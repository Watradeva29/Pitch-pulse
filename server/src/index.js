const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { nanoid } = require("nanoid");

const {
  newMatchState,
  applyBallWithUndo,
  undoLastBall,
  startFirstInnings,
  startSecondInnings,
  startSuperOver,
} = require("./match/scoring");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

// Dev-friendly CORS: reflect the request origin.
// For production, set CLIENT_ORIGIN explicitly and lock it down.
const corsOptions = {
  origin: true,
  credentials: true,
};

const app = express();
app.use(express.json());
app.use(
  cors(corsOptions)
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

// In-memory store: matchCode -> match object
const matches = new Map();

function createCode() {
  return nanoid(6).toUpperCase();
}

function createUmpireKey() {
  // short but unguessable enough for local/EC2 single-instance MVP
  return nanoid(24);
}

function pickPlayers(names) {
  return (names || []).map((name, idx) => ({
    id: nanoid(8),
    name: String(name || `Player ${idx + 1}`).trim(),
  }));
}

function addJoker(teamAPlayers, teamBPlayers, joker) {
  const mode = joker?.mode || "off"; // off | bothTeams | oneTeamExtraWicket
  if (mode === "off") return { teamAPlayers, teamBPlayers, joker: null };

  const name = String(joker?.name || "Joker").trim() || "Joker";
  const team = joker?.team === "B" ? "B" : "A";
  const player = { id: nanoid(8), name };

  if (mode === "bothTeams") {
    return {
      teamAPlayers: [...teamAPlayers, player],
      teamBPlayers: [...teamBPlayers, player],
      joker: { enabled: true, mode, team: null, playerId: player.id, name: player.name },
    };
  }

  // oneTeamExtraWicket: joker only appears in the selected team.
  return {
    teamAPlayers: team === "A" ? [...teamAPlayers, player] : teamAPlayers,
    teamBPlayers: team === "B" ? [...teamBPlayers, player] : teamBPlayers,
    joker: { enabled: true, mode, team, playerId: player.id, name: player.name },
  };
}

function publicMatch(match) {
  // Never leak umpireKey / internal lock info
  const { umpireKey, umpireSocketId, ...rest } = match;
  return rest;
}

function mustGetMatch(code) {
  const match = matches.get(code);
  if (!match) {
    const err = new Error("Match not found.");
    err.status = 404;
    throw err;
  }
  return match;
}

function emitMatch(code) {
  const match = matches.get(code);
  if (!match) return;
  io.to(`match:${code}`).emit("match:update", publicMatch(match));
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/matches", (req, res) => {
  const {
    teamAName,
    teamBName,
    teamAColor,
    teamBColor,
    teamAPlayers,
    teamBPlayers,
    playersPerTeam = 11,
    overs,
    joker, // { mode, team, name }
    rules,
  } = req.body || {};

  const pCount = Math.max(3, Math.min(11, Number(playersPerTeam || 11)));
  const maxOvers = Math.max(1, Number(overs || pCount));

  const code = createCode();
  const matchId = code;
  const umpireKey = createUmpireKey();

  const baseAPlayers = pickPlayers(teamAPlayers);
  const baseBPlayers = pickPlayers(teamBPlayers);
  const { teamAPlayers: finalAPlayers, teamBPlayers: finalBPlayers, joker: jokerCfg } = addJoker(
    baseAPlayers,
    baseBPlayers,
    joker
  );

  const match = newMatchState({
    matchId,
    teamAName: String(teamAName || "Team A"),
    teamBName: String(teamBName || "Team B"),
    teamAColor: String(teamAColor || "#60A5FA"),
    teamBColor: String(teamBColor || "#F59E0B"),
    teamAPlayers: finalAPlayers,
    teamBPlayers: finalBPlayers,
    playersPerTeam: pCount,
    maxOvers,
    joker: jokerCfg,
    rules,
  });

  match.umpireKey = umpireKey;
  match.umpireSocketId = null; // lock to a single active umpire socket

  matches.set(code, match);
  res.json({ code, match: publicMatch(match), umpireKey });
});

app.get("/api/matches/:code", (req, res, next) => {
  try {
    const match = mustGetMatch(String(req.params.code || "").toUpperCase());
    res.json({ match: publicMatch(match) });
  } catch (e) {
    next(e);
  }
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Server error" });
});

io.on("connection", (socket) => {
  socket.on("match:join", ({ code, role, key }) => {
    const c = String(code || "").toUpperCase();
    if (!matches.has(c)) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    const match = matches.get(c);
    const r = role === "umpire" ? "umpire" : "spectator";

    if (r === "umpire") {
      if (!key || key !== match.umpireKey) {
        socket.emit("match:error", { message: "Umpire access denied." });
        return;
      }
      if (match.umpireSocketId && match.umpireSocketId !== socket.id) {
        socket.emit("match:error", { message: "Umpire already connected." });
        return;
      }
      match.umpireSocketId = socket.id;
      matches.set(c, match);
    }

    socket.data.code = c;
    socket.data.role = r;
    socket.join(`match:${c}`);
    socket.emit("match:update", publicMatch(matches.get(c)));
  });

  socket.on("disconnect", () => {
    const c = socket.data.code;
    if (!c) return;
    const match = matches.get(c);
    if (!match) return;
    if (match.umpireSocketId === socket.id) {
      match.umpireSocketId = null;
      matches.set(c, match);
      emitMatch(c);
    }
  });

  socket.on("match:setupTeams", ({ code, battingTeam }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = matches.get(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }

    const bt = battingTeam === "B" ? "B" : "A";
    match.battingTeam = bt;
    match.bowlingTeam = bt === "A" ? "B" : "A";
    matches.set(c, match);
    emitMatch(c);
  });

  socket.on("match:startInnings1", ({ code }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = matches.get(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }
    matches.set(c, startFirstInnings(match));
    emitMatch(c);
  });

  socket.on("match:startInnings2", ({ code }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = matches.get(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }
    matches.set(c, startSecondInnings(match));
    emitMatch(c);
  });

  socket.on("match:startSuperOver", ({ code }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = matches.get(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }
    const next = startSuperOver(match);
    matches.set(c, next);
    emitMatch(c);
  });

  socket.on("match:selectPlayers", ({ code, strikerId, nonStrikerId, bowlerId }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = matches.get(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }
    match.current.strikerId = strikerId || null;
    match.current.nonStrikerId = nonStrikerId || null;
    match.current.bowlerId = bowlerId || null;
    matches.set(c, match);
    emitMatch(c);
  });

  socket.on("match:ball", ({ code, action }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = matches.get(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }
    const next = applyBallWithUndo(match, action || {});
    matches.set(c, next);
    emitMatch(c);
  });

  socket.on("match:undo", ({ code }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = matches.get(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }
    const next = undoLastBall(match);
    matches.set(c, next);
    emitMatch(c);
  });

  socket.on("match:toss", ({ code, call, result, decision }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = matches.get(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }

    // call: { team: "A"|"B", choice: "H"|"T" }
    // result: "H"|"T"
    // decision: "bat"|"bowl"
    const r = result === "T" ? "T" : "H";
    const winnerTeam =
      call?.choice && call.choice.toUpperCase() === r
        ? call.team === "B"
          ? "B"
          : "A"
        : call?.team === "B"
          ? "A"
          : "B";

    match.toss = {
      winner: winnerTeam,
      decision: decision === "bowl" ? "bowl" : "bat",
      overridden: false,
      call: { team: call?.team === "B" ? "B" : "A", choice: call?.choice === "T" ? "T" : "H" },
      result: r,
    };

    const winnerBats = match.toss.decision === "bat";
    match.battingTeam = winnerBats ? winnerTeam : winnerTeam === "A" ? "B" : "A";
    match.bowlingTeam = match.battingTeam === "A" ? "B" : "A";

    matches.set(c, match);
    emitMatch(c);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`CORS origin: ${CLIENT_ORIGIN}`);
});

