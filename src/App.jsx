import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AudioPanel from './components/AudioPanel.jsx';
import DataPanel from './components/DataPanel.jsx';
import ModelsPanel from './components/ModelsPanel.jsx';
import ProgramMonitor from './components/ProgramMonitor.jsx';
import StripImporter from './components/StripImporter.jsx';
import { APP_VERSION, MODELS } from './constants.js';
import { scheduleProjectAudio } from './lib/audio.js';
import { exportProjectMp4 } from './lib/exportVideo.js';
import { bakeTransformedObject, objectKey } from './lib/renderer.js';
import {
  createDefaultProject,
  migrateProject,
  normalizeTable,
  projectDuration,
  resolvedCards,
  roleHeader,
} from './utils/data.js';
import { downloadBlob, fileToDataUrl, loadImage, sanitizeFilename } from './utils/assets.js';

const TAB_NAMES = ['Data', 'Models', 'Audio'];

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}`;
}

function ensureRowsAndColumns(project, rowIndex, columnIndex) {
  const next = structuredClone(project);
  while (next.data.rows.length <= rowIndex) {
    next.data.rows.push(Array(next.data.headers.length).fill(''));
  }
  while (next.data.headers.length <= columnIndex) {
    next.data.headers.push(`Column ${next.data.headers.length + 1}`);
    next.data.rows = next.data.rows.map((row) => [...row, '']);
  }
  next.data.rows = next.data.rows.map((row) => {
    const copy = [...row];
    while (copy.length < next.data.headers.length) copy.push('');
    return copy;
  });
  return next;
}

function roleDefaultHeader(role, project) {
  const model = MODELS[project.settings.modelId];
  return model.fields.find(([, fieldRole]) => fieldRole === role)?.[0]
    || ({ badge_primary: 'Value', badge_secondary: 'Unit', title: 'Title', description: 'Description', image: 'Image' }[role]);
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onClose, 4200);
    return () => clearTimeout(timer);
  }, [toast, onClose]);
  if (!toast) return null;
  return <div className={`toast ${toast.type || 'info'}`}><span>{toast.message}</span><button onClick={onClose}>×</button></div>;
}

function ExportOverlay({ state, onCancel, onClose }) {
  if (!state.open) return null;
  const percent = Math.round((state.progress || 0) * 100);
  return (
    <div className="modal-backdrop export-backdrop">
      <div className="modal-card export-modal">
        <div className="export-mark">CTS</div>
        <h2>{state.done ? 'Export complete' : state.error ? 'Export failed' : 'Exporting MP4'}</h2>
        <p>{state.error || state.detail || 'Preparing browser video encoder…'}</p>
        {!state.error && (
          <>
            <div className="progress-track"><i style={{ width: `${percent}%` }} /></div>
            <div className="export-percent"><span>{percent}%</span><span>H.264 · {state.width}×{state.height} · {state.fps} FPS</span></div>
          </>
        )}
        <div className="modal-actions centered">
          {!state.done && !state.error && <button className="danger-button" onClick={onCancel}>Cancel export</button>}
          {(state.done || state.error) && <button className="primary-button" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [project, setProject] = useState(createDefaultProject);
  const [projectName, setProjectName] = useState('Untitled comparison');
  const [activeTab, setActiveTab] = useState('Data');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState(null);
  const [transformMode, setTransformMode] = useState(false);
  const [stripOpen, setStripOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [images, setImages] = useState(new Map());
  const [bakedImages, setBakedImages] = useState(new Map());
  const [exportState, setExportState] = useState({ open: false, progress: 0, detail: '' });
  const projectFileRef = useRef(null);
  const imageFileRef = useRef(null);
  const pendingImageRowRef = useRef(null);
  const imagePromiseCache = useRef(new Map());
  const animationRef = useRef(null);
  const playbackStartRef = useRef(0);
  const audioContextRef = useRef(null);
  const audioSourcesRef = useRef([]);
  const exportAbortRef = useRef(null);
  const projectRef = useRef(project);
  const rebakeInFlightRef = useRef(new Set());

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const cards = useMemo(() => resolvedCards(project), [project]);
  const duration = useMemo(() => projectDuration(project), [project]);

  const notify = useCallback((message, type = 'info') => setToast({ message, type }), []);

  useEffect(() => {
    const customFont = project.settings.customFont;
    if (!customFont?.dataUrl || !customFont.family) return;
    if (document.fonts.check(`16px "${customFont.family}"`)) return;
    const face = new FontFace(customFont.family, `url(${customFont.dataUrl})`);
    face.load().then(() => document.fonts.add(face)).catch(() => {});
  }, [project.settings.customFont]);

  useEffect(() => {
    let active = true;
    const sources = new Set(cards.map((card) => card.image).filter(Boolean));
    Promise.all(Array.from(sources).map(async (source) => [source, await loadImage(source, imagePromiseCache.current)]))
      .then((entries) => {
        if (!active) return;
        setImages(new Map(entries.filter(([, image]) => image)));
      });
    return () => { active = false; };
  }, [cards]);

  useEffect(() => {
    let active = true;
    const sources = new Set(Object.values(project.transforms || {}).map((transform) => transform.baked).filter(Boolean));
    Promise.all(Array.from(sources).map(async (source) => [source, await loadImage(source, imagePromiseCache.current)]))
      .then((entries) => {
        if (!active) return;
        setBakedImages(new Map(entries.filter(([, image]) => image)));
      });
    return () => { active = false; };
  }, [project.transforms]);


  useEffect(() => {
    const timer = setTimeout(() => {
      const snapshot = projectRef.current;
      const currentCards = resolvedCards(snapshot);
      for (const [key, transform] of Object.entries(snapshot.transforms || {})) {
        if (transform.baked || rebakeInFlightRef.current.has(key)) continue;
        const separator = key.lastIndexOf(':');
        const cardId = key.slice(0, separator);
        const role = key.slice(separator + 1);
        const card = currentCards.find((item) => item.id === cardId);
        if (!card) continue;
        if (role === 'image' && card.image && !images.has(card.image)) continue;
        rebakeInFlightRef.current.add(key);
        bakeTransformedObject(snapshot, card, role, transform, images.get(card.image))
          .then((baked) => {
            setProject((current) => {
              const latest = current.transforms[key];
              if (!latest || latest.baked) return current;
              return { ...current, transforms: { ...current.transforms, [key]: { ...latest, baked } } };
            });
          })
          .catch((error) => notify(`Could not refresh a transformed object: ${error.message}`, 'error'))
          .finally(() => rebakeInFlightRef.current.delete(key));
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [project.transforms, project.data, project.settings.fontFamily, images, notify]);

  const stopAudio = useCallback(() => {
    for (const source of audioSourcesRef.current) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    audioSourcesRef.current = [];
  }, []);

  const startAudio = useCallback(async (fromTime) => {
    stopAudio();
    if (!project.audioTracks.length || fromTime >= duration) return;
    try {
      const context = audioContextRef.current || new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      audioSourcesRef.current = await scheduleProjectAudio({
        context,
        destination: context.destination,
        tracks: project.audioTracks,
        masterVolume: project.settings.soundtrackMasterVolume,
        timelineTime: fromTime,
        timelineDuration: duration,
        startAt: context.currentTime + 0.03,
      });
    } catch (error) {
      notify(`Audio preview unavailable: ${error.message}`, 'warning');
    }
  }, [project.audioTracks, project.settings.soundtrackMasterVolume, duration, notify, stopAudio]);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(animationRef.current);
      stopAudio();
      return undefined;
    }
    playbackStartRef.current = performance.now() - time * 1000;
    startAudio(time);
    const tick = (now) => {
      const next = (now - playbackStartRef.current) / 1000;
      if (next >= duration) {
        setTime(duration);
        setPlaying(false);
        return;
      }
      setTime(next);
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
    // Playing is intentionally the trigger. Seeking while playing restarts through seekTo().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => () => {
    cancelAnimationFrame(animationRef.current);
    stopAudio();
    audioContextRef.current?.close?.();
  }, [stopAudio]);

  useEffect(() => {
    if (time > duration) setTime(duration);
  }, [duration, time]);

  const seekTo = (nextTime) => {
    const clamped = Math.max(0, Math.min(duration, Number(nextTime) || 0));
    setTime(clamped);
    if (playing) {
      playbackStartRef.current = performance.now() - clamped * 1000;
      startAudio(clamped);
    }
  };

  const invalidateBakedTransforms = (transforms) => Object.fromEntries(
    Object.entries(transforms || {}).map(([key, transform]) => [key, { ...transform, baked: null }]),
  );

  const updateSettings = (patch) => setProject((current) => ({
    ...current,
    settings: { ...current.settings, ...patch },
    transforms: invalidateBakedTransforms(current.transforms),
  }));

  const updateMapping = (role, header) => setProject((current) => ({
    ...current,
    settings: {
      ...current.settings,
      fieldMapping: { ...current.settings.fieldMapping, [role]: header },
    },
    transforms: invalidateBakedTransforms(current.transforms),
  }));

  const replaceData = (data) => {
    setProject((current) => ({ ...current, data: normalizeTable(data), transforms: {} }));
    setSelected(null);
    setTransformMode(false);
    setTime(0);
    notify('Comparison data imported');
  };

  const updateCell = (rowIndex, columnIndex, value) => {
    setProject((current) => {
      const next = ensureRowsAndColumns(current, rowIndex, columnIndex);
      next.data.rows[rowIndex][columnIndex] = String(value ?? '');
      next.transforms = invalidateBakedTransforms(next.transforms);
      return next;
    });
  };

  const addRow = () => setProject((current) => ({
    ...current,
    data: { ...current.data, rows: [...current.data.rows, Array(current.data.headers.length).fill('')] },
  }));

  const duplicateRow = (rowIndex) => setProject((current) => {
    const rows = [...current.data.rows];
    const source = rows[rowIndex];
    if (!source) return current;
    rows.splice(rowIndex + 1, 0, [...source]);
    return { ...current, data: { ...current.data, rows }, transforms: {} };
  });

  const deleteRow = (rowIndex) => setProject((current) => {
    if (!current.data.rows[rowIndex]) return current;
    const rows = current.data.rows.filter((_, index) => index !== rowIndex);
    return { ...current, data: { ...current.data, rows }, transforms: {} };
  });

  const addColumn = () => setProject((current) => {
    const name = prompt('New field name', `Field ${current.data.headers.length + 1}`);
    if (!name?.trim()) return current;
    return {
      ...current,
      data: {
        headers: [...current.data.headers, name.trim()],
        rows: current.data.rows.map((row) => [...row, '']),
      },
    };
  });

  const renameColumn = (columnIndex, name) => setProject((current) => {
    if (!current.data.headers[columnIndex]) return current;
    const headers = [...current.data.headers];
    const old = headers[columnIndex];
    headers[columnIndex] = name;
    const fieldMapping = { ...current.settings.fieldMapping };
    Object.keys(fieldMapping).forEach((role) => {
      if (fieldMapping[role] === old) fieldMapping[role] = name;
    });
    return { ...current, data: { ...current.data, headers }, settings: { ...current.settings, fieldMapping } };
  });

  const deleteColumn = (columnIndex) => setProject((current) => {
    if (current.data.headers.length <= 1) return current;
    const deleted = current.data.headers[columnIndex];
    const headers = current.data.headers.filter((_, index) => index !== columnIndex);
    const rows = current.data.rows.map((row) => row.filter((_, index) => index !== columnIndex));
    const fieldMapping = { ...current.settings.fieldMapping };
    Object.keys(fieldMapping).forEach((role) => {
      if (fieldMapping[role] === deleted) delete fieldMapping[role];
    });
    return { ...current, data: { headers, rows }, settings: { ...current.settings, fieldMapping }, transforms: {} };
  });

  const blankProject = () => {
    if (!confirm('Clear every card and transform?')) return;
    setProject((current) => ({
      ...current,
      data: { headers: [...current.data.headers], rows: [] },
      transforms: {},
    }));
    setSelected(null);
    setTime(0);
  };

  const ensureRoleColumn = (current, role) => {
    let header = roleHeader(current, role);
    if (header) return { project: current, header };
    header = roleDefaultHeader(role, current);
    const next = structuredClone(current);
    if (!next.data.headers.includes(header)) {
      next.data.headers.push(header);
      next.data.rows = next.data.rows.map((row) => [...row, '']);
    }
    next.settings.fieldMapping = { ...next.settings.fieldMapping, [role]: header };
    return { project: next, header };
  };

  const editField = (rowIndex, role, value) => setProject((current) => {
    const prepared = ensureRoleColumn(current, role);
    const next = prepared.project === current ? structuredClone(current) : prepared.project;
    const columnIndex = next.data.headers.indexOf(prepared.header);
    while (next.data.rows.length <= rowIndex) next.data.rows.push(Array(next.data.headers.length).fill(''));
    while (next.data.rows[rowIndex].length < next.data.headers.length) next.data.rows[rowIndex].push('');
    next.data.rows[rowIndex][columnIndex] = value;
    const card = resolvedCards(next).find((item) => item.sourceIndex === rowIndex);
    if (card) {
      const key = objectKey(card, role);
      if (next.transforms[key]) next.transforms[key] = { ...next.transforms[key], baked: null };
    }
    return next;
  });

  const chooseRowImage = (rowIndex) => {
    pendingImageRowRef.current = rowIndex;
    imageFileRef.current?.click();
  };

  const applyRowImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const rowIndex = pendingImageRowRef.current;
    pendingImageRowRef.current = null;
    if (!file || rowIndex == null) return;
    const dataUrl = await fileToDataUrl(file);
    setProject((current) => {
      const prepared = ensureRoleColumn(current, 'image');
      const next = prepared.project === current ? structuredClone(current) : prepared.project;
      const columnIndex = next.data.headers.indexOf(prepared.header);
      while (next.data.rows.length <= rowIndex) next.data.rows.push(Array(next.data.headers.length).fill(''));
      while (next.data.rows[rowIndex].length < next.data.headers.length) next.data.rows[rowIndex].push('');
      next.data.rows[rowIndex][columnIndex] = dataUrl;
      const card = resolvedCards(next).find((item) => item.sourceIndex === rowIndex);
      if (card) {
        const key = objectKey(card, 'image');
        if (next.transforms[key]) next.transforms[key] = { ...next.transforms[key], baked: null };
      }
      return next;
    });
    notify(`Embedded ${file.name}`);
  };

  const pasteImageUrl = (rowIndex) => {
    const value = prompt('Paste an HTTP(S) image URL');
    if (!value?.trim()) return;
    if (!/^https?:\/\//i.test(value.trim()) && !value.trim().startsWith('data:image/')) {
      notify('Use an HTTP(S) image URL or an image data URL.', 'warning');
      return;
    }
    editField(rowIndex, 'image', value.trim());
  };

  const clearRowImage = (rowIndex) => editField(rowIndex, 'image', '');

  const previewTransform = (cardId, role, transform) => setProject((current) => {
    const key = objectKey({ id: cardId }, role);
    return {
      ...current,
      transforms: {
        ...current.transforms,
        [key]: { ...(current.transforms[key] || {}), ...transform, baked: current.transforms[key]?.baked || null },
      },
    };
  });

  const commitTransform = async (cardId, role) => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const latestProject = projectRef.current;
    const card = resolvedCards(latestProject).find((item) => item.id === cardId);
    const key = objectKey({ id: cardId }, role);
    const transform = latestProject.transforms[key];
    if (!card || !transform) return;
    try {
      const baked = await bakeTransformedObject(latestProject, card, role, transform, images.get(card.image));
      setProject((current) => {
        const currentTransform = current.transforms[key];
        if (!currentTransform) return current;
        return { ...current, transforms: { ...current.transforms, [key]: { ...currentTransform, baked } } };
      });
      notify(`${role === 'image' ? 'Image' : 'Text'} baked into the protected browser project cache`);
    } catch (error) {
      notify(`Could not bake transformed object: ${error.message}`, 'error');
    }
  };

  const resetTransform = (cardId, role) => setProject((current) => {
    const key = objectKey({ id: cardId }, role);
    if (!current.transforms[key]) return current;
    const transforms = { ...current.transforms };
    delete transforms[key];
    return { ...current, transforms };
  });

  const activateTransform = (enabled, region) => {
    if (region) setSelected({ cardId: region.cardId, role: region.role, cardIndex: region.cardIndex });
    setTransformMode(Boolean(enabled));
  };

  const saveProject = () => {
    const payload = JSON.stringify({ ...project, name: projectName, savedAt: new Date().toISOString() }, null, 2);
    downloadBlob(new Blob([payload], { type: 'application/json' }), `${sanitizeFilename(projectName)}.cts.json`);
    notify('Project saved');
  };

  const openProject = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const migrated = migrateProject(raw);
      setProject(migrated);
      setProjectName(raw.name || file.name.replace(/\.cts\.json$|\.json$/i, ''));
      setTime(0);
      setPlaying(false);
      setSelected(null);
      setTransformMode(false);
      notify(`Opened ${file.name}`);
    } catch (error) {
      notify(`Could not open project: ${error.message}`, 'error');
    }
  };

  const addCardAndReveal = () => {
    const nextIndex = project.data.rows.length;
    addRow();
    setActiveTab('Data');
    const revealTime = Math.min(duration, nextIndex * 2 + 0.7);
    seekTo(revealTime);
  };

  const applyStrip = (sliceSources) => {
    setProject((current) => {
      const prepared = ensureRoleColumn(current, 'image');
      const next = prepared.project === current ? structuredClone(current) : prepared.project;
      const columnIndex = next.data.headers.indexOf(prepared.header);
      const requiredRows = Math.max(next.data.rows.length, sliceSources.length);
      while (next.data.rows.length < requiredRows) next.data.rows.push(Array(next.data.headers.length).fill(''));
      sliceSources.forEach((source, index) => {
        while (next.data.rows[index].length < next.data.headers.length) next.data.rows[index].push('');
        next.data.rows[index][columnIndex] = source;
      });
      return next;
    });
    setStripOpen(false);
    notify(`Applied ${sliceSources.length} strip images`);
  };

  const exportVideo = async () => {
    if (!cards.length) {
      notify('Add at least one non-empty card before exporting', 'error');
      return;
    }
    const abort = new AbortController();
    exportAbortRef.current = abort;
    setExportState({
      open: true,
      progress: 0,
      detail: 'Checking browser encoders',
      width: project.settings.width,
      height: project.settings.height,
      fps: project.settings.fps,
    });
    try {
      await exportProjectMp4({
        project,
        images,
        bakedImages,
        filename: projectName,
        signal: abort.signal,
        onProgress: (progress, detail) => setExportState((current) => ({ ...current, progress, detail })),
      });
      setExportState((current) => ({ ...current, done: true, progress: 1, detail: 'The MP4 download has started.' }));
    } catch (error) {
      if (error.name === 'AbortError') {
        setExportState((current) => ({ ...current, error: 'Export canceled.' }));
      } else {
        setExportState((current) => ({ ...current, error: error.message || String(error) }));
      }
    } finally {
      exportAbortRef.current = null;
    }
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-mark">CTS</div>
        <div className="brand-copy">
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="Project name" />
          <span>COMPARISON TIMELINE STUDIO · WEB</span>
        </div>
        <div className="top-actions">
          <button className="toolbar-button" onClick={() => projectFileRef.current?.click()}>Open project</button>
          <button className="toolbar-button" onClick={saveProject}>Save project</button>
          <button className="primary-button export-button" onClick={exportVideo}>Export MP4</button>
        </div>
        <input ref={projectFileRef} hidden type="file" accept=".json,.cts.json,application/json" onChange={openProject} />
        <input ref={imageFileRef} hidden type="file" accept="image/*" onChange={applyRowImage} />
      </header>

      <main className="workspace">
        <aside className="project-panel panel">
          <div className="panel-header"><strong>PROJECT</strong><span>Data · Models · Audio</span></div>
          <nav className="tabs">
            {TAB_NAMES.map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}
          </nav>
          <div className="panel-body">
            {activeTab === 'Data' && (
              <DataPanel
                project={project}
                onReplaceData={replaceData}
                onUpdateCell={updateCell}
                onAddRow={addRow}
                onDuplicateRow={duplicateRow}
                onDeleteRow={deleteRow}
                onAddColumn={addColumn}
                onRenameColumn={renameColumn}
                onDeleteColumn={deleteColumn}
                onBlank={blankProject}
                onChooseRowImage={chooseRowImage}
                onOpenStripImporter={() => setStripOpen(true)}
              />
            )}
            {activeTab === 'Models' && <ModelsPanel project={project} onSettings={updateSettings} onMapping={updateMapping} />}
            {activeTab === 'Audio' && (
              <AudioPanel
                project={project}
                onTracks={(audioTracks) => setProject((current) => ({ ...current, audioTracks }))}
                onMasterVolume={(soundtrackMasterVolume) => updateSettings({ soundtrackMasterVolume })}
              />
            )}
          </div>
        </aside>

        <section className="monitor-panel panel">
          <div className="panel-header"><strong>PROGRAM MONITOR</strong><span>Click a field to select · Double-click to edit · Right-click for object tools</span></div>
          <div className="monitor-body">
            <ProgramMonitor
              project={project}
              time={time}
              images={images}
              bakedImages={bakedImages}
              selected={selected}
              onSelected={(value) => { setSelected(value); if (!value) setTransformMode(false); }}
              transformMode={transformMode}
              onTransformMode={activateTransform}
              onTransformPreview={previewTransform}
              onTransformCommit={commitTransform}
              onResetTransform={resetTransform}
              onEditField={editField}
              onChooseImage={chooseRowImage}
              onPasteImageUrl={pasteImageUrl}
              onClearImage={clearRowImage}
            />

            <div className="playback-bar">
              <button className="play-button" onClick={() => {
                if (time >= duration) setTime(0);
                setPlaying((current) => !current);
              }}>{playing ? '❚❚' : '▶'}</button>
              <button onClick={() => seekTo(0)}>↤</button>
              <button onClick={() => seekTo(Math.max(0, time - 1))}>−1s</button>
              <span className="timecode">{formatTime(time)}</span>
              <input className="timeline-slider" type="range" min="0" max={Math.max(0.01, duration)} step="0.01" value={Math.min(time, duration)} onChange={(event) => seekTo(Number(event.target.value))} />
              <span className="timecode muted">{formatTime(duration)}</span>
              <button onClick={() => seekTo(Math.min(duration, time + 1))}>+1s</button>
              <button onClick={addCardAndReveal}>＋ Add card</button>
            </div>

            <div className="sequence-bar">
              <div><span className="eyebrow">SEQUENCE</span><strong>{cards.length} cards · {MODELS[project.settings.modelId].name}</strong></div>
              <label className="check-row"><input type="checkbox" checked={project.settings.hexagonsBounce} onChange={(event) => updateSettings({ hexagonsBounce: event.target.checked })} /><span>Badge bounce</span></label>
              <span className="sequence-spacer" />
              {selected && (
                <>
                  <span className="selection-label">{selected.role.replaceAll('_', ' ')}</span>
                  <button className={transformMode ? 'active-tool' : ''} onClick={() => setTransformMode((current) => !current)}>{transformMode ? 'Transforming' : 'Transform'}</button>
                  {project.transforms[objectKey({ id: selected.cardId }, selected.role)] && <button onClick={() => resetTransform(selected.cardId, selected.role)}>Reset</button>}
                  <button onClick={() => { setSelected(null); setTransformMode(false); }}>Deselect</button>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="status-bar">
        <span>{APP_VERSION}</span>
        <span className="status-center">Local-first · Projects, images, audio, and export stay in your browser</span>
        <span>{project.settings.width}×{project.settings.height} · {project.settings.fps} FPS</span>
      </footer>

      <StripImporter open={stripOpen} onClose={() => setStripOpen(false)} expectedCount={project.data.rows.length} onApply={applyStrip} />
      <ExportOverlay
        state={exportState}
        onCancel={() => exportAbortRef.current?.abort()}
        onClose={() => setExportState({ open: false, progress: 0, detail: '' })}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
