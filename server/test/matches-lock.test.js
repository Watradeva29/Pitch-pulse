const test = require("node:test");
const assert = require("node:assert/strict");

const { withMatchWriteLock } = require("../src/store/matches");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("withMatchWriteLock serializes concurrent writes for the same match", async () => {
  const seen = [];
  const persisted = { runs: 0 };

  async function scoreRun(label) {
    return withMatchWriteLock("abc123", async () => {
      const snapshotRuns = persisted.runs;
      seen.push(`${label}:read:${snapshotRuns}`);
      await delay(label === "first" ? 20 : 0);
      persisted.runs = snapshotRuns + 1;
      seen.push(`${label}:write:${persisted.runs}`);
      return persisted.runs;
    });
  }

  const [first, second] = await Promise.all([scoreRun("first"), scoreRun("second")]);

  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(persisted.runs, 2);
  assert.deepEqual(seen, ["first:read:0", "first:write:1", "second:read:1", "second:write:2"]);
});
