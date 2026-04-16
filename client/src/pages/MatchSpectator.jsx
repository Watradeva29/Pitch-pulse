import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createSocket } from "../lib/socket";
import { getMatch } from "../lib/api";
import { pickTextColor, withAlpha } from "../lib/colors";
import ScorecardView from "../components/ScorecardView";

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

function getPlayer(match, playerId) {
  if (!match || !playerId) return null;
  const all = [...(match.teams?.A?.players || []), ...(match.teams?.B?.players || [])];
  return all.find((p) => p.id === playerId) || null;
}

function sr(runs, balls) {
  const b = Number(balls || 0);
  if (!b) return "—";
  return ((Number(runs || 0) * 100) / b).toFixed(1);
}

function oversFromLegalBalls(lb) {
  const o = Math.floor((lb || 0) / 6);
  const b = (lb || 0) % 6;
  return `${o}.${b}`;
}

function econ(runsConceded, legalBalls) {
  const balls = Number(legalBalls || 0);
  if (!balls) return "—";
  const overs = balls / 6;
  return (Number(runsConceded || 0) / overs).toFixed(2);
}

function lastBallsLabel(ball) {
  if (!ball) return "•";
  if (ball.kind === "run") return String(ball.runs);
  if (ball.kind === "wide") return "Wd";
  if (ball.kind === "noBall") return "Nb";
  if (ball.kind === "wicket") return "W";
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

export default function MatchSpectator() {
  const nav = useNavigate();
  const { code } = useParams();
  const matchCode = String(code || "").toUpperCase();

  const [match, setMatch] = useState(null);
  const [err, setErr] = useState("");
  const [connected, setConnected] = useState(false);
  const [recent, setRecent] = useState([]);
  const [tab, setTab] = useState("live"); // live | scorecard

  const socket = useMemo(() => createSocket(), []);

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
      setErr("");
      if (m?.lastBall) {
        setRecent((prev) => {
          const next = [m.lastBall, ...prev].slice(0, 12);
          return next;
        });
      }
    };
    const onError = (e) => setErr(e?.message || "Socket error");
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("match:update", onUpdate);
    socket.on("match:error", onError);
    socket.connect();
    socket.emit("match:join", { code: matchCode, role: "spectator" });
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("match:update", onUpdate);
      socket.off("match:error", onError);
      socket.disconnect();
    };
  }, [socket, matchCode]);

  const current = match?.current;
  const batTeamKey = match?.battingTeam;
  const bowlTeamKey = match?.bowlingTeam;
  const batTeam = batTeamKey ? match?.teams?.[batTeamKey] : null;
  const bowlTeam = bowlTeamKey ? match?.teams?.[bowlTeamKey] : null;
  const batColor = batTeam?.color || "#60A5FA";
  const bowlColor = bowlTeam?.color || "#F59E0B";
  const batText = pickTextColor(batColor);
  const bowlText = pickTextColor(bowlColor);

  const bowler = current?.bowlerId ? current?.bowling?.[current.bowlerId] : null;

  const { overIndex: displayOverIndex, list: overList } = thisOverDeliveries(current);

  const ballsLeft =
    match?.settings?.maxOvers != null ? Math.max(0, match.settings.maxOvers * 6 - (current?.legalBalls || 0)) : null;
  const runsNeeded = match?.target != null ? Math.max(0, match.target - (current?.runs || 0)) : null;
  const rrr =
    match?.target != null && ballsLeft != null && ballsLeft > 0
      ? ((runsNeeded * 6) / ballsLeft).toFixed(2)
      : null;

  const rr =
    current?.legalBalls ? ((Number(current?.runs || 0) * 6) / Number(current.legalBalls || 1)).toFixed(2) : "—";
  const projected =
    match?.settings?.maxOvers && current?.legalBalls
      ? Math.round(((Number(current?.runs || 0) * 6) / Number(current.legalBalls || 1)) * Number(match.settings.maxOvers))
      : null;

  const deliveries = Array.isArray(current?.deliveries) ? current.deliveries : [];
  const lastWicketIdx = (() => {
    for (let i = deliveries.length - 1; i >= 0; i -= 1) {
      if (deliveries[i]?.kind === "wicket") return i;
    }
    return -1;
  })();
  const partnershipDeliveries = lastWicketIdx >= 0 ? deliveries.slice(lastWicketIdx + 1) : deliveries;
  const partnershipRuns = partnershipDeliveries.reduce((sum, d) => sum + Number(d?.runs || 0) + Number(d?.extras?.wide || 0) + Number(d?.extras?.noBall || 0), 0);
  const partnershipBalls = partnershipDeliveries.reduce((sum, d) => sum + (d?.legal ? 1 : 0), 0);

  const isMatchOver =
    match?.status === "completed" ||
    match?.status === "tie" ||
    (match?.innings === 2 && match?.current?.completed);

  return (
    <div className="container">
      <div
        className="card"
        style={{
          padding: 18,
          borderColor: "rgba(255,255,255,0.14)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="pill">Live</div>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {match?.teams?.A?.name || "Team A"} vs {match?.teams?.B?.name || "Team B"}
              </div>
              <div className="muted">
                Code: <code>{match?.matchId || matchCode}</code> · Socket: {connected ? "connected" : "disconnected"}
              </div>
            </div>
          </div>
          <div className="btnRow">
            <button onClick={() => nav("/")}>Home</button>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="muted" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {match?.superOver?.active ? <span className="pill">Super Over</span> : <span className="pill">Innings {match?.innings ?? "—"}</span>}
              <span className="pill" style={{ borderColor: batTeam?.color || "var(--border)", color: "var(--muted)" }}>
                Batting: {batTeam?.name || "—"}
              </span>
              <span className="pill" style={{ borderColor: bowlTeam?.color || "var(--border)", color: "var(--muted)" }}>
                Bowling: {bowlTeam?.name || "—"}
              </span>
              {match?.settings?.joker?.enabled ? (
                <span className="pill">Joker: {match.settings.joker.name}</span>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "baseline", marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 44, fontWeight: 800 }}>
                {current?.runs ?? 0}/{current?.wickets ?? 0}
              </div>
              <div className="muted" style={{ fontSize: 14 }}>
                Overs {toOversString(current?.legalBalls || 0)} / {match?.settings?.maxOvers ?? "—"}
                {match?.target != null ? (
                  <>
                    {" "}
                    · Target <b>{match.target}</b>
                  </>
                ) : null}
              </div>
            </div>
            {match?.innings === 2 && match?.target != null ? (
              <div className="muted" style={{ marginTop: 6 }}>
                Need <b>{runsNeeded}</b> from <b>{ballsLeft}</b> balls
                {rrr ? (
                  <>
                    {" "}
                    · RRR <b>{rrr}</b>
                  </>
                ) : null}
              </div>
            ) : null}
            <div className="muted" style={{ marginTop: 6 }}>
              RR <b>{rr}</b>
              {projected != null ? (
                <>
                  {" "}
                  · Projected <b>{projected}</b>
                </>
              ) : null}
              {" "}
              · Partnership <b>{partnershipRuns}</b> ({partnershipBalls}b)
            </div>
          </div>

          <div className="card" style={{ padding: 12, minWidth: 320, background: "rgba(0,0,0,0.18)" }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Recent balls
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {recent.length ? (
                recent.map((b, idx) => (
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
                    {lastBallsLabel(b)}
                  </span>
                ))
              ) : (
                <span className="muted">—</span>
              )}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
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
                    {lastBallsLabel(b)}
                  </span>
                ))
              ) : (
                <span className="muted">—</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {err ? (
        <div className="error" style={{ marginTop: 16 }}>
          {err}
        </div>
      ) : null}

      {match?.status === "tie" ? (
        <div className="row" style={{ marginTop: 16 }}>
          <div className="card" style={{ flex: "1 1 100%" }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Match tied</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Waiting for the umpire to start the Super Over.
            </div>
          </div>
        </div>
      ) : null}

      {match?.status === "completed" && match?.result?.type === "win" ? (
        <div className="row" style={{ marginTop: 16 }}>
          <div className="card" style={{ flex: "1 1 100%" }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              Winner: {match?.teams?.[match.result.winnerTeam]?.name || match.result.winnerTeam}
              {match?.result?.note ? ` (${match.result.note})` : ""}
            </div>
          </div>
        </div>
      ) : null}

      {isMatchOver ? (
        <div className="row" style={{ marginTop: 16 }}>
          <div className="card" style={{ flex: "1 1 100%" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Match over</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  View the full match summary and downloads.
                </div>
              </div>
              <button className="primary" onClick={() => nav(`/match/${encodeURIComponent(matchCode)}/scorecard`)}>
                Match summary
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 100%" }}>
          <div className="btnRow tight">
            <button className={tab === "live" ? "primary" : ""} onClick={() => setTab("live")}>
              Live
            </button>
            <button className={tab === "scorecard" ? "primary" : ""} onClick={() => setTab("scorecard")}>
              Scorecard
            </button>
            <button style={{ marginLeft: "auto" }} onClick={() => nav(`/match/${encodeURIComponent(matchCode)}/scorecard`)}>
              Open full scorecard
            </button>
          </div>
        </div>
      </div>

      {tab === "scorecard" ? (
        <div className="row" style={{ marginTop: 16 }}>
          <div style={{ flex: "1 1 100%" }}>
            <ScorecardView match={match} />
          </div>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 680px" }}>
          <div
            style={{
              borderRadius: 12,
              padding: "10px 12px",
              background: `linear-gradient(90deg, ${withAlpha(batColor, 0.35)} 0%, rgba(0,0,0,0) 65%)`,
              border: `1px solid ${withAlpha(batColor, 0.35)}`,
              color: batText,
              fontWeight: 900,
              marginBottom: 10,
            }}
          >
            Batsmen ({batTeam?.name || "—"})
          </div>
          {tab === "live" ? <div style={{ display: "grid", gap: 10 }}>
            {[
              { id: current?.strikerId, star: true },
              { id: current?.nonStrikerId, star: false },
            ].map((row) => {
              const id = row.id;
              const p = id ? getPlayer(match, id) : null;
              const st = id ? current?.batting?.[id] : null;
              return (
                <div
                  key={row.star ? "striker" : "non"}
                  className="card"
                  style={{
                    padding: 12,
                    background: "rgba(0,0,0,0.18)",
                    borderColor: "rgba(255,255,255,0.12)",
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 99,
                            background: batTeam?.color || "rgba(96,165,250,0.8)",
                            display: "inline-block",
                            flex: "0 0 auto",
                          }}
                        />
                        <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p?.name || "—"}{row.star ? " *" : ""}
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        SR <b>{sr(st?.runs ?? 0, st?.balls ?? 0)}</b> · 4s <b>{st?.fours ?? 0}</b> · 6s <b>{st?.sixes ?? 0}</b>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 900 }} className="mono">
                        {st?.runs ?? 0}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        ({st?.balls ?? 0}b)
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div> : null}
        </div>

        {tab === "live" ? <div className="card" style={{ flex: "1 1 380px" }}>
          <div
            style={{
              borderRadius: 12,
              padding: "10px 12px",
              background: `linear-gradient(90deg, ${withAlpha(bowlColor, 0.35)} 0%, rgba(0,0,0,0) 65%)`,
              border: `1px solid ${withAlpha(bowlColor, 0.35)}`,
              color: bowlText,
              fontWeight: 900,
              marginBottom: 10,
            }}
          >
            Bowler ({bowlTeam?.name || "—"})
          </div>
          <div className="muted" style={{ marginBottom: 8 }}>
            <b>{findPlayerName(match, current?.bowlerId) || "—"}</b>
          </div>

          <div className="card" style={{ padding: 12, background: "rgba(0,0,0,0.18)" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="kv">
                <div>
                  <div className="k">Overs</div>
                  <div className="v mono">{oversFromLegalBalls(bowler?.legalBalls || 0)}</div>
                </div>
                <div>
                  <div className="k">Runs</div>
                  <div className="v mono">{bowler?.runsConceded ?? 0}</div>
                </div>
                <div>
                  <div className="k">Wkts</div>
                  <div className="v mono">{bowler?.wickets ?? 0}</div>
                </div>
                <div>
                  <div className="k">Econ</div>
                  <div className="v mono">{econ(bowler?.runsConceded ?? 0, bowler?.legalBalls ?? 0)}</div>
                </div>
              </div>
            </div>

            <div className="kv" style={{ marginTop: 10 }}>
              <div>
                <div className="k">Wd</div>
                <div className="v mono">{bowler?.wides ?? 0}</div>
              </div>
              <div>
                <div className="k">Nb</div>
                <div className="v mono">{bowler?.noBalls ?? 0}</div>
              </div>
            </div>
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            Last: {match?.lastBall ? lastBallsLabel(match.lastBall) : "—"} {match?.lastBall?.freeHit ? "(free hit)" : ""}
          </div>
        </div> : null}
      </div>
    </div>
  );
}

