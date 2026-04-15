function inferApiBase() {
  // If app is opened via LAN IP (phone testing), "localhost" would point to the phone.
  // So we default to the same hostname as the page, with backend port 3001.
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:3001`;
  }
  return "http://localhost:3001";
}

function sanitizeApiBase(maybeUrl) {
  const raw = String(maybeUrl || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw, typeof window !== "undefined" ? window.location.origin : undefined);
    // If someone accidentally set VITE_API_BASE to the Vite dev server,
    // sockets will try /socket.io on :5173 and fail. Prefer inferred backend.
    if (u.port === "5173") return null;
    return u.origin;
  } catch {
    return null;
  }
}

const API_BASE = sanitizeApiBase(import.meta.env.VITE_API_BASE) || inferApiBase();

export async function createMatch(payload) {
  const res = await fetch(`${API_BASE}/api/matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to create match");
  return await res.json();
}

export async function getMatch(code) {
  const res = await fetch(`${API_BASE}/api/matches/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error((await res.json()).error || "Failed to fetch match");
  return await res.json();
}

export { API_BASE };

