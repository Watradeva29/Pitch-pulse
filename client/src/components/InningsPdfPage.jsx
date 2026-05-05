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

function nameOf(allPlayers, id) {
  if (!id) return "";
  return allPlayers.find((p) => p.id === id)?.name || "";
}

function asArray(obj) {
  if (!obj) return [];
  return Object.values(obj);
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

function computeTimeline(allPlayers, deliveries) {
  let total = 0;
  let legalBalls = 0;

  let segRuns = 0;
  let segBalls = 0;
  const partnerships = [];
  const fow = [];
  let lastWicket = null;

  const overBallLabel = (d) => `${Number(d?.over ?? 0)}.${Number(d?.ballInOver ?? 0) + 1}`;

  for (const d of deliveries) {
    const add = Number(d?.runs || 0) + Number(d?.extras?.wide || 0) + Number(d?.extras?.noBall || 0);
    total += add;
    segRuns += add;
    if (d?.legal) {
      legalBalls += 1;
      segBalls += 1;
    }

    if (d?.kind === "wicket") {
      const outName = nameOf(allPlayers, d?.wicket?.outPlayerId) || "—";
      fow.push(`${total}-${outName} (${overBallLabel(d)} ov)`);
      lastWicket = { score: total, outName, ov: overBallLabel(d) };
      partnerships.push({ runs: segRuns, balls: segBalls });
      segRuns = 0;
      segBalls = 0;
    }
  }

  // current/last partnership after final wicket
  if (segRuns > 0 || segBalls > 0) partnerships.push({ runs: segRuns, balls: segBalls });

  const highest = [...partnerships].sort((a, b) => Number(b.runs || 0) - Number(a.runs || 0))[0] || { runs: 0, balls: 0 };

  return {
    fow: fow.slice(0, 12),
    partnerships,
    highestPartnership: highest,
    currentPartnership: partnerships.length ? partnerships[partnerships.length - 1] : { runs: 0, balls: 0 },
    lastWicket,
    total,
    legalBalls,
  };
}

function InningsHeader({ label, teamColor, teamText, inn, maxOvers }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: `1px solid ${withAlpha(teamColor, 0.45)}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          background: `linear-gradient(90deg, ${withAlpha(teamColor, 0.96)}, ${withAlpha(teamColor, 0.55)})`,
          color: teamText,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 1000, letterSpacing: 0.4 }}>{label}</div>
        <div className="mono" style={{ fontWeight: 1000, fontSize: 18 }}>
          {inn?.runs ?? 0}/{inn?.wickets ?? 0} ({toOversString(inn?.legalBalls || 0)}/{maxOvers ?? "—"})
        </div>
      </div>
      <div style={{ padding: "10px 14px", background: "rgba(0,0,0,0.22)" }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Overs: <b className="mono">{toOversString(inn?.legalBalls || 0)}</b>
        </div>
      </div>
    </div>
  );
}

function Table({ title, head, rows }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.18)", fontWeight: 900 }}>{title}</div>
      <div style={{ background: "rgba(0,0,0,0.10)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", fontSize: 12, color: "rgba(255,255,255,0.70)" }}>
              {head.map((h) => (
                <th key={h} style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {r.map((c, cIdx) => (
                    <td key={cIdx} style={{ padding: "8px 10px", fontSize: 12 }}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={head.length} style={{ padding: "10px 10px", color: "rgba(255,255,255,0.60)" }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const InningsPdfPage = forwardRef(function InningsPdfPage({ match, inningsLabel, inn, batTeamKey, bowlTeamKey }, ref) {
  const allPlayers = useMemo(() => getAllPlayers(match), [match]);
  const batTeam = batTeamKey ? match?.teams?.[batTeamKey] : null;
  const bowlTeam = bowlTeamKey ? match?.teams?.[bowlTeamKey] : null;
  const batColor = batTeam?.color || "#60A5FA";
  const bowlColor = bowlTeam?.color || "#F59E0B";
  const batText = pickTextColor(batColor);
  const bowlText = pickTextColor(bowlColor);

  const batting = asArray(inn?.batting).sort((a, b) => Number(b?.runs || 0) - Number(a?.runs || 0));
  const bowling = asArray(inn?.bowling).sort((a, b) => Number(b?.wickets || 0) - Number(a?.wickets || 0) || Number(a?.runsConceded || 0) - Number(b?.runsConceded || 0));

  const battingRows = batting.map((b) => [
    nameOf(allPlayers, b.playerId) || "—",
    b.out ? b.howOut || "Out" : "not out",
    <span className="mono" key="r">{b.runs ?? 0}</span>,
    <span className="mono" key="b">{b.balls ?? 0}</span>,
    <span className="mono" key="4">{b.fours ?? 0}</span>,
    <span className="mono" key="6">{b.sixes ?? 0}</span>,
    <span className="mono" key="sr">{sr(b.runs ?? 0, b.balls ?? 0)}</span>,
  ]);

  const bowlingRows = bowling.map((bw) => [
    nameOf(allPlayers, bw.playerId) || "—",
    <span className="mono" key="o">{toOversString(bw.legalBalls || 0)}</span>,
    <span className="mono" key="r">{bw.runsConceded ?? 0}</span>,
    <span className="mono" key="w">{bw.wickets ?? 0}</span>,
    <span className="mono" key="wd">{bw.wides ?? 0}</span>,
    <span className="mono" key="nb">{bw.noBalls ?? 0}</span>,
    <span className="mono" key="e">{econ(bw.runsConceded ?? 0, bw.legalBalls ?? 0)}</span>,
  ]);

  // Minimal FOW from deliveries (since FOW array isn’t filled currently)
  const deliveries = Array.isArray(inn?.deliveries) ? inn.deliveries : [];
  const timeline = computeTimeline(allPlayers, deliveries);
  const fow = timeline.fow;

  const extras =
    (inn?.deliveries || []).reduce((sum, d) => sum + Number(d?.extras?.wide || 0) + Number(d?.extras?.noBall || 0), 0) || 0;

  return (
    <div
      ref={ref}
      style={{
        width: 794, // approx A4 width at 96dpi
        minHeight: 1123,
        padding: 18,
        borderRadius: 18,
        background:
          "radial-gradient(1200px 800px at 20% 10%, #192044 0%, #0b1020 45%)",
        color: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.14)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -2,
          background: `radial-gradient(900px 260px at 10% 0%, ${withAlpha(batColor, 0.22)} 0%, transparent 60%), radial-gradient(900px 260px at 90% 0%, ${withAlpha(bowlColor, 0.22)} 0%, transparent 60%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 1000, letterSpacing: 0.6, fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
              PITCH PULSE · SCORECARD
            </div>
            <div style={{ fontWeight: 1000, fontSize: 20, letterSpacing: -0.2, marginTop: 6 }}>
              {match?.teams?.A?.name || "Team A"} vs {match?.teams?.B?.name || "Team B"}
            </div>
            <div style={{ marginTop: 6, color: "rgba(255,255,255,0.70)", fontSize: 12 }}>
              Match code: <span className="mono">{match?.matchId}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                display: "inline-flex",
                gap: 10,
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.18)",
                fontWeight: 900,
              }}
            >
              {inningsLabel}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <InningsHeader
            label={`Batting: ${batTeam?.name || "—"}`}
            teamColor={batColor}
            teamText={batText}
            inn={inn}
            maxOvers={match?.settings?.maxOvers}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.18)",
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              Partnership: <span className="mono">{timeline.currentPartnership.runs}</span>{" "}
              <span className="muted">({timeline.currentPartnership.balls}b)</span>
            </span>
            {timeline.lastWicket ? (
              <span
                style={{
                  display: "inline-flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.18)",
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                Last wicket: <span className="mono">{timeline.lastWicket.score}</span>-
                <span>{timeline.lastWicket.outName}</span> <span className="muted">({timeline.lastWicket.ov})</span>
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <Table title="Batting" head={["Batter", "How out", "R", "B", "4s", "6s", "SR"]} rows={battingRows} />
          <Table title="Bowling" head={["Bowler", "O", "R", "W", "Wd", "Nb", "Econ"]} rows={bowlingRows} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 12, background: "rgba(0,0,0,0.16)" }}>
              <div style={{ fontWeight: 900 }}>Extras</div>
              <div className="mono" style={{ marginTop: 8, fontSize: 18, fontWeight: 1000 }}>
                {extras}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                (Wd + Nb)
              </div>
            </div>
            <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 12, background: "rgba(0,0,0,0.16)" }}>
              <div style={{ fontWeight: 900 }}>Partnership</div>
              <div className="mono" style={{ marginTop: 8, fontSize: 18, fontWeight: 1000 }}>
                {timeline.currentPartnership.runs} <span className="muted">({timeline.currentPartnership.balls}b)</span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Highest: <b className="mono">{timeline.highestPartnership.runs}</b> ({timeline.highestPartnership.balls}b)
              </div>
            </div>
          </div>

          <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 12, background: "rgba(0,0,0,0.16)" }}>
            <div style={{ fontWeight: 900 }}>Fall of wickets</div>
            <div style={{ marginTop: 8, display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr" }}>
              {fow.length ? (
                fow.map((x, i) => (
                  <div key={i} className="muted" style={{ fontSize: 12 }}>
                    {x}
                  </div>
                ))
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>
                  —
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 12, color: "rgba(255,255,255,0.60)", fontSize: 11 }}>
          <div>Batting: <b style={{ color: batText }}>{batTeam?.name || "—"}</b> · Bowling: <b style={{ color: bowlText }}>{bowlTeam?.name || "—"}</b></div>
          <div className="mono">{new Date().toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
});

export default InningsPdfPage;

