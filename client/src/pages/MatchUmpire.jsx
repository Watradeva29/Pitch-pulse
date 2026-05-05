import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createSocket } from "../lib/socket";
import { getMatch } from "../lib/api";
import { pickTextColor, withAlpha } from "../lib/colors";
import MatchSummaryCard from "../components/MatchSummaryCard";
import { exportElementToPng } from "../lib/export";
import TeamSelect from "../components/TeamSelect";

function toOversString(legalBalls) {
  const o = Math.floor((legalBalls || 0) / 6);
  const b = (legalBalls || 0) % 6;
  return `${o}.${b}`;
}

function findPlayerName(match, playerId) {
  if (!match || playerId == null || playerId === "") return "";
  const id = String(playerId);
  const all = [...(match.teams?.A?.players || []), ...(match.teams?.B?.players || [])];
  return all.find((p) => String(p.id) === id)?.name || "";
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

function formatDuration(ms) {
  const t = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function ballLabel(b) {
  if (!b) return "•";
  if (b.kind === "run") return String(b.runs);
  if (b.kind === "wide") return "Wd";
  if (b.kind === "noBall") return "Nb";
  if (b.kind === "wicket") return "W";
  return "•";
}

function bubbleStyleForBall(b, batColor) {
  const base = {
    marginRight: 6,
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.90)",
    borderColor: "rgba(255,255,255,0.16)",
    minWidth: 44,
    justifyContent: "center",
    fontWeight: 900,
  };

  if (!b) return base;

  if (b.kind === "wicket") {
    return {
      ...base,
      background: "rgba(239,68,68,0.14)",
      borderColor: "rgba(239,68,68,0.55)",
      color: "rgba(255,255,255,0.92)",
    };
  }

  if (b.kind === "run" && (Number(b.runs) === 4 || Number(b.runs) === 6)) {
    return {
      ...base,
      background: withAlpha(batColor, 0.18),
      borderColor: withAlpha(batColor, 0.55),
      color: pickTextColor(batColor),
    };
  }

  return base;
}

function thisOverDeliveries(current) {
  const deliveries = Array.isArray(current?.deliveries) ? current.deliveries : [];
  const legalBalls = Number(current?.legalBalls || 0);
  const ballInOver = Number(current?.ballInOver || 0);
  const overs = Number(current?.overs || 0);
  const betweenOvers =
    Number(current?.legalBalls || 0) > 0 &&
    Number(current?.ballInOver || 0) === 0 &&
    !current?.bowlerId;

  // If we're between overs (bowlerId cleared), show the completed over.
  // If a new bowler is already selected, show the current over (empty until first ball).
  const overIndex = betweenOvers ? Math.max(0, overs - 1) : overs;
  const list = deliveries.filter((d) => Number(d?.over) === overIndex);
  return { overIndex, list };
}

function overRuns(current, overIndex) {
  const deliveries = Array.isArray(current?.deliveries) ? current.deliveries : [];
  const list = deliveries.filter((d) => Number(d?.over) === Number(overIndex));
  return list.reduce((sum, d) => sum + Number(d?.runs || 0) + Number(d?.extras?.wide || 0) + Number(d?.extras?.noBall || 0), 0);
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
  const [now, setNow] = useState(() => Date.now());

  const socket = useMemo(() => createSocket(), []);

  const summaryRef = useRef(null);

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
    };
    const onError = (e) => setErr(e?.message || "Socket error");
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("match:update", onUpdate);
    socket.on("match:error", onError);
    socket.connect();
    if (key) {
      socket.emit("match:join", { code: matchCode, role: "umpire", key });
    }
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("match:update", onUpdate);
      socket.off("match:error", onError);
      socket.disconnect();
    };
  }, [socket, matchCode, key]);

  const current = match?.current;
  const battingPlayers = match ? match.teams?.[match.battingTeam]?.players || [] : [];
  const bowlingPlayers = match ? match.teams?.[match.bowlingTeam]?.players || [] : [];
  const aColor = match?.teams?.A?.color || "#60A5FA";
  const bColor = match?.teams?.B?.color || "#F59E0B";
  const aText = pickTextColor(aColor);
  const bText = pickTextColor(bColor);

  const [wicketOpen, setWicketOpen] = useState(false);
  const [wicketHowOut, setWicketHowOut] = useState("Bowled");
  const [wicketNextBatterId, setWicketNextBatterId] = useState("");
  const [wicketOutPlayerId, setWicketOutPlayerId] = useState("");
  const [wicketFielderId, setWicketFielderId] = useState("");
  const [wicketRunsCompleted, setWicketRunsCompleted] = useState(0);
  const [newBowlerId, setNewBowlerId] = useState("");
  const [pendingStriker, setPendingStriker] = useState("");
  const [pendingNonStriker, setPendingNonStriker] = useState("");
  const [pendingBowler, setPendingBowler] = useState("");

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

  const innings1Summary =
    match?.innings === 1
      ? match?.current
      : match?.previous;

  useEffect(() => {
    setPendingStriker(current?.strikerId || "");
    setPendingNonStriker(current?.nonStrikerId || "");
    setPendingBowler(current?.bowlerId || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchCode, current?.strikerId, current?.nonStrikerId, current?.bowlerId]);

  /** Before any ball: must choose striker, non-striker, bowler (innings 1 or start of innings 2). */
  const needsPickOpeners =
    match?.status === "live" &&
    !match?.current?.completed &&
    Number(match?.current?.legalBalls || 0) === 0 &&
    (!match?.current?.strikerId || !match?.current?.nonStrikerId || !match?.current?.bowlerId);

  const needsStartInnings2 =
    match?.status === "live" && match?.innings === 1 && !!match?.current?.completed;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const rr =
    current?.legalBalls ? ((Number(current?.runs || 0) * 6) / Number(current.legalBalls || 1)).toFixed(2) : "—";
  const rrr =
    chase && chase.ballsLeft > 0 ? ((Number(chase.runsNeeded || 0) * 6) / Number(chase.ballsLeft || 1)).toFixed(2) : null;

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
  const betweenOvers =
    Number(current?.legalBalls || 0) > 0 &&
    Number(current?.ballInOver || 0) === 0 &&
    !current?.bowlerId;
  const lastOverRuns = betweenOvers ? overRuns(current, displayOverIndex) : null;

  const bowlerQuotaBalls = (() => {
    const m = Number(match?.settings?.bowlerMaxOvers);
    if (!Number.isFinite(m) || m <= 0) return Infinity;
    return Math.floor(m) * 6;
  })();
  const bowlersUnderQuota = (bowlingPlayers || []).filter((p) => {
    if (!p.id) return false;
    const lb = Number(current?.bowling?.[p.id]?.legalBalls || 0);
    return lb < bowlerQuotaBalls;
  });
  const eligibleBowlers = bowlersUnderQuota.filter((p) => p.id !== current?.lastOverBowlerId);

  const battingTeam = match?.teams?.[match?.battingTeam];
  const bowlingTeam = match?.teams?.[match?.bowlingTeam];
  const batColor = battingTeam?.color || "#60A5FA";
  const bowlColor = bowlingTeam?.color || "#F59E0B";

  const elapsed = match?.createdAt ? formatDuration(now - Number(match.createdAt || 0)) : "00:00:00";
  const clock = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const lastOutId = match?.lastBall?.kind === "wicket" ? match?.lastBall?.wicket?.outPlayerId : null;
  const strikerWasOut = !!lastOutId && lastOutId === current?.strikerId;
  const nonStrikerWasOut = !!lastOutId && lastOutId === current?.nonStrikerId;

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
    const forceRunOut = !!current?.freeHit;
    setWicketHowOut(forceRunOut ? "Run out" : "Bowled");
    setWicketNextBatterId("");
    setWicketOutPlayerId(current?.strikerId || "");
    setWicketFielderId("");
    setWicketRunsCompleted(0);
    setWicketOpen(true);
  }

  function applyPlayersSelection() {
    const strikerId = String(pendingStriker || "").trim();
    const nonStrikerId = String(pendingNonStriker || "").trim();
    const bowlerId = String(pendingBowler || "").trim();
    if (!strikerId || !nonStrikerId || !bowlerId) {
      setErr("Select striker, non-striker, and bowler.");
      return;
    }
    if (strikerId === nonStrikerId) {
      setErr("Striker and non-striker cannot be the same player.");
      return;
    }
    setErr("");
    socket.timeout(4000).emit("match:selectPlayers", { code: match.matchId, strikerId, nonStrikerId, bowlerId }, (err, res) => {
      if (err) {
        setErr("Could not reach server. Check connection and try again.");
        return;
      }
      if (res && res.ok === false) {
        setErr(res.error || "Could not apply line-up.");
      }
    });
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
          <div style={{ flex: "1 1 100%" }}>
            <MatchSummaryCard ref={summaryRef} match={match} />
            <div className="btnRow" style={{ marginTop: 10 }}>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    setErr("");
                    await exportElementToPng(summaryRef.current, `pitch-pulse-${match.matchId}-summary`);
                  } catch (e) {
                    setErr(e?.message || "Failed to export summary PNG.");
                  }
                }}
              >
                Download Summary PNG
              </button>
              <button onClick={() => nav(`/match/${encodeURIComponent(match.matchId)}/scorecard`)}>Open full scorecard</button>
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
            background: withAlpha(match?.teams?.[match?.bowlingTeam]?.color || "#000000", 0.92),
            zIndex: 80,
            display: "flex",
            alignItems: "end",
            justifyContent: "center",
            padding: 14,
          }}
          onClick={() => setWicketOpen(false)}
        >
          <div
            className="card modalCard"
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 18,
              background: "rgba(0,0,0,0.58)",
              borderColor: "rgba(255,255,255,0.20)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Wicket</h2>
            <div className="muted" style={{ marginBottom: 10 }}>
              Select the dismissal details below.
            </div>

            {current?.freeHit ? (
              <div className="pill" style={{ borderColor: "rgba(96,165,250,0.45)", background: "rgba(96,165,250,0.12)" }}>
                Free Hit: only{" "}
                <b style={{ marginLeft: 2, marginRight: 2 }}>Run out</b>{" "}
                is allowed
              </div>
            ) : null}

            <div className="grid2">
              <div>
                <TeamSelect
                  label="Out batter"
                  value={wicketOutPlayerId}
                  onChange={setWicketOutPlayerId}
                  options={[
                    { value: current?.strikerId || "", label: findPlayerName(match, current?.strikerId) || "Striker" },
                    { value: current?.nonStrikerId || "", label: findPlayerName(match, current?.nonStrikerId) || "Non-striker" },
                  ].filter((o) => o.value)}
                  placeholder="Select"
                  accentColor={batColor}
                  panelColor={bowlColor}
                  fieldStyle="neutral"
                  disabled={!connected}
                />
              </div>
              <div>
                <TeamSelect
                  label="How out"
                  value={wicketHowOut}
                  onChange={setWicketHowOut}
                  options={["Bowled", "Caught", "LBW", "Run out", "Stumped", "Hit wicket"].map((x) => ({ value: x, label: x }))}
                  placeholder="Select"
                  accentColor={bowlColor}
                  panelColor={bowlColor}
                  fieldStyle="neutral"
                  disabled={!connected || !!current?.freeHit}
                />
              </div>
              <div>
                <TeamSelect
                  label="Next batter"
                  value={wicketNextBatterId}
                  onChange={setWicketNextBatterId}
                  options={wicketCandidates.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="Select"
                  accentColor={batColor}
                  panelColor={bowlColor}
                  fieldStyle="neutral"
                  disabled={!connected}
                />
              </div>
              {wicketHowOut === "Caught" || wicketHowOut === "Run out" ? (
                <div>
                  <TeamSelect
                    label={wicketHowOut === "Caught" ? "Caught by" : "Run out by"}
                    value={wicketFielderId}
                    onChange={setWicketFielderId}
                    options={bowlingPlayers.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Select"
                    accentColor={bowlColor}
                    panelColor={batColor}
                    fieldStyle="neutral"
                    disabled={!connected}
                  />
                </div>
              ) : null}
            </div>

            {wicketHowOut === "Run out" ? (
              <div style={{ marginTop: 10 }}>
                <label>Runs completed (0–4)</label>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={wicketRunsCompleted}
                  onChange={(e) => setWicketRunsCompleted(Number(e.target.value || 0))}
                />
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Use this when they were running and got out after completing runs (e.g. 1 + W).
                </div>
              </div>
            ) : null}

            <div className="btnRow" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <button onClick={() => setWicketOpen(false)}>Cancel</button>
              <button
                className="bad"
                disabled={
                  !connected ||
                  (!wicketNextBatterId && wicketCandidates.length > 0) ||
                  !wicketOutPlayerId ||
                  ((wicketHowOut === "Caught" || wicketHowOut === "Run out") && !wicketFielderId) ||
                  (current?.freeHit && wicketHowOut !== "Run out")
                }
                onClick={() => {
                  setWicketOpen(false);
                  sendBall({
                    kind: "wicket",
                    howOut: wicketHowOut,
                    wicketKind: wicketHowOut,
                    outPlayerId: wicketOutPlayerId || current?.strikerId,
                    fielderId:
                      wicketHowOut === "Caught" || wicketHowOut === "Run out" ? wicketFielderId : null,
                    runsCompleted: wicketHowOut === "Run out" ? Math.max(0, Math.min(4, Number(wicketRunsCompleted || 0))) : 0,
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
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 18,
              background: `linear-gradient(180deg, ${withAlpha(bowlColor, 0.14)} 0%, rgba(255,255,255,0.03) 100%)`,
              borderColor: withAlpha(bowlColor, 0.28),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>New over — select bowler</h2>
            <div className="muted" style={{ marginBottom: 10 }}>
              Over <b className="mono">{displayOverIndex + 1}</b> completed. Pick the next bowler to continue.
            </div>
            <div>
              <TeamSelect
                label="Bowler"
                value={newBowlerId}
                onChange={setNewBowlerId}
                options={eligibleBowlers.map((p) => ({ value: p.id, label: p.name }))}
                placeholder="Select"
                accentColor={bowlColor}
              />
              {current?.lastOverBowlerId ? (
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                  Previous over: <b>{findPlayerName(match, current.lastOverBowlerId) || "—"}</b> (not selectable)
                </div>
              ) : null}
              {eligibleBowlers.length === 0 ? (
                <div className="error" style={{ marginTop: 10 }}>
                  No bowlers available: everyone has reached the {match?.settings?.bowlerMaxOvers ?? "—"} overs cap, or only the previous over bowler is left.
                </div>
              ) : null}
            </div>
            <div className="btnRow" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button
                className="primary"
                disabled={!connected || !newBowlerId || eligibleBowlers.length === 0}
                onClick={() => {
                  hapticTick();
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

      {/* Score box (keep only this + score entry controls) */}
      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 100%" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="muted" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="pill">{match?.superOver?.active ? "Super Over" : `Innings ${match.innings}`}</span>
              <span
                className="pill"
                style={{
                  borderColor: withAlpha(batColor, 0.5),
                  background: withAlpha(batColor, 0.14),
                  color: pickTextColor(batColor),
                }}
              >
                Batting: {battingTeam?.name || "—"}
              </span>
              <span
                className="pill"
                style={{
                  borderColor: withAlpha(bowlColor, 0.5),
                  background: withAlpha(bowlColor, 0.14),
                  color: pickTextColor(bowlColor),
                }}
              >
                Bowling: {bowlingTeam?.name || "—"}
              </span>
              {match?.settings?.joker?.enabled ? <span className="pill">Joker: {match.settings.joker.name}</span> : null}
              {Number.isFinite(Number(match?.settings?.bowlerMaxOvers)) && Number(match?.settings?.bowlerMaxOvers) > 0 ? (
                <span className="pill">Bowler cap: {match.settings.bowlerMaxOvers} ov/inn</span>
              ) : null}
            </div>

            <div className="muted" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="pill">
                Elapsed <b className="mono">{elapsed}</b>
              </span>
              <span className="pill">
                Time <b className="mono">{clock}</b>
              </span>
            </div>
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
            {needsPickOpeners ? (
              <span className="pill" style={{ borderColor: withAlpha(batColor, 0.55) }}>
                Select openers + bowler
              </span>
            ) : null}
          </div>

          {chase ? (
            <div className="muted" style={{ marginTop: 8 }}>
              Need <b className="mono">{chase.runsNeeded}</b> from <b className="mono">{chase.ballsLeft}</b> balls · Req RR{" "}
              <b className="mono">{rrr ?? "—"}</b> · RR <b className="mono">{rr}</b>
            </div>
          ) : null}

          {needsPickOpeners ? (
            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 12, fontWeight: 800 }}>
                Choose striker, non-striker, and bowler, then Apply.
              </div>
              <div className="grid2">
                <div>
                  <TeamSelect
                    label="Striker"
                    value={pendingStriker}
                    onChange={setPendingStriker}
                    options={battingPlayers
                      .filter((p) => !pendingNonStriker || String(p.id) !== String(pendingNonStriker))
                      .map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Select"
                    accentColor={batColor}
                    disabled={!connected}
                  />
                </div>
                <div>
                  <TeamSelect
                    label="Non-striker"
                    value={pendingNonStriker}
                    onChange={setPendingNonStriker}
                    options={battingPlayers
                      .filter((p) => !pendingStriker || String(p.id) !== String(pendingStriker))
                      .map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Select"
                    accentColor={batColor}
                    disabled={!connected}
                  />
                </div>
                <div>
                  <TeamSelect
                    label="Bowler"
                    value={pendingBowler}
                    onChange={setPendingBowler}
                    options={bowlersUnderQuota.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Select"
                    accentColor={bowlColor}
                    disabled={!connected}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "end" }}>
                  <button
                    className="primary"
                    disabled={
                      !connected ||
                      !pendingStriker ||
                      !pendingNonStriker ||
                      !pendingBowler
                    }
                    onClick={applyPlayersSelection}
                  >
                    Apply
                  </button>
                </div>
              </div>
              {bowlersUnderQuota.length === 0 ? (
                <div className="error" style={{ marginTop: 12 }}>
                  No bowlers are left under the {match?.settings?.bowlerMaxOvers ?? "—"} overs-per-bowler limit. Increase the limit in a new match or end the innings.
                </div>
              ) : null}
            </div>
          ) : (
          <div className="row" style={{ marginTop: 12 }}>
            <div
              className="card"
              style={{
                flex: "1 1 420px",
                padding: 12,
                background: withAlpha(batColor, 0.10),
                borderColor: withAlpha(batColor, 0.28),
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  marginBottom: 8,
                  color: withAlpha(batColor, 0.95),
                  fontWeight: 900,
                  letterSpacing: 0.2,
                  textShadow: "0 1px 2px rgba(0,0,0,0.88), 0 0 1px rgba(0,0,0,0.6)",
                }}
              >
                Batters
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {/* Striker row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 10px",
                    borderRadius: 14,
                    border: `1px solid ${withAlpha(batColor, 0.22)}`,
                    background: `linear-gradient(90deg, ${withAlpha(batColor, 0.18)} 0%, rgba(0,0,0,0.12) 65%)`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span
                      title="On strike"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        display: "grid",
                        placeItems: "center",
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(0,0,0,0.20)",
                        color: "rgba(255,255,255,0.92)",
                        flex: "0 0 auto",
                        lineHeight: 0,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 1000 }}>▶</span>
                    </span>
                    <div
                      style={{
                        fontWeight: 1000,
                        letterSpacing: 0.2,
                        fontSize: 22,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: strikerWasOut ? "rgba(239,68,68,0.92)" : "rgba(255,255,255,0.92)",
                      }}
                    >
                      {findPlayerName(match, current?.strikerId) || "—"}
                      {strikerWasOut ? <span className="pill" style={{ marginLeft: 10, borderColor: "rgba(239,68,68,0.55)" }}>W</span> : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flex: "0 0 auto" }}>
                    <div className="mono" style={{ fontWeight: 1000, fontSize: 34, letterSpacing: -0.6 }}>
                      {strikerStats?.runs ?? 0}
                    </div>
                    <div className="mono" style={{ fontWeight: 900, fontSize: 18, opacity: 0.85 }}>
                      {strikerStats ? String(strikerStats.balls ?? 0) : "0"}
                    </div>
                    <div className="mono" style={{ fontWeight: 900, fontSize: 14, opacity: 0.82 }}>
                      SR {strikerStats ? sr(strikerStats.runs, strikerStats.balls) : "—"}
                    </div>
                  </div>
                </div>

                {/* Non-striker row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 10px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.12)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 1000,
                      letterSpacing: 0.2,
                      fontSize: 22,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: nonStrikerWasOut ? "rgba(239,68,68,0.92)" : "rgba(255,255,255,0.92)",
                      minWidth: 0,
                    }}
                  >
                    {findPlayerName(match, current?.nonStrikerId) || "—"}
                    {nonStrikerWasOut ? <span className="pill" style={{ marginLeft: 10, borderColor: "rgba(239,68,68,0.55)" }}>W</span> : null}
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flex: "0 0 auto" }}>
                    <div className="mono" style={{ fontWeight: 1000, fontSize: 34, letterSpacing: -0.6 }}>
                      {nonStrikerStats?.runs ?? 0}
                    </div>
                    <div className="mono" style={{ fontWeight: 900, fontSize: 18, opacity: 0.85 }}>
                      {nonStrikerStats ? String(nonStrikerStats.balls ?? 0) : "0"}
                    </div>
                    <div className="mono" style={{ fontWeight: 900, fontSize: 14, opacity: 0.82 }}>
                      SR {nonStrikerStats ? sr(nonStrikerStats.runs, nonStrikerStats.balls) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="card"
              style={{
                flex: "1 1 420px",
                padding: 12,
                background: withAlpha(bowlColor, 0.10),
                borderColor: withAlpha(bowlColor, 0.28),
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  marginBottom: 8,
                  color: withAlpha(bowlColor, 0.95),
                  fontWeight: 900,
                  letterSpacing: 0.2,
                  textShadow: "0 1px 2px rgba(0,0,0,0.88), 0 0 1px rgba(0,0,0,0.6)",
                }}
              >
                Bowler
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>{findPlayerName(match, current?.bowlerId) || "—"}</div>
                <div className="mono" style={{ fontWeight: 1000 }}>
                  {toOversString(bowlerStats?.legalBalls || 0)} · {bowlerStats?.runsConceded ?? 0}R · {bowlerStats?.wickets ?? 0}W · Econ{" "}
                  {econ(bowlerStats?.runsConceded ?? 0, bowlerStats?.legalBalls ?? 0)}
                </div>
              </div>
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                {betweenOvers ? (
                  <>
                    Last over: <b className="mono">{displayOverIndex + 1}</b> ·{" "}
                    <b className="mono">{lastOverRuns ?? 0}</b> runs
                  </>
                ) : (
                  <>
                    This over: <b className="mono">{displayOverIndex + 1}</b>{" "}
                    {overList.length ? (
                      <span style={{ marginLeft: 8 }}>
                        {overList.map((b, idx) => (
                          <span key={`${b.t || idx}-${idx}`} className="pill" style={bubbleStyleForBall(b, batColor)}>
                            {ballLabel(b)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {needsStartInnings2 ? (
        <div className="row" style={{ marginTop: 12 }}>
          <div className="card" style={{ flex: "1 1 100%" }}>
            <div className="btnRow tight" style={{ marginBottom: 10, justifyContent: "flex-start" }}>
              <button
                className="good"
                disabled={!connected}
                onClick={() => {
                  setErr("");
                  socket.timeout(2500).emit("match:startInnings2", { code: match.matchId }, (err, res) => {
                    if (err) {
                      setErr("Failed to start innings 2. Try again.");
                      return;
                    }
                    if (res?.ok === false) {
                      setErr(res.error || "Failed to start innings 2.");
                    }
                  });
                }}
              >
                Start innings 2
              </button>
            </div>

            {innings1Summary ? (
              <div className="card" style={{ padding: 12, background: "rgba(0,0,0,0.18)", marginBottom: 12 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  Innings 1 complete
                </div>
                <div style={{ fontWeight: 900, marginTop: 6 }}>
                  {match?.teams?.[match?.battingTeam]?.name || "Batting"}:{" "}
                  <span className="mono">
                    {innings1Summary.runs ?? 0}/{innings1Summary.wickets ?? 0} ({toOversString(innings1Summary.legalBalls || 0)})
                  </span>
                </div>
                {match?.target != null ? (
                  <div className="muted" style={{ marginTop: 6 }}>
                    Target for innings 2: <b>{match.target}</b>
                  </div>
                ) : null}
              </div>
            ) : null}
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

