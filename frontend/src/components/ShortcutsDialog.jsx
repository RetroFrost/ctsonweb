import React from "react";
import { X } from "lucide-react";

const GROUPS = [
  {
    title: "Playback",
    items: [
      ["Space", "Play / pause"],
      ["Home", "Jump to start"],
      ["End", "Jump to end"],
      ["← / →", "Previous / next card"],
      [", / .", "Step one frame back / forward"],
      ["L", "Toggle loop"],
    ],
  },
  {
    title: "Editing",
    items: [
      ["Ctrl+Z", "Undo"],
      ["Ctrl+Shift+Z / Ctrl+Y", "Redo"],
      ["Ctrl+D", "Duplicate selected card"],
      ["Delete", "Delete selected card"],
      ["N", "Add a new card"],
      ["Enter", "Apply inline edit"],
      ["Esc", "Cancel inline edit / deselect"],
    ],
  },
  {
    title: "Canvas",
    items: [
      ["Double-click text", "Edit it in place"],
      ["Click image area", "Change the picture"],
      ["G", "Toggle grid overlay"],
      ["S", "Toggle safe-area guides"],
    ],
  },
];

export default function ShortcutsDialog({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={onClose}>
      <div data-testid="shortcuts-dialog" className="bg-panel border border-line rounded-[4px] w-[560px] max-h-[80vh] overflow-y-auto fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line sticky top-0 bg-panel">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button className="btn-icon" data-testid="close-shortcuts-btn" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="ui-label mb-2">{group.title}</div>
              <div className="space-y-1.5">
                {group.items.map(([keys, label]) => (
                  <div key={keys} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">{label}</span>
                    <kbd className="font-mono text-[10px] bg-[#1A1A1A] border border-line rounded px-1.5 py-0.5 text-zinc-300">{keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
