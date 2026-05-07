function normalizeKey(key) {
  return String(key || "").toUpperCase();
}

function createKeyedLock() {
  const queues = new Map();

  function withLock(key, task) {
    const k = normalizeKey(key);
    const previous = queues.get(k) || Promise.resolve();

    let current;
    current = previous
      .catch(() => {
        // Keep the queue moving even if the previous task failed.
      })
      .then(task)
      .finally(() => {
        if (queues.get(k) === current) queues.delete(k);
      });

    queues.set(k, current);
    return current;
  }

  withLock.pendingCount = () => queues.size;

  return withLock;
}

const withMatchLock = createKeyedLock();

module.exports = {
  createKeyedLock,
  withMatchLock,
};
