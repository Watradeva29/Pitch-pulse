import { pickTextColor, withAlpha } from "../lib/colors";

function toOversString(legalBalls) {
  const o = Math.floor((legalBalls || 0) / 6);
  const b = (legalBalls || 0) % 6;
  return `${o}.${b}`;
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

function getTeam(match, key) {
  return key ? match?.teams?.[key] : null;
}

function playerName(players, id) {
  if (!id) return "";
  return players.find((p) => p.id === id)?.name || "";
}

function getAllPlayers(match) {
  return [...(match?.teams?.A?.players || []), ...(match?.teams?.B?.players || [])];
}

function inningsLabel(match, which) {
  if (match?.superOver?.active) {
    return which === 1 ? "Super Over — Innings 1" : "Super Over — Innings 2";
  }
  return which === 1 ? "Innings 1" : "Innings 2";
}

function sortByRunsThenBalls(a, b) {
  const ra = Number(a?.runs || 0);
  const rb = Number(b?.runs || 0);
  if (rb !== ra) return rb - ra;
  const ba = Number(a?.balls || 0);
  const bb = Number(b?.balls || 0);
  return ba - bb;
}

function sortByWicketsThenRuns(a, b) {
  const wa = Number(a?.wickets || 0);
  const wb = Number(b?.wickets || 0);
  if (wb !== wa) return wb - wa;
  const ra = Number(a?.runsConceded || 0);
  const rb = Number(b?.runsConceded || 0);
  return ra - rb;
}

function asArray(obj) {
  if (!obj) return [];
  return Object.values(obj);
}

function ResultBanner({ match }) {
  if (!match) return null;
  if (match.status !== "completed" && match.status !== "tie") return null;
  const r = match.result;
  if (!r) {
    return (
      <div className="card" style={{ padding: 12, background: "rgba(0,0,0,0.18)" }}>
        <div style={{ fontWeight: 900 }}>Match ended</div>
      </div>
    );
  }
  if (r.type === "tie") {
    return (
      <div className="card" style={{ padding: 12, background: "rgba(0,0,0,0.18)" }}>
        <div style={{ fontWeight: 900 }}>
          Match tied{r.note ? ` (${r.note})` : ""}
        </div>
      </div>
    );
  }
  const winnerName = match?.teams?.[r.winnerTeam]?.name || r.winnerTeam;
  const by =
    r.byRuns != null ? `won by ${r.byRuns} run${r.byRuns === 1 ? "" : "s"}` : r.byWickets != null ? `won by ${r.byWickets} wicket${r.byWickets === 1 ? "" : "s"}` : "won";
  return (
    <div className="card" style={{ padding: 12, background: "rgba(0,0,0,0.18)" }}>
      <div style={{ fontWeight: 900 }}>
        {winnerName} {by}
        {r.note ? ` (${r.note})` : ""}
      </div>
    </div>
  );
}

function InningsCard({ title, match, batTeamKey, bowlTeamKey, inn }) {
  const batTeam = getTeam(match, batTeamKey);
  const bowlTeam = getTeam(match, bowlTeamKey);
  const batColor = batTeam?.color || "#60A5FA";
  const bowlColor = bowlTeam?.color || "#F59E0B";
  const batText = pickTextColor(batColor);
  const bowlText = pickTextColor(bowlColor);

  const allPlayers = getAllPlayers(match);
  const batting = asArray(inn?.batting).sort(sortByRunsThenBalls);
  const bowling = asArray(inn?.bowling).sort(sortByWicketsThenRuns);

  return (
    <div className="card" style={{ flex: "1 1 100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="pill">{title}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            <span
              className="pill"
              style={{
                borderColor: withAlpha(batColor, 0.5),
                background: withAlpha(batColor, 0.18),
                color: batText,
              }}
            >
              Batting: {batTeam?.name || "—"}
            </span>{" "}
            <span
              className="pill"
              style={{
                borderColor: withAlpha(bowlColor, 0.5),
                background: withAlpha(bowlColor, 0.18),
                color: bowlText,
              }}
            >
              Bowling: {bowlTeam?.name || "—"}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 900 }} className="mono">
            {inn?.runs ?? 0}/{inn?.wickets ?? 0}
          </div>
          <div className="muted">
            Overs <b className="mono">{toOversString(inn?.legalBalls || 0)}</b>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12, gap: 12, flexWrap: "wrap" }}>
        <div className="card" style={{ flex: "1 1 520px", padding: 12, background: "rgba(0,0,0,0.18)" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Batting
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr className="muted" style={{ textAlign: "left", fontSize: 12 }}>
                  <th style={{ padding: "8px 6px" }}>Batter</th>
                  <th style={{ padding: "8px 6px" }}>How out</th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    R
                  </th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    B
                  </th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    4s
                  </th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    6s
                  </th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    SR
                  </th>
                </tr>
              </thead>
              <tbody>
                {batting.length ? (
                  batting.map((b) => (
                    <tr key={b.playerId} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: "8px 6px", fontWeight: 700 }}>{playerName(allPlayers, b.playerId) || "—"}</td>
                      <td style={{ padding: "8px 6px" }} className="muted">
                        {b.out ? b.howOut || "Out" : "Not out"}
                      </td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {b.runs ?? 0}
                      </td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {b.balls ?? 0}
                      </td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {b.fours ?? 0}
                      </td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {b.sixes ?? 0}
                      </td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {sr(b.runs ?? 0, b.balls ?? 0)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: "10px 6px" }}>
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ flex: "1 1 420px", padding: 12, background: "rgba(0,0,0,0.18)" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Bowling
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr className="muted" style={{ textAlign: "left", fontSize: 12 }}>
                  <th style={{ padding: "8px 6px" }}>Bowler</th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    O
                  </th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    R
                  </th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    W
                  </th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    Wd
                  </th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    Nb
                  </th>
                  <th style={{ padding: "8px 6px" }} className="mono">
                    Econ
                  </th>
                </tr>
              </thead>
              <tbody>
                {bowling.length ? (
                  bowling.map((bw) => (
                    <tr key={bw.playerId} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: "8px 6px", fontWeight: 700 }}>{playerName(allPlayers, bw.playerId) || "—"}</td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {toOversString(bw.legalBalls || 0)}
                      </td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {bw.runsConceded ?? 0}
                      </td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {bw.wickets ?? 0}
                      </td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {bw.wides ?? 0}
                      </td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {bw.noBalls ?? 0}
                      </td>
                      <td style={{ padding: "8px 6px" }} className="mono">
                        {econ(bw.runsConceded ?? 0, bw.legalBalls ?? 0)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: "10px 6px" }}>
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScorecardView({ match }) {
  if (!match) return null;

  const base = match?.superOver?.base;

  const mainInnings1 = base?.innings1 || (match.innings === 2 || match.status !== "setup" ? match.previous : null);
  const mainInnings2 = base?.innings2 || (match.innings === 2 || match.status !== "setup" ? match.current : null);

  // For main match team keys: innings 1 battingTeam/bowlingTeam are from the match at that time.
  // If we have base, we don't store those keys; we can infer from the fact that at start of innings 2 teams swap.
  // So for main match, use current match keys + swap back for innings 1 if needed.
  const inn2Bat = match.battingTeam;
  const inn2Bowl = match.bowlingTeam;
  const inn1Bat = inn2Bowl;
  const inn1Bowl = inn2Bat;

  // Super Over: infer team keys the same way (innings 2 swaps teams).
  const soInnings1 = match?.superOver?.active ? (match.innings === 2 ? match.previous : match.current) : null;
  const soInnings2 = match?.superOver?.active && match.innings === 2 ? match.current : null;

  const soInn1Bat = match?.superOver?.active ? (match.innings === 2 ? match.bowlingTeam : match.battingTeam) : null;
  const soInn1Bowl = match?.superOver?.active ? (match.innings === 2 ? match.battingTeam : match.bowlingTeam) : null;
  const soInn2Bat = match?.superOver?.active && match.innings === 2 ? match.battingTeam : null;
  const soInn2Bowl = match?.superOver?.active && match.innings === 2 ? match.bowlingTeam : null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <ResultBanner match={match} />

      {base ? (
        <div className="card" style={{ padding: 12, background: "rgba(0,0,0,0.18)" }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Main match
          </div>
          <div style={{ fontWeight: 900, marginTop: 4 }}>
            {match?.teams?.A?.name} vs {match?.teams?.B?.name}
          </div>
        </div>
      ) : null}

      <InningsCard title={base ? "Main match — Innings 1" : inningsLabel(match, 1)} match={match} batTeamKey={inn1Bat} bowlTeamKey={inn1Bowl} inn={mainInnings1} />
      <InningsCard title={base ? "Main match — Innings 2" : inningsLabel(match, 2)} match={match} batTeamKey={inn2Bat} bowlTeamKey={inn2Bowl} inn={mainInnings2} />

      {match?.superOver?.active ? (
        <>
          <div className="card" style={{ padding: 12, background: "rgba(0,0,0,0.18)" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Super Over
            </div>
          </div>
          <InningsCard title="Super Over — Innings 1" match={match} batTeamKey={soInn1Bat} bowlTeamKey={soInn1Bowl} inn={soInnings1} />
          {soInnings2 ? <InningsCard title="Super Over — Innings 2" match={match} batTeamKey={soInn2Bat} bowlTeamKey={soInn2Bowl} inn={soInnings2} /> : null}
        </>
      ) : null}
    </div>
  );
}

