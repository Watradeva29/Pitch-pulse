function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function newMatchState({
  matchId,
  teamAName,
  teamBName,
  teamAColor,
  teamBColor,
  teamAPlayers,
  teamBPlayers,
  playersPerTeam,
  maxOvers,
  joker,
  rules,
}) {
  return {
    matchId,
    createdAt: Date.now(),
    status: "setup", // setup | live | tie | completed
    result: null, // { type: "win"|"tie", winnerTeam?: "A"|"B", byRuns?: number, byWickets?: number, note?: string }
    superOver: { active: false, base: null },
    teams: {
      A: { name: teamAName, color: teamAColor || "#60A5FA", players: teamAPlayers },
      B: { name: teamBName, color: teamBColor || "#F59E0B", players: teamBPlayers },
    },
    settings: {
      playersPerTeam,
      maxOvers,
      superOver: { maxOvers: 1, maxWickets: 2 },
      joker: joker?.enabled
        ? {
            enabled: true,
            mode: joker.mode || "bothTeams", // bothTeams | oneTeamExtraWicket
            team: joker.team || null, // "A" | "B" | null
            playerId: joker.playerId,
            name: joker.name,
          }
        : { enabled: false, mode: "off", team: null, playerId: null, name: null },
      rules: {
        wide: { extraRun: true, extraBall: true, ...(rules?.wide || {}) },
        noBall: {
          extraRun: true,
          extraBall: true,
          freeHit: true,
          ...(rules?.noBall || {}),
        },
      },
    },
    toss: {
      winner: null, // "A" | "B"
      decision: null, // "bat" | "bowl"
      overridden: false,
    },
    innings: 1, // 1 or 2
    battingTeam: null, // "A" | "B"
    bowlingTeam: null, // "A" | "B"
    target: null,
    current: newInningsState(),
    previous: null,
    lastBall: null,
    undo: { available: false, snapshot: null },
    errors: [],
  };
}

function newInningsState() {
  return {
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    overs: 0,
    ballInOver: 0, // 0-5 for legal balls
    strikerId: null,
    nonStrikerId: null,
    bowlerId: null,
    lastOverBowlerId: null, // bowler who completed the most recent over
    freeHit: false,
    batting: {}, // playerId -> stats
    bowling: {}, // playerId -> stats
    fallOfWickets: [],
    deliveries: [],
    completed: false,
  };
}

function ensureBattingPlayer(inn, playerId) {
  if (!inn.batting[playerId]) {
    inn.batting[playerId] = {
      playerId,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
      howOut: null,
    };
  }
  return inn.batting[playerId];
}

function ensureBowlingPlayer(inn, playerId) {
  if (!inn.bowling[playerId]) {
    inn.bowling[playerId] = {
      playerId,
      runsConceded: 0,
      legalBalls: 0,
      overs: 0,
      wickets: 0,
      wides: 0,
      noBalls: 0,
    };
  }
  return inn.bowling[playerId];
}

function recalcOverFields(inn) {
  inn.overs = Math.floor(inn.legalBalls / 6);
  inn.ballInOver = inn.legalBalls % 6;
}

function rotateStrike(inn) {
  const tmp = inn.strikerId;
  inn.strikerId = inn.nonStrikerId;
  inn.nonStrikerId = tmp;
}

function isOverComplete(inn) {
  return inn.legalBalls > 0 && inn.legalBalls % 6 === 0;
}

function computeMaxWickets(match) {
  if (match?.superOver?.active) {
    return Math.max(0, Number(match.settings?.superOver?.maxWickets ?? 2));
  }
  // wickets possible = players per team - 1 (+ extra wicket rule)
  let max = Math.max(0, (match.settings.playersPerTeam || 11) - 1);
  const jk = match?.settings?.joker;
  if (jk?.enabled && jk.mode === "oneTeamExtraWicket" && (jk.team === "A" || jk.team === "B")) {
    const other = jk.team === "A" ? "B" : "A";
    // "other team gets an extra wicket" → when other team is batting, allow one additional dismissal
    if (match.battingTeam === other) max += 1;
  }
  return max;
}

function computeMaxLegalBalls(match) {
  const overs = match?.superOver?.active ? match.settings?.superOver?.maxOvers : match.settings?.maxOvers;
  return Math.max(0, Number(overs || 0) * 6);
}

function finalizeResult(next) {
  const inn1 = next.previous;
  const inn2 = next.current;
  if (!inn1 || !inn2) return next;

  if (Number(inn2.runs || 0) > Number(inn1.runs || 0)) {
    const winnerTeam = next.battingTeam; // chasing team (innings 2 batting)
    const maxWickets = computeMaxWickets(next);
    const wktsLost = Number(inn2.wickets || 0);
    next.result = {
      type: "win",
      winnerTeam,
      byWickets: Math.max(0, maxWickets - wktsLost),
      note: next.superOver?.active ? "Super Over" : undefined,
    };
    next.status = "completed";
    return next;
  }

  if (Number(inn2.runs || 0) < Number(inn1.runs || 0)) {
    const winnerTeam = next.bowlingTeam; // defending team (innings 2 bowling)
    next.result = {
      type: "win",
      winnerTeam,
      byRuns: Math.max(0, Number(inn1.runs || 0) - Number(inn2.runs || 0)),
      note: next.superOver?.active ? "Super Over" : undefined,
    };
    next.status = "completed";
    return next;
  }

  next.result = { type: "tie", note: next.superOver?.active ? "Super Over" : undefined };
  next.status = next.superOver?.active ? "completed" : "tie";
  return next;
}

function requiredInfo(match) {
  if (!match.battingTeam || !match.bowlingTeam) return "Pick batting/bowling teams.";
  const inn = match.current;
  if (!inn.strikerId || !inn.nonStrikerId) return "Pick opening batsmen.";
  if (!inn.bowlerId) return "Pick bowler.";
  return null;
}

function applyBall(match, action) {
  const next = clone(match);
  next.errors = [];

  if (next.status === "setup") next.status = "live";
  if (next.status !== "live") {
    next.errors.push("Match is not live.");
    return next;
  }
  if (next.current.completed) {
    next.errors.push("Innings already completed.");
    return next;
  }

  const missing = requiredInfo(next);
  if (missing) {
    next.errors.push(missing);
    return next;
  }

  const inn = next.current;
  const rules = next.settings.rules;

  const striker = ensureBattingPlayer(inn, inn.strikerId);
  ensureBattingPlayer(inn, inn.nonStrikerId);
  const bowler = ensureBowlingPlayer(inn, inn.bowlerId);

  const record = {
    t: Date.now(),
    innings: next.innings,
    kind: action.kind,
    runs: action.runs ?? 0,
    strikerId: inn.strikerId,
    nonStrikerId: inn.nonStrikerId,
    bowlerId: inn.bowlerId,
    legal: true,
    extras: { wide: 0, noBall: 0 },
    wicket: null,
    freeHit: inn.freeHit,
    over: Math.floor(inn.legalBalls / 6),
    ballInOver: inn.legalBalls % 6,
  };

  if (action.kind === "run") {
    const r = Math.max(0, Math.min(6, Number(action.runs || 0)));
    inn.runs += r;
    striker.runs += r;
    striker.balls += 1;
    bowler.runsConceded += r;
    if (r === 4) striker.fours += 1;
    if (r === 6) striker.sixes += 1;

    inn.legalBalls += 1;
    bowler.legalBalls += 1;

    if (r === 1 || r === 3) rotateStrike(inn);
  } else if (action.kind === "wide") {
    inn.runs += 1;
    bowler.runsConceded += 1;
    bowler.wides += 1;
    record.legal = !rules.wide.extraBall;
    record.extras.wide = 1;
    if (!rules.wide.extraBall) {
      inn.legalBalls += 1;
      bowler.legalBalls += 1;
    }
  } else if (action.kind === "noBall") {
    inn.runs += 1;
    bowler.runsConceded += 1;
    bowler.noBalls += 1;
    record.legal = !rules.noBall.extraBall;
    record.extras.noBall = 1;
    if (rules.noBall.freeHit) inn.freeHit = true;
    if (!rules.noBall.extraBall) {
      inn.legalBalls += 1;
      bowler.legalBalls += 1;
    }
  } else if (action.kind === "wicket") {
    // On free hit, wicket only allowed for run out (we'll keep simple: block wicket when freeHit true)
    if (inn.freeHit) {
      next.errors.push("Free hit: wicket not allowed (simplified).");
      return next;
    }
    const outPlayerId = action.outPlayerId || inn.strikerId;
    const isStrikerOut = outPlayerId === inn.strikerId;
    const isNonStrikerOut = outPlayerId === inn.nonStrikerId;
    if (!isStrikerOut && !isNonStrikerOut) {
      next.errors.push("Wicket must be striker or non-striker.");
      return next;
    }
    inn.wickets += 1;
    bowler.wickets += 1;
    striker.balls += 1;

    const outStats = ensureBattingPlayer(inn, outPlayerId);
    outStats.out = true;
    outStats.howOut = action.howOut || "W";
    record.wicket = { outPlayerId, howOut: outStats.howOut };

    // Replace dismissed batter with next batter if provided
    const nextBatterId = action.nextBatterId || null;
    if (nextBatterId) {
      ensureBattingPlayer(inn, nextBatterId);
      if (isStrikerOut) inn.strikerId = nextBatterId;
      if (isNonStrikerOut) inn.nonStrikerId = nextBatterId;
    }

    inn.legalBalls += 1;
    bowler.legalBalls += 1;
  } else {
    next.errors.push("Unknown action.");
    return next;
  }

  // Free hit only applies for the next legal delivery; if this was a legal ball, clear it.
  const consumedFreeHit = inn.freeHit && record.kind !== "noBall" && record.legal === true;
  if (consumedFreeHit) inn.freeHit = false;

  recalcOverFields(inn);
  bowler.overs = Math.floor(bowler.legalBalls / 6) + (bowler.legalBalls % 6) / 10;

  // End of over strike rotation (after legal ball 6)
  if (record.legal && isOverComplete(inn)) {
    rotateStrike(inn);
    // Force bowler selection for the next over.
    inn.lastOverBowlerId = record.bowlerId || inn.bowlerId || inn.lastOverBowlerId || null;
    inn.bowlerId = null;
  }

  // append delivery record
  if (!Array.isArray(inn.deliveries)) inn.deliveries = [];
  inn.deliveries.push(record);

  next.lastBall = record;

  // Check innings completion
  const maxWkts = computeMaxWickets(next);
  const maxBalls = computeMaxLegalBalls(next);
  const allOut = inn.wickets >= maxWkts;
  const oversDone = inn.legalBalls >= maxBalls;
  const chaseDone = next.innings === 2 && next.target != null && inn.runs >= next.target;

  if (allOut || oversDone || chaseDone) {
    inn.completed = true;
    if (next.innings === 1) {
      next.target = inn.runs + 1;
    } else {
      finalizeResult(next);
    }
  }

  return next;
}

function stripUndo(match) {
  const m = clone(match);
  m.undo = { available: false, snapshot: null };
  m.errors = [];
  return m;
}

function applyBallWithUndo(match, action) {
  const snapshot = stripUndo(match);
  const next = applyBall(match, action);
  if (next?.errors?.length) return next;
  next.undo = { available: true, snapshot };
  return next;
}

function undoLastBall(match) {
  const next = clone(match);
  next.errors = [];
  if (!next.undo || !next.undo.available || !next.undo.snapshot) {
    next.errors.push("Nothing to undo.");
    return next;
  }
  const restored = clone(next.undo.snapshot);
  restored.errors = [];
  restored.undo = { available: false, snapshot: null }; // single-step only
  return restored;
}

function canStartInnings(match) {
  return !!match.battingTeam && !!match.bowlingTeam;
}

function startFirstInnings(match) {
  const next = clone(match);
  next.errors = [];
  if (!canStartInnings(next)) {
    next.errors.push("Set batting/bowling teams first.");
    return next;
  }
  next.innings = 1;
  next.status = "live";
  next.result = null;
  next.target = null;
  next.previous = null;
  next.current = newInningsState();
  return next;
}

function startSecondInnings(match) {
  const next = clone(match);
  next.errors = [];
  if (next.innings !== 1 || !next.current.completed) {
    next.errors.push("First innings not complete yet.");
    return next;
  }
  next.previous = next.current;
  next.innings = 2;
  next.current = newInningsState();
  // swap teams
  const bt = next.battingTeam;
  next.battingTeam = next.bowlingTeam;
  next.bowlingTeam = bt;
  next.status = "live";
  return next;
}

function startSuperOver(match) {
  const next = clone(match);
  next.errors = [];
  if (next.status !== "tie") {
    next.errors.push("Super Over is only available after a tie.");
    return next;
  }
  if (!next.previous || !next.current || !next.current.completed) {
    next.errors.push("Match must be completed (tied) to start Super Over.");
    return next;
  }

  const chasingTeamInMain = next.battingTeam;
  next.superOver = {
    active: true,
    base: {
      innings1: next.previous,
      innings2: next.current,
      target: next.target,
      mainResult: next.result,
    },
  };

  next.result = null;
  next.status = "live";
  next.innings = 1;
  next.previous = null;
  next.target = null;
  next.battingTeam = chasingTeamInMain;
  next.bowlingTeam = chasingTeamInMain === "A" ? "B" : "A";
  next.current = newInningsState();
  next.lastBall = null;
  next.undo = { available: false, snapshot: null };
  return next;
}

function computeChase(match) {
  if (match.innings !== 2 || match.target == null) return null;
  const inn = match.current;
  const ballsLeft = Math.max(0, computeMaxLegalBalls(match) - inn.legalBalls);
  const runsNeeded = Math.max(0, match.target - inn.runs);
  const rrr = ballsLeft === 0 ? null : (runsNeeded * 6) / ballsLeft;
  return { ballsLeft, runsNeeded, requiredRunRate: rrr };
}

module.exports = {
  newMatchState,
  applyBallWithUndo,
  undoLastBall,
  startFirstInnings,
  startSecondInnings,
  startSuperOver,
  computeChase,
  newInningsState,
};
