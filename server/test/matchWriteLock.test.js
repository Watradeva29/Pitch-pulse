const assert = require("node:assert/strict");
const test = require("node:test");

const { withMatchWriteLock } = require("../src/store/matches");

test("serializes writes for the same match code", async () => {
  const events = [];
  let releaseFirst;

  const first = withMatchWriteLock("abc123", async () => {
    events.push("first:start");
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
    events.push("first:end");
    return "first";
  });

  const second = withMatchWriteLock("ABC123", async () => {
    events.push("second:start");
    return "second";
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["first:start"]);

  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
});

test("continues the queue after a failed write", async () => {
  await assert.rejects(
    withMatchWriteLock("FAIL01", async () => {
      throw new Error("boom");
    }),
    /boom/
  );

  const value = await withMatchWriteLock("FAIL01", async () => "recovered");
  assert.equal(value, "recovered");
});
