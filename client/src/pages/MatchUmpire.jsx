import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createSocket } from "../lib/socket";
import { getMatch } from "../lib/api";
import { pickTextColor, withAlpha } from "../lib/colors";

function toOversString(legalBalls) {
  const o = Math.floor((legalBalls || 0) / 6);
  const b = (legalBalls || 0) % 6;
  return `${o}.${b}`;
}

function findPlayerName(match, playerId) {
  if (!match || !playerId) return "";
  const all = [...(match.teams?.A?.players || []), ...(match.teams?.B?.players || [])];
  return all.find((p) => p.id === playerId)?.name || "";
}

function sr(runs, balls) {
  const b = Number(balls || 0);
  if (!b) return "—";
  return ((Number(runs || 0) * 100) / b).toFixed(1);
}

function econ(runsConceded, legalBalls) {
  const balls = Number(legalBalls || 0);
  if (!balls) return "—";
  const overs = balls / 6;
  return (Number(runsConceded || 0) / overs).toFixed(2);
}

function ballLabel(b) {
  if (!b) return "•";
  if (b.kind === "run") return String(b.runs);
  if (b.kind === "wide") return "Wd";
  if (b.kind === "noBall") return "Nb";
  if (b.kind === "wicket") return "W";
  return "•";
}

function thisOverDeliveries(current) {
  const deliveries = Array.isArray(current?.deliveries) ? current.deliveries : [];
  const legalBalls = Number(current?.legalBalls || 0);
  const ballInOver = Number(current?.ballInOver || 0);
  const overs = Number(current?.overs || 0);
  const overIndex = legalBalls > 0 && ballInOver === 0 ? Math.max(0, overs - 1) : overs;
  const list = deliveries.filter((d) => Number(d?.over) === overIndex);
  return { overIndex, list };
}

export default function MatchUmpire() {
  const nav = useNavigate();
  const { code } = useParams();
  const [sp] = useSearchParams();
  const key = sp.get("key") || "";
  const matchCode = String(code || "").toUpperCase();

  const [match, setMatch] = useState(null);
  const [err, setErr] = useState("");
  const [connected, setConnected] = useState(false);

  const socket = useMemo(() => createSocket(), []);

  const strikerRef = useRef(null);
  const nonStrikerRef = useRef(null);
  const bowlerRef = useRef(null);

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
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("match:update", (m) => {
      setMatch(m);
      setErr(m?.errors?.[0] || "");
    });
    socket.on("match:error", (e) => setErr(e?.message || "Socket error"));
    if (key) {
      socket.emit("match:join", { code: matchCode, role: "umpire", key });
    }
    return () => socket.disconnect();
  }, [socket, matchCode, key]);

  const current = match?.current;
  const battingPlayers = match ? match.teams?.[match.battingTeam]?.players || [] : [];
  const bowlingPlayers = match ? match.teams?.[match.bowlingTeam]?.players || [] : [];
  const aColor = match?.teams?.A?.color || "#60A5FA";
  const bColor = match?.teams?.B?.color || "#F59E0B";
  const aText = pickTextColor(aColor);
  const bText = pickTextColor(bColor);

  const [showSetup, setShowSetup] = useState(true);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [wicketHowOut, setWicketHowOut] = useState("Bowled");
  const [wicketNextBatterId, setWicketNextBatterId] = useState("");
  const [newBowlerId, setNewBowlerId] = useState("");

  const shouldPromptNewBowler =
    match?.status === "live" &&
    !match?.current?.completed &&
    !!match?.current?.strikerId &&
    !!match?.current?.nonStrikerId &&
    !match?.current?.bowlerId &&
    Number(match?.current?.legalBalls || 0) > 0 &&
    Number(match?.current?.ballInOver || 0) === 0;

  const isMatchOver =
    match?.status === "completed" ||
    match?.status === "tie" ||
    (match?.innings === 2 && match?.current?.completed);

  if (!match) {
    return (
      <div className="container">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="pill">Umpire</div>
            <h1 style={{ margin: "10px 0 0" }}>Loading match…</h1>
            <div className="muted" style={{ marginTop: 6 }}>
              Code: <code>{matchCode}</code>
            </div>
          </div>
          <div className="btnRow">
            <button onClick={() => nav(-1)}>Back</button>
            <button onClick={() => nav("/")}>Home</button>
          </div>
        </div>
        {err ? (
          <div className="error" style={{ marginTop: 16 }}>
            {err}
          </div>
        ) : null}
        {!key ? (
          <div className="error" style={{ marginTop: 16 }}>
            Missing umpire key. Use the private umpire link from the Share screen.
          </div>
        ) : null}
      </div>
    );
  }

  const chase =
    match?.innings === 2 && match?.target != null
      ? {
          runsNeeded: Math.max(0, match.target - (current?.runs || 0)),
          ballsLeft: Math.max(0, match.settings.maxOvers * 6 - (current?.legalBalls || 0)),
        }
      : null;

  const strikerStats = current?.strikerId ? current?.batting?.[current.strikerId] : null;
  const nonStrikerStats = current?.nonStrikerId ? current?.batting?.[current.nonStrikerId] : null;
  const bowlerStats = current?.bowlerId ? current?.bowling?.[current.bowlerId] : null;

  const battingAll = match?.teams?.[match?.battingTeam]?.players || [];
  const availableBatters = battingAll.filter((p) => {
    const st = current?.batting?.[p.id];
    if (!st) return true;
    return !st.out;
  });
  const wicketCandidates = availableBatters.filter((p) => p.id !== current?.strikerId && p.id !== current?.nonStrikerId);

  const { overIndex: displayOverIndex, list: overList } = thisOverDeliveries(current);

  const eligibleBowlers = (bowlingPlayers || []).filter((p) => p.id && p.id !== current?.lastOverBowlerId);

  function hapticTick() {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(10);
      }
    } catch {
      // ignore
    }
  }

  function sendBall(action) {
    hapticTick();
    socket.emit("match:ball", { code: match.matchId, action });
  }

  function openWicket() {
    setWicketHowOut("Bowled");
    setWicketNextBatterId("");
    setWicketOpen(true);
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="pill">Umpire</div>
          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800 }}>
            {match.teams?.A?.name} vs {match.teams?.B?.name}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Match code: <code>{match.matchId}</code> · Socket: {connected ? "connected" : "disconnected"}
          </div>
        </div>
        <div className="btnRow">
          <button onClick={() => nav("/")}>Home</button>
        </div>
      </div>

      {err ? (
        <div className="error" style={{ marginTop: 16 }}>
          {err}
        </div>
      ) : null}

      {isMatchOver ? (
        <div className="row" style={{ marginTop: 16 }}>
          <div className="card" style={{ flex: "1 1 100%" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Match over</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Open the full match summary and downloads.
                </div>
              </div>
              <button className="primary" onClick={() => nav(`/match/${encodeURIComponent(match.matchId)}/scorecard`)}>
                Match summary
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {match?.status === "tie" ? (
        <div className="row" style={{ marginTop: 16 }}>
          <div className="card" style={{ flex: "1 1 100%" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>Match tied</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Start a Super Over to decide the winner.
                </div>
              </div>
              <button
                className="primary"
                disabled={!connected}
                onClick={() => socket.emit("match:startSuperOver", { code: match.matchId })}
              >
                Start Super Over
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {wicketOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 80,
            display: "flex",
            alignItems: "end",
            justifyContent: "center",
            padding: 14,
          }}
          onClick={() => setWicketOpen(false)}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: 520, borderRadius: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Wicket</h2>
            <div className="muted" style={{ marginBottom: 10 }}>
              Out: <b>{findPlayerName(match, current?.strikerId) || "—"}</b>
            </div>

            <div className="grid2">
              <div>
                <label>How out</label>
                <select value={wicketHowOut} onChange={(e) => setWicketHowOut(e.target.value)}>
                  <option>Bowled</option>
                  <option>Caught</option>
                  <option>LBW</option>
                  <option>Run out</option>
                  <option>Stumped</option>
                  <option>Hit wicket</option>
                </select>
              </div>
              <div>
                <label>Next batter</label>
                <select value={wicketNextBatterId} onChange={(e) => setWicketNextBatterId(e.target.value)}>
                  <option value="">Select</option>
                  {wicketCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="btnRow" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <button onClick={() => setWicketOpen(false)}>Cancel</button>
              <button
                className="bad"
                disabled={!connected || (!wicketNextBatterId && wicketCandidates.length > 0)}
                onClick={() => {
                  setWicketOpen(false);
                  sendBall({
                    kind: "wicket",
                    howOut: wicketHowOut,
                    outPlayerId: current?.strikerId,
                    nextBatterId: wicketNextBatterId || null,
                  });
                }}
              >
                Confirm wicket
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shouldPromptNewBowler ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 85,
            display: "flex",
            alignItems: "end",
            justifyContent: "center",
            padding: 14,
          }}
          onClick={() => {}}
        >
          <div className="card" style={{ width: "100%", maxWidth: 520, borderRadius: 18 }} onClick={(e) => e.stopPropagation()}>
            <h2>New over — select bowler</h2>
            <div className="muted" style={{ marginBottom: 10 }}>
              Over <b className="mono">{displayOverIndex + 1}</b> completed. Pick the next bowler to continue.
            </div>
            <div>
              <label>Bowler</label>
              <select value={newBowlerId} onChange={(e) => setNewBowlerId(e.target.value)}>
                <option value="">Select</option>
                {eligibleBowlers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {current?.lastOverBowlerId ? (
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                  Previous over: <b>{findPlayerName(match, current.lastOverBowlerId) || "—"}</b> (not selectable)
                </div>
              ) : null}
            </div>
            <div className="btnRow" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button
                className="primary"
                disabled={!connected || !newBowlerId}
                onClick={() => {
                  hapticTick();
                  setShowSetup(true);
                  socket.emit("match:selectPlayers", {
                    code: match.matchId,
                    strikerId: current?.strikerId,
                    nonStrikerId: current?.nonStrikerId,
                    bowlerId: newBowlerId,
                  });
                }}
              >
                Start next over
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <div
          className="card"
          style={{
            flex: "1 1 100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div className="muted" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span
              className="pill"
              style={{
                borderColor: withAlpha(aColor, 0.5),
                background: withAlpha(aColor, 0.18),
                color: aText,
              }}
            >
              {match.teams.A.name}
            </span>
            <span
              className="pill"
              style={{
                borderColor: withAlpha(bColor, 0.5),
                background: withAlpha(bColor, 0.18),
                color: bText,
              }}
            >
              {match.teams.B.name}
            </span>
            {match?.settings?.joker?.enabled ? (
              <span
                className="pill"
                style={{
                  borderColor: "rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                Joker: {match.settings.joker.name}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 100%" }}>
          <div className="muted" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="pill">{match?.superOver?.active ? "Super Over" : `Innings ${match.innings}`}</span>
            <span className="pill" style={{ borderColor: match.teams?.[match.battingTeam]?.color || "var(--border)" }}>
              Batting: {match.teams?.[match.battingTeam]?.name || "—"}
            </span>
            <span className="pill" style={{ borderColor: match.teams?.[match.bowlingTeam]?.color || "var(--border)" }}>
              Bowling: {match.teams?.[match.bowlingTeam]?.name || "—"}
            </span>
          </div>

          <div className="row" style={{ marginTop: 10, justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
              <div className="scoreBig" style={{ fontWeight: 900 }}>
                {current?.runs ?? 0}/{current?.wickets ?? 0}
              </div>
              <div className="muted">
                Overs <b className="mono">{toOversString(current?.legalBalls || 0)}</b> / <b className="mono">{match.settings.maxOvers}</b>
                {match.target != null ? (
                  <>
                    {" "}
                    · Target <b className="mono">{match.target}</b>
                  </>
                ) : null}
              </div>
            </div>
            <button onClick={() => setShowSetup((v) => !v)}>{showSetup ? "Hide setup" : "Show setup"}</button>
          </div>

          {chase ? (
            <div className="muted" style={{ marginTop: 8 }}>
              Need <b className="mono">{chase.runsNeeded}</b> from <b className="mono">{chase.ballsLeft}</b> balls
            </div>
          ) : null}

          <div className="muted" style={{ marginTop: 10 }}>
            Striker <b>{findPlayerName(match, current?.strikerId) || "—"}</b> · Non <b>{findPlayerName(match, current?.nonStrikerId) || "—"}</b> · Bowler{" "}
            <b>{findPlayerName(match, current?.bowlerId) || "—"}</b>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <div className="card" style={{ flex: "1 1 100%", padding: 12, background: "rgba(0,0,0,0.18)" }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                This over (Over <b className="mono">{displayOverIndex + 1}</b>)
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {overList.length ? (
                  overList.map((b, idx) => (
                    <span
                      key={`${b.t || idx}-${idx}`}
                      className="pill"
                      style={{
                        borderColor:
                          b.kind === "wicket"
                            ? "rgba(239,68,68,0.55)"
                            : b.kind === "wide" || b.kind === "noBall"
                              ? "rgba(96,165,250,0.55)"
                              : "rgba(255,255,255,0.16)",
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.85)",
                        minWidth: 44,
                        justifyContent: "center",
                      }}
                      title={b.freeHit ? "Free hit" : ""}
                    >
                      {ballLabel(b)}
                    </span>
                  ))
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <div className="card" style={{ flex: "1 1 320px", padding: 12, background: "rgba(0,0,0,0.18)" }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Batting (live)
              </div>
              <div className="kv">
                <div>
                  <div className="k">Striker</div>
                  <div className="v">
                    {strikerStats ? (
                      <span className="mono">
                        {strikerStats.runs}/{strikerStats.balls} · SR {sr(strikerStats.runs, strikerStats.balls)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                <div>
                  <div className="k">Non-striker</div>
                  <div className="v">
                    {nonStrikerStats ? (
                      <span className="mono">
                        {nonStrikerStats.runs}/{nonStrikerStats.balls} · SR {sr(nonStrikerStats.runs, nonStrikerStats.balls)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ flex: "1 1 320px", padding: 12, background: "rgba(0,0,0,0.18)" }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Bowling (current)
              </div>
              <div className="kv">
                <div>
                  <div className="k">O</div>
                  <div className="v mono">{toOversString(bowlerStats?.legalBalls || 0)}</div>
                </div>
                <div>
                  <div className="k">R</div>
                  <div className="v mono">{bowlerStats?.runsConceded ?? 0}</div>
                </div>
                <div>
                  <div className="k">W</div>
                  <div className="v mono">{bowlerStats?.wickets ?? 0}</div>
                </div>
                <div>
                  <div className="k">Econ</div>
                  <div className="v mono">{econ(bowlerStats?.runsConceded ?? 0, bowlerStats?.legalBalls ?? 0)}</div>
                </div>
                <div>
                  <div className="k">Wd/Nb</div>
                  <div className="v mono">
                    {(bowlerStats?.wides ?? 0)}/{(bowlerStats?.noBalls ?? 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSetup ? (
        <div className="row" style={{ marginTop: 12 }}>
          <div className="card" style={{ flex: "1 1 100%" }}>
            <div className="btnRow tight" style={{ marginBottom: 10 }}>
              {match?.innings === 1 && match?.current?.completed ? (
                <button className="good" disabled={!connected} onClick={() => socket.emit("match:startInnings2", { code: match.matchId })}>
                  Start innings 2
                </button>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>
                  Innings and teams are auto-set from the toss. Start innings 2 appears after innings 1 ends.
                </div>
              )}
            </div>

            <div className="grid2">
              <div>
                <label>Striker</label>
                <select key={current?.strikerId || "striker"} defaultValue={current?.strikerId || ""} ref={strikerRef}>
                  <option value="">Select</option>
                  {battingPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Non-striker</label>
                <select key={current?.nonStrikerId || "non"} defaultValue={current?.nonStrikerId || ""} ref={nonStrikerRef}>
                  <option value="">Select</option>
                  {battingPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Bowler</label>
                <select key={current?.bowlerId || "bowler"} defaultValue={current?.bowlerId || ""} ref={bowlerRef}>
                  <option value="">Select</option>
                  {bowlingPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "end" }}>
                <button
                  className="primary"
                  disabled={!connected}
                  onClick={() =>
                    socket.emit("match:selectPlayers", {
                      code: match.matchId,
                      strikerId: strikerRef.current?.value || "",
                      nonStrikerId: nonStrikerRef.current?.value || "",
                      bowlerId: bowlerRef.current?.value || "",
                    })
                  }
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 12 }}>
        <div className="stickyBar" style={{ flex: "1 1 100%" }}>
          <div className="btnRow tight" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button
              disabled={!connected || !match?.undo?.available}
              onClick={() => {
                hapticTick();
                socket.emit("match:undo", { code: match.matchId });
              }}
            >
              Undo
            </button>
            <div className="muted" style={{ fontSize: 12 }}>
              (only previous ball)
            </div>
          </div>

          <div className="btnGrid">
            {[0, 1, 2, 3, 4, 6].map((r) => (
              <button
                key={r}
                className="primary"
                disabled={!connected || !current?.bowlerId}
                onClick={() => sendBall({ kind: "run", runs: r })}
              >
                {r}
              </button>
            ))}
            <button disabled={!connected || !current?.bowlerId} onClick={() => sendBall({ kind: "wide" })}>
              Wd
            </button>
            <button disabled={!connected || !current?.bowlerId} onClick={() => sendBall({ kind: "noBall" })}>
              Nb
            </button>
            <button className="bad" disabled={!connected || !current?.bowlerId} onClick={openWicket}>
              W
            </button>
          </div>

          <div className="muted" style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              Last:{" "}
              <b>
                {match.lastBall
                  ? `${match.lastBall.kind}${match.lastBall.kind === "run" ? `(${match.lastBall.runs})` : ""}${match.lastBall.freeHit ? " [free hit]" : ""}`
                  : "—"}
              </b>
            </div>
            <div className="mono">Code {match.matchId}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

