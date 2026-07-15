import ExcelJS from 'exceljs';
import {
  DEFAULT_PROJECT,
  FIELD_ROLES,
  MODELS,
  MODEL_REFERENCE,
  TIMING,
} from '../constants.js';

const HEADER_ALIASES = {
  badge_primary: new Set([
    'date', 'uploaded', 'upload date', 'uploaded date', 'year', 'value', 'badge',
    'badge value', 'badge date / value', 'number', 'amount', 'age', 'probability', 'rank',
  ]),
  badge_secondary: new Set([
    'unit', 'label', 'badge label', 'badge label / unit', 'small label', 'type', 'metric',
  ]),
  title: new Set(['title', 'name', 'heading', 'card title', 'item', 'subject']),
  description: new Set(['description', 'details', 'summary', 'text', 'caption']),
  image: new Set(['image', 'image path', 'image url', 'photo', 'picture', 'thumbnail', 'artwork']),
};

export function deepClone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function createDefaultProject() {
  return deepClone(DEFAULT_PROJECT);
}

export function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replaceAll('_', ' ').replace(/\s+/g, ' ');
}

export function uniqueHeaders(headers, width = headers.length) {
  const used = new Set();
  const output = [];
  for (let index = 0; index < width; index += 1) {
    const base = String(headers[index] ?? '').trim() || `Column ${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(normalizeHeader(candidate))) {
      candidate = `${base} (${suffix})`;
      suffix += 1;
    }
    used.add(normalizeHeader(candidate));
    output.push(candidate);
  }
  return output;
}

export function normalizeTable(data) {
  const rawHeaders = Array.isArray(data?.headers) ? data.headers : [];
  const rawRows = Array.isArray(data?.rows) ? data.rows : [];
  const width = Math.max(rawHeaders.length, ...rawRows.map((row) => row.length), 1);
  const headers = uniqueHeaders(rawHeaders, width);
  const rows = rawRows.map((row) => Array.from({ length: width }, (_, index) => String(row?.[index] ?? '').trim()));
  return { headers, rows };
}

export function guessFieldMapping(headers) {
  const mapping = {};
  const normalized = headers.map(normalizeHeader);
  for (const role of FIELD_ROLES) {
    const index = normalized.findIndex((header) => HEADER_ALIASES[role].has(header));
    if (index >= 0) mapping[role] = headers[index];
  }
  return mapping;
}

export function resolveFieldMapping(project) {
  const headers = project.data.headers;
  const guessed = guessFieldMapping(headers);
  const explicit = project.settings.fieldMapping || {};
  const mapping = {};
  for (const role of FIELD_ROLES) {
    const selected = explicit[role];
    if (selected && headers.includes(selected)) mapping[role] = selected;
    else if (guessed[role]) mapping[role] = guessed[role];
  }
  return mapping;
}

export function resolvedCards(project) {
  const data = normalizeTable(project.data);
  const mapping = resolveFieldMapping({ ...project, data });
  const indexFor = (role) => data.headers.indexOf(mapping[role]);
  return data.rows
    .map((row, sourceIndex) => ({
      id: project.rowIds?.[sourceIndex] || `card-${sourceIndex}`,
      sourceIndex,
      badge_primary: indexFor('badge_primary') >= 0 ? row[indexFor('badge_primary')] : '',
      badge_secondary: indexFor('badge_secondary') >= 0 ? row[indexFor('badge_secondary')] : '',
      title: indexFor('title') >= 0 ? row[indexFor('title')] : '',
      description: indexFor('description') >= 0 ? row[indexFor('description')] : '',
      image: indexFor('image') >= 0 ? row[indexFor('image')] : '',
    }));
}

export function effectiveVisibleCards(settings) {
  const explicit = Number(settings.visibleCards || 0);
  if (explicit > 0) return Math.max(1, Math.min(8, Math.floor(explicit)));
  return MODELS[settings.modelId]?.visibleCards || MODELS[MODEL_REFERENCE].visibleCards;
}

export function autoDuration(project) {
  const count = resolvedCards(project).length;
  if (!count) return 0;
  const visible = effectiveVisibleCards(project.settings);
  const reveal = Math.min(count, visible) * TIMING.revealSeconds;
  const scroll = Math.max(0, count - visible) * TIMING.scrollSeconds;
  return reveal + scroll + TIMING.endHoldSeconds + TIMING.fadeSeconds;
}

export function projectDuration(project) {
  const custom = Number(project.settings.customDuration);
  return Number.isFinite(custom) && custom >= 1 ? custom : autoDuration(project);
}

export function modelTime(project, outputTime) {
  const automatic = autoDuration(project);
  const duration = projectDuration(project);
  if (automatic <= 0 || duration <= 0) return Math.max(0, outputTime);
  return Math.max(0, outputTime) * (automatic / duration);
}

export function parseDelimitedText(text) {
  const cleaned = String(text ?? '').replace(/^\uFEFF/, '').trim();
  if (!cleaned) return { headers: [], rows: [] };
  const delimiter = cleaned.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    const next = cleaned[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  if (!rows.length) return { headers: [], rows: [] };
  return normalizeTable({ headers: rows[0], rows: rows.slice(1) });
}

export async function importSpreadsheetFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') {
    return parseDelimitedText(await file.text());
  }
  const bytes = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const displayExcelValue = (value) => {
    if (value == null) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value !== 'object') return String(value).trim();
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').trim();
    if ('result' in value && value.result != null) return displayExcelValue(value.result);
    if ('text' in value && value.text != null) return String(value.text).trim();
    if ('hyperlink' in value && value.hyperlink) return String(value.text || value.hyperlink).trim();
    return String(value).trim();
  };

  const width = Math.max(1, sheet.columnCount || 1);
  const allRows = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    allRows.push(Array.from({ length: width }, (_, index) => displayExcelValue(row.getCell(index + 1).value)));
  }
  while (allRows.length && !allRows.at(-1).some((value) => value)) allRows.pop();
  if (!allRows.length) return { headers: [], rows: [] };
  const normalized = normalizeTable({ headers: allRows[0], rows: allRows.slice(1) });

  const embedded = typeof sheet.getImages === 'function' ? sheet.getImages() : [];
  if (embedded.length) {
    let imageHeader = normalized.headers.find((header) => HEADER_ALIASES.image.has(normalizeHeader(header)));
    if (!imageHeader) {
      imageHeader = 'Image';
      normalized.headers.push(imageHeader);
      normalized.rows = normalized.rows.map((row) => [...row, '']);
    }
    const imageColumn = normalized.headers.indexOf(imageHeader);
    const toDataUrl = (image) => {
      const extension = String(image.extension || 'png').toLowerCase().replace('jpg', 'jpeg');
      const mime = extension === 'svg' ? 'image/svg+xml' : `image/${extension}`;
      const source = image.buffer || image.base64;
      if (typeof source === 'string') return source.startsWith('data:') ? source : `data:${mime};base64,${source}`;
      const data = source instanceof Uint8Array ? source : new Uint8Array(source || []);
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < data.length; offset += chunkSize) {
        binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
      }
      return `data:${mime};base64,${btoa(binary)}`;
    };
    for (const placement of embedded) {
      const image = workbook.getImage(placement.imageId);
      if (!image) continue;
      const nativeRow = placement.range?.tl?.nativeRow ?? placement.range?.tl?.row ?? 1;
      const targetRow = Math.max(0, Math.floor(nativeRow) - 1);
      while (normalized.rows.length <= targetRow) normalized.rows.push(Array(normalized.headers.length).fill(''));
      while (normalized.rows[targetRow].length < normalized.headers.length) normalized.rows[targetRow].push('');
      normalized.rows[targetRow][imageColumn] = toDataUrl(image);
    }
  }
  return normalized;
}

export function migrateProject(raw) {
  const base = createDefaultProject();
  const source = raw && typeof raw === 'object' ? raw : {};
  const data = normalizeTable(source.data || source.spreadsheet || base.data);
  const settingsSource = source.settings || {};
  const settings = {
    ...base.settings,
    ...settingsSource,
    customDuration: settingsSource.customDuration ?? settingsSource.custom_duration ?? null,
    modelId: settingsSource.modelId ?? settingsSource.model_id ?? base.settings.modelId,
    visibleCards: settingsSource.visibleCards ?? settingsSource.visible_cards ?? 0,
    fieldMapping: settingsSource.fieldMapping ?? settingsSource.field_mapping ?? {},
    soundtrackMasterVolume:
      settingsSource.soundtrackMasterVolume ?? settingsSource.soundtrack_master_volume ?? 1,
    hexagonsBounce: settingsSource.hexagonsBounce ?? settingsSource.hexagons_bounce ?? true,
    fontFamily: settingsSource.fontFamily ?? settingsSource.font_family ?? 'Nunito',
    illustratedBackground:
      settingsSource.illustratedBackground ?? settingsSource.illustrated_background ?? 'beach',
    imageScale: settingsSource.imageScale ?? settingsSource.image_scale ?? 1,
    hexagonScale: settingsSource.hexagonScale ?? settingsSource.hexagon_scale ?? 1,
    autoSizeArtwork:
      settingsSource.autoSizeArtwork ?? settingsSource.auto_size_artwork ?? true,
    showHexagons: settingsSource.showHexagons ?? settingsSource.show_hexagons ?? true,
    titleBarEnabled: settingsSource.titleBarEnabled ?? settingsSource.title_bar_enabled ?? true,
  };
  return {
    ...base,
    ...source,
    version: 1,
    data,
    settings,
    transforms: source.transforms || {},
    audioTracks: source.audioTracks || source.audio_tracks || [],
  };
}

export function updateCell(project, rowIndex, header, value) {
  const next = structuredClone(project);
  const columnIndex = next.data.headers.indexOf(header);
  if (columnIndex < 0 || rowIndex < 0 || rowIndex >= next.data.rows.length) return project;
  next.data.rows[rowIndex][columnIndex] = String(value ?? '');
  return next;
}

export function roleHeader(project, role) {
  return resolveFieldMapping(project)[role] || '';
}
