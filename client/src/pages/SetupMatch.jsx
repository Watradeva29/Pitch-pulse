import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createMatch } from "../lib/api";
import { pickTextColor, withAlpha } from "../lib/colors";
import ColorWheelPicker from "../components/ColorWheelPicker";

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizePlayersFromFileText(text) {
  const raw = String(text || "").replace(/^\uFEFF/, ""); // strip UTF-8 BOM
  // If it's a simple 1-column CSV, we accept commas/semicolons/tabs as separators too.
  const separatorsToNewlines = raw
    .split(/\r?\n/)
    .flatMap((line) => {
      const t = String(line || "").trim();
      if (!t) return [];
      // if line looks like CSV row, take first cell; otherwise keep whole line
      if (/[,\t;]/.test(t)) {
        const firstCell = t.split(/[,\t;]/)[0];
        return [firstCell];
      }
      return [t];
    })
    .join("\n");
  return splitLines(separatorsToNewlines).slice(0, 30);
}

async function readTextFile(file) {
  if (!file) return "";
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
}

export default function SetupMatch() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");
  const [teamAColor, setTeamAColor] = useState("#60A5FA");
  const [teamBColor, setTeamBColor] = useState("#F59E0B");
  const [playersPerTeam, setPlayersPerTeam] = useState(5);
  const [overs, setOvers] = useState(5);
  const [jokerMode, setJokerMode] = useState("off"); // off | bothTeams | oneTeamExtraWicket
  const [jokerTeam, setJokerTeam] = useState("A"); // A | B
  const [jokerName, setJokerName] = useState("Joker");

  const [teamAPlayersText, setTeamAPlayersText] = useState("A1\nA2\nA3\nA4\nA5");
  const [teamBPlayersText, setTeamBPlayersText] = useState("B1\nB2\nB3\nB4\nB5");

  const [wideExtraBall, setWideExtraBall] = useState(true);
  const [noBallExtraBall, setNoBallExtraBall] = useState(true);
  const [freeHit, setFreeHit] = useState(true);

  const teamAPlayers = useMemo(() => splitLines(teamAPlayersText), [teamAPlayersText]);
  const teamBPlayers = useMemo(() => splitLines(teamBPlayersText), [teamBPlayersText]);

  const teamAText = pickTextColor(teamAColor);
  const teamBText = pickTextColor(teamBColor);

  async function importPlayers(file, which) {
    try {
      setErr("");
      const text = await readTextFile(file);
      const players = normalizePlayersFromFileText(text);
      if (!players.length) {
        setErr("No player names found in the uploaded file.");
        return;
      }
      const joined = players.join("\n");
      if (which === "A") setTeamAPlayersText(joined);
      if (which === "B") setTeamBPlayersText(joined);
    } catch (e) {
      setErr(e?.message || "Failed to import players.");
    }
  }

  async function onCreate() {
    try {
      setBusy(true);
      setErr("");
      const payload = {
        teamAName,
        teamBName,
        teamAColor,
        teamBColor,
        playersPerTeam: Number(playersPerTeam),
        overs: Number(overs),
        joker: {
          mode: jokerMode,
          team: jokerTeam,
          name: jokerName,
        },
        teamAPlayers,
        teamBPlayers,
        rules: {
          wide: { extraBall: !!wideExtraBall },
          noBall: { extraBall: !!noBallExtraBall, freeHit: !!freeHit },
        },
      };
      const res = await createMatch(payload);
      nav(`/match/${encodeURIComponent(res.code)}/share?key=${encodeURIComponent(res.umpireKey || "")}`);
    } catch (e) {
      setErr(e.message || "Failed to create match.");
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="pill">Pitch Pulse - Scoring app</div>
          <h1 style={{ margin: "10px 0 0" }}>Create match</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            Built for gully cricket.
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

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 520px" }}>
          <h2>Teams</h2>
          <div className="grid2">
            <div>
              <label>Team A name</label>
              <input value={teamAName} onChange={(e) => setTeamAName(e.target.value)} />
            </div>
            <div>
              <label>Team B name</label>
              <input value={teamBName} onChange={(e) => setTeamBName(e.target.value)} />
            </div>
          </div>

          <div className="grid2" style={{ marginTop: 12 }}>
            <div>
              <label>Players per team (3–11)</label>
              <input
                type="number"
                min={3}
                max={11}
                value={playersPerTeam}
                onChange={(e) => setPlayersPerTeam(e.target.value)}
              />
            </div>
            <div>
              <label>Overs per side</label>
              <input type="number" min={1} value={overs} onChange={(e) => setOvers(e.target.value)} />
            </div>
          </div>

          <div className="grid2" style={{ marginTop: 12, alignItems: "end" }}>
            <div>
              <label>Team A colour</label>
              <ColorWheelPicker label="Team A" value={teamAColor} onChange={setTeamAColor} />
            </div>
            <div>
              <label>Team B colour</label>
              <ColorWheelPicker label="Team B" value={teamBColor} onChange={setTeamBColor} />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, alignItems: "center" }}>
            <div className="btnRow">
              <button className={jokerMode !== "off" ? "primary" : ""} onClick={() => setJokerMode((m) => (m === "off" ? "bothTeams" : "off"))}>
                Joker: {jokerMode === "off" ? "OFF" : jokerMode === "bothTeams" ? "Both teams" : "One team + extra wicket"}
              </button>
            </div>
            {jokerMode !== "off" ? (
              <div style={{ flex: "1 1 240px" }}>
                <label>Joker name</label>
                <input value={jokerName} onChange={(e) => setJokerName(e.target.value)} />
              </div>
            ) : null}
            {jokerMode !== "off" ? (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <label>Mode</label>
                  <select value={jokerMode} onChange={(e) => setJokerMode(e.target.value)}>
                    <option value="bothTeams">Plays for both teams</option>
                    <option value="oneTeamExtraWicket">Plays for one team, other gets extra wicket</option>
                  </select>
                </div>
                {jokerMode === "oneTeamExtraWicket" ? (
                  <div>
                    <label>Joker team</label>
                    <select value={jokerTeam} onChange={(e) => setJokerTeam(e.target.value)}>
                      <option value="A">{teamAName}</option>
                      <option value="B">{teamBName}</option>
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ flex: "1 1 520px" }}>
          <h2>Rules</h2>
          <div className="btnRow">
            <button className={wideExtraBall ? "primary" : ""} onClick={() => setWideExtraBall((v) => !v)}>
              Wide extra ball: {wideExtraBall ? "ON" : "OFF"}
            </button>
            <button className={noBallExtraBall ? "primary" : ""} onClick={() => setNoBallExtraBall((v) => !v)}>
              No-ball extra ball: {noBallExtraBall ? "ON" : "OFF"}
            </button>
            <button className={freeHit ? "primary" : ""} onClick={() => setFreeHit((v) => !v)}>
              Free hit: {freeHit ? "ON" : "OFF"}
            </button>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            Notes: wide/no-ball always add +1 run in this MVP. Extra-ball toggles whether it counts as a legal ball.
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 520px" }}>
          <div
            style={{
              borderRadius: 12,
              padding: "10px 12px",
              background: `linear-gradient(180deg, ${withAlpha(teamAColor, 0.35)} 0%, rgba(0,0,0,0) 100%)`,
              border: `1px solid ${withAlpha(teamAColor, 0.35)}`,
              marginBottom: 12,
              color: teamAText,
              fontWeight: 800,
            }}
          >
            {teamAName} players
          </div>
          <label>One player per line</label>
          <div className="row" style={{ marginTop: 8, justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Upload (.txt/.csv) to fill list
            </div>
            <input
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importPlayers(f, "A");
                e.target.value = "";
              }}
            />
          </div>
          <textarea
            value={teamAPlayersText}
            onChange={(e) => setTeamAPlayersText(e.target.value)}
            style={{
              width: "100%",
              minHeight: 160,
              padding: 10,
              borderRadius: 10,
              border: `1px solid ${withAlpha(teamAColor, 0.35)}`,
              background: `linear-gradient(180deg, ${withAlpha(teamAColor, 0.14)} 0%, rgba(0,0,0,0.25) 55%)`,
              color: "var(--text)",
            }}
          />
          <div className="muted" style={{ marginTop: 8 }}>
            Count: {teamAPlayers.length}
          </div>
        </div>

        <div className="card" style={{ flex: "1 1 520px" }}>
          <div
            style={{
              borderRadius: 12,
              padding: "10px 12px",
              background: `linear-gradient(180deg, ${withAlpha(teamBColor, 0.35)} 0%, rgba(0,0,0,0) 100%)`,
              border: `1px solid ${withAlpha(teamBColor, 0.35)}`,
              marginBottom: 12,
              color: teamBText,
              fontWeight: 800,
            }}
          >
            {teamBName} players
          </div>
          <label>One player per line</label>
          <div className="row" style={{ marginTop: 8, justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Upload (.txt/.csv) to fill list
            </div>
            <input
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importPlayers(f, "B");
                e.target.value = "";
              }}
            />
          </div>
          <textarea
            value={teamBPlayersText}
            onChange={(e) => setTeamBPlayersText(e.target.value)}
            style={{
              width: "100%",
              minHeight: 160,
              padding: 10,
              borderRadius: 10,
              border: `1px solid ${withAlpha(teamBColor, 0.35)}`,
              background: `linear-gradient(180deg, ${withAlpha(teamBColor, 0.14)} 0%, rgba(0,0,0,0.25) 55%)`,
              color: "var(--text)",
            }}
          />
          <div className="muted" style={{ marginTop: 8 }}>
            Count: {teamBPlayers.length}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 100%" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="muted">
              This creates the match and opens the umpire screen.
            </div>
            <button className="primary" disabled={busy} onClick={onCreate}>
              {busy ? "Creating..." : "Create match"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

