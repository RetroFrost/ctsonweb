import React from "react";
import { assetUrl } from "../api";
import { MODEL_CLASSIC, MODEL_ILLUSTRATED, dateLines } from "./timing";

function Badge({ primary, secondary, cardW, topH, scale, minFont = 7 }) {
  const badgeW = Math.max(20, cardW * 0.69 * scale);
  const badgeH = Math.max(24, topH * 0.73 * scale);
  const pLen = Math.max(1, String(primary || "").length);
  const sLen = Math.max(1, String(secondary || "").length);
  const primarySize = Math.min(Math.max(minFont, badgeH * (secondary ? 0.21 : 0.24)), (badgeW * 0.86) / (0.62 * pLen));
  const secondarySize = Math.min(Math.max(minFont, badgeH * 0.12), (badgeW * 0.8) / (0.6 * sLen));
  return (
    <div
      className="absolute left-1/2 flex flex-col items-center justify-center text-center"
      style={{
        width: badgeW,
        height: badgeH,
        top: Math.max(4, (topH - badgeH) * 0.52),
        transform: "translateX(-50%)",
        clipPath: "polygon(50% 0%, 100% 20%, 100% 78%, 50% 100%, 0% 78%, 0% 20%)",
        background: "linear-gradient(180deg, rgb(210,4,9) 0%, rgb(248,14,15) 38%, rgb(205,2,8) 100%)",
        filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.6))",
      }}
    >
      <div
        className="font-bold text-[#fffaf4] leading-tight px-[8%] overflow-hidden"
        style={{ fontSize: primarySize, maxHeight: badgeH * (secondary ? 0.5 : 0.7) }}
      >
        {primary}
      </div>
      {secondary ? (
        <div
          className="font-bold text-[#fff8f0] leading-tight px-[8%] overflow-hidden"
          style={{ fontSize: secondarySize, maxHeight: badgeH * 0.22 }}
        >
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

function CardImage({ src, style, className, zoom = 1, panX = 0, panY = 0 }) {
  const url = assetUrl(src);
  if (!url) return null;
  const pos = `${50 + panX * 50}% ${50 + panY * 50}%`;
  return (
    <div className={className} style={{ ...style, overflow: "hidden" }}>
      <img src={url} alt="" draggable={false}
        style={{
          width: "100%", height: "100%", objectFit: "cover", objectPosition: pos,
          transform: `scale(${Math.max(1, zoom)})`, transformOrigin: pos,
        }} />
    </div>
  );
}

function ReferenceCard({ card, w, h, bs = 1 }) {
  const topH = h * 0.44;
  const titleH = h * 0.098;
  const bodyTop = topH + titleH;
  const bodyH = h - bodyTop;
  const divider = Math.max(2, w * 0.008);
  const imageTop = bodyTop + bodyH * 0.29;
  let [primary, secondary] = [card.badge_primary, card.badge_secondary];
  if (primary && !secondary) [primary, secondary] = dateLines(primary);
  return (
    <>
      <div className="absolute" style={{ top: topH, left: 0, right: 0, height: titleH, background: "#efeff1", borderTop: `${Math.max(2, divider / 2)}px solid #08090c` }}>
        <div className="w-full h-full flex items-center justify-center text-center font-bold overflow-hidden"
          style={{ color: "#0f0f11", fontSize: Math.max(8, h * 0.042), lineHeight: 1.12, padding: `0 ${w * 0.045}px` }}>
          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.title}</span>
        </div>
      </div>
      <div className="absolute" style={{ top: bodyTop, left: 0, right: 0, bottom: 0, background: "#7f8577", borderTop: `${Math.max(2, divider / 2)}px solid #08090c` }} />
      <div className="absolute" style={{ top: topH, left: 0, width: divider, bottom: 0, background: "#08090c" }} />
      <div className="absolute" style={{ top: topH, right: 0, width: divider, bottom: 0, background: "#08090c" }} />
      <div className="absolute flex items-center justify-center text-center overflow-hidden"
        style={{ top: bodyTop + bodyH * 0.035, left: w * 0.045, right: w * 0.045, height: imageTop - (bodyTop + bodyH * 0.035) - bodyH * 0.025, color: "rgb(235,236,230)", fontSize: Math.max(7, h * 0.026), lineHeight: 1.2 }}>
        <span style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.description}</span>
      </div>
      <CardImage src={card.image} className="absolute"
        style={{ top: imageTop, left: w * 0.085, right: w * 0.085, bottom: Math.max(5, divider), border: `${Math.max(2, divider / 2)}px solid #181917` }} />
      <Badge primary={primary} secondary={secondary} cardW={w} topH={topH} scale={bs} />
    </>
  );
}

function ClassicCard({ card, w, h, bs = 1 }) {
  const topH = h * 0.39;
  const titleTop = topH;
  const imageTop = h * 0.495;
  const divider = Math.max(2, w * 0.008);
  return (
    <>
      <div className="absolute inset-x-0 top-0" style={{ height: topH, background: "#101113" }} />
      <div className="absolute inset-x-0" style={{ top: titleTop, height: imageTop - titleTop, background: "#efefef", borderTop: `${divider}px solid #050608` }}>
        <div className="w-full h-full flex items-center justify-center text-center font-bold overflow-hidden"
          style={{ color: "#0f0f0f", fontSize: Math.max(8, h * 0.04), lineHeight: 1.1, padding: `0 ${w * 0.035}px` }}>
          <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.title}</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0" style={{ top: imageTop, background: "#767775", borderTop: `${divider}px solid #050608` }} />
      <CardImage src={card.image} className="absolute"
        style={{ top: imageTop + divider, left: divider, right: divider, bottom: divider }} />
      <div className="absolute inset-y-0 left-0" style={{ width: divider, background: "#050608" }} />
      <div className="absolute inset-y-0 right-0" style={{ width: divider, background: "#050608" }} />
      <Badge primary={card.badge_primary} secondary={card.badge_secondary} cardW={w} topH={topH} scale={0.97 * bs} />
    </>
  );
}

function IllustratedCard({ card, w, h, bs = 1 }) {
  const titleTop = h * 0.88;
  const divider = Math.max(2, w * 0.008);
  const url = assetUrl(card.image);
  const zoom = parseFloat(card.image_zoom) || 1;
  const panX = Math.max(-1, Math.min(1, parseFloat(card.image_pan_x) || 0));
  const panY = Math.max(-1, Math.min(1, parseFloat(card.image_pan_y) || 0));
  return (
    <>
      {url ? (
        <CardImage src={card.image} zoom={zoom} panX={panX} panY={panY}
          className="absolute" style={{ top: 0, left: divider, right: divider, height: titleTop }} />
      ) : (
        <div className="absolute" style={{ top: 0, left: divider, right: divider, height: titleTop }}>
          <div className="absolute inset-x-0 top-0" style={{ height: "64%", background: "#46cce2" }} />
          <div className="absolute inset-x-0 bottom-0" style={{ height: "36%", background: "#f2c66f", borderTop: `${Math.max(2, divider)}px solid #2b7a8f` }} />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0" style={{ top: titleTop, background: "#f9f8f4", borderTop: `${divider}px solid #1e1e1c` }}>
        <div className="w-full h-full flex items-center justify-center text-center font-bold overflow-hidden"
          style={{ color: "#121210", fontSize: Math.max(8, h * 0.042), lineHeight: 1.1, padding: `0 ${w * 0.035}px` }}>
          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.title}</span>
        </div>
      </div>
      <div className="absolute inset-y-0 left-0" style={{ width: divider, background: "#1e1e1c" }} />
      <div className="absolute inset-y-0 right-0" style={{ width: divider, background: "#1e1e1c" }} />
      <Badge primary={card.badge_primary} secondary={card.badge_secondary} cardW={w} topH={h * 0.37} scale={0.87 * bs} />
    </>
  );
}

export default function CardView({ card, modelId, w, h, badgeScale = 1, hideRole }) {
  const shown = { ...card };
  if (hideRole && hideRole !== "image") shown[hideRole] = "";
  const inner =
    modelId === MODEL_ILLUSTRATED ? <IllustratedCard card={shown} w={w} h={h} bs={badgeScale} /> :
    modelId === MODEL_CLASSIC ? <ClassicCard card={shown} w={w} h={h} bs={badgeScale} /> :
    <ReferenceCard card={shown} w={w} h={h} bs={badgeScale} />;
  return <div className="absolute inset-0 overflow-hidden">{inner}</div>;
}
