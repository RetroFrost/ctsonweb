import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  drawSelectionOverlay,
  hitSelectionHandle,
  hitTest,
  objectKey,
  renderProjectFrame,
} from '../lib/renderer.js';
import { projectDuration, resolvedCards } from '../utils/data.js';

function canvasPoint(event, canvas) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
  };
}

function normalizedTransform(rect, canvas) {
  return {
    x: rect.x / canvas.width,
    y: rect.y / canvas.height,
    w: rect.w / canvas.width,
    h: rect.h / canvas.height,
  };
}

function cursorForHandle(handle) {
  if (handle === 'nw' || handle === 'se') return 'nwse-resize';
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
  return 'move';
}

export default function ProgramMonitor({
  project,
  time,
  images,
  bakedImages,
  selected,
  onSelected,
  transformMode,
  onTransformMode,
  onTransformPreview,
  onTransformCommit,
  onResetTransform,
  onEditField,
  onChooseImage,
  onPasteImageUrl,
  onClearImage,
}) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const regionsRef = useRef([]);
  const selectedRegionRef = useRef(null);
  const dragRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 540 });
  const [contextMenu, setContextMenu] = useState(null);
  const [inlineEdit, setInlineEdit] = useState(null);
  const cards = useMemo(() => resolvedCards(project), [project.data, project.settings.fieldMapping]);
  const duration = projectDuration(project);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const resize = () => {
      const width = Math.max(320, Math.floor(host.clientWidth));
      const height = Math.max(180, Math.floor(width / (project.settings.width / project.settings.height)));
      const maxHeight = Math.max(180, host.clientHeight || height);
      const fittedHeight = Math.min(height, maxHeight);
      const fittedWidth = Math.floor(fittedHeight * (project.settings.width / project.settings.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      setCanvasSize({ width: Math.floor(fittedWidth * dpr), height: Math.floor(fittedHeight * dpr) });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => observer.disconnect();
  }, [project.settings.width, project.settings.height]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== canvasSize.width || canvas.height !== canvasSize.height) {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
    }
    const ctx = canvas.getContext('2d', { alpha: false });
    const result = renderProjectFrame(ctx, project, Math.min(time, duration), {
      width: canvas.width,
      height: canvas.height,
      images,
      bakedImages,
      cards,
    });
    regionsRef.current = result.regions;
    const selectedRegion = selected
      ? result.regions.find((region) => region.cardId === selected.cardId && region.role === selected.role)
      : null;
    selectedRegionRef.current = selectedRegion;
    if (selectedRegion) drawSelectionOverlay(ctx, selectedRegion.rect, canvas.width / 960);
  }, [project, time, duration, images, bakedImages, cards, selected, canvasSize]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  const selectAtPoint = useCallback((point) => {
    const region = hitTest(regionsRef.current, point);
    onSelected(region ? { cardId: region.cardId, role: region.role, cardIndex: region.cardIndex } : null);
    return region;
  }, [onSelected]);

  const beginInlineEdit = useCallback((region) => {
    if (!region || region.role === 'image') return;
    const card = cards.find((item) => item.id === region.cardId);
    if (!card) return;
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    const scaleX = bounds.width / canvas.width;
    const scaleY = bounds.height / canvas.height;
    setInlineEdit({
      cardId: region.cardId,
      cardIndex: region.cardIndex,
      role: region.role,
      value: card[region.role] || '',
      style: {
        left: region.rect.x * scaleX,
        top: region.rect.y * scaleY,
        width: region.rect.w * scaleX,
        height: region.rect.h * scaleY,
      },
    });
  }, [cards]);

  const commitInline = useCallback(() => {
    if (!inlineEdit) return;
    onEditField(inlineEdit.cardIndex, inlineEdit.role, inlineEdit.value);
    setInlineEdit(null);
  }, [inlineEdit, onEditField]);

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    setContextMenu(null);
    const canvas = canvasRef.current;
    const point = canvasPoint(event, canvas);
    const current = selectedRegionRef.current;
    if (transformMode && current) {
      const handle = hitSelectionHandle(point, current.rect, Math.max(14, canvas.width / 70));
      const inside = hitTest([current], point);
      if (handle || inside) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          start: point,
          initial: { ...current.rect },
          handle,
          cardId: current.cardId,
          role: current.role,
        };
        event.preventDefault();
        return;
      }
    }
    selectAtPoint(point);
  };

  const onPointerMove = (event) => {
    const canvas = canvasRef.current;
    const point = canvasPoint(event, canvas);
    const drag = dragRef.current;
    if (!drag) {
      const current = selectedRegionRef.current;
      const handle = transformMode && current
        ? hitSelectionHandle(point, current.rect, Math.max(14, canvas.width / 70))
        : null;
      canvas.style.cursor = handle ? cursorForHandle(handle) : transformMode && current && hitTest([current], point) ? 'move' : 'default';
      return;
    }
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    let rect = { ...drag.initial };
    const minW = canvas.width * 0.03;
    const minH = canvas.height * 0.03;
    if (!drag.handle) {
      rect.x += dx;
      rect.y += dy;
    } else {
      if (drag.handle.includes('w')) {
        rect.x += dx;
        rect.w -= dx;
      }
      if (drag.handle.includes('e')) rect.w += dx;
      if (drag.handle.includes('n')) {
        rect.y += dy;
        rect.h -= dy;
      }
      if (drag.handle.includes('s')) rect.h += dy;
      if (rect.w < minW) {
        if (drag.handle.includes('w')) rect.x -= minW - rect.w;
        rect.w = minW;
      }
      if (rect.h < minH) {
        if (drag.handle.includes('n')) rect.y -= minH - rect.h;
        rect.h = minH;
      }
    }
    rect.x = Math.max(-rect.w * 0.75, Math.min(canvas.width - rect.w * 0.25, rect.x));
    rect.y = Math.max(-rect.h * 0.75, Math.min(canvas.height - rect.h * 0.25, rect.y));
    onTransformPreview(drag.cardId, drag.role, normalizedTransform(rect, canvas));
  };

  const finishDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onTransformCommit(drag.cardId, drag.role);
  };

  const onDoubleClick = (event) => {
    const point = canvasPoint(event, canvasRef.current);
    const region = selectAtPoint(point);
    if (!region) return;
    if (region.role === 'image') onChooseImage(region.cardIndex);
    else beginInlineEdit(region);
  };

  const onContextMenu = (event) => {
    event.preventDefault();
    const point = canvasPoint(event, canvasRef.current);
    const region = selectAtPoint(point);
    if (!region) {
      setContextMenu(null);
      return;
    }
    setContextMenu({ x: event.clientX, y: event.clientY, region });
  };

  const activateTransform = () => {
    if (!contextMenu?.region) return;
    onTransformMode(true, contextMenu.region);
    setContextMenu(null);
  };

  const resetTransform = () => {
    if (!contextMenu?.region) return;
    onResetTransform(contextMenu.region.cardId, contextMenu.region.role);
    setContextMenu(null);
  };

  const openEdit = () => {
    const region = contextMenu?.region;
    if (!region) return;
    setContextMenu(null);
    if (region.role === 'image') onChooseImage(region.cardIndex);
    else beginInlineEdit(region);
  };

  const selectedHasTransform = selected
    ? Boolean(project.transforms?.[objectKey({ id: selected.cardId }, selected.role)])
    : false;

  return (
    <div className="monitor-host" ref={hostRef}>
      <div className="monitor-canvas-wrap" style={{ aspectRatio: `${project.settings.width} / ${project.settings.height}` }}>
        <canvas
          ref={canvasRef}
          className="monitor-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
        />
        {inlineEdit && (
          <textarea
            className="inline-canvas-editor"
            style={inlineEdit.style}
            value={inlineEdit.value}
            autoFocus
            onChange={(event) => setInlineEdit((current) => ({ ...current, value: event.target.value }))}
            onBlur={commitInline}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                commitInline();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setInlineEdit(null);
              }
            }}
          />
        )}
      </div>

      {contextMenu && (
        <div
          className="object-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button onClick={openEdit}>{contextMenu.region.role === 'image' ? 'Choose image…' : 'Edit text'}</button>
          {contextMenu.region.role === 'image' && <button onClick={() => { onPasteImageUrl(contextMenu.region.cardIndex); setContextMenu(null); }}>Paste image URL…</button>}
          <button onClick={activateTransform}>Transform {contextMenu.region.role === 'image' ? 'image' : 'text box'}</button>
          {selectedHasTransform && <button onClick={resetTransform}>Reset position and size</button>}
          {contextMenu.region.role === 'image' && <button onClick={() => { onClearImage(contextMenu.region.cardIndex); setContextMenu(null); }}>Clear image</button>}
          <button onClick={() => { onSelected(null); onTransformMode(false); setContextMenu(null); }}>Deselect object</button>
        </div>
      )}
    </div>
  );
}
