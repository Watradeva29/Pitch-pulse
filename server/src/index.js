const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

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
  newInningsState,
  bowlerHasQuotaRemaining,
} = require("./match/scoring");

const {
  initMongo,
  closeMongo,
  getMongoDiagnostics,
  createMatch,
  getMatch,
  saveMatch,
  hasMatch,
  listRecentMatchSummariesForApi,
} = require("./store/matches");

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

async function mustGetMatch(code) {
  const match = await getMatch(code);
  if (!match) {
    const err = new Error("Match not found.");
    err.status = 404;
    throw err;
  }
  return match;
}

function emitMatch(code, match) {
  if (!match) return;
  io.to(`match:${code}`).emit("match:update", publicMatch(match));
}

app.get("/api/health", async (req, res) => {
  const mongo = await getMongoDiagnostics().catch((e) => ({
    configured: false,
    connected: false,
    error: e?.message || String(e),
  }));
  res.json({ ok: true, mongo });
});

app.post("/api/matches", async (req, res, next) => {
  const {
    teamAName,
    teamBName,
    teamAColor,
    teamBColor,
    teamAPlayers,
    teamBPlayers,
    playersPerTeam = 11,
    overs,
    bowlerMaxOvers,
    joker, // { mode, team, name }
    rules,
  } = req.body || {};

  try {
    const pCount = Math.max(3, Math.min(11, Number(playersPerTeam || 11)));
    const maxOvers = Math.max(1, Number(overs || pCount));
    const bmo = Math.floor(Number(bowlerMaxOvers));
    if (!Number.isFinite(bmo) || bmo < 1) {
      res.status(400).json({ error: "Set max overs per bowler (whole number, at least 1)." });
      return;
    }
    if (bmo > maxOvers) {
      res.status(400).json({ error: `Max overs per bowler cannot exceed the innings length (${maxOvers}).` });
      return;
    }
    if (pCount * bmo < maxOvers) {
      res.status(400).json({
        error: `Bowler limit is too low to complete ${maxOvers} overs. Need playersPerTeam × bowlerMaxOvers ≥ overs (${pCount} × ${bmo} < ${maxOvers}).`,
      });
      return;
    }

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
      bowlerMaxOvers: bmo,
      joker: jokerCfg,
      rules,
    });

    match.umpireKey = umpireKey;
    match.umpireSocketId = null; // lock to a single active umpire socket

    await createMatch(match);
    res.json({ code, match: publicMatch(match), umpireKey });
  } catch (e) {
    next(e);
  }
});

app.get("/api/matches/:code", async (req, res, next) => {
  try {
    const match = await mustGetMatch(String(req.params.code || "").toUpperCase());
    res.json({ match: publicMatch(match) });
  } catch (e) {
    next(e);
  }
});

app.get("/api/data/matches", async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const rows = await listRecentMatchSummariesForApi(limit);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Server error" });
});

io.on("connection", (socket) => {
  socket.on("match:join", async ({ code, role, key }) => {
    const c = String(code || "").toUpperCase();
    if (!(await hasMatch(c))) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    const match = await getMatch(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    const r = role === "umpire" ? "umpire" : "spectator";

    if (r === "umpire") {
      if (!key || key !== match.umpireKey) {
        socket.emit("match:error", { message: "Umpire access denied." });
        return;
      }
    }

    // Register role and room before any await so control events (e.g. selectPlayers) are authorized immediately.
    socket.data.code = c;
    socket.data.role = r;
    socket.join(`match:${c}`);

    if (r === "umpire") {
      if (match.umpireSocketId && match.umpireSocketId !== socket.id) {
        // Seamless handoff: same key can take over (prevents navigation races between pages).
        const prev = io.sockets.sockets.get(match.umpireSocketId);
        try {
          prev?.disconnect(true);
        } catch {
          // ignore
        }
      }
      match.umpireSocketId = socket.id;
      await saveMatch(match);
    }

    socket.emit("match:update", publicMatch(match));
  });

  socket.on("disconnect", async () => {
    const c = socket.data.code;
    if (!c) return;
    const match = await getMatch(c);
    if (!match) return;
    if (match.umpireSocketId === socket.id) {
      match.umpireSocketId = null;
      await saveMatch(match);
      emitMatch(c, match);
    }
  });

  socket.on("match:setupTeams", async ({ code, battingTeam }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = await getMatch(c);
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
    await saveMatch(match);
    emitMatch(c, match);
  });

  socket.on("match:startInnings1", async ({ code }, ack) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = await getMatch(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      if (typeof ack === "function") ack({ ok: false, error: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      if (typeof ack === "function") ack({ ok: false, error: "Only umpire can control the match." });
      return;
    }
    const next = startFirstInnings(match);
    await saveMatch(next);
    emitMatch(c, next);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("match:startInnings2", async ({ code }, ack) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = await getMatch(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      if (typeof ack === "function") ack({ ok: false, error: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      if (typeof ack === "function") ack({ ok: false, error: "Only umpire can control the match." });
      return;
    }
    const next = startSecondInnings(match);
    if (next?.errors?.length) {
      socket.emit("match:error", { message: next.errors[0] || "Failed to start innings 2." });
      if (typeof ack === "function") ack({ ok: false, error: next.errors[0] || "Failed to start innings 2." });
      return;
    }
    await saveMatch(next);
    emitMatch(c, next);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("match:startSuperOver", async ({ code }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = await getMatch(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }
    const next = startSuperOver(match);
    await saveMatch(next);
    emitMatch(c, next);
  });

  socket.on("match:selectPlayers", async ({ code, strikerId, nonStrikerId, bowlerId }, ack) => {
    try {
      const c = String(code || socket.data.code || "").toUpperCase();
      const match = await getMatch(c);
      if (!match) {
        socket.emit("match:error", { message: "Match not found." });
        if (typeof ack === "function") ack({ ok: false, error: "Match not found." });
        return;
      }
      if (socket.data.role !== "umpire") {
        socket.emit("match:error", { message: "Only umpire can control the match." });
        if (typeof ack === "function") ack({ ok: false, error: "Only umpire can control the match." });
        return;
      }
      const s = strikerId ? String(strikerId).trim() : "";
      const n = nonStrikerId ? String(nonStrikerId).trim() : "";
      const b = bowlerId ? String(bowlerId).trim() : "";
      if (s && n && s === n) {
        socket.emit("match:error", { message: "Striker and non-striker cannot be the same player." });
        if (typeof ack === "function") ack({ ok: false, error: "Striker and non-striker cannot be the same player." });
        return;
      }
      if (!match.current || typeof match.current !== "object") {
        match.current = newInningsState();
      }
      if (b && !bowlerHasQuotaRemaining(match, b)) {
        const lim = match.settings?.bowlerMaxOvers;
        socket.emit("match:error", {
          message:
            Number.isFinite(Number(lim)) && Number(lim) > 0
              ? `That bowler has already bowled ${lim} overs (maximum for this match).`
              : "That bowler cannot bowl (quota reached).",
        });
        if (typeof ack === "function") ack({ ok: false, error: "Bowler over quota." });
        return;
      }
      match.current.strikerId = s || null;
      match.current.nonStrikerId = n || null;
      match.current.bowlerId = b || null;
      await saveMatch(match);
      emitMatch(c, match);
      if (typeof ack === "function") ack({ ok: true });
    } catch (e) {
      const msg = e?.message || "Failed to select players.";
      socket.emit("match:error", { message: msg });
      if (typeof ack === "function") ack({ ok: false, error: msg });
    }
  });

  socket.on("match:ball", async ({ code, action }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = await getMatch(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }
    const next = applyBallWithUndo(match, action || {});
    await saveMatch(next);
    emitMatch(c, next);
  });

  socket.on("match:undo", async ({ code }) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = await getMatch(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      return;
    }
    const next = undoLastBall(match);
    await saveMatch(next);
    emitMatch(c, next);
  });

  socket.on("match:toss", async ({ code, call, result, decision }, ack) => {
    const c = String(code || socket.data.code || "").toUpperCase();
    const match = await getMatch(c);
    if (!match) {
      socket.emit("match:error", { message: "Match not found." });
      if (typeof ack === "function") ack({ ok: false, error: "Match not found." });
      return;
    }
    if (socket.data.role !== "umpire") {
      socket.emit("match:error", { message: "Only umpire can control the match." });
      if (typeof ack === "function") ack({ ok: false, error: "Only umpire can control the match." });
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

    await saveMatch(match);
    emitMatch(c, match);
    if (typeof ack === "function") ack({ ok: true, winnerTeam, battingTeam: match.battingTeam, bowlingTeam: match.bowlingTeam });
  });
});

async function start() {
  try {
    await initMongo();
  } catch (e) {
    console.warn("Mongo init failed; using in-memory store.", e?.message || e);
  }

  server.once("error", (err) => {
    if (err?.code === "EADDRINUSE") {
      console.error(
        `[server] Port ${PORT} is already in use. Stop the other process (e.g. another nodemon tab) or set PORT in server/.env.`
      );
      process.exit(1);
      return;
    }
    console.error("[server] listen error:", err?.message || err);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`CORS origin: ${CLIENT_ORIGIN}`);
  });
}

start();

process.on("SIGINT", async () => {
  await closeMongo();
  process.exit(0);
});


