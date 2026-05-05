import { forwardRef, useMemo } from "react";
import { pickTextColor, withAlpha } from "../lib/colors";

function toOversString(legalBalls) {
  const o = Math.floor((legalBalls || 0) / 6);
  const b = (legalBalls || 0) % 6;
  return `${o}.${b}`;
}

function getAllPlayers(match) {
  return [...(match?.teams?.A?.players || []), ...(match?.teams?.B?.players || [])];
}

/** Which side batted this innings — from scorecard player ids (works after innings swap & in Super Over). */
function teamKeyBattingForInnings(match, inn) {
  if (!inn?.batting || !match?.teams) return null;
  for (const pid of Object.keys(inn.batting)) {
    const id = String(pid);
    if (match.teams.A?.players?.some((p) => String(p.id) === id)) return "A";
    if (match.teams.B?.players?.some((p) => String(p.id) === id)) return "B";
  }
  return null;
}

function nameOf(allPlayers, id) {
  if (!id) return "";
  return allPlayers.find((p) => p.id === id)?.name || "";
}

function topBatters(inn, limit = 4) {
  const list = Object.values(inn?.batting || {});
  list.sort((a, b) => Number(b?.runs || 0) - Number(a?.runs || 0));
  return list.slice(0, limit);
}

function topBowlers(inn, limit = 4) {
  const list = Object.values(inn?.bowling || {});
  list.sort((a, b) => Number(b?.wickets || 0) - Number(a?.wickets || 0) || Number(a?.runsConceded || 0) - Number(b?.runsConceded || 0));
  return list.slice(0, limit);
}

function resultLine(match) {
  if (!match) return "";
  if (match.status !== "completed" && match.status !== "tie") return "";
  const r = match.result;
  if (!r) return "Match ended";
  if (r.type === "tie") return `Match tied${r.note ? ` (${r.note})` : ""}`;
  const winnerName = match?.teams?.[r.winnerTeam]?.name || r.winnerTeam;
  const by =
    r.byRuns != null ? `won by ${r.byRuns} run${r.byRuns === 1 ? "" : "s"}` : r.byWickets != null ? `won by ${r.byWickets} wicket${r.byWickets === 1 ? "" : "s"}` : "won";
  return `${winnerName} ${by}${r.note ? ` (${r.note})` : ""}`;
}

function InningsBlock({ label, color, textColor, allPlayers, inn }) {
  const bat = topBatters(inn, 4);
  const bowl = topBowlers(inn, 4);

  return (
    <div style={{ border: `1px solid ${withAlpha(color, 0.45)}`, borderRadius: 14, overflow: "hidden" }}>
      <div
        style={{
          background: `linear-gradient(90deg, ${withAlpha(color, 0.95)}, ${withAlpha(color, 0.55)})`,
          color: textColor,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 1000, letterSpacing: 0.3 }}>{label}</div>
        <div className="mono" style={{ fontWeight: 1000 }}>
          {inn?.runs ?? 0}/{inn?.wickets ?? 0} ({toOversString(inn?.legalBalls || 0)})
        </div>
      </div>

      <div style={{ background: "rgba(0,0,0,0.22)", padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
            Batting
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {bat.length ? (
              bat.map((b) => (
                <div key={b.playerId} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nameOf(allPlayers, b.playerId) || "—"}
                  </div>
                  <div className="mono" style={{ fontWeight: 900 }}>
                    {b.runs ?? 0} <span className="muted">({b.balls ?? 0})</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="muted">—</div>
            )}
          </div>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
            Bowling
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {bowl.length ? (
              bowl.map((bw) => (
                <div key={bw.playerId} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nameOf(allPlayers, bw.playerId) || "—"}
                  </div>
                  <div className="mono" style={{ fontWeight: 900 }}>
                    {bw.wickets ?? 0}-{bw.runsConceded ?? 0} <span className="muted">({toOversString(bw.legalBalls || 0)})</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="muted">—</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const MatchSummaryCard = forwardRef(function MatchSummaryCard({ match }, ref) {
  const allPlayers = useMemo(() => getAllPlayers(match), [match]);
  if (!match) return null;

  const a = match?.teams?.A;
  const b = match?.teams?.B;
  const aColor = a?.color || "#60A5FA";
  const bColor = b?.color || "#F59E0B";

  const base = match?.superOver?.base;
  const inn1 = base?.innings1 || match?.previous || (match?.innings === 1 ? match.current : null);
  const inn2 = base?.innings2 || (match?.innings >= 2 ? match.current : null);

  const inn1BatKey =
    teamKeyBattingForInnings(match, inn1) || (match.innings === 1 ? match.battingTeam : match.bowlingTeam);
  const inn2BatKey = inn2
    ? teamKeyBattingForInnings(match, inn2) ||
      (!match?.superOver?.active && match.innings >= 2 ? match.battingTeam : null)
    : null;

  const inn1Team = inn1BatKey ? match.teams?.[inn1BatKey] : null;
  const inn2Team = inn2BatKey ? match.teams?.[inn2BatKey] : null;
  const inn1BlockColor = inn1Team?.color || "#60A5FA";
  const inn2BlockColor = inn2Team?.color || "#F59E0B";
  const inn1BlockText = pickTextColor(inn1BlockColor);
  const inn2BlockText = pickTextColor(inn2BlockColor);

  const title = `${a?.name || "Team A"} vs ${b?.name || "Team B"}`;
  const resLine = resultLine(match);

  return (
    <div
      ref={ref}
      className="card"
      style={{
        padding: 16,
        borderRadius: 18,
        borderColor: "rgba(255,255,255,0.18)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -2,
          background: `radial-gradient(800px 240px at 20% 0%, ${withAlpha(aColor, 0.25)} 0%, transparent 55%), radial-gradient(800px 240px at 80% 0%, ${withAlpha(bColor, 0.25)} 0%, transparent 55%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>
        <div className="pill">Match summary</div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: -0.3 }}>{title}</div>
          <div className="muted">
            Code: <code>{match?.matchId}</code>
          </div>
        </div>

        {resLine ? (
          <div style={{ marginTop: 10, fontWeight: 1000, letterSpacing: -0.2 }}>
            <span
              className="pill"
              style={{
                borderColor: "rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.20)",
                color: "rgba(255,255,255,0.92)",
              }}
            >
              {resLine}
            </span>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {inn1 ? (
            <InningsBlock
              label={inn1Team?.name || (inn1BatKey === "A" ? a?.name : inn1BatKey === "B" ? b?.name : "Innings 1")}
              color={inn1BlockColor}
              textColor={inn1BlockText}
              allPlayers={allPlayers}
              inn={inn1}
            />
          ) : null}
          {inn2 ? (
            <InningsBlock
              label={inn2Team?.name || (inn2BatKey === "A" ? a?.name : inn2BatKey === "B" ? b?.name : "Innings 2")}
              color={inn2BlockColor}
              textColor={inn2BlockText}
              allPlayers={allPlayers}
              inn={inn2}
            />
          ) : null}
        </div>

        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Generated by Pitch Pulse
        </div>
      </div>
    </div>
  );
});

export default MatchSummaryCard;

