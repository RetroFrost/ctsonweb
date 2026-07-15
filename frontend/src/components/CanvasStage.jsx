import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Grid3X3, Frame, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "../store";
import CardView from "../engine/CardView";
import {
  autoDuration, cardBoundaries, duration, effectiveVisible, fieldAt, formatTimecode,
  modelTime, outputTimeFromModel, placements, resolveCardsJs,
} from "../engine/timing";

export default function CanvasStage() {
  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ w: 960, h: 540 });
  const {
    doc, time, playing, loop, speed, zoom, showGuides, showGrid, selection,
    setTime, setPlaying, setSelection, setCardField, addCard,
  } = useEditor();
  const set = useEditor.setState;
  const settings = doc.settings;
  const cards = useMemo(() => resolveCardsJs(doc.spreadsheet, settings.field_mapping || {}), [doc.spreadsheet, settings.field_mapping]);
  const dur = Math.max(0.01, duration(cards.length, settings));
  const visible = effectiveVisible(settings);
  const cardWidth = stageSize.w / visible;
  const mTime = modelTime(time, cards.length, settings);
  const shown = placements(cards.length, mTime, visible, stageSize.w, settings.hexagons_bounce);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const update = () => setStageSize({ w: Math.max(1, node.clientWidth), h: Math.max(1, node.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const boundaries = useMemo(() => cardBoundaries(cards.length, settings).map((value) => outputTimeFromModel(value, cards.length, settings)), [cards.length, settings]);

  const seekCard = (delta) => {
    if (!cards.length) return;
    const current = Math.max(0, boundaries.filter((value) => value <= time + 0.001).length - 1);
    const target = Math.max(0, Math.min(cards.length - 1, current + delta));
    setPlaying(false);
    setTime(Math.min(dur, (boundaries[target] || 0) + 0.7));
    setSelection({ cardIndex: target, role: "title" });
  };

  const locate = (event) => {
    const rect = stageRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const place = [...shown].reverse().find((item) => x >= item.x && x <= item.x + cardWidth);
    if (!place) return null;
    return {
      cardIndex: place.index,
      role: fieldAt(settings.model_id, (x - place.x) / cardWidth, y / stageSize.h),
    };
  };

  const selectAt = (event) => {
    const target = locate(event);
    if (target) setSelection(target);
    else setSelection(null);
  };

  const editAt = (event) => {
    const target = locate(event);
    if (!target) return;
    const card = cards[target.cardIndex];
    const current = card?.[target.role] || "";
    const label = target.role === "image" ? "Image URL" : target.role.replaceAll("_", " ");
    const value = window.prompt(`Edit ${label}`, current);
    if (value == null) return;
    setCardField(target.cardIndex, target.role, value);
    setSelection(target);
    toast.success(`${label} updated`);
  };

  const zoomScale = zoom === "fit" ? 1 : Number(zoom) || 1;
  const fadeStart = Math.max(0, autoDuration(cards.length, settings) - 0.8);
  const fade = mTime > fadeStart ? Math.min(1, (mTime - fadeStart) / 0.8) : 0;

  return (
    <div className="flex-1 min-h-0 bg-black flex flex-col overflow-hidden" data-testid="canvas-panel">
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-auto p-4">
        <div className="w-full h-full flex items-center justify-center" style={{ transform: `scale(${zoomScale})`, transformOrigin: "center" }}>
          <div
            ref={stageRef}
            data-testid="canvas-stage"
            className="relative overflow-hidden shadow-2xl ring-1 ring-white/10 select-none"
            style={{
              width: "min(100%, calc((100vh - 310px) * 16 / 9))",
              aspectRatio: "16 / 9",
              maxHeight: "100%",
              background: settings.background || "#05060f",
              opacity: 1 - fade,
            }}
            onClick={selectAt}
            onDoubleClick={editAt}
          >
            {shown.map(({ index, x, alpha, badgeScale }) => (
              <div key={index} className="absolute top-0 h-full"
                style={{ left: x, width: cardWidth, opacity: alpha, transform: `translateY(${(1 - alpha) * stageSize.h * 0.018}px)` }}>
                <CardView card={cards[index]} modelId={settings.model_id} w={cardWidth} h={stageSize.h} badgeScale={badgeScale} />
                {selection?.cardIndex === index && (
                  <div className="absolute inset-1 border border-[#007AFF] pointer-events-none shadow-[inset_0_0_0_1px_rgba(0,122,255,.35)]" />
                )}
              </div>
            ))}

            {showGrid && (
              <div className="absolute inset-0 pointer-events-none opacity-25"
                style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.45) 1px, transparent 1px)", backgroundSize: "10% 10%" }} />
            )}
            {showGuides && (
              <div className="absolute inset-[5%] border border-dashed border-white/50 pointer-events-none">
                <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-white/30" />
                <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-white/30" />
              </div>
            )}
            {!cards.length && <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">Add a card to start designing.</div>}
          </div>
        </div>
      </div>

      <div className="h-11 shrink-0 border-t border-line bg-header flex items-center justify-between px-3 gap-3">
        <div className="flex items-center gap-1">
          <button className="btn-icon" title="Previous card" onClick={() => seekCard(-1)}><SkipBack size={15} /></button>
          <button data-testid="play-button" className="btn-icon !text-white" title="Play / pause"
            onClick={() => { if (time >= dur - 0.01) setTime(0); setPlaying(!playing); }}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="btn-icon" title="Next card" onClick={() => seekCard(1)}><SkipForward size={15} /></button>
          <button className={`btn-icon ${loop ? "!text-[#007AFF]" : ""}`} title="Loop" onClick={() => set({ loop: !loop })}><Repeat size={15} /></button>
          <select className="select-dark !w-20 !py-1 text-xs" value={speed} onChange={(e) => set({ speed: Number(e.target.value) })}>
            {[0.25, 0.5, 1, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
        </div>

        <div className="flex-1 flex items-center gap-2 max-w-xl">
          <span className="text-[10px] font-mono text-zinc-400 w-16 text-right">{formatTimecode(time, settings.fps)}</span>
          <input className="flex-1" type="range" min={0} max={dur} step={1 / settings.fps} value={Math.min(time, dur)} onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }} />
          <span className="text-[10px] font-mono text-zinc-600 w-16">{formatTimecode(dur, settings.fps)}</span>
        </div>

        <div className="flex items-center gap-1">
          <button className={`btn-icon ${showGrid ? "!text-[#007AFF]" : ""}`} title="Grid" onClick={() => set({ showGrid: !showGrid })}><Grid3X3 size={15} /></button>
          <button className={`btn-icon ${showGuides ? "!text-[#007AFF]" : ""}`} title="Safe guides" onClick={() => set({ showGuides: !showGuides })}><Frame size={15} /></button>
          <select className="select-dark !w-20 !py-1 text-xs" value={zoom} onChange={(e) => set({ zoom: e.target.value === "fit" ? "fit" : Number(e.target.value) })}>
            <option value="fit">Fit</option><option value={0.5}>50%</option><option value={0.75}>75%</option><option value={1}>100%</option><option value={1.5}>150%</option>
          </select>
          <button className="btn-secondary !px-2 !py-1 text-xs flex items-center gap-1" onClick={() => { const index = addCard(); setSelection({ cardIndex: index, role: "title" }); }}><Plus size={13} /> Card</button>
        </div>
      </div>
    </div>
  );
}
