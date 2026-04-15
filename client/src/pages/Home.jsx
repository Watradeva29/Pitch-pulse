import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();
  const [code, setCode] = useState("");

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="pill">Pitch Pulse - Scoring app</div>
          <h1 style={{ margin: "10px 0 0" }}>Pitch Pulse</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            Built for gully cricket.
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 420px" }}>
          <h2>Create match</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Set teams, players, overs, and rules.
          </p>
          <button className="primary" onClick={() => nav("/setup")}>
            Go to match setup
          </button>
        </div>

        <div className="card" style={{ flex: "1 1 420px" }}>
          <h2>Join match</h2>
          <div className="grid2">
            <div>
              <label>Match code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" />
            </div>
            <div>
              <label>Spectate</label>
              <div className="btnRow">
                <button className="primary" onClick={() => nav(`/join/${encodeURIComponent(code.trim().toUpperCase())}`)}>
                  Open spectator view
                </button>
              </div>
            </div>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            Umpire access is only via the private link shown after match creation.
          </div>
        </div>
      </div>
    </div>
  );
}

