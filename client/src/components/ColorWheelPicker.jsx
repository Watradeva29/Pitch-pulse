import { useEffect, useMemo, useRef, useState } from "react";
import { hexToHsv, hsvToHex, hsvToRgb } from "../lib/colors";

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function angleDeg(x, y) {
  // angle from +x axis, clockwise, 0..360
  const a = (Math.atan2(y, x) * 180) / Math.PI;
  return (a + 360) % 360;
}

function getPos(evt, el) {
  const r = el.getBoundingClientRect();
  const x = (evt.clientX ?? 0) - r.left;
  const y = (evt.clientY ?? 0) - r.top;
  return { x, y, w: r.width, h: r.height };
}

export default function ColorWheelPicker({
  value,
  onChange,
  size = 240,
  ringThickness = 28,
  squareSize = 120,
  label,
}) {
  const ringRef = useRef(null);
  const squareRef = useRef(null);

  const initial = useMemo(() => hexToHsv(value || "#60A5FA"), [value]);
  const [h, setH] = useState(initial.h);
  const [s, setS] = useState(initial.s);
  const [v, setV] = useState(initial.v);

  // keep internal HSV in sync if parent changes
  useEffect(() => {
    const next = hexToHsv(value || "#60A5FA");
    setH(next.h);
    setS(next.s);
    setV(next.v);
  }, [value]);

  const outHex = useMemo(() => hsvToHex(h, s, v), [h, s, v]);

  useEffect(() => {
    if (typeof onChange === "function" && outHex && outHex !== (value || "").toUpperCase()) {
      onChange(outHex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outHex]);

  // draw hue ring
  useEffect(() => {
    const canvas = ringRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const px = Math.floor(size * dpr);
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    ctx.clearRect(0, 0, px, px);
    const cx = px / 2;
    const cy = px / 2;
    const outer = (px / 2) - 2 * dpr;
    const inner = outer - ringThickness * dpr;

    for (let a = 0; a < 360; a += 1) {
      ctx.beginPath();
      ctx.strokeStyle = `hsl(${a}, 100%, 50%)`;
      ctx.lineWidth = ringThickness * dpr;
      const start = ((a - 1) * Math.PI) / 180;
      const end = (a * Math.PI) / 180;
      ctx.arc(cx, cy, (inner + outer) / 2, start, end);
      ctx.stroke();
    }

    // hollow center
    ctx.beginPath();
    ctx.fillStyle = "rgba(11,16,32,1)";
    ctx.arc(cx, cy, inner - 2 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }, [size, ringThickness]);

  // draw SV square for current hue
  useEffect(() => {
    const canvas = squareRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const px = Math.floor(squareSize * dpr);
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = `${squareSize}px`;
    canvas.style.height = `${squareSize}px`;

    // base: hue color
    const { r, g, b } = hsvToRgb(h, 1, 1);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, px, px);

    // overlay: white -> transparent (controls saturation)
    const sat = ctx.createLinearGradient(0, 0, px, 0);
    sat.addColorStop(0, "rgba(255,255,255,1)");
    sat.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sat;
    ctx.fillRect(0, 0, px, px);

    // overlay: transparent -> black (controls value)
    const val = ctx.createLinearGradient(0, 0, 0, px);
    val.addColorStop(0, "rgba(0,0,0,0)");
    val.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = val;
    ctx.fillRect(0, 0, px, px);
  }, [h, squareSize]);

  function setHueFromEvent(evt) {
    const el = ringRef.current;
    if (!el) return;
    const { x, y, w } = getPos(evt, el);
    const cx = w / 2;
    const cy = w / 2;
    const dx = x - cx;
    const dy = y - cy;
    const a = angleDeg(dx, dy);
    setH(a);
  }

  function setSvFromEvent(evt) {
    const el = squareRef.current;
    if (!el) return;
    const { x, y, w, h: hh } = getPos(evt, el);
    const ns = clamp01(x / w);
    const nv = clamp01(1 - y / hh);
    setS(ns);
    setV(nv);
  }

  function trackPointer(onMove) {
    return (downEvt) => {
      downEvt.preventDefault();
      onMove(downEvt);
      const move = (evt) => onMove(evt);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
  }

  const ringHandle = useMemo(() => {
    const radius = size / 2 - ringThickness / 2;
    const rad = (h * Math.PI) / 180;
    const cx = size / 2;
    const cy = size / 2;
    const x = cx + Math.cos(rad) * radius;
    const y = cy + Math.sin(rad) * radius;
    return { x, y };
  }, [h, size, ringThickness]);

  const squareHandle = useMemo(() => {
    const x = s * squareSize;
    const y = (1 - v) * squareSize;
    return { x, y };
  }, [s, v, squareSize]);

  const center = (size - squareSize) / 2;
  const currentSwatch = outHex;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <canvas
          ref={ringRef}
          role="slider"
          aria-label={label ? `${label} hue` : "Hue"}
          onPointerDown={trackPointer(setHueFromEvent)}
          style={{
            width: size,
            height: size,
            borderRadius: 999,
            touchAction: "none",
            cursor: "crosshair",
            display: "block",
          }}
        />

        {/* hue handle */}
        <div
          style={{
            position: "absolute",
            left: ringHandle.x - 14,
            top: ringHandle.y - 14,
            width: 28,
            height: 28,
            borderRadius: 999,
            border: "3px solid rgba(255,255,255,0.95)",
            boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
            background: "transparent",
            pointerEvents: "none",
          }}
        />

        {/* SV square */}
        <div
          style={{
            position: "absolute",
            left: center,
            top: center,
            width: squareSize,
            height: squareSize,
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
          }}
        >
          <canvas
            ref={squareRef}
            aria-label={label ? `${label} saturation/value` : "Saturation/value"}
            onPointerDown={trackPointer(setSvFromEvent)}
            style={{
              width: squareSize,
              height: squareSize,
              display: "block",
              touchAction: "none",
              cursor: "crosshair",
            }}
          />

          {/* SV handle */}
          <div
            style={{
              position: "absolute",
              left: squareHandle.x - 9,
              top: squareHandle.y - 9,
              width: 18,
              height: 18,
              borderRadius: 999,
              border: "2px solid rgba(255,255,255,0.95)",
              boxShadow: "0 4px 14px rgba(0,0,0,0.55)",
              background: "transparent",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      {/* swatch (no hex text shown) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {label || "Colour"}
        </div>
        <div
          title={currentSwatch}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.16)",
            background: currentSwatch,
            boxShadow: "0 10px 26px rgba(0,0,0,0.45)",
          }}
        />
      </div>
    </div>
  );
}

