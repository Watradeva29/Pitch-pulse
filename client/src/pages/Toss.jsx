import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createSocket } from "../lib/socket";
import { getMatch } from "../lib/api";
import { pickTextColor } from "../lib/colors";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fairFlip() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const buf = new Uint8Array(1);
      crypto.getRandomValues(buf);
      return (buf[0] & 1) === 0 ? "H" : "T";
    }
  } catch {
    // ignore
  }
  return Math.random() < 0.5 ? "H" : "T";
}

export default function Toss() {
  const nav = useNavigate();
  const { code } = useParams();
  const [sp] = useSearchParams();
  const key = sp.get("key") || "";

  const matchCode = String(code || "").toUpperCase();
  const socket = useMemo(() => createSocket(), []);

  const [match, setMatch] = useState(null);
  const [err, setErr] = useState("");
  const [connected, setConnected] = useState(false);
  const [authOk, setAuthOk] = useState(true);

  const [callTeam, setCallTeam] = useState("A"); // team that calls
  const [callChoice, setCallChoice] = useState("H"); // H or T
  const [phase, setPhase] = useState("pick"); // pick | flipping | reveal | decision
  const [flipResult, setFlipResult] = useState(null); // H|T
  const [winner, setWinner] = useState(null); // A|B
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getMatch(matchCode);
        if (!alive) return;
        setMatch(res.match);
      } catch (e) {
        setErr(e.message || "Failed to load match.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [matchCode]);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onUpdate = (m) => {
      setMatch(m);
      setErr(m?.errors?.[0] || "");
      setAuthOk(true);
    };
    const onError = (e) => {
      setErr(e?.message || "Socket error");
      setAuthOk(false);
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("match:update", onUpdate);
    socket.on("match:error", onError);
    socket.connect();
    if (key) {
      socket.emit("match:join", { code: matchCode, role: "umpire", key });
    } else {
      // Avoid setState directly inside effect body to satisfy eslint rule.
      queueMicrotask(() => {
        setErr("Missing umpire key. Use the private link from Share screen.");
        setAuthOk(false);
      });
    }
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("match:update", onUpdate);
      socket.off("match:error", onError);
      socket.disconnect();
    };
  }, [socket, matchCode, key]);

  const a = match?.teams?.A;
  const b = match?.teams?.B;
  const aColor = a?.color || "#60A5FA";
  const bColor = b?.color || "#F59E0B";

  async function onFlip() {
    setErr("");
    setPhase("flipping");
    setWinner(null);
    setFlipResult(null);

    const r = fairFlip();
    setFlipResult(r);

    // simulate animation time
    await sleep(1400);

    const winTeam = callChoice === r ? callTeam : callTeam === "A" ? "B" : "A";
    setWinner(winTeam);
    setPhase("reveal");
    await sleep(900);
    setPhase("decision");
  }

  async function onChoose(dec) {
    if (saving) return;
    if (!connected) {
      setErr("Not connected to server yet. Please wait 1–2 seconds and try again.");
      return;
    }
    if (!authOk) {
      setErr("Umpire access denied (or umpire already connected). Use the private link from Share screen.");
      return;
    }
    const d = dec === "bowl" ? "bowl" : "bat";
    setSaving(true);
    setErr("");
    const payload = {
      code: matchCode,
      call: { team: callTeam, choice: callChoice },
      result: flipResult || "H",
      decision: d,
    };
    try {
      await new Promise((resolve, reject) => {
        socket.timeout(2500).emit("match:toss", payload, (err, res) => {
          if (err) return reject(new Error("Failed to save toss. Try again."));
          if (res?.ok === false) return reject(new Error(res.error || "Failed to save toss."));
          resolve(res);
        });
      });
      await new Promise((resolve, reject) => {
        socket.timeout(2500).emit("match:startInnings1", { code: matchCode }, (err, res) => {
          if (err) return reject(new Error("Failed to start innings. Try again."));
          if (res?.ok === false) return reject(new Error(res.error || "Failed to start innings."));
          resolve(res);
        });
      });
      nav(`/match/${encodeURIComponent(matchCode)}/umpire?key=${encodeURIComponent(key)}`);
    } catch (e) {
      setErr(e?.message || "Failed to continue. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const winnerName = winner === "B" ? b?.name : a?.name;
  const winnerColor = winner === "B" ? bColor : aColor;
  const winnerText = pickTextColor(winnerColor);

  return (
    <div className="container" style={{ position: "relative" }}>
      {(phase === "reveal" || phase === "decision") && winner ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: winnerColor,
            color: winnerText,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 520 }}>
            <div style={{ fontSize: 14, letterSpacing: 1, fontWeight: 900, textTransform: "uppercase", opacity: 0.85 }}>
              Toss won
            </div>
            <div style={{ fontSize: 44, fontWeight: 1000, letterSpacing: -1, marginTop: 10 }}>
              {winnerName || "—"}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10, opacity: 0.8 }}>
              Result: {flipResult === "T" ? "Tails" : "Heads"}
            </div>
            {phase === "decision" ? (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Choose</div>
                <div className="btnRow" style={{ justifyContent: "center" }}>
                  <button className="primary" onClick={() => onChoose("bat")}>
                    Bat
                  </button>
                  <button className="primary" onClick={() => onChoose("bowl")}>
                    Bowl
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 18, fontWeight: 800 }}>...</div>
            )}
          </div>
        </div>
      ) : null}

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="pill">Toss</div>
          <h1 style={{ margin: "10px 0 0" }}>Heads or Tails</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            Code: <code>{matchCode}</code> · Socket: {connected ? "connected" : "disconnected"}
          </div>
        </div>
        <div className="btnRow">
          <button onClick={() => nav(`/match/${encodeURIComponent(matchCode)}/share?key=${encodeURIComponent(key)}`)}>Back</button>
          <button onClick={() => nav("/")}>Home</button>
        </div>
      </div>

      {err ? (
        <div className="error" style={{ marginTop: 16 }}>
          {err}
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 520px" }}>
          <h2>Choose who calls</h2>
          <div className="btnRow">
            <button className={callTeam === "A" ? "primary" : ""} onClick={() => setCallTeam("A")}>
              {a?.name || "Team A"}
            </button>
            <button className={callTeam === "B" ? "primary" : ""} onClick={() => setCallTeam("B")}>
              {b?.name || "Team B"}
            </button>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            Selected: <b>{callTeam === "B" ? b?.name : a?.name}</b>
          </div>
        </div>

        <div className="card" style={{ flex: "1 1 520px" }}>
          <h2>Pick Heads or Tails</h2>
          <div className="btnRow">
            <button className={callChoice === "H" ? "primary" : ""} onClick={() => setCallChoice("H")}>
              Heads
            </button>
            <button className={callChoice === "T" ? "primary" : ""} onClick={() => setCallChoice("T")}>
              Tails
            </button>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            Picked: <b>{callChoice === "T" ? "Tails" : "Heads"}</b>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16, justifyContent: "center" }}>
        <div className="card" style={{ flex: "1 1 100%", maxWidth: 520, textAlign: "center" }}>
          <div
            style={{
              width: 130,
              height: 130,
              borderRadius: 999,
              margin: "0 auto 14px",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
              display: "grid",
              placeItems: "center",
              fontWeight: 1000,
              fontSize: 26,
              transform: phase === "flipping" ? "rotateY(720deg)" : "rotateY(0deg)",
              transition: phase === "flipping" ? "transform 1.3s cubic-bezier(.2,.8,.2,1)" : "transform 0.2s ease",
            }}
          >
            {phase === "pick" ? "FLIP" : flipResult === "T" ? "T" : "H"}
          </div>

          <button className="primary" disabled={!key || phase === "flipping"} onClick={onFlip}>
            Toss now
          </button>
          <div className="muted" style={{ marginTop: 10 }}>
            After the toss, winner chooses bat/bowl and we go straight to scoring.
          </div>
        </div>
      </div>
    </div>
  );
}

