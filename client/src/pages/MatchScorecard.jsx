import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createSocket } from "../lib/socket";
import { getMatch } from "../lib/api";
import ScorecardView from "../components/ScorecardView";
import MatchSummaryCard from "../components/MatchSummaryCard";
import InningsPdfPage from "../components/InningsPdfPage";
import { exportElementToPng, renderElementToPngDataUrl } from "../lib/export";

export default function MatchScorecard() {
  const nav = useNavigate();
  const { code } = useParams();
  const matchCode = String(code || "").toUpperCase();

  const [match, setMatch] = useState(null);
  const [err, setErr] = useState("");
  const [connected, setConnected] = useState(false);

  const socket = useMemo(() => createSocket(), []);
  const summaryRef = useRef(null);
  const pdfMain1Ref = useRef(null);
  const pdfMain2Ref = useRef(null);
  const pdfSo1Ref = useRef(null);
  const pdfSo2Ref = useRef(null);

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
    socket.emit("match:join", { code: matchCode, role: "spectator" });
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("match:update", onUpdate);
      socket.off("match:error", onError);
      socket.disconnect();
    };
  }, [socket, matchCode]);

  useEffect(() => {
    let timer = null;
    let alive = true;

    async function refresh() {
      try {
        const res = await getMatch(matchCode);
        if (!alive) return;
        setMatch(res.match);
      } catch {
        // ignore
      }
    }

    if (!connected) {
      refresh();
      timer = setInterval(refresh, 4000);
    }

    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [connected, matchCode]);

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
            <div className="muted">PNG and PDF exports (best after match ends)</div>
            <div className="btnRow">
              <button
                disabled={!match}
                onClick={async () => {
                  try {
                    setErr("");
                    await exportElementToPng(summaryRef.current, `pitch-pulse-${match.matchId || matchCode}-summary`);
                  } catch (e) {
                    setErr(e?.message || "Failed to export summary PNG.");
                  }
                }}
              >
                Download Summary PNG
              </button>
              <button
                className="primary"
                disabled={!match}
                onClick={async () => {
                  try {
                    setErr("");
                    const pageEls = [pdfMain1Ref.current, pdfMain2Ref.current, pdfSo1Ref.current, pdfSo2Ref.current].filter(Boolean);
                    if (!pageEls.length) {
                      throw new Error("PDF pages are not ready yet. Please try again.");
                    }

                    const { default: jsPDF } = await import("jspdf");
                    const doc = new jsPDF({ unit: "pt", format: "a4" });

                    for (let i = 0; i < pageEls.length; i += 1) {
                      const dataUrl = await renderElementToPngDataUrl(pageEls[i]);
                      if (i > 0) doc.addPage();
                      const pageW = doc.internal.pageSize.getWidth();
                      const pageH = doc.internal.pageSize.getHeight();
                      doc.addImage(dataUrl, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
                    }

                    doc.save(`pitch-pulse-${match.matchId || matchCode}-scorecard.pdf`);
                  } catch (e) {
                    setErr(e?.message || "Failed to export PDF. Check hosting base path and try again.");
                  }

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
          <div style={{ marginBottom: 12 }}>
            <MatchSummaryCard ref={summaryRef} match={match} />
          </div>

          {/* Hidden, fully-styled PDF pages (captured via html2canvas) */}
          <div style={{ position: "absolute", left: -99999, top: 0, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
            <div>
              <InningsPdfPage
                ref={pdfMain1Ref}
                match={match}
                inningsLabel={match?.superOver?.active ? "Main match — Innings 1" : "Innings 1"}
                inn={match?.superOver?.base?.innings1 || match?.previous || (match?.innings === 1 ? match?.current : null)}
                batTeamKey={match?.superOver?.active ? match?.bowlingTeam : (match?.innings === 1 ? match?.battingTeam : match?.bowlingTeam)}
                bowlTeamKey={match?.superOver?.active ? match?.battingTeam : (match?.innings === 1 ? match?.bowlingTeam : match?.battingTeam)}
              />
            </div>
            <div style={{ marginTop: 24 }}>
              <InningsPdfPage
                ref={pdfMain2Ref}
                match={match}
                inningsLabel={match?.superOver?.active ? "Main match — Innings 2" : "Innings 2"}
                inn={match?.superOver?.base?.innings2 || (match?.innings === 2 ? match?.current : null)}
                batTeamKey={match?.superOver?.active ? match?.battingTeam : match?.battingTeam}
                bowlTeamKey={match?.superOver?.active ? match?.bowlingTeam : match?.bowlingTeam}
              />
            </div>
            {match?.superOver?.active ? (
              <>
                <div style={{ marginTop: 24 }}>
                  <InningsPdfPage
                    ref={pdfSo1Ref}
                    match={match}
                    inningsLabel="Super Over — Innings 1"
                    inn={match.innings === 2 ? match.previous : match.current}
                    batTeamKey={match.innings === 2 ? match.bowlingTeam : match.battingTeam}
                    bowlTeamKey={match.innings === 2 ? match.battingTeam : match.bowlingTeam}
                  />
                </div>
                {match.innings === 2 ? (
                  <div style={{ marginTop: 24 }}>
                    <InningsPdfPage
                      ref={pdfSo2Ref}
                      match={match}
                      inningsLabel="Super Over — Innings 2"
                      inn={match.current}
                      batTeamKey={match.battingTeam}
                      bowlTeamKey={match.bowlingTeam}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          <ScorecardView match={match} />
        </div>
      </div>
    </div>
  );
}

