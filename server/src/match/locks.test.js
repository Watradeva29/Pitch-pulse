const assert = require("node:assert/strict");
const test = require("node:test");

const { createKeyedLock } = require("./locks");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("serializes overlapping work for the same key", async () => {
  const withLock = createKeyedLock();
  let value = 0;

  await Promise.all([
    withLock("abc123", async () => {
      const snapshot = value;
      await delay(10);
      value = snapshot + 1;
    }),
    withLock("ABC123", async () => {
      const snapshot = value;
      await delay(1);
      value = snapshot + 1;
    }),
  ]);

  assert.equal(value, 2);
  assert.equal(withLock.pendingCount(), 0);
});

test("continues the queue after a failed task", async () => {
  const withLock = createKeyedLock();
  const events = [];

  await assert.rejects(
    withLock("match", async () => {
      events.push("first");
      throw new Error("boom");
    }),
    /boom/
  );

  await withLock("match", async () => {
    events.push("second");
  });

  assert.deepEqual(events, ["first", "second"]);
  assert.equal(withLock.pendingCount(), 0);
});
