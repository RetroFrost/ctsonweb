import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fileToDataUrl } from '../utils/assets.js';

function colorDistance(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]);
}

function dividerCandidates(imageData, width, height, orientation) {
  const data = imageData.data;
  const length = orientation === 'horizontal' ? width : height;
  const cross = orientation === 'horizontal' ? height : width;
  const scores = [];
  for (let position = 0; position < length; position += 1) {
    const firstIndex = orientation === 'horizontal' ? position * 4 : position * width * 4;
    const base = [data[firstIndex], data[firstIndex + 1], data[firstIndex + 2], data[firstIndex + 3]];
    let variance = 0;
    for (let index = 1; index < cross; index += Math.max(1, Math.floor(cross / 80))) {
      const pixelIndex = orientation === 'horizontal'
        ? (index * width + position) * 4
        : (position * width + index) * 4;
      variance += colorDistance(base, [data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2], data[pixelIndex + 3]]);
    }
    scores.push(variance);
  }
  const maxGood = Math.max(40, cross * 0.8);
  const runs = [];
  let start = null;
  for (let i = 0; i < scores.length; i += 1) {
    if (scores[i] <= maxGood && start === null) start = i;
    if ((scores[i] > maxGood || i === scores.length - 1) && start !== null) {
      const end = scores[i] > maxGood ? i : i + 1;
      if (end - start >= 2) runs.push([start, end]);
      start = null;
    }
  }
  return runs;
}

function slicesFromDividers(length, dividers) {
  if (!dividers.length) return [];
  const slices = [];
  let start = 0;
  for (const [dividerStart, dividerEnd] of dividers) {
    if (dividerStart - start > 3) slices.push([start, dividerStart]);
    start = dividerEnd;
  }
  if (length - start > 3) slices.push([start, length]);
  return slices;
}

async function makeSlices(src, orientation, mode, count) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const length = orientation === 'horizontal' ? canvas.width : canvas.height;
  let ranges = [];
  if (mode === 'auto') {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ranges = slicesFromDividers(length, dividerCandidates(data, canvas.width, canvas.height, orientation));
  }
  if (!ranges.length) {
    const sliceCount = Math.max(1, Math.min(100, Number(count) || 1));
    ranges = Array.from({ length: sliceCount }, (_, index) => [
      Math.round(index * length / sliceCount),
      Math.round((index + 1) * length / sliceCount),
    ]);
  }
  return ranges.map(([start, end], index) => {
    const output = document.createElement('canvas');
    output.width = orientation === 'horizontal' ? end - start : canvas.width;
    output.height = orientation === 'horizontal' ? canvas.height : end - start;
    const out = output.getContext('2d');
    out.drawImage(
      canvas,
      orientation === 'horizontal' ? start : 0,
      orientation === 'horizontal' ? 0 : start,
      output.width,
      output.height,
      0,
      0,
      output.width,
      output.height,
    );
    return { id: index, src: output.toDataURL('image/png'), width: output.width, height: output.height };
  });
}

export default function StripImporter({ open, onClose, expectedCount, onApply }) {
  const fileRef = useRef(null);
  const [src, setSrc] = useState('');
  const [name, setName] = useState('');
  const [orientation, setOrientation] = useState('horizontal');
  const [mode, setMode] = useState('auto');
  const [count, setCount] = useState(expectedCount || 4);
  const [slices, setSlices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setCount(expectedCount || 4);
  }, [open, expectedCount]);

  useEffect(() => {
    if (!src) return;
    let active = true;
    setBusy(true);
    setError('');
    makeSlices(src, orientation, mode, count)
      .then((result) => { if (active) setSlices(result); })
      .catch((reason) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [src, orientation, mode, count]);

  const mismatch = expectedCount > 0 && slices.length !== expectedCount;
  const title = useMemo(() => name ? `Split ${name}` : 'Import image strip', [name]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card strip-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><h2>{title}</h2><p>Detect uniform dividers or slice the strip into equal pieces.</p></div>
          <button className="icon-close" onClick={onClose}>×</button>
        </div>
        <div className="strip-controls">
          <button onClick={() => fileRef.current?.click()}>{src ? 'Choose another strip' : 'Choose strip image'}</button>
          <input ref={fileRef} hidden type="file" accept="image/*" onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setName(file.name);
            setSrc(await fileToDataUrl(file));
          }} />
          <label><span>Direction</span><select value={orientation} onChange={(event) => setOrientation(event.target.value)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
          <label><span>Method</span><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="auto">Detect dividers</option><option value="equal">Equal slices</option></select></label>
          <label><span>Equal slice count</span><input type="number" min="1" max="100" value={count} onChange={(event) => setCount(Number(event.target.value) || 1)} /></label>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {!src && <div className="strip-empty">Choose a horizontal or vertical image strip to preview the cuts.</div>}
        {src && (
          <div className="slice-preview-grid">
            {busy ? <div className="strip-empty">Analyzing strip…</div> : slices.map((slice, index) => (
              <figure key={slice.id}><img src={slice.src} alt={`Slice ${index + 1}`} /><figcaption>{index + 1} · {slice.width}×{slice.height}</figcaption></figure>
            ))}
          </div>
        )}
        {mismatch && <div className="warning-banner">Detected {slices.length} cuts, but the project currently has {expectedCount} cards. Applying will fill the first {Math.min(slices.length, expectedCount)} cards.</div>}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={!slices.length || busy} onClick={() => onApply(slices.map((slice) => slice.src))}>Apply {slices.length || ''} images</button>
        </div>
      </div>
    </div>
  );
}
