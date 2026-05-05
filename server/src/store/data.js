/**
 * `data` collection: bootstrap metadata + lightweight match-summary index.
 * Canonical match state remains in `matches`.
 */

const BOOTSTRAP_ID = "__pitchpulse_app__";

function redactMongoUri(u) {
  return String(u || "").replace(/(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/i, "$1$2:***@");
}

/** Ensure physical `data` collection exists (idempotent). */
async function ensureDataCollection(db) {
  const existing = await db.listCollections({ name: "data" }).toArray();
  if (existing.length === 0) {
    await db.createCollection("data");
  }
}

/**
 * Idempotent bootstrap document (safe on every startup / nodemon restart).
 */
async function ensureDataCollectionBootstrap(db, uri, dbName) {
  const dataCol = db.collection("data");
  const now = new Date();
  await dataCol.updateOne(
    { _id: BOOTSTRAP_ID },
    {
      $set: {
        kind: "bootstrap",
        schemaVersion: 1,
        app: "pitch-pulse",
        purpose: "server_bootstrap",
        dbName,
        mongodbUriRedacted: redactMongoUri(uri),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
}

function deriveSummaryStatus(match) {
  const s = String(match?.status || "setup");
  if (s === "setup") return "created";
  if (s === "live") return "live";
  if (s === "tie" || s === "completed") return "finished";
  return "live";
}

/**
 * Best-effort index row for history / listing. Must not throw to callers.
 */
async function upsertMatchSummary(db, match) {
  const code = String(match?.matchId || "").toUpperCase();
  if (!code) return;

  const teamAName = match?.teams?.A?.name ?? "Team A";
  const teamBName = match?.teams?.B?.name ?? "Team B";
  const maxOvers = match?.settings?.maxOvers ?? null;
  const summaryStatus = deriveSummaryStatus(match);
  const now = new Date();
  const createdMs = Number(match?.createdAt) || Date.now();

  const dataCol = db.collection("data");
  await dataCol.updateOne(
    { _id: `match:${code}` },
    {
      $set: {
        kind: "match_summary",
        schemaVersion: 1,
        code,
        teamAName,
        teamBName,
        maxOvers,
        status: summaryStatus,
        matchStatus: match?.status ?? null,
        result: match?.result ?? null,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: new Date(createdMs),
      },
    },
    { upsert: true }
  );
}

async function listRecentMatchSummaries(db, limit) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const cursor = db
    .collection("data")
    .find({ kind: "match_summary" })
    .sort({ updatedAt: -1 })
    .limit(lim);
  return cursor.toArray();
}

module.exports = {
  BOOTSTRAP_ID,
  redactMongoUri,
  ensureDataCollection,
  ensureDataCollectionBootstrap,
  upsertMatchSummary,
  listRecentMatchSummaries,
};
