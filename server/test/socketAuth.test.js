const assert = require("node:assert/strict");
const test = require("node:test");

const { authorizeUmpireForJoinedMatch } = require("../src/socketAuth");

test("allows an umpire to control the match joined on this socket", () => {
  const socket = { data: { role: "umpire", code: "ABC123" } };

  assert.deepEqual(authorizeUmpireForJoinedMatch(socket, "abc123"), {
    ok: true,
    code: "ABC123",
  });
});

test("uses the joined match when no event code is provided", () => {
  const socket = { data: { role: "umpire", code: "ABC123" } };

  assert.deepEqual(authorizeUmpireForJoinedMatch(socket), {
    ok: true,
    code: "ABC123",
  });
});

test("rejects an umpire event for a different match code", () => {
  const socket = { data: { role: "umpire", code: "ABC123" } };

  assert.deepEqual(authorizeUmpireForJoinedMatch(socket, "OTHER1"), {
    ok: false,
    error: "Umpire is not authorized for that match.",
  });
});

test("rejects spectators even when they provide a match code", () => {
  const socket = { data: { role: "spectator", code: "ABC123" } };

  assert.deepEqual(authorizeUmpireForJoinedMatch(socket, "ABC123"), {
    ok: false,
    error: "Only umpire can control the match.",
  });
});
