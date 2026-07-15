// Timing + layout math ported from comparison_studio (deterministic parity with export renderer).

export const REVEAL = 2.0;
export const SCROLL = 10.0 / 3.0;
export const HOLD = 2.0;
export const FADE = 0.8;

export const MODEL_REFERENCE = "reference_detail";
export const MODEL_ILLUSTRATED = "illustrated_cards";
export const MODEL_CLASSIC = "classic_compact";

export const MODEL_DEFAULT_VISIBLE = {
  [MODEL_REFERENCE]: 4,
  [MODEL_ILLUSTRATED]: 3,
  [MODEL_CLASSIC]: 4,
};

export const MODEL_LABELS = {
  [MODEL_REFERENCE]: "Reference Detail",
  [MODEL_ILLUSTRATED]: "Illustrated Cards",
  [MODEL_CLASSIC]: "Classic Compact",
};

export const MODEL_SCHEMAS = {
  [MODEL_REFERENCE]: [
    ["Badge Date / Value", "badge_primary"],
    ["Title", "title"],
    ["Description", "description"],
    ["Image", "image"],
  ],
  [MODEL_ILLUSTRATED]: [
    ["Badge Value", "badge_primary"],
    ["Badge Label", "badge_secondary"],
    ["Title", "title"],
    ["Artwork", "image"],
  ],
  [MODEL_CLASSIC]: [
    ["Value", "badge_primary"],
    ["Unit", "badge_secondary"],
    ["Title", "title"],
    ["Image", "image"],
  ],
};

export const ROLE_LABELS = {
  badge_primary: "Badge value",
  badge_secondary: "Badge label",
  title: "Title",
  description: "Description",
  image: "Image",
};

const HEADER_ALIASES = {
  badge_primary: ["date", "uploaded", "upload date", "uploaded date", "year", "value",
    "badge", "badge value", "badge date / value", "number", "amount", "age", "probability", "rank"],
  badge_secondary: ["unit", "label", "badge label", "badge label / unit", "small label", "type", "metric"],
  title: ["title", "name", "heading", "card title", "item", "subject"],
  description: ["description", "details", "summary", "text", "caption"],
  image: ["image", "image path", "image url", "photo", "picture", "thumbnail", "artwork"],
};

export function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

export function guessFieldMapping(headers) {
  const mapping = {};
  const normalized = headers.map(normalizeHeader);
  for (const [role, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalized.findIndex((v) => aliases.includes(v));
    if (index >= 0) mapping[role] = headers[index];
  }
  return mapping;
}

export function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

export function smoothstep(v) {
  v = clamp(v);
  return v * v * (3 - 2 * v);
}

export function easeOutBack(v) {
  v = clamp(v);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
}

export function effectiveVisible(settings) {
  if (settings.visible_cards) return Math.max(1, Math.min(8, Math.floor(settings.visible_cards)));
  return MODEL_DEFAULT_VISIBLE[settings.model_id] || 4;
}

export function autoDuration(cardCount, settings) {
  if (cardCount <= 0) return 0;
  const visible = effectiveVisible(settings);
  return Math.min(cardCount, visible) * REVEAL + Math.max(0, cardCount - visible) * SCROLL + HOLD + FADE;
}

export function duration(cardCount, settings) {
  const auto = autoDuration(cardCount, settings);
  if (settings.custom_duration == null) return auto;
  return Math.max(1, Number(settings.custom_duration));
}

export function speedMultiplier(cardCount, settings) {
  const auto = autoDuration(cardCount, settings);
  const chosen = duration(cardCount, settings);
  if (auto <= 0 || chosen <= 0) return 1;
  return auto / chosen;
}

export function modelTime(outputTime, cardCount, settings) {
  return Math.max(0, outputTime) * speedMultiplier(cardCount, settings);
}

function badgeScaleFor(center, focus, cardWidth) {
  const distance = (center - focus) / Math.max(1, cardWidth * 0.6);
  return 0.72 + 0.44 * Math.exp(-0.5 * distance * distance);
}

export function placements(cardCount, mTime, visible, width, bounce) {
  const cardWidth = width / visible;
  const initialCount = Math.min(cardCount, visible);
  const introDuration = initialCount * REVEAL;
  const result = [];
  if (mTime < introDuration) {
    const latest = Math.max(0, Math.min(initialCount - 1, Math.floor(mTime / REVEAL)));
    const focusCenter = (latest + 0.5) * cardWidth;
    for (let index = 0; index < initialCount; index++) {
      const local = mTime - index * REVEAL;
      if (local < 0) continue;
      const progress = smoothstep(local / 0.62);
      const x = index * cardWidth;
      const center = x + cardWidth / 2;
      let badgeScale = 1;
      if (bounce) {
        badgeScale = badgeScaleFor(center, focusCenter, cardWidth) * Math.min(1, easeOutBack(local / 0.58));
      }
      result.push({ index, x, alpha: progress, badgeScale });
    }
    return result;
  }
  const scrollElapsed = Math.max(0, mTime - introDuration);
  const shift = Math.min(Math.max(0, cardCount - visible), scrollElapsed / SCROLL) * cardWidth;
  const focusCenter = (visible - 0.5) * cardWidth;
  for (let index = 0; index < cardCount; index++) {
    const x = index * cardWidth - shift;
    if (x >= width || x + cardWidth <= 0) continue;
    const center = x + cardWidth / 2;
    const badgeScale = bounce ? badgeScaleFor(center, focusCenter, cardWidth) : 1;
    result.push({ index, x, alpha: 1, badgeScale });
  }
  return result;
}

export const FIELD_BOXES = {
  [MODEL_REFERENCE]: {
    badge_primary: [0.1, 0.1, 0.8, 0.28],
    title: [0.035, 0.445, 0.93, 0.087],
    description: [0.045, 0.55, 0.91, 0.11],
    image: [0.085, 0.67, 0.83, 0.32],
  },
  [MODEL_ILLUSTRATED]: {
    badge_primary: [0.15, 0.075, 0.7, 0.14],
    badge_secondary: [0.18, 0.215, 0.64, 0.09],
    title: [0.035, 0.885, 0.93, 0.105],
    image: [0.01, 0.01, 0.98, 0.87],
  },
  [MODEL_CLASSIC]: {
    badge_primary: [0.15, 0.095, 0.7, 0.15],
    badge_secondary: [0.18, 0.25, 0.64, 0.1],
    title: [0.035, 0.397, 0.93, 0.09],
    image: [0.01, 0.505, 0.98, 0.485],
  },
};

export function fieldAt(modelId, localX, localY) {
  if (modelId === MODEL_ILLUSTRATED) {
    if (localY >= 0.88) return "title";
    if (localX >= 0.12 && localX <= 0.88 && localY <= 0.32) {
      return localY <= 0.21 ? "badge_primary" : "badge_secondary";
    }
    return "image";
  }
  if (modelId === MODEL_CLASSIC) {
    if (localY < 0.39) return localY < 0.25 ? "badge_primary" : "badge_secondary";
    if (localY < 0.495) return "title";
    return "image";
  }
  if (localY < 0.44) return "badge_primary";
  if (localY < 0.538) return "title";
  if (localY < 0.67) return "description";
  return "image";
}

export const TRANSFORM_HEADERS = {
  image_zoom: "Image Zoom",
  image_pan_x: "Image Pan X",
  image_pan_y: "Image Pan Y",
};

export function resolveCardsJs(spreadsheet, mapping) {
  const headers = spreadsheet.headers || [];
  const indexes = {};
  headers.forEach((h, i) => (indexes[h] = i));
  const value = (row, role, fallbackHeader) => {
    const header = mapping?.[role] || fallbackHeader;
    const index = indexes[header];
    return index != null && index < row.length ? String(row[index] || "").trim() : "";
  };
  return (spreadsheet.rows || []).map((row) => ({
    badge_primary: value(row, "badge_primary"),
    badge_secondary: value(row, "badge_secondary"),
    title: value(row, "title"),
    description: value(row, "description"),
    image: value(row, "image"),
    image_zoom: value(row, "image_zoom", TRANSFORM_HEADERS.image_zoom),
    image_pan_x: value(row, "image_pan_x", TRANSFORM_HEADERS.image_pan_x),
    image_pan_y: value(row, "image_pan_y", TRANSFORM_HEADERS.image_pan_y),
  }));
}

const CONTENT_FIELDS = ["badge_primary", "badge_secondary", "title", "description", "image"];

export function cardIsBlank(card) {
  return !CONTENT_FIELDS.some((k) => String(card[k] || "").trim());
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function dateLines(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    const mi = parseInt(m, 10);
    if (mi >= 1 && mi <= 12) return [`${parseInt(d, 10)} ${MONTHS[mi - 1]}`, y];
  }
  const trailing = text.match(/^(.*?)[,\s]+((?:19|20)\d{2})$/);
  if (trailing) return [trailing[1].trim(), trailing[2]];
  if (/^(?:19|20)\d{2}$/.test(text)) return [text, ""];
  return [text, ""];
}

export function formatTimecode(seconds, fps = 30) {
  seconds = Math.max(0, seconds);
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * fps);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(2, "0")}`;
}

export function formatClock(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function cardBoundaries(cardCount, settings) {
  const visible = effectiveVisible(settings);
  const times = [];
  for (let i = 0; i < cardCount; i++) {
    if (i < visible) times.push(i * REVEAL);
    else times.push(Math.min(cardCount, visible) * REVEAL + (i - visible + 1) * SCROLL);
  }
  return times;
}

export function outputTimeFromModel(mTime, cardCount, settings) {
  const speed = speedMultiplier(cardCount, settings);
  return speed > 0 ? mTime / speed : mTime;
}
