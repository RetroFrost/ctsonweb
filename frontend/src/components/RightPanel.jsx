import React, { useMemo } from "react";
import { Palette, SlidersHorizontal, Image as ImageIcon, Gauge, Monitor, Info } from "lucide-react";
import { useEditor } from "../store";
import { MODEL_ILLUSTRATED, ROLE_LABELS, resolveCardsJs } from "../engine/timing";
import { IS_STATIC } from "../api";

const RESOLUTIONS = [
  [1920, 1080, "1080p"],
  [1280, 720, "720p"],
  [1080, 1920, "Vertical"],
  [1080, 1080, "Square"],
  [3840, 2160, "4K"],
];

function Field({ label, value, onChange, type = "text", min, max, step }) {
  return (
    <label className="block">
      <span className="text-[10px] text-zinc-500 block mb-1">{label}</span>
      <input className="input-dark !py-1.5 text-xs" type={type} value={value ?? ""} min={min} max={max} step={step}
        onChange={(e) => onChange(type === "number" || type === "range" ? Number(e.target.value) : e.target.value)} />
    </label>
  );
}

export default function RightPanel() {
  const { doc, selection, setCardField, setSetting } = useEditor();
  const settings = doc.settings;
  const cards = useMemo(() => resolveCardsJs(doc.spreadsheet, settings.field_mapping || {}), [doc.spreadsheet, settings.field_mapping]);
  const selectedCard = selection ? cards[selection.cardIndex] : null;

  const setResolution = (value) => {
    const [width, height] = value.split("x").map(Number);
    useEditor.getState().setDoc((d) => { d.settings.width = width; d.settings.height = height; return d; });
  };

  return (
    <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto" data-testid="right-panel">
      <div className="h-9 px-3 border-b border-line flex items-center gap-2 sticky top-0 bg-panel z-10">
        <SlidersHorizontal size={13} className="text-zinc-500" />
        <span className="ui-label">Properties</span>
      </div>

      {selectedCard && (
        <section className="border-b border-line p-3 space-y-3">
          <div className="ui-label flex items-center gap-2"><ImageIcon size={12} /> Selected card {selection.cardIndex + 1}</div>
          {["badge_primary", "badge_secondary", "title", "description", "image"].map((role) => (
            <Field key={role} label={ROLE_LABELS[role] || role} value={selectedCard[role] || ""}
              onChange={(value) => setCardField(selection.cardIndex, role, value)} />
          ))}
          {settings.model_id === MODEL_ILLUSTRATED && selectedCard.image && (
            <div className="pt-2 border-t border-line space-y-2">
              <div className="text-[10px] text-zinc-500">Artwork position</div>
              <Field label={`Zoom ${(parseFloat(selectedCard.image_zoom) || 1).toFixed(2)}×`} type="range" min={1} max={3} step={0.02}
                value={parseFloat(selectedCard.image_zoom) || 1} onChange={(value) => setCardField(selection.cardIndex, "image_zoom", value, false)} />
              <Field label="Horizontal pan" type="range" min={-1} max={1} step={0.02}
                value={parseFloat(selectedCard.image_pan_x) || 0} onChange={(value) => setCardField(selection.cardIndex, "image_pan_x", value, false)} />
              <Field label="Vertical pan" type="range" min={-1} max={1} step={0.02}
                value={parseFloat(selectedCard.image_pan_y) || 0} onChange={(value) => setCardField(selection.cardIndex, "image_pan_y", value, false)} />
            </div>
          )}
        </section>
      )}

      <section className="border-b border-line p-3 space-y-3">
        <div className="ui-label flex items-center gap-2"><Palette size={12} /> Design</div>
        <label className="flex items-center justify-between text-xs text-zinc-400">
          Background
          <input type="color" value={settings.background || "#05060f"} className="w-10 h-7 bg-transparent border border-line rounded"
            onChange={(e) => setSetting("background", e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[10px] text-zinc-500 block mb-1">Visible cards</span>
          <select className="select-dark !py-1.5 text-xs" value={settings.visible_cards || 0} onChange={(e) => setSetting("visible_cards", Number(e.target.value))}>
            <option value={0}>Automatic</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={settings.hexagons_bounce !== false} onChange={(e) => setSetting("hexagons_bounce", e.target.checked)} />
          Hexagons bounce
        </label>
      </section>

      <section className="border-b border-line p-3 space-y-3">
        <div className="ui-label flex items-center gap-2"><Monitor size={12} /> Output</div>
        <label className="block">
          <span className="text-[10px] text-zinc-500 block mb-1">Resolution</span>
          <select className="select-dark !py-1.5 text-xs" value={`${settings.width}x${settings.height}`} onChange={(e) => setResolution(e.target.value)}>
            {RESOLUTIONS.map(([width, height, label]) => <option key={`${width}x${height}`} value={`${width}x${height}`}>{label} · {width}×{height}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] text-zinc-500 block mb-1">Frame rate</span>
          <select className="select-dark !py-1.5 text-xs" value={settings.fps} onChange={(e) => setSetting("fps", Number(e.target.value))}>
            {[24, 25, 30, 50, 60].map((fps) => <option key={fps} value={fps}>{fps} fps</option>)}
          </select>
        </label>
        <Field label="Custom duration (seconds, blank = automatic)" value={settings.custom_duration ?? ""}
          onChange={(value) => setSetting("custom_duration", value === "" ? null : Math.max(1, Number(value)))} />
      </section>

      <section className="p-3 space-y-2">
        <div className="ui-label flex items-center gap-2"><Gauge size={12} /> Hosting mode</div>
        <div className="text-xs leading-relaxed text-zinc-500 flex gap-2">
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>{IS_STATIC ? "Projects are stored locally in this browser. GitHub Pages cannot run FFmpeg, so MP4 export needs an external CTS backend." : "Connected to the CTS backend for project storage and MP4 rendering."}</span>
        </div>
      </section>
    </aside>
  );
}
