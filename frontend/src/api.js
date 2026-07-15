import axios from "axios";

export const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : "";
export const IS_STATIC = !BACKEND_URL;

const STORAGE_KEY = "cts-studio-projects-v1";

const DEFAULT_SHEETS = {
  reference_detail: ["Badge Date / Value", "Title", "Description", "Image"],
  illustrated_cards: ["Badge Value", "Badge Label", "Title", "Artwork"],
  classic_compact: ["Value", "Unit", "Title", "Image"],
};

const DEFAULT_MAPPINGS = {
  reference_detail: { badge_primary: "Badge Date / Value", title: "Title", description: "Description", image: "Image" },
  illustrated_cards: { badge_primary: "Badge Value", badge_secondary: "Badge Label", title: "Title", image: "Artwork" },
  classic_compact: { badge_primary: "Value", badge_secondary: "Unit", title: "Title", image: "Image" },
};

const TEMPLATES = [
  {
    id: "supercars",
    name: "Supercar showdown",
    description: "Price and top-speed comparison of performance cars.",
    model_id: "reference_detail",
    headers: ["Badge Date / Value", "Title", "Description", "Image"],
    rows: [
      ["$140,000", "Mercedes-AMG GT", "Hand-built 4.0L V8 biturbo, 577 hp, 0-60 in 3.1s.", "https://images.pexels.com/photos/26563767/pexels-photo-26563767.jpeg"],
      ["$95,000", "Blue GT Coupe", "Aerodynamic grand tourer with adaptive suspension.", "https://images.pexels.com/photos/17476943/pexels-photo-17476943.jpeg"],
      ["$210,000", "Track Edition", "Carbon-ceramic brakes and a stripped racing interior.", "https://images.pexels.com/photos/26563767/pexels-photo-26563767.jpeg"],
      ["$78,000", "Roadster S", "Open-top thrills with a 3.0L twin-turbo inline six.", "https://images.pexels.com/photos/17476943/pexels-photo-17476943.jpeg"],
      ["$320,000", "Hyper GT", "Hybrid powertrain delivering 900 combined horsepower.", "https://images.pexels.com/photos/26563767/pexels-photo-26563767.jpeg"],
    ],
  },
  {
    id: "monuments",
    name: "Monuments through time",
    description: "Historic landmarks ordered by construction year.",
    model_id: "illustrated_cards",
    headers: ["Badge Value", "Badge Label", "Title", "Artwork"],
    rows: [
      ["1754", "Completed", "Safdarjung Tomb", "https://images.pexels.com/photos/29230104/pexels-photo-29230104.jpeg"],
      ["1913", "Completed", "Völkerschlachtdenkmal", "https://images.pexels.com/photos/18287214/pexels-photo-18287214.jpeg"],
      ["1754", "Restored", "Mughal Gardens", "https://images.pexels.com/photos/29230104/pexels-photo-29230104.jpeg"],
      ["1913", "Memorial", "Battle Monument", "https://images.pexels.com/photos/18287214/pexels-photo-18287214.jpeg"],
    ],
  },
  {
    id: "blank-classic",
    name: "Classic compact (blank)",
    description: "Start from an empty Classic Compact grid.",
    model_id: "classic_compact",
    headers: ["Value", "Unit", "Title", "Image"],
    rows: Array.from({ length: 4 }, () => ["", "", "", ""]),
  },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function id() {
  return globalThis.crypto?.randomUUID?.().replaceAll("-", "") || `${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function readProjects() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeProjects(projects) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function summary(project) {
  return {
    id: project.id,
    name: project.name,
    model_id: project.settings?.model_id || "reference_detail",
    card_count: project.spreadsheet?.rows?.length || 0,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}

function createProject(body = {}) {
  const template = TEMPLATES.find((item) => item.id === body.template_id);
  const modelId = template?.model_id || body.model_id || "reference_detail";
  const headers = clone(template?.headers || DEFAULT_SHEETS[modelId] || DEFAULT_SHEETS.reference_detail);
  const rows = clone(template?.rows || Array.from({ length: 4 }, () => Array(headers.length).fill("")));
  const timestamp = now();
  return {
    id: id(),
    name: body.name || template?.name || "Untitled comparison",
    spreadsheet: { headers, rows },
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      custom_duration: null,
      model_id: modelId,
      visible_cards: 0,
      field_mapping: clone(DEFAULT_MAPPINGS[modelId] || DEFAULT_MAPPINGS.reference_detail),
      soundtrack_master_volume: 1,
      hexagons_bounce: true,
      background: "#05060f",
    },
    audio_tracks: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function fail(detail, status = 400) {
  const error = new Error(detail);
  error.response = { status, data: { detail } };
  return Promise.reject(error);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function localGet(path) {
  if (path === "/health") return { data: { status: "ok", mode: "static" } };
  if (path === "/templates") return { data: clone(TEMPLATES) };
  if (path === "/projects") return { data: readProjects().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map(summary) };
  const projectMatch = path.match(/^\/projects\/([^/]+)$/);
  if (projectMatch) {
    const project = readProjects().find((item) => item.id === projectMatch[1]);
    return project ? { data: clone(project) } : fail("Project not found", 404);
  }
  return fail("This feature requires the optional CTS backend.", 501);
}

async function localPost(path, body = {}) {
  if (path === "/projects") {
    const project = createProject(body || {});
    const projects = readProjects();
    projects.unshift(project);
    writeProjects(projects);
    return { data: clone(project) };
  }

  if (path === "/projects/import-legacy") {
    const file = body?.get?.("file");
    if (!file) return fail("Choose a JSON project file first.");
    try {
      const imported = JSON.parse(await file.text());
      const project = {
        ...createProject(),
        ...imported,
        id: id(),
        name: imported.name || "Imported comparison",
        created_at: now(),
        updated_at: now(),
      };
      const projects = readProjects();
      projects.unshift(project);
      writeProjects(projects);
      return { data: clone(project) };
    } catch {
      return fail("The selected file is not a valid CTS JSON project.");
    }
  }

  const duplicateMatch = path.match(/^\/projects\/([^/]+)\/duplicate$/);
  if (duplicateMatch) {
    const projects = readProjects();
    const source = projects.find((item) => item.id === duplicateMatch[1]);
    if (!source) return fail("Project not found", 404);
    const copy = clone(source);
    copy.id = id();
    copy.name = `${source.name} copy`;
    copy.created_at = now();
    copy.updated_at = copy.created_at;
    projects.unshift(copy);
    writeProjects(projects);
    return { data: clone(copy) };
  }

  if (["/upload/image", "/uploads/image", "/assets/image"].includes(path)) {
    const file = body?.get?.("file");
    if (!file) return fail("Choose an image first.");
    const url = await fileToDataUrl(file);
    return { data: { path: url, url } };
  }

  if (["/upload/audio", "/uploads/audio", "/assets/audio"].includes(path)) {
    const file = body?.get?.("file");
    if (!file) return fail("Choose an audio file first.");
    const url = await fileToDataUrl(file);
    return { data: { path: url, url, name: file.name, duration: 0 } };
  }

  if (path === "/import/xlsx") return fail("XLSX import needs the CTS backend in the Pages build. Paste spreadsheet cells instead.", 501);
  if (/\/export(?:\/|$)/.test(path)) return fail("MP4 export needs the optional CTS backend. Your project is still saved locally.", 501);
  return fail("This feature requires the optional CTS backend.", 501);
}

async function localPut(path, body = {}) {
  const match = path.match(/^\/projects\/([^/]+)$/);
  if (!match) return fail("This feature requires the optional CTS backend.", 501);
  const projects = readProjects();
  const index = projects.findIndex((item) => item.id === match[1]);
  if (index < 0) return fail("Project not found", 404);
  projects[index] = { ...projects[index], ...clone(body), id: projects[index].id, updated_at: now() };
  writeProjects(projects);
  return { data: clone(projects[index]) };
}

async function localDelete(path) {
  const match = path.match(/^\/projects\/([^/]+)$/);
  if (!match) return fail("This feature requires the optional CTS backend.", 501);
  const projects = readProjects();
  const next = projects.filter((item) => item.id !== match[1]);
  if (next.length === projects.length) return fail("Project not found", 404);
  writeProjects(next);
  return { data: { ok: true } };
}

const remote = BACKEND_URL ? axios.create({ baseURL: API }) : null;

export const api = remote || {
  get: localGet,
  post: localPost,
  put: localPut,
  delete: localDelete,
};

export function assetUrl(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^(data:|blob:)/i.test(v)) return v;
  if (v.startsWith("/api/uploads/") && BACKEND_URL) return `${BACKEND_URL}${v}`;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  if (/^www\./i.test(v)) return `https://${v}`;
  return "";
}
