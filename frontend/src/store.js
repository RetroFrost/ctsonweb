import { create } from "zustand";
import {
  MODEL_SCHEMAS, TRANSFORM_HEADERS, guessFieldMapping, normalizeHeader, resolveCardsJs,
} from "./engine/timing";

const MAX_HISTORY = 100;

function snapshot(doc) {
  return JSON.parse(JSON.stringify(doc));
}

export const useEditor = create((set, get) => ({
  doc: null,
  past: [],
  future: [],
  dirty: false,
  saving: false,
  savedAt: null,

  time: 0,
  playing: false,
  loop: false,
  speed: 1,
  zoom: "fit",
  showGuides: false,
  showGrid: false,
  timelineZoom: 40,

  selection: null,
  editing: null,
  leftTab: "cards",
  rightTab: "design",

  loadDoc: (doc) => set({ doc, past: [], future: [], dirty: false, time: 0, playing: false, selection: null, editing: null }),

  setDoc: (updater, undoable = true) => {
    const { doc, past } = get();
    if (!doc) return;
    const next = typeof updater === "function" ? updater(snapshot(doc)) : updater;
    set({
      doc: next,
      past: undoable ? [...past.slice(-MAX_HISTORY), snapshot(doc)] : past,
      future: undoable ? [] : get().future,
      dirty: true,
    });
  },

  undo: () => {
    const { past, future, doc } = get();
    if (!past.length) return;
    set({
      doc: past[past.length - 1],
      past: past.slice(0, -1),
      future: [snapshot(doc), ...future].slice(0, MAX_HISTORY),
      dirty: true,
    });
  },

  redo: () => {
    const { past, future, doc } = get();
    if (!future.length) return;
    set({
      doc: future[0],
      future: future.slice(1),
      past: [...past, snapshot(doc)].slice(-MAX_HISTORY),
      dirty: true,
    });
  },

  markSaved: () => set({ dirty: false, saving: false, savedAt: new Date() }),

  setTime: (time) => set({ time: Math.max(0, time) }),
  setPlaying: (playing) => set({ playing }),
  setSelection: (selection) => set({ selection }),
  setEditing: (editing) => set({ editing }),

  cards: () => {
    const { doc } = get();
    if (!doc) return [];
    const mapping = doc.settings.field_mapping || {};
    return resolveCardsJs(doc.spreadsheet, mapping);
  },

  ensureColumn: (doc, header) => {
    let index = doc.spreadsheet.headers.indexOf(header);
    if (index < 0) {
      doc.spreadsheet.headers.push(header);
      index = doc.spreadsheet.headers.length - 1;
      doc.spreadsheet.rows.forEach((row) => {
        while (row.length < doc.spreadsheet.headers.length) row.push("");
      });
    }
    return index;
  },

  setCardField: (cardIndex, role, value, undoable = true) => {
    const { setDoc, ensureColumn } = get();
    setDoc((doc) => {
      let header = doc.settings.field_mapping?.[role];
      if (!header) {
        if (TRANSFORM_HEADERS[role]) {
          header = TRANSFORM_HEADERS[role];
        } else {
          const schema = MODEL_SCHEMAS[doc.settings.model_id] || [];
          const entry = schema.find(([, r]) => r === role);
          header = entry ? entry[0] : role;
        }
        doc.settings.field_mapping = { ...(doc.settings.field_mapping || {}), [role]: header };
      }
      const col = ensureColumn(doc, header);
      while (doc.spreadsheet.rows.length <= cardIndex) {
        doc.spreadsheet.rows.push(new Array(doc.spreadsheet.headers.length).fill(""));
      }
      const row = doc.spreadsheet.rows[cardIndex];
      while (row.length < doc.spreadsheet.headers.length) row.push("");
      row[col] = value;
      return doc;
    }, undoable);
  },

  addCard: () => {
    get().setDoc((doc) => {
      doc.spreadsheet.rows.push(new Array(Math.max(1, doc.spreadsheet.headers.length)).fill(""));
      return doc;
    });
    return get().doc.spreadsheet.rows.length - 1;
  },

  duplicateCard: (index) => {
    get().setDoc((doc) => {
      const row = doc.spreadsheet.rows[index];
      if (row) doc.spreadsheet.rows.splice(index + 1, 0, [...row]);
      return doc;
    });
  },

  deleteCard: (index) => {
    get().setDoc((doc) => {
      doc.spreadsheet.rows.splice(index, 1);
      return doc;
    });
    set({ selection: null, editing: null });
  },

  moveCard: (from, to) => {
    if (from === to) return;
    get().setDoc((doc) => {
      const [row] = doc.spreadsheet.rows.splice(from, 1);
      doc.spreadsheet.rows.splice(to, 0, row);
      return doc;
    });
  },

  setSetting: (key, value) => {
    get().setDoc((doc) => {
      doc.settings[key] = value;
      return doc;
    });
  },

  switchModel: (modelId) => {
    const { setDoc, ensureColumn } = get();
    setDoc((doc) => {
      doc.settings.model_id = modelId;
      const schema = MODEL_SCHEMAS[modelId] || [];
      const mapping = { ...(doc.settings.field_mapping || {}) };
      const guessed = guessFieldMapping(doc.spreadsheet.headers);
      for (const [label, role] of schema) {
        if (mapping[role] && doc.spreadsheet.headers.includes(mapping[role])) continue;
        if (guessed[role]) {
          mapping[role] = guessed[role];
        } else {
          const existing = doc.spreadsheet.headers.find((h) => normalizeHeader(h) === normalizeHeader(label));
          if (existing) {
            mapping[role] = existing;
          } else {
            ensureColumn(doc, label);
            mapping[role] = label;
          }
        }
      }
      doc.settings.field_mapping = mapping;
      doc.settings.visible_cards = 0;
      return doc;
    });
  },
}));
