const test = require("node:test");
const assert = require("node:assert/strict");

const { isUmpireForMatch } = require("./auth");

test("isUmpireForMatch rejects an umpire socket bound to another match", () => {
  const socket = {
    id: "socket-1",
    data: { role: "umpire", code: "MATCH1" },
  };
  const otherMatch = { matchId: "MATCH2", umpireSocketId: "socket-1" };

  assert.equal(isUmpireForMatch(socket, "MATCH2", otherMatch), false);
});

test("isUmpireForMatch rejects stale umpire sockets when another socket holds the lock", () => {
  const socket = {
    id: "socket-1",
    data: { role: "umpire", code: "MATCH1" },
  };
  const match = { matchId: "MATCH1", umpireSocketId: "socket-2" };

  assert.equal(isUmpireForMatch(socket, "MATCH1", match), false);
});

test("isUmpireForMatch accepts the bound active umpire socket", () => {
  const socket = {
    id: "socket-1",
    data: { role: "umpire", code: "MATCH1" },
  };
  const match = { matchId: "MATCH1", umpireSocketId: "socket-1" };

  assert.equal(isUmpireForMatch(socket, "match1", match), true);
});
