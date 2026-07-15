import React, { useEffect, useRef, useState } from "react";
import { X, Download, Ban, AlertTriangle, CheckCircle2, Loader2, Server } from "lucide-react";
import { useEditor } from "../store";
import { api, API, IS_STATIC } from "../api";
import { duration, resolveCardsJs, cardIsBlank, formatClock } from "../engine/timing";

export default function ExportDialog({ onClose }) {
  const { doc } = useEditor();
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);

  const settings = doc.settings;
  const cards = resolveCardsJs(doc.spreadsheet, settings.field_mapping || {}).filter((c) => !cardIsBlank(c));
  const dur = duration(cards.length, settings);
  const frames = Math.ceil(dur * settings.fps);

  const start = async () => {
    if (IS_STATIC) return;
    setStarting(true);
    try {
      const { data } = await api.post(`/projects/${doc.id}/export`, {});
      setJob(data.job_id);
    } catch (err) {
      setStatus({ status: "error", error: { summary: err?.response?.data?.detail || "Could not start the export." } });
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!job || IS_STATIC) return undefined;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/export/${job}`);
        setStatus(data);
        if (["done", "error", "canceled"].includes(data.status)) clearInterval(pollRef.current);
      } catch {
        clearInterval(pollRef.current);
      }
    }, 700);
    return () => clearInterval(pollRef.current);
  }, [job]);

  const cancel = async () => {
    if (job) await api.post(`/export/${job}/cancel`).catch(() => {});
  };

  const pct = status && status.total ? Math.round((status.completed / status.total) * 100) : 0;
  const running = status?.status === "running" || (job && !status);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={() => { if (!running) onClose(); }}>
      <div data-testid="export-dialog" className="bg-panel border border-line rounded-[4px] w-[480px] fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h2 className="text-sm font-semibold">Export video</h2>
          {!running && <button className="btn-icon" data-testid="close-export-btn" onClick={onClose}><X size={15} /></button>}
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono">
            <div className="text-zinc-500">Cards</div><div className="text-zinc-200 text-right">{cards.length}</div>
            <div className="text-zinc-500">Resolution</div><div className="text-zinc-200 text-right">{settings.width} × {settings.height}</div>
            <div className="text-zinc-500">Frame rate</div><div className="text-zinc-200 text-right">{settings.fps} fps</div>
            <div className="text-zinc-500">Duration</div><div className="text-zinc-200 text-right">{formatClock(dur)}</div>
            <div className="text-zinc-500">Frames</div><div className="text-zinc-200 text-right">{frames.toLocaleString()}</div>
            <div className="text-zinc-500">Audio tracks</div><div className="text-zinc-200 text-right">{(doc.audio_tracks || []).length}</div>
          </div>

          {IS_STATIC ? (
            <div className="border border-amber-900/70 bg-amber-950/25 rounded-[4px] p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold"><Server size={15} /> MP4 export needs the CTS backend</div>
              <p className="text-xs leading-relaxed text-zinc-400">
                GitHub Pages hosts the editor as a static website, so it cannot run FFmpeg. Your project is autosaved in this browser and can be downloaded as desktop-compatible JSON from the top bar.
              </p>
              <p className="text-[11px] text-zinc-500">
                Set <code className="font-mono text-zinc-300">REACT_APP_BACKEND_URL</code> during deployment to reconnect server rendering.
              </p>
            </div>
          ) : !job ? (
            <button data-testid="start-export-btn" className="btn-primary w-full py-2" disabled={starting || cards.length === 0} onClick={start}>
              {cards.length === 0 ? "Add at least one non-empty card first" : starting ? "Starting…" : "Start H.264 / AAC export"}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                {running && <Loader2 size={14} className="animate-spin text-[#007AFF]" />}
                {status?.status === "done" && <CheckCircle2 size={14} className="text-emerald-500" />}
                {status?.status === "error" && <AlertTriangle size={14} className="text-red-400" />}
                {status?.status === "canceled" && <Ban size={14} className="text-zinc-500" />}
                <span data-testid="export-stage" className="font-semibold text-zinc-200">{status?.stage || "Starting"}</span>
                <span className="text-zinc-500 truncate">{status?.message}</span>
              </div>
              <div className="h-2 bg-[#1A1A1A] rounded-full overflow-hidden border border-line">
                <div className="h-full bg-[#007AFF] transition-[width] duration-300" style={{ width: `${pct}%` }} data-testid="export-progress-bar" />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                <span>{pct}%</span>
                {running && status?.eta != null && <span>ETA {formatClock(status.eta)}</span>}
              </div>

              {status?.status === "error" && (
                <div className="text-xs bg-red-950/40 border border-red-900 rounded-[4px] p-3 space-y-1">
                  <div className="text-red-300 font-medium">{status.error?.summary}</div>
                  {status.error?.suggestion && <div className="text-zinc-400">{status.error.suggestion}</div>}
                </div>
              )}

              <div className="flex gap-2">
                {running && <button data-testid="cancel-export-btn" className="btn-secondary flex-1 flex items-center justify-center gap-2" onClick={cancel}><Ban size={13} /> Cancel export</button>}
                {status?.status === "done" && <a data-testid="download-video-btn" className="btn-primary flex-1 flex items-center justify-center gap-2" href={`${API}/export/${job}/download`}><Download size={14} /> Download MP4</a>}
                {["error", "canceled"].includes(status?.status) && <button className="btn-secondary flex-1" onClick={() => { setJob(null); setStatus(null); }}>Try again</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
