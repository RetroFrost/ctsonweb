import React, { useRef } from 'react';
import { fileToDataUrl } from '../utils/assets.js';

function NumberField({ label, value, min = 0, step = 0.1, onChange, placeholder }) {
  return (
    <label className="mini-field">
      <span>{label}</span>
      <input type="number" min={min} step={step} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} />
    </label>
  );
}

export default function AudioPanel({ project, onTracks, onMasterVolume }) {
  const fileRef = useRef(null);
  const tracks = project.audioTracks || [];

  const addFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    const additions = [];
    for (const file of files) {
      additions.push({
        id: crypto.randomUUID(),
        name: file.name,
        src: await fileToDataUrl(file),
        startTime: 0,
        trimStart: 0,
        trimEnd: null,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
        loop: false,
      });
    }
    onTracks([...tracks, ...additions]);
  };

  const update = (id, patch) => onTracks(tracks.map((track) => track.id === id ? { ...track, ...patch } : track));
  const remove = (id) => onTracks(tracks.filter((track) => track.id !== id));

  return (
    <div className="tab-page audio-page">
      <p className="helper-text">Each soundtrack row is an independent export layer. Audio is embedded into saved web projects.</p>
      <button className="insert-data-button audio-add" onClick={() => fileRef.current?.click()}>＋ ADD SOUNDTRACK</button>
      <input ref={fileRef} hidden multiple type="file" accept="audio/*" onChange={addFiles} />

      <label className="range-control master-volume">
        <span className="control-label"><b>Master volume</b><output>{Math.round(project.settings.soundtrackMasterVolume * 100)}%</output></span>
        <input type="range" min="0" max="2" step="0.01" value={project.settings.soundtrackMasterVolume} onChange={(event) => onMasterVolume(Number(event.target.value))} />
      </label>

      <div className="audio-track-list">
        {tracks.map((track, index) => (
          <article className="audio-track" key={track.id}>
            <header>
              <div><span className="track-index">A{index + 1}</span><strong title={track.name}>{track.name}</strong></div>
              <button className="icon-close small" onClick={() => remove(track.id)}>×</button>
            </header>
            <div className="audio-grid">
              <NumberField label="Timeline start" value={track.startTime} onChange={(startTime) => update(track.id, { startTime: Math.max(0, startTime || 0) })} />
              <NumberField label="Trim In" value={track.trimStart} onChange={(trimStart) => update(track.id, { trimStart: Math.max(0, trimStart || 0) })} />
              <NumberField label="Trim Out" value={track.trimEnd} placeholder="End" onChange={(trimEnd) => update(track.id, { trimEnd })} />
              <NumberField label="Volume" value={track.volume} min={0} step={0.01} onChange={(volume) => update(track.id, { volume: Math.max(0, volume ?? 1) })} />
              <NumberField label="Fade In" value={track.fadeIn} onChange={(fadeIn) => update(track.id, { fadeIn: Math.max(0, fadeIn || 0) })} />
              <NumberField label="Fade Out" value={track.fadeOut} onChange={(fadeOut) => update(track.id, { fadeOut: Math.max(0, fadeOut || 0) })} />
            </div>
            <label className="check-row"><input type="checkbox" checked={track.loop} onChange={(event) => update(track.id, { loop: event.target.checked })} /><span>Loop trimmed region</span></label>
          </article>
        ))}
        {!tracks.length && <div className="empty-audio"><strong>No soundtrack layers</strong><span>CTS will export a video-only MP4.</span></div>}
      </div>
    </div>
  );
}
