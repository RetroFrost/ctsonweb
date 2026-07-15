import React, { useRef } from 'react';
import { BACKGROUNDS, FONT_OPTIONS, MODELS } from '../constants.js';
import { fileToDataUrl } from '../utils/assets.js';

function RangeControl({ label, value, min, max, step, suffix = '', onChange }) {
  return (
    <label className="range-control">
      <span className="control-label"><b>{label}</b><output>{Math.round(value * (suffix === '%' ? 100 : 1))}{suffix}</output></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export default function ModelsPanel({ project, onSettings, onMapping }) {
  const fontRef = useRef(null);
  const settings = project.settings;
  const model = MODELS[settings.modelId];

  const uploadFont = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const family = `CTS Custom ${Date.now()}`;
    const fontFace = new FontFace(family, `url(${dataUrl})`);
    await fontFace.load();
    document.fonts.add(fontFace);
    onSettings({ customFont: { name: file.name, family, dataUrl }, fontFamily: family });
  };

  return (
    <div className="tab-page models-page">
      <section className="settings-section">
        <div className="section-heading">
          <div><span className="eyebrow">VISUAL MODEL</span><h3>{model.name}</h3></div>
        </div>
        <div className="model-picker">
          {Object.values(MODELS).map((item) => (
            <button
              key={item.id}
              className={`model-card ${settings.modelId === item.id ? 'active' : ''}`}
              onClick={() => onSettings({ modelId: item.id, visibleCards: 0 })}
            >
              <span className={`model-miniature ${item.id}`}><i /><i /><i /></span>
              <strong>{item.name}</strong>
              <small>{item.visibleCards} cards visible</small>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <span className="eyebrow">OUTPUT STYLE</span>
        <label className="field-label">
          <span>Font</span>
          <select value={settings.fontFamily} onChange={(event) => onSettings({ fontFamily: event.target.value, customFont: null })}>
            {FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
            {settings.customFont && <option value={settings.customFont.family}>{settings.customFont.name}</option>}
          </select>
        </label>
        <button className="wide-button" onClick={() => fontRef.current?.click()}>Upload custom font</button>
        <input ref={fontRef} hidden type="file" accept=".ttf,.otf,.woff,.woff2" onChange={uploadFont} />

        {settings.modelId === 'illustrated_cards' && (
          <label className="field-label">
            <span>Illustrated background</span>
            <select value={settings.illustratedBackground} onChange={(event) => onSettings({ illustratedBackground: event.target.value })}>
              {BACKGROUNDS.map((background) => <option key={background.id} value={background.id}>{background.name}</option>)}
            </select>
          </label>
        )}

        <RangeControl label="Image scale" value={settings.imageScale} min={0.5} max={2} step={0.01} suffix="%" onChange={(imageScale) => onSettings({ imageScale })} />
        {settings.modelId === 'illustrated_cards' && (
          <>
            <RangeControl label="Illustrated hexagon" value={settings.hexagonScale} min={0.6} max={1.6} step={0.01} suffix="%" onChange={(hexagonScale) => onSettings({ hexagonScale })} />
            <label className="check-row"><input type="checkbox" checked={settings.autoSizeArtwork} onChange={(event) => onSettings({ autoSizeArtwork: event.target.checked })} /><span>Auto-size artwork and hexagon from typed value</span></label>
            <label className="check-row"><input type="checkbox" checked={settings.showHexagons} onChange={(event) => onSettings({ showHexagons: event.target.checked })} /><span>Show hexagons</span></label>
            <label className="check-row"><input type="checkbox" checked={settings.titleBarEnabled !== false} onChange={(event) => onSettings({ titleBarEnabled: event.target.checked })} /><span>Keep white title bar</span></label>
          </>
        )}
      </section>

      <section className="settings-section">
        <span className="eyebrow">ADVANCED MAPPING</span>
        <p className="helper-text compact">Choose which spreadsheet field supplies each object. Auto keeps CTS header detection.</p>
        <div className="mapping-grid">
          {model.fields.map(([label, role]) => (
            <label key={role} className="field-label compact-field">
              <span>{label}</span>
              <select value={settings.fieldMapping?.[role] || ''} onChange={(event) => onMapping(role, event.target.value)}>
                <option value="">Auto</option>
                {project.data.headers.map((header) => <option key={header} value={header}>{header}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <span className="eyebrow">TIMING & OUTPUT</span>
        <div className="form-grid two">
          <label className="field-label"><span>Width</span><input type="number" min="320" max="7680" value={settings.width} onChange={(event) => onSettings({ width: Number(event.target.value) || 1920 })} /></label>
          <label className="field-label"><span>Height</span><input type="number" min="180" max="4320" value={settings.height} onChange={(event) => onSettings({ height: Number(event.target.value) || 1080 })} /></label>
          <label className="field-label"><span>FPS</span><input type="number" min="1" max="60" value={settings.fps} onChange={(event) => onSettings({ fps: Number(event.target.value) || 30 })} /></label>
          <label className="field-label"><span>Visible cards</span><input type="number" min="0" max="8" value={settings.visibleCards} onChange={(event) => onSettings({ visibleCards: Number(event.target.value) || 0 })} /><small>0 = model default</small></label>
          <label className="field-label full"><span>Custom total duration</span><input type="number" min="1" step="0.1" placeholder="Automatic" value={settings.customDuration ?? ''} onChange={(event) => onSettings({ customDuration: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        </div>
      </section>
    </div>
  );
}
