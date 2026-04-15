import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

export default function ShareMatch() {
  const nav = useNavigate();
  const { code } = useParams();
  const [sp] = useSearchParams();
  const key = sp.get("key") || "";

  const matchCode = String(code || "").toUpperCase();

  const basePath = String(import.meta.env.BASE_URL || "/").replace(/\/+$/, "");

  const spectatorLink = useMemo(() => {
    const base = window.location.origin;
    return `${base}${basePath}/match/${encodeURIComponent(matchCode)}/spectator`;
  }, [matchCode, basePath]);

  const umpireLink = useMemo(() => {
    const base = window.location.origin;
    return `${base}${basePath}/match/${encodeURIComponent(matchCode)}/toss?key=${encodeURIComponent(key)}`;
  }, [matchCode, key, basePath]);

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="pill">Share</div>
          <h1 style={{ margin: "10px 0 0" }}>Invite spectators</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            Match code: <code>{matchCode}</code>
          </div>
        </div>
        <div className="btnRow">
          <button onClick={() => nav("/")}>Home</button>
          <button className="primary" onClick={() => nav(`/match/${encodeURIComponent(matchCode)}/toss?key=${encodeURIComponent(key)}`)}>
            Continue to toss
          </button>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 520px" }}>
          <h2>Spectator link</h2>
          <div className="muted" style={{ marginBottom: 10 }}>
            Share this with anyone. Read-only.
          </div>
          <div className="card" style={{ padding: 12, background: "rgba(0,0,0,0.18)" }}>
            <div className="mono" style={{ wordBreak: "break-all" }}>
              {spectatorLink}
            </div>
          </div>
          <div className="btnRow" style={{ marginTop: 10 }}>
            <button onClick={() => navigator.clipboard?.writeText(spectatorLink)}>Copy spectator link</button>
          </div>
        </div>

        <div className="card" style={{ flex: "1 1 520px" }}>
          <h2>Umpire access</h2>
          <div className="muted" style={{ marginBottom: 10 }}>
            Only people with the umpire link can control scoring.
          </div>
          {key ? (
            <>
              <div className="card" style={{ padding: 12, background: "rgba(0,0,0,0.18)" }}>
                <div className="mono" style={{ wordBreak: "break-all" }}>
                  {umpireLink}
                </div>
              </div>
              <div className="btnRow" style={{ marginTop: 10 }}>
                <button className="primary" onClick={() => navigator.clipboard?.writeText(umpireLink)}>
                  Copy umpire link
                </button>
              </div>
              <div className="muted" style={{ marginTop: 10 }}>
                Note: only one umpire can be connected at a time.
              </div>
            </>
          ) : (
            <div className="error">Missing umpire key. Please recreate the match from setup.</div>
          )}
        </div>
      </div>
    </div>
  );
}

