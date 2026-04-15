function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }
  return { r: 255, g: 255, b: 255 };
}

function rgbToHex({ r, g, b }) {
  const rr = clampInt(r, 0, 255).toString(16).padStart(2, "0");
  const gg = clampInt(g, 0, 255).toString(16).padStart(2, "0");
  const bb = clampInt(b, 0, 255).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`.toUpperCase();
}

// h: 0-360, s: 0-1, v: 0-1
export function hsvToRgb(h, s, v) {
  const hh = ((Number(h) % 360) + 360) % 360;
  const ss = clamp01(Number(s));
  const vv = clamp01(Number(v));
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) [rp, gp, bp] = [c, x, 0];
  else if (hh < 120) [rp, gp, bp] = [x, c, 0];
  else if (hh < 180) [rp, gp, bp] = [0, c, x];
  else if (hh < 240) [rp, gp, bp] = [0, x, c];
  else if (hh < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

export function rgbToHsv(r, g, b) {
  const rr = clamp01(Number(r) / 255);
  const gg = clamp01(Number(g) / 255);
  const bb = clamp01(Number(b) / 255);
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;

  let h = 0;
  if (d === 0) h = 0;
  else if (max === rr) h = 60 * (((gg - bb) / d) % 6);
  else if (max === gg) h = 60 * ((bb - rr) / d + 2);
  else h = 60 * ((rr - gg) / d + 4);
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

export function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

export function hsvToHex(h, s, v) {
  return rgbToHex(hsvToRgb(h, s, v));
}

// Relative luminance (sRGB)
function luminance({ r, g, b }) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function pickTextColor(bgHex) {
  const lum = luminance(hexToRgb(bgHex));
  // threshold tuned for dark UI panels
  return lum > 0.55 ? "rgba(0,0,0,0.88)" : "rgba(255,255,255,0.92)";
}

export function withAlpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  const alpha = clamp01(Number(a));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

