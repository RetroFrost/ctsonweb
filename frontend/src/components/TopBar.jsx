import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Clapperboard, Undo2, Redo2, Keyboard, FileDown, CheckCircle2, CloudUpload, Video,
} from "lucide-react";
import { useEditor } from "../store";
import { MODEL_LABELS } from "../engine/timing";

export default function TopBar({ onOpenExport, onOpenShortcuts }) {
  const navigate = useNavigate();
  const { doc, setDoc, undo, redo, past, future, dirty, saving, switchModel } = useEditor();
  if (!doc) return null;

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(doc.name || "comparison").replace(/[^a-z0-9._-]+/gi, "_")}.cts.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-12 shrink-0 border-b border-line bg-header flex items-center justify-between px-3 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button data-testid="back-to-projects-btn" className="flex items-center gap-2 hover:opacity-80 transition-opacity" onClick={() => navigate("/")}>
          <div className="w-7 h-7 rounded-[4px] bg-[#FF3B30] flex items-center justify-center">
            <Clapperboard size={15} className="text-white" />
          </div>
        </button>
        <input
          data-testid="project-name-input"
          className="bg-transparent text-sm font-semibold text-zinc-100 border border-transparent hover:border-line focus:border-lineActive rounded-[4px] px-2 py-1 focus:outline-none w-56 truncate transition-colors"
          value={doc.name}
          onChange={(e) => setDoc((d) => { d.name = e.target.value; return d; }, false)}
          onBlur={(e) => setDoc((d) => { d.name = e.target.value.trim() || "Untitled comparison"; return d; })}
        />
        <select
          data-testid="model-switcher"
          className="select-dark w-44"
          value={doc.settings.model_id}
          onChange={(e) => switchModel(e.target.value)}
        >
          {Object.entries(MODEL_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button data-testid="undo-btn" className="btn-icon" disabled={!past.length} title="Undo (Ctrl+Z)" onClick={undo}><Undo2 size={15} /></button>
        <button data-testid="redo-btn" className="btn-icon" disabled={!future.length} title="Redo (Ctrl+Shift+Z)" onClick={redo}><Redo2 size={15} /></button>
        <div className="w-px h-5 bg-line mx-2" />
        <span data-testid="save-status" className="text-[11px] font-mono text-zinc-500 flex items-center gap-1.5 w-20">
          {saving || dirty ? (<><CloudUpload size={12} className="text-zinc-400" /> saving…</>) : (<><CheckCircle2 size={12} className="text-emerald-500" /> saved</>)}
        </span>
        <div className="w-px h-5 bg-line mx-2" />
        <button data-testid="shortcuts-btn" className="btn-icon" title="Keyboard shortcuts" onClick={onOpenShortcuts}><Keyboard size={15} /></button>
        <button data-testid="download-json-btn" className="btn-icon" title="Download project .json (desktop compatible)" onClick={downloadJson}>
          <FileDown size={15} />
        </button>
        <button data-testid="open-export-btn" className="btn-primary flex items-center gap-2 ml-2" onClick={onOpenExport}>
          <Video size={14} /> Export
        </button>
      </div>
    </div>
  );
}
