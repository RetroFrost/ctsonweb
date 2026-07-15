import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../api";
import { useEditor } from "../store";
import { duration, resolveCardsJs, cardBoundaries, outputTimeFromModel } from "../engine/timing";
import TopBar from "../components/TopBar";
import LeftPanel from "../components/LeftPanel";
import CanvasStage from "../components/CanvasStage";
import Timeline from "../components/Timeline";
import RightPanel from "../components/RightPanel";
import ExportDialog from "../components/ExportDialog";
import ShortcutsDialog from "../components/ShortcutsDialog";

export default function EditorPage() {
  const { projectId } = useParams();
  const { doc, loadDoc, dirty, markSaved } = useEditor();
  const [error, setError] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    api.get(`/projects/${projectId}`)
      .then(({ data }) => loadDoc(data))
      .catch(() => setError("This project could not be loaded."));
    return () => loadDoc(null);
  }, [projectId, loadDoc]);

  useEffect(() => {
    if (!doc || !dirty) return;
    const timer = setTimeout(async () => {
      useEditor.setState({ saving: true });
      try {
        await api.put(`/projects/${doc.id}`, {
          name: doc.name,
          spreadsheet: doc.spreadsheet,
          settings: doc.settings,
          audio_tracks: doc.audio_tracks || [],
        });
        markSaved();
      } catch {
        useEditor.setState({ saving: false });
        toast.error("Autosave failed — check your connection.");
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [doc, dirty, markSaved]);

  const rafRef = useRef(null);
  useEffect(() => {
    let last = performance.now();
    const tick = (now) => {
      const s = useEditor.getState();
      if (s.playing && s.doc) {
        const cards = resolveCardsJs(s.doc.spreadsheet, s.doc.settings.field_mapping || {});
        const dur = duration(cards.length, s.doc.settings);
        let next = s.time + ((now - last) / 1000) * s.speed;
        if (next >= dur) {
          if (s.loop) next = 0;
          else { next = dur; useEditor.setState({ playing: false }); }
        }
        useEditor.setState({ time: next });
      }
      last = now;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const s = useEditor.getState();
      if (!s.doc) return;
      const tag = e.target.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (typing) return;
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        if (typing) return;
        e.preventDefault();
        s.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && s.selection) {
        if (typing) return;
        e.preventDefault();
        s.duplicateCard(s.selection.cardIndex);
        return;
      }
      if (typing || s.editing) {
        if (e.key === "Escape") s.setEditing(null);
        return;
      }
      const cards = resolveCardsJs(s.doc.spreadsheet, s.doc.settings.field_mapping || {});
      const dur = duration(cards.length, s.doc.settings);
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (s.time >= dur - 0.01) s.setTime(0);
          s.setPlaying(!s.playing);
          break;
        case "Home": s.setTime(0); break;
        case "End": s.setPlaying(false); s.setTime(dur); break;
        case ",": s.setTime(Math.max(0, s.time - 1 / s.doc.settings.fps)); break;
        case ".": s.setTime(Math.min(dur, s.time + 1 / s.doc.settings.fps)); break;
        case "l": case "L": useEditor.setState({ loop: !s.loop }); break;
        case "g": case "G": useEditor.setState({ showGrid: !s.showGrid }); break;
        case "s": case "S": useEditor.setState({ showGuides: !s.showGuides }); break;
        case "n": case "N": s.addCard(); break;
        case "Delete": case "Backspace":
          if (s.selection) s.deleteCard(s.selection.cardIndex);
          break;
        case "Escape": s.setSelection(null); break;
        case "ArrowLeft": case "ArrowRight": {
          e.preventDefault();
          const step = e.key === "ArrowLeft" ? -1 : 1;
          const b = cardBoundaries(cards.length, s.doc.settings).map((t) => outputTimeFromModel(t, cards.length, s.doc.settings));
          const current = b.filter((x) => x <= s.time + 0.001).length - 1;
          const target = Math.max(0, Math.min(cards.length - 1, current + step));
          if (b[target] != null) s.setTime(b[target] + 0.01);
          break;
        }
        default: break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (error) {
    return (
      <div className="h-screen bg-app flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-zinc-400">{error}</p>
        <a href="#/" className="btn-primary">Back to projects</a>
      </div>
    );
  }
  if (!doc) {
    return <div className="h-screen bg-app flex items-center justify-center text-sm text-zinc-500">Loading editor…</div>;
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-app text-zinc-100" data-testid="editor-root">
      <TopBar onOpenExport={() => setShowExport(true)} onOpenShortcuts={() => setShowShortcuts(true)} />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <LeftPanel />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <CanvasStage />
          <Timeline />
        </div>
        <RightPanel />
      </div>
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
