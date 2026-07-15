import {
  MODEL_CLASSIC,
  MODEL_ILLUSTRATED,
  MODEL_REFERENCE,
  TIMING,
} from '../constants.js';
import {
  effectiveVisibleCards,
  modelTime,
  projectDuration,
  resolvedCards,
} from '../utils/data.js';

const TAU = Math.PI * 2;

export function objectKey(card, role) {
  return `${card.id}:${role}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value) {
  const t = clamp(value, 0, 1);
  return 1 - ((1 - t) ** 3);
}

function roundedRectPath(ctx, x, y, width, height, radius = 12) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, width, height, radius, fill) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundedRect(ctx, x, y, width, height, radius, stroke, lineWidth = 2) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawCoverImage(ctx, image, rect, scale = 1, contain = false) {
  const { x, y, w, h } = rect;
  if (!image?.naturalWidth || !image?.naturalHeight) {
    const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
    gradient.addColorStop(0, '#32343c');
    gradient.addColorStop(1, '#1d1e24');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = Math.max(1, w * 0.004);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.7);
    ctx.lineTo(x + w * 0.42, y + h * 0.46);
    ctx.lineTo(x + w * 0.56, y + h * 0.6);
    ctx.lineTo(x + w * 0.72, y + h * 0.38);
    ctx.lineTo(x + w * 0.86, y + h * 0.58);
    ctx.stroke();
    return;
  }
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = w / h;
  let drawW;
  let drawH;
  if ((contain && imageRatio > targetRatio) || (!contain && imageRatio < targetRatio)) {
    drawW = w * scale;
    drawH = drawW / imageRatio;
  } else {
    drawH = h * scale;
    drawW = drawH * imageRatio;
  }
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

function wrapLines(ctx, text, maxWidth) {
  const paragraphs = String(text ?? '').split(/\n/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function fittedFont(ctx, text, maxWidth, maxHeight, options = {}) {
  const {
    maxSize = 72,
    minSize = 12,
    weight = 800,
    family = 'Nunito, system-ui, sans-serif',
    maxLines = 3,
    lineHeight = 1.08,
  } = options;
  for (let size = maxSize; size >= minSize; size -= 1) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines && lines.length * size * lineHeight <= maxHeight) {
      return { size, lines: lines.slice(0, maxLines), lineHeight };
    }
  }
  ctx.font = `${weight} ${minSize}px ${family}`;
  return { size: minSize, lines: wrapLines(ctx, text, maxWidth).slice(0, maxLines), lineHeight };
}

function drawTextBlock(ctx, text, rect, options = {}) {
  const {
    color = '#fff',
    align = 'center',
    baseline = 'middle',
    weight = 800,
    family = 'Nunito, system-ui, sans-serif',
    maxSize = Math.max(18, rect.h * 0.42),
    minSize = Math.max(10, rect.h * 0.13),
    maxLines = 3,
    lineHeight = 1.08,
    paddingX = rect.w * 0.06,
  } = options;
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  const fitted = fittedFont(ctx, text, rect.w - paddingX * 2, rect.h, {
    maxSize,
    minSize,
    weight,
    family,
    maxLines,
    lineHeight,
  });
  ctx.font = `${weight} ${fitted.size}px ${family}`;
  const total = fitted.lines.length * fitted.size * fitted.lineHeight;
  const anchorX = align === 'left' ? rect.x + paddingX : align === 'right' ? rect.x + rect.w - paddingX : rect.x + rect.w / 2;
  let currentY = rect.y + rect.h / 2 - total / 2 + fitted.size * fitted.lineHeight / 2;
  for (const line of fitted.lines) {
    ctx.fillText(line, anchorX, currentY, rect.w - paddingX * 2);
    currentY += fitted.size * fitted.lineHeight;
  }
  ctx.restore();
}

function addRegion(regions, card, role, rect, sourceRect = rect) {
  regions.push({
    key: objectKey(card, role),
    cardId: card.id,
    cardIndex: card.sourceIndex,
    role,
    rect: { ...rect },
    sourceRect: { ...sourceRect },
  });
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function hitTest(regions, point) {
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    if (pointInRect(point, regions[index].rect)) return regions[index];
  }
  return null;
}

function cardMotion(project, time, cardCount, canvasWidth, cardWidth, gap) {
  const visible = effectiveVisibleCards(project.settings);
  const t = modelTime(project, time);
  const revealWindow = Math.min(cardCount, visible) * TIMING.revealSeconds;
  const scrollStart = revealWindow;
  const scrollCards = Math.min(
    Math.max(0, cardCount - visible),
    Math.max(0, (t - scrollStart) / TIMING.scrollSeconds),
  );
  const stripOffset = scrollCards * (cardWidth + gap);
  const fadeStart = Math.max(0, projectDuration(project) - TIMING.fadeSeconds);
  const alpha = time <= fadeStart ? 1 : clamp(1 - (time - fadeStart) / TIMING.fadeSeconds, 0, 1);
  return { visible, t, stripOffset, alpha, canvasWidth };
}

function cardEntrance(t, index) {
  const start = index * TIMING.revealSeconds;
  return easeOutCubic((t - start) / 0.65);
}

function drawBackground(ctx, width, height, backgroundId) {
  if (backgroundId === 'blueprint') {
    ctx.fillStyle = '#14395a';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(168,218,255,.16)';
    ctx.lineWidth = Math.max(1, width / 1920);
    const step = width / 24;
    for (let x = 0; x <= width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y <= height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    return;
  }
  const palettes = {
    beach: ['#7bd4eb', '#bfe9e6', '#f8d592', '#e8b76e'],
    sunset: ['#4c2c72', '#c55378', '#f49c68', '#f8d7a0'],
    forest: ['#183b31', '#38674e', '#83a95d', '#d6d49b'],
    lavender: ['#5c4b7a', '#8f78aa', '#cab8dc', '#f0e8f6'],
    night: ['#080d22', '#111d3f', '#253a61', '#5b6c91'],
  };
  const colors = palettes[backgroundId] || palettes.beach;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  colors.forEach((color, index) => gradient.addColorStop(index / (colors.length - 1), color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  if (backgroundId === 'beach') {
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.58);
    for (let x = 0; x <= width; x += width / 14) {
      ctx.quadraticCurveTo(x + width / 28, height * (0.55 + 0.025 * Math.sin(x)), x + width / 14, height * 0.58);
    }
    ctx.lineTo(width, height * 0.68); ctx.lineTo(0, height * 0.68); ctx.closePath(); ctx.fill();
  }
}

function drawHexagon(ctx, cx, cy, radius, fill, shadow = true) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.32)';
    ctx.shadowBlur = radius * 0.18;
    ctx.shadowOffsetY = radius * 0.08;
  }
  ctx.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = Math.PI / 6 + index * Math.PI / 3;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function roleHidden(project, card, role) {
  return Boolean(project.transforms?.[objectKey(card, role)]);
}

function drawReferenceCard(ctx, project, card, rect, images, regions, opacity) {
  const font = `${project.settings.fontFamily}, Nunito, system-ui, sans-serif`;
  const pad = rect.w * 0.045;
  const radius = rect.w * 0.035;
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.shadowColor = 'rgba(0,0,0,.22)';
  ctx.shadowBlur = rect.w * 0.04;
  ctx.shadowOffsetY = rect.w * 0.02;
  fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, radius, '#ececf0');
  ctx.shadowColor = 'transparent';

  const showBadge = project.settings.showHexagons !== false;
  const badge = { x: rect.x + pad, y: rect.y + pad, w: rect.w - pad * 2, h: rect.h * 0.13 };
  const title = showBadge
    ? { x: rect.x + pad, y: rect.y + rect.h * 0.19, w: rect.w - pad * 2, h: rect.h * 0.14 }
    : { x: rect.x + pad, y: rect.y + rect.h * 0.055, w: rect.w - pad * 2, h: rect.h * 0.16 };
  const description = showBadge
    ? { x: rect.x + pad, y: rect.y + rect.h * 0.35, w: rect.w - pad * 2, h: rect.h * 0.22 }
    : { x: rect.x + pad, y: rect.y + rect.h * 0.235, w: rect.w - pad * 2, h: rect.h * 0.25 };
  const imageRect = showBadge
    ? { x: rect.x + pad, y: rect.y + rect.h * 0.59, w: rect.w - pad * 2, h: rect.h * 0.36 }
    : { x: rect.x + pad, y: rect.y + rect.h * 0.51, w: rect.w - pad * 2, h: rect.h * 0.44 };

  if (showBadge && !roleHidden(project, card, 'badge_primary')) {
    fillRoundedRect(ctx, badge.x, badge.y, badge.w, badge.h, badge.h / 2, '#e23b45');
    drawTextBlock(ctx, card.badge_primary, badge, { family: font, maxLines: 2, maxSize: badge.h * 0.5, minSize: badge.h * 0.2 });
    addRegion(regions, card, 'badge_primary', badge);
  }
  if (!roleHidden(project, card, 'title')) {
    fillRoundedRect(ctx, title.x, title.y, title.w, title.h, title.h * 0.08, '#ffffff');
    drawTextBlock(ctx, card.title, title, { family: font, color: '#17171d', maxLines: 2, maxSize: title.h * 0.43, minSize: title.h * 0.2 });
    addRegion(regions, card, 'title', title);
  }
  if (!roleHidden(project, card, 'description')) {
    fillRoundedRect(ctx, description.x, description.y, description.w, description.h, description.h * 0.05, '#d9d9df');
    drawTextBlock(ctx, card.description, description, { family: font, color: '#3f414b', weight: 650, maxLines: 5, maxSize: description.h * 0.18, minSize: description.h * 0.1, align: 'left' });
    addRegion(regions, card, 'description', description);
  }
  if (!roleHidden(project, card, 'image')) {
    ctx.save();
    roundedRectPath(ctx, imageRect.x, imageRect.y, imageRect.w, imageRect.h, imageRect.h * 0.04);
    ctx.clip();
    drawCoverImage(ctx, images.get(card.image), imageRect, project.settings.imageScale || 1, false);
    ctx.restore();
    addRegion(regions, card, 'image', imageRect);
  }
  ctx.restore();
}

function drawIllustratedCard(ctx, project, card, rect, images, regions, opacity, time) {
  const font = `${project.settings.fontFamily}, Nunito, system-ui, sans-serif`;
  const titleEnabled = project.settings.titleBarEnabled !== false;
  ctx.save();
  ctx.globalAlpha *= opacity;
  const cardRadius = rect.w * 0.03;
  ctx.shadowColor = 'rgba(0,0,0,.27)';
  ctx.shadowBlur = rect.w * 0.045;
  ctx.shadowOffsetY = rect.w * 0.025;
  fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, cardRadius, 'rgba(255,255,255,.08)');
  ctx.shadowColor = 'transparent';
  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, cardRadius);
  ctx.clip();
  ctx.translate(rect.x, rect.y);
  drawBackground(ctx, rect.w, rect.h, project.settings.illustratedBackground || 'beach');
  ctx.restore();

  const titleH = titleEnabled ? rect.h * 0.18 : 0;
  const showBadge = project.settings.showHexagons !== false;
  const art = {
    x: rect.x + rect.w * (showBadge ? 0.04 : 0.025),
    y: rect.y + rect.h * (showBadge ? 0.06 : 0.025),
    w: rect.w * (showBadge ? 0.92 : 0.95),
    h: rect.h * (titleEnabled ? (showBadge ? 0.78 : 0.82) : (showBadge ? 0.89 : 0.95)),
  };
  if (!roleHidden(project, card, 'image')) {
    ctx.save();
    roundedRectPath(ctx, art.x, art.y, art.w, art.h, rect.w * 0.018);
    ctx.clip();
    const image = images.get(card.image);
    if (image) drawCoverImage(ctx, image, art, project.settings.imageScale || 1, true);
    else {
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(art.x, art.y, art.w, art.h);
      drawTextBlock(ctx, 'ARTWORK', art, { family: font, color: 'rgba(255,255,255,.34)', maxSize: art.h * 0.12, minSize: 16 });
    }
    ctx.restore();
    addRegion(regions, card, 'image', art);
  }

  if (showBadge) {
    const textLength = String(card.badge_primary || '').length;
    const auto = project.settings.autoSizeArtwork !== false ? clamp(1 + Math.max(0, textLength - 7) * 0.025, 1, 1.25) : 1;
    const bounce = project.settings.hexagonsBounce !== false ? 1 + Math.sin(time * 5 + card.sourceIndex) * 0.025 : 1;
    const radius = rect.w * 0.145 * (project.settings.hexagonScale || 1) * auto * bounce;
    const cx = rect.x + rect.w * 0.23;
    const cy = rect.y + rect.h * 0.17;
    const badgeRect = { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
    if (!roleHidden(project, card, 'badge_primary')) {
      drawHexagon(ctx, cx, cy, radius, '#d92e3d');
      drawTextBlock(ctx, card.badge_primary, { x: badgeRect.x + radius * 0.12, y: badgeRect.y + radius * 0.33, w: badgeRect.w - radius * 0.24, h: radius * 0.78 }, { family: font, maxLines: 2, maxSize: radius * 0.44, minSize: radius * 0.17 });
      addRegion(regions, card, 'badge_primary', badgeRect);
    }
    if (!roleHidden(project, card, 'badge_secondary')) {
      const secondary = { x: badgeRect.x + radius * 0.14, y: badgeRect.y + radius * 1.08, w: badgeRect.w - radius * 0.28, h: radius * 0.44 };
      drawTextBlock(ctx, card.badge_secondary, secondary, { family: font, maxLines: 2, maxSize: radius * 0.2, minSize: radius * 0.1, weight: 700 });
      addRegion(regions, card, 'badge_secondary', secondary);
    }
  }

  if (titleEnabled && !roleHidden(project, card, 'title')) {
    const title = { x: rect.x, y: rect.y + rect.h - titleH, w: rect.w, h: titleH };
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.22)';
    ctx.shadowBlur = rect.w * 0.022;
    ctx.shadowOffsetY = -rect.w * 0.008;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(title.x, title.y, title.w, title.h);
    ctx.restore();
    drawTextBlock(ctx, card.title, title, { family: font, color: '#17171d', maxLines: 2, maxSize: title.h * 0.42, minSize: title.h * 0.2 });
    addRegion(regions, card, 'title', title);
  }
  ctx.restore();
}

function drawClassicCard(ctx, project, card, rect, images, regions, opacity) {
  const font = `${project.settings.fontFamily}, Nunito, system-ui, sans-serif`;
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.shadowColor = 'rgba(0,0,0,.25)';
  ctx.shadowBlur = rect.w * 0.045;
  ctx.shadowOffsetY = rect.w * 0.025;
  fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.w * 0.035, '#ffffff');
  ctx.shadowColor = 'transparent';

  const showBadge = project.settings.showHexagons !== false;
  const value = { x: rect.x + rect.w * 0.06, y: rect.y + rect.h * 0.06, w: rect.w * 0.64, h: rect.h * 0.18 };
  const unit = { x: rect.x + rect.w * 0.69, y: rect.y + rect.h * 0.09, w: rect.w * 0.25, h: rect.h * 0.13 };
  const title = showBadge
    ? { x: rect.x + rect.w * 0.06, y: rect.y + rect.h * 0.26, w: rect.w * 0.88, h: rect.h * 0.14 }
    : { x: rect.x + rect.w * 0.06, y: rect.y + rect.h * 0.07, w: rect.w * 0.88, h: rect.h * 0.17 };
  const imageRect = showBadge
    ? { x: rect.x + rect.w * 0.06, y: rect.y + rect.h * 0.43, w: rect.w * 0.88, h: rect.h * 0.51 }
    : { x: rect.x + rect.w * 0.06, y: rect.y + rect.h * 0.27, w: rect.w * 0.88, h: rect.h * 0.67 };

  if (showBadge && !roleHidden(project, card, 'badge_primary')) {
    drawTextBlock(ctx, card.badge_primary, value, { family: font, color: '#e03343', align: 'left', maxLines: 2, maxSize: value.h * 0.68, minSize: value.h * 0.25 });
    addRegion(regions, card, 'badge_primary', value);
  }
  if (showBadge && !roleHidden(project, card, 'badge_secondary')) {
    drawTextBlock(ctx, card.badge_secondary, unit, { family: font, color: '#777984', align: 'left', weight: 700, maxLines: 2, maxSize: unit.h * 0.5, minSize: unit.h * 0.2 });
    addRegion(regions, card, 'badge_secondary', unit);
  }
  if (!roleHidden(project, card, 'title')) {
    drawTextBlock(ctx, card.title, title, { family: font, color: '#22232a', align: 'left', maxLines: 2, maxSize: title.h * 0.45, minSize: title.h * 0.2 });
    addRegion(regions, card, 'title', title);
  }
  if (!roleHidden(project, card, 'image')) {
    ctx.save();
    roundedRectPath(ctx, imageRect.x, imageRect.y, imageRect.w, imageRect.h, rect.w * 0.025);
    ctx.clip();
    drawCoverImage(ctx, images.get(card.image), imageRect, project.settings.imageScale || 1, false);
    ctx.restore();
    addRegion(regions, card, 'image', imageRect);
  }
  ctx.restore();
}

export function defaultObjectRect(project, card, role, time, width, height) {
  const result = renderProjectFrame(null, project, time, { width, height, dryRun: true });
  return result.regions.find((region) => region.cardId === card.id && region.role === role)?.rect || null;
}

function drawTransformedObjects(ctx, project, cards, images, bakedImages, regions) {
  const font = `${project.settings.fontFamily}, Nunito, system-ui, sans-serif`;
  for (const card of cards) {
    for (const role of ['badge_primary', 'badge_secondary', 'title', 'description', 'image']) {
      if (project.settings.showHexagons === false && role.startsWith('badge_')) continue;
      const transform = project.transforms?.[objectKey(card, role)];
      if (!transform) continue;
      const rect = {
        x: transform.x * ctx.canvas.width,
        y: transform.y * ctx.canvas.height,
        w: transform.w * ctx.canvas.width,
        h: transform.h * ctx.canvas.height,
      };
      const baked = bakedImages?.get(transform.baked || '');
      if (baked) {
        ctx.drawImage(baked, rect.x, rect.y, rect.w, rect.h);
      } else if (role === 'image') {
        ctx.save();
        roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(rect.w, rect.h) * 0.04);
        ctx.clip();
        drawCoverImage(ctx, images.get(card.image), rect, 1, true);
        ctx.restore();
      } else {
        const colors = role.startsWith('badge') ? ['#d92e3d', '#fff'] : role === 'description' ? ['rgba(20,20,26,.76)', '#fff'] : ['rgba(255,255,255,.94)', '#17171d'];
        fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(rect.w, rect.h) * 0.08, colors[0]);
        drawTextBlock(ctx, card[role], rect, {
          family: font,
          color: colors[1],
          align: role === 'description' ? 'left' : 'center',
          weight: role === 'description' ? 650 : 850,
          maxLines: role === 'description' ? 6 : 3,
          maxSize: rect.h * (role === 'description' ? 0.2 : 0.42),
          minSize: Math.max(10, rect.h * 0.12),
        });
      }
      addRegion(regions, card, role, rect, rect);
    }
  }
}

export function renderProjectFrame(ctx, project, time, options = {}) {
  const width = options.width || ctx?.canvas?.width || project.settings.width || 1920;
  const height = options.height || ctx?.canvas?.height || project.settings.height || 1080;
  const cards = options.cards || resolvedCards(project);
  const regions = [];
  const images = options.images || new Map();
  const bakedImages = options.bakedImages || new Map();
  const dryRun = Boolean(options.dryRun);
  const targetCtx = ctx || document.createElement('canvas').getContext('2d');
  if (!ctx) {
    targetCtx.canvas.width = width;
    targetCtx.canvas.height = height;
  }
  const model = project.settings.modelId;
  const visible = effectiveVisibleCards(project.settings);
  const outerPad = width * 0.035;
  const gap = width * (model === MODEL_ILLUSTRATED ? 0.022 : 0.016);
  const cardWidth = (width - outerPad * 2 - gap * (visible - 1)) / visible;
  const cardHeight = model === MODEL_ILLUSTRATED ? height * 0.78 : height * 0.82;
  const cardY = (height - cardHeight) / 2;
  const motion = cardMotion(project, time, cards.length, width, cardWidth, gap);

  if (!dryRun) {
    targetCtx.save();
    targetCtx.clearRect(0, 0, width, height);
    if (model === MODEL_ILLUSTRATED) drawBackground(targetCtx, width, height, project.settings.illustratedBackground || 'beach');
    else {
      const gradient = targetCtx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#20212a');
      gradient.addColorStop(1, '#0f1015');
      targetCtx.fillStyle = gradient;
      targetCtx.fillRect(0, 0, width, height);
    }
    targetCtx.globalAlpha = motion.alpha;
  }

  cards.forEach((card, index) => {
    const entrance = cardEntrance(motion.t, index);
    if (entrance <= 0) return;
    const x = outerPad + index * (cardWidth + gap) - motion.stripOffset;
    if (x + cardWidth < -width * 0.15 || x > width * 1.15) return;
    const rect = {
      x: x + (1 - entrance) * width * 0.18,
      y: cardY + (1 - entrance) * height * 0.08,
      w: cardWidth,
      h: cardHeight,
    };
    if (dryRun) {
      const temp = document.createElement('canvas');
      temp.width = width; temp.height = height;
      const tempCtx = temp.getContext('2d');
      if (model === MODEL_ILLUSTRATED) drawIllustratedCard(tempCtx, project, card, rect, images, regions, entrance, time);
      else if (model === MODEL_CLASSIC) drawClassicCard(tempCtx, project, card, rect, images, regions, entrance);
      else drawReferenceCard(tempCtx, project, card, rect, images, regions, entrance);
    } else if (model === MODEL_ILLUSTRATED) {
      drawIllustratedCard(targetCtx, project, card, rect, images, regions, entrance, time);
    } else if (model === MODEL_CLASSIC) {
      drawClassicCard(targetCtx, project, card, rect, images, regions, entrance);
    } else {
      drawReferenceCard(targetCtx, project, card, rect, images, regions, entrance);
    }
  });

  if (!dryRun) {
    targetCtx.globalAlpha = motion.alpha;
    drawTransformedObjects(targetCtx, project, cards, images, bakedImages, regions);
    targetCtx.restore();
  }

  return { regions, cards, duration: projectDuration(project), opacity: motion.alpha };
}

export async function bakeTransformedObject(project, card, role, transform, image) {
  const width = Math.max(8, Math.round(transform.w * project.settings.width));
  const height = Math.max(8, Math.round(transform.h * project.settings.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const font = `${project.settings.fontFamily}, Nunito, system-ui, sans-serif`;
  if (role === 'image') {
    drawCoverImage(ctx, image, { x: 0, y: 0, w: width, h: height }, 1, true);
  } else {
    const colors = role.startsWith('badge') ? ['#d92e3d', '#fff'] : role === 'description' ? ['rgba(20,20,26,.88)', '#fff'] : ['#fff', '#17171d'];
    fillRoundedRect(ctx, 0, 0, width, height, Math.min(width, height) * 0.08, colors[0]);
    drawTextBlock(ctx, card[role], { x: 0, y: 0, w: width, h: height }, {
      family: font,
      color: colors[1],
      align: role === 'description' ? 'left' : 'center',
      weight: role === 'description' ? 650 : 850,
      maxLines: role === 'description' ? 6 : 3,
      maxSize: height * (role === 'description' ? 0.2 : 0.42),
      minSize: Math.max(10, height * 0.12),
    });
  }
  return canvas.toDataURL('image/png');
}

export function drawSelectionOverlay(ctx, rect, scale = 1) {
  if (!ctx || !rect) return;
  const handle = Math.max(8, 11 * scale);
  ctx.save();
  ctx.strokeStyle = '#8b5cf6';
  ctx.lineWidth = Math.max(2, 2 * scale);
  ctx.setLineDash([8 * scale, 5 * scale]);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([]);
  const handles = selectionHandles(rect, handle);
  for (const box of Object.values(handles)) {
    ctx.fillStyle = '#f5f3ff';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = '#6d28d9';
    ctx.lineWidth = Math.max(1, scale);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }
  ctx.restore();
}

export function selectionHandles(rect, size = 12) {
  const half = size / 2;
  return {
    nw: { x: rect.x - half, y: rect.y - half, w: size, h: size },
    ne: { x: rect.x + rect.w - half, y: rect.y - half, w: size, h: size },
    sw: { x: rect.x - half, y: rect.y + rect.h - half, w: size, h: size },
    se: { x: rect.x + rect.w - half, y: rect.y + rect.h - half, w: size, h: size },
  };
}

export function hitSelectionHandle(point, rect, size = 14) {
  for (const [name, handle] of Object.entries(selectionHandles(rect, size))) {
    if (pointInRect(point, handle)) return name;
  }
  return null;
}
