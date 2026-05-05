import { useEffect, useMemo, useRef, useState } from "react";
import { pickTextColor, withAlpha } from "../lib/colors";

function useOutsideClick(ref, onOutside) {
  useEffect(() => {
    function onDown(e) {
      const el = ref.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      onOutside?.();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
    };
  }, [ref, onOutside]);
}

export default function TeamSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
  accentColor = "#60A5FA",
  panelColor,
  fieldStyle = "tinted", // tinted | neutral
  disabled = false,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [maxListHeight, setMaxListHeight] = useState(280);

  useOutsideClick(wrapRef, () => setOpen(false));

  const panel = useMemo(() => panelColor || accentColor, [panelColor, accentColor]);
  const textColor = useMemo(() => pickTextColor(panel), [panel]);
  const selected = useMemo(() => (options || []).find((o) => o.value === value) || null, [options, value]);
  const fieldTinted = fieldStyle !== "neutral";

  useEffect(() => {
    if (!open) return;

    function recompute() {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 8;
      const pad = 8;
      const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
      const spaceAbove = rect.top - gap - pad;
      const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      setOpenUp(shouldOpenUp);
      const usable = Math.max(160, Math.min(360, (shouldOpenUp ? spaceAbove : spaceBelow) - 4));
      setMaxListHeight(usable);
    }

    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {label ? (
        <label style={{ color: pickTextColor(panel), fontWeight: 900, letterSpacing: 0.2 }}>{label}</label>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((s) => !s)}
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          borderRadius: 12,
          border: `1px solid ${fieldTinted ? withAlpha(panel, 0.35) : "rgba(255,255,255,0.12)"}`,
          background: fieldTinted ? withAlpha(panel, 0.10) : "rgba(0,0,0,0.25)",
          color: "rgba(255,255,255,0.92)",
          padding: "10px 12px",
          minHeight: 44,
        }}
      >
        <span style={{ fontWeight: 800, opacity: selected ? 1 : 0.65 }}>
          {selected?.label || placeholder}
        </span>
        <span className="mono" style={{ opacity: 0.75 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            zIndex: 200,
            left: 0,
            right: 0,
            marginTop: openUp ? 0 : 8,
            marginBottom: openUp ? 8 : 0,
            bottom: openUp ? "100%" : "auto",
            borderRadius: 14,
            border: `1px solid ${withAlpha(panel, 0.35)}`,
            background:
              `linear-gradient(180deg, ${withAlpha(panel, 0.22)} 0%, rgba(11,16,32,0.96) 28%)`,
            boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
            overflow: "hidden",
          }}
        >
          <div style={{ maxHeight: maxListHeight, overflow: "auto" }}>
            {(options || []).map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value || opt.label}
                  type="button"
                  onClick={() => {
                    onChange?.(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 0,
                    background: active ? withAlpha(panel, 0.30) : "transparent",
                    color: active ? textColor : "rgba(255,255,255,0.90)",
                    padding: "10px 12px",
                    fontWeight: active ? 1000 : 800,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

