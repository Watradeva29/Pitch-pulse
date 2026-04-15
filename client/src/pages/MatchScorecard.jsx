import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createSocket } from "../lib/socket";
import { getMatch } from "../lib/api";
import ScorecardView from "../components/ScorecardView";

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function matchToCsv(match) {
  const lines = [];
  const push = (row) => lines.push(row.map((x) => `"${String(x ?? "").replaceAll('"', '""')}"`).join(","));

  const title = `${match?.teams?.A?.name || "Team A"} vs ${match?.teams?.B?.name || "Team B"}`;
  push(["Pitch Pulse - Scoring app"]);
  push([title]);
  push([`Match code: ${match?.matchId || ""}`]);
  push([]);

  if (match?.result) {
    const r = match.result;
    if (r.type === "tie") push(["Result", `Tie${r.note ? ` (${r.note})` : ""}`]);
    if (r.type === "win") push(["Result", `Winner: ${match?.teams?.[r.winnerTeam]?.name || r.winnerTeam}`]);
    push([]);
  }

  const allPlayers = [...(match?.teams?.A?.players || []), ...(match?.teams?.B?.players || [])];
  const nameOf = (id) => allPlayers.find((p) => p.id === id)?.name || "";

  const inningsBlocks = [];
  const base = match?.superOver?.base;
  const inn1 = base?.innings1 || match?.previous;
  const inn2 = base?.innings2 || match?.current;
  inningsBlocks.push({ label: base ? "Main match - Innings 1" : "Innings 1", inn: inn1 });
  inningsBlocks.push({ label: base ? "Main match - Innings 2" : "Innings 2", inn: inn2 });
  if (match?.superOver?.active) {
    const so1 = match.innings === 2 ? match.previous : match.current;
    const so2 = match.innings === 2 ? match.current : null;
    inningsBlocks.push({ label: "Super Over - Innings 1", inn: so1 });
    if (so2) inningsBlocks.push({ label: "Super Over - Innings 2", inn: so2 });
  }

  for (const blk of inningsBlocks) {
    if (!blk.inn) continue;
    push([blk.label]);
    push(["Runs", blk.inn.runs ?? 0, "Wickets", blk.inn.wickets ?? 0, "Legal balls", blk.inn.legalBalls ?? 0]);
    push([]);
    push(["Batting"]);
    push(["Batter", "Runs", "Balls", "4s", "6s", "Out", "How out"]);
    for (const b of Object.values(blk.inn.batting || {})) {
      push([nameOf(b.playerId), b.runs ?? 0, b.balls ?? 0, b.fours ?? 0, b.sixes ?? 0, b.out ? "Y" : "N", b.howOut || ""]);
    }
    push([]);
    push(["Bowling"]);
    push(["Bowler", "Legal balls", "Runs", "Wickets", "Wides", "No-balls"]);
    for (const bw of Object.values(blk.inn.bowling || {})) {
      push([nameOf(bw.playerId), bw.legalBalls ?? 0, bw.runsConceded ?? 0, bw.wickets ?? 0, bw.wides ?? 0, bw.noBalls ?? 0]);
    }
    push([]);
    push(["Deliveries"]);
    push(["t", "kind", "runs", "legal", "over", "ballInOver", "striker", "nonStriker", "bowler", "wicket_out", "wicket_howOut", "wide", "noBall", "freeHit"]);
    for (const d of blk.inn.deliveries || []) {
      push([
        d.t || "",
        d.kind || "",
        d.runs ?? 0,
        d.legal ? "Y" : "N",
        d.over ?? "",
        d.ballInOver ?? "",
        nameOf(d.strikerId),
        nameOf(d.nonStrikerId),
        nameOf(d.bowlerId),
        d.wicket?.outPlayerId ? nameOf(d.wicket.outPlayerId) : "",
        d.wicket?.howOut || "",
        d.extras?.wide ?? 0,
        d.extras?.noBall ?? 0,
        d.freeHit ? "Y" : "N",
      ]);
    }
    push([]);
  }

  return lines.join("\n");
}

export default function MatchScorecard() {
  const nav = useNavigate();
  const { code } = useParams();
  const matchCode = String(code || "").toUpperCase();

  const [match, setMatch] = useState(null);
  const [err, setErr] = useState("");
  const [connected, setConnected] = useState(false);

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
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("match:update", (m) => {
      setMatch(m);
      setErr(m?.errors?.[0] || "");
    });
    socket.on("match:error", (e) => setErr(e?.message || "Socket error"));
    socket.emit("match:join", { code: matchCode, role: "spectator" });
    return () => socket.disconnect();
  }, [socket, matchCode]);

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="pill">Scorecard</div>
          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800 }}>
            {match?.teams?.A?.name || "Team A"} vs {match?.teams?.B?.name || "Team B"}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Code: <code>{match?.matchId || matchCode}</code> · Socket: {connected ? "connected" : "disconnected"}
          </div>
        </div>
        <div className="btnRow">
          <button onClick={() => nav(-1)}>Back</button>
          <button onClick={() => nav(`/match/${encodeURIComponent(matchCode)}/spectator`)}>Live</button>
          <button className="primary" onClick={() => nav("/")}>
            Home
          </button>
        </div>
      </div>

      {err ? (
        <div className="error" style={{ marginTop: 16 }}>
          {err}
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 100%" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="muted">Download exports (best after match ends)</div>
            <div className="btnRow">
              <button
                disabled={!match}
                onClick={() => {
                  const csv = matchToCsv(match);
                  downloadBlob(`pitch-pulse-${match.matchId || matchCode}-scorecard.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
                }}
              >
                Download CSV
              </button>
              <button
                className="primary"
                disabled={!match}
                onClick={async () => {
                  const { default: jsPDF } = await import("jspdf");
                  const autoTableMod = await import("jspdf-autotable");
                  const doc = new jsPDF({ unit: "pt", format: "a4" });
                  const autoTable = autoTableMod.default || autoTableMod;

                  const title = `${match?.teams?.A?.name || "Team A"} vs ${match?.teams?.B?.name || "Team B"}`;
                  doc.setFontSize(16);
                  doc.text("Pitch Pulse - Scoring app", 40, 48);
                  doc.setFontSize(11);
                  doc.text("Built for gully cricket", 40, 66);
                  doc.setFontSize(12);
                  doc.text(title, 40, 92);
                  doc.setFontSize(10);
                  doc.text(`Match code: ${match?.matchId || matchCode}`, 40, 110);

                  let y = 130;
                  if (match?.result) {
                    const r = match.result;
                    const msg =
                      r.type === "tie"
                        ? `Result: Tie${r.note ? ` (${r.note})` : ""}`
                        : `Winner: ${match?.teams?.[r.winnerTeam]?.name || r.winnerTeam}${r.note ? ` (${r.note})` : ""}`;
                    doc.text(msg, 40, y);
                    y += 16;
                  }

                  const allPlayers = [...(match?.teams?.A?.players || []), ...(match?.teams?.B?.players || [])];
                  const nameOf = (id) => allPlayers.find((p) => p.id === id)?.name || "";

                  const blocks = [];
                  const base = match?.superOver?.base;
                  const inn1 = base?.innings1 || match?.previous;
                  const inn2 = base?.innings2 || match?.current;
                  blocks.push({ label: base ? "Main match - Innings 1" : "Innings 1", inn: inn1 });
                  blocks.push({ label: base ? "Main match - Innings 2" : "Innings 2", inn: inn2 });
                  if (match?.superOver?.active) {
                    const so1 = match.innings === 2 ? match.previous : match.current;
                    const so2 = match.innings === 2 ? match.current : null;
                    blocks.push({ label: "Super Over - Innings 1", inn: so1 });
                    if (so2) blocks.push({ label: "Super Over - Innings 2", inn: so2 });
                  }

                  for (const blk of blocks) {
                    if (!blk.inn) continue;
                    y += 14;
                    doc.setFontSize(12);
                    doc.text(`${blk.label}: ${blk.inn.runs ?? 0}/${blk.inn.wickets ?? 0} (${Math.floor((blk.inn.legalBalls || 0) / 6)}.${(blk.inn.legalBalls || 0) % 6})`, 40, y);
                    y += 8;

                    const batRows = Object.values(blk.inn.batting || {}).map((b) => [
                      nameOf(b.playerId),
                      b.out ? b.howOut || "Out" : "Not out",
                      String(b.runs ?? 0),
                      String(b.balls ?? 0),
                      String(b.fours ?? 0),
                      String(b.sixes ?? 0),
                    ]);
                    autoTable(doc, {
                      startY: y + 6,
                      head: [["Batter", "How out", "R", "B", "4s", "6s"]],
                      body: batRows.length ? batRows : [["—", "—", "0", "0", "0", "0"]],
                      styles: { fontSize: 9 },
                      headStyles: { fillColor: [20, 20, 20] },
                      margin: { left: 40, right: 40 },
                    });
                    y = doc.lastAutoTable.finalY + 10;

                    const bowlRows = Object.values(blk.inn.bowling || {}).map((bw) => [
                      nameOf(bw.playerId),
                      `${Math.floor((bw.legalBalls || 0) / 6)}.${(bw.legalBalls || 0) % 6}`,
                      String(bw.runsConceded ?? 0),
                      String(bw.wickets ?? 0),
                      String(bw.wides ?? 0),
                      String(bw.noBalls ?? 0),
                    ]);
                    autoTable(doc, {
                      startY: y,
                      head: [["Bowler", "O", "R", "W", "Wd", "Nb"]],
                      body: bowlRows.length ? bowlRows : [["—", "0.0", "0", "0", "0", "0"]],
                      styles: { fontSize: 9 },
                      headStyles: { fillColor: [20, 20, 20] },
                      margin: { left: 40, right: 40 },
                    });
                    y = doc.lastAutoTable.finalY + 12;
                    if (y > 740) {
                      doc.addPage();
                      y = 60;
                    }
                  }

                  doc.save(`pitch-pulse-${match.matchId || matchCode}-scorecard.pdf`);
                }}
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <div style={{ flex: "1 1 100%" }}>
          <ScorecardView match={match} />
        </div>
      </div>
    </div>
  );
}

