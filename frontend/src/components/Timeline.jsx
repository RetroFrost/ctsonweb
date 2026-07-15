import React, { useMemo, useRef } from "react";
import { Music, ZoomIn } from "lucide-react";
import { useEditor } from "../store";
import {
  cardBoundaries, duration, outputTimeFromModel, resolveCardsJs, formatClock,
} from "../engine/timing";

export default function Timeline() {
  const { doc, time, setTime, setPlaying, setSelection, selection, timelineZoom } = useEditor();
  const set = useEditor.setState;
  const scrollRef = useRef(null);
  const settings = doc.settings;
  const cards = useMemo(() => resolveCardsJs(doc.spreadsheet, settings.field_mapping || {}), [doc.spreadsheet, settings.field_mapping]);
  const dur = Math.max(1, duration(cards.length, settings));
  const pps = timelineZoom;
  const width = Math.max(400, dur * pps + 80);

  const boundaries = useMemo(() => {
    const raw = cardBoundaries(cards.length, settings);
    return raw.map((t) => outputTimeFromModel(t, cards.length, settings));
  }, [cards.length, settings]);

  const scrub = (e) => {
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    setTime(Math.max(0, Math.min(dur, x / pps)));
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlaying(false);
    scrub(e);
  };
  const onPointerMove = (e) => {
    if (e.buttons & 1) scrub(e);
  };

  const tickStep = pps >= 60 ? 1 : pps >= 25 ? 2 : 5;
  const ticks = [];
  for (let t = 0; t <= dur; t += tickStep) ticks.push(t);

  const audioTracks = doc.audio_tracks || [];

  return (
    <div className="h-52 shrink-0 border-t border-line bg-panel flex flex-col overflow-hidden" data-testid="timeline-panel">
      <div className="h-8 shrink-0 flex items-center justify-between px-3 border-b border-line">
        <span className="ui-label">Timeline</span>
        <div className="flex items-center gap-2">
          <ZoomIn size={12} className="text-zinc-500" />
          <input data-testid="timeline-zoom-slider" type="range" min={12} max={140} value={timelineZoom}
            className="w-32" onChange={(e) => set({ timelineZoom: Number(e.target.value) })} />
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto relative"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} data-testid="timeline-scroll">
        <div className="relative" style={{ width, minHeight: "100%" }}>
          <div className="h-6 border-b border-line relative sticky top-0 bg-panel z-10 cursor-ew-resize" data-testid="timeline-ruler">
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 h-full border-l border-zinc-700" style={{ left: t * pps }}>
                <span className="absolute top-0.5 left-1 text-[9px] font-mono text-zinc-500">{formatClock(t)}</span>
              </div>
            ))}
          </div>

          <div className="h-12 relative border-b border-line bg-[#111]" data-testid="timeline-cards-track">
            {boundaries.map((start, i) => {
              const end = i + 1 < boundaries.length ? boundaries[i + 1] : dur;
              const card = cards[i];
              const isSelected = selection?.cardIndex === i;
              return (
                <button
                  key={i}
                  data-testid={`timeline-clip-${i}`}
                  className={`absolute top-1.5 h-9 rounded-[2px] border px-1.5 text-left overflow-hidden transition-colors ${
                    isSelected ? "bg-[#0a3a6e] border-[#007AFF]" : "bg-[#27272A] border-zinc-600 hover:border-zinc-400"
                  }`}
                  style={{ left: start * pps + 1, width: Math.max(14, (end - start) * pps - 2) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTime(Math.min(start + 0.7, (end + start) / 2));
                    setSelection({ cardIndex: i, role: "title" });
                  }}
                >
                  <div className="text-[10px] font-semibold text-zinc-200 truncate leading-tight">
                    {card?.title || `Card ${i + 1}`}
                  </div>
                  <div className="text-[9px] font-mono text-zinc-500 truncate">{card?.badge_primary || "—"}</div>
                </button>
              );
            })}
          </div>

          {audioTracks.map((track, i) => {
            const start = Math.min(dur, track.start_time || 0);
            const trimLen = (track.trim_end != null ? track.trim_end : (track.duration || dur)) - (track.trim_start || 0);
            const len = track.loop ? dur - start : Math.min(Math.max(0.2, trimLen), dur - start);
            return (
              <div key={i} className="h-7 relative border-b border-line bg-[#101410]" data-testid={`timeline-audio-${i}`}>
                <div className="absolute top-1 h-5 rounded-[2px] bg-emerald-900 border border-emerald-700 flex items-center gap-1 px-1.5 overflow-hidden"
                  style={{ left: start * pps, width: Math.max(16, len * pps) }}>
                  <Music size={9} className="text-emerald-400 shrink-0" />
                  <span className="text-[9px] text-emerald-200 truncate">{track.name || track.path.split("/").pop()}</span>
                </div>
              </div>
            );
          })}

          <div data-testid="playhead" className="absolute top-0 bottom-0 w-px bg-[#FF3B30] z-20 pointer-events-none" style={{ left: time * pps }}>
            <div className="absolute -top-0 -translate-x-1/2 w-2.5 h-2.5 bg-[#FF3B30]" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
