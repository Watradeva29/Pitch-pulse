const { MongoClient } = require("mongodb");
const fsp = require("fs/promises");
const path = require("path");
const {
  ensureDataCollection,
  ensureDataCollectionBootstrap,
  upsertMatchSummary,
  listRecentMatchSummaries,
  BOOTSTRAP_ID,
} = require("./data");

let _client = null;
let _db = null;
let _col = null;

function isMongoConfigured() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  return !!uri;
}

async function bestEffortMatchSummary(match) {
  if (!_db || !match) return;
  try {
    await upsertMatchSummary(_db, match);
  } catch (e) {
    console.warn("[mongo] match summary upsert failed:", e?.message || e);
  }
}

async function initMongo() {
  if (!isMongoConfigured()) return null;
  if (_col) return _col;

  const uri = String(process.env.MONGODB_URI || "").trim();
  const dbName = String(process.env.MONGODB_DB || "pitchpulse").trim() || "pitchpulse";

  _client = new MongoClient(uri);
  await _client.connect();
  _db = _client.db(dbName);
  _col = _db.collection("matches");

  await _col.createIndex({ matchId: 1 }, { unique: true });
  await _col.createIndex({ createdAt: -1 });

  await ensureDataCollection(_db);
  await ensureDataCollectionBootstrap(_db, uri, dbName);

  const host = (() => {
    const s = String(uri);
    const m = s.match(/^mongodb\+srv:\/\/([^/?]+)/i) || s.match(/^mongodb:\/\/(?:[^@]+@)?([^/?:]+)/i);
    return m ? m[1] : "mongo";
  })();
  console.log(`[mongo] connected db="${dbName}" host="${host}"`);
  console.log(`[mongo] collection "data" bootstrap document ready`);

  return _col;
}

/** For /api/health — call after initMongo or standalone. */
async function getMongoDiagnostics() {
  if (!isMongoConfigured()) {
    return { configured: false, connected: false, mode: "file_or_memory_fallback" };
  }
  try {
    await initMongo();
    const names = (await _db.listCollections().toArray())
      .map((x) => x.name)
      .sort();
    const dataDoc = await _db.collection("data").findOne({ _id: BOOTSTRAP_ID });
    let dataMatchCount = 0;
    try {
      dataMatchCount = await _db.collection("data").countDocuments({ kind: "match_summary" });
    } catch {
      // ignore
    }
    return {
      configured: true,
      connected: true,
      database: _db.databaseName,
      collections: names,
      dataCollectionInitialized: !!dataDoc,
      dataMatchCount,
    };
  } catch (e) {
    return { configured: true, connected: false, error: e?.message || String(e) };
  }
}

async function closeMongo() {
  try {
    await _client?.close?.();
  } finally {
    _client = null;
    _db = null;
    _col = null;
  }
}

/** Recent match-summary rows from `data` (empty if Mongo not connected). */
async function listRecentMatchSummariesForApi(limit) {
  const col = await initMongo();
  if (!col || !_db) return [];
  return listRecentMatchSummaries(_db, limit);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// In-memory fallback (kept for local dev without Mongo configured)
const mem = new Map();

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "matches.json");

async function ensureDataDir() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

async function loadFromDiskOnce() {
  // Only used when Mongo is not configured.
  if (mem.size) return;
  try {
    const raw = await fsp.readFile(FILE_PATH, "utf8");
    const json = JSON.parse(raw || "{}");
    if (json && typeof json === "object") {
      for (const [k, v] of Object.entries(json)) {
        if (k && v) mem.set(String(k).toUpperCase(), v);
      }
    }
  } catch {
    // ignore missing/corrupt file
  }
}

async function flushToDisk() {
  // Only used when Mongo is not configured.
  await ensureDataDir();
  const obj = Object.fromEntries(mem.entries());
  const tmp = `${FILE_PATH}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await fsp.rename(tmp, FILE_PATH);
}

async function createMatch(match) {
  const m = clone(match);
  const code = String(m.matchId || "").toUpperCase();
  if (!code) throw new Error("Missing matchId.");

  const col = await initMongo();
  if (!col) {
    await loadFromDiskOnce();
    mem.set(code, m);
    await flushToDisk();
    return m;
  }

  await col.insertOne({ ...m, matchId: code, _id: code });
  await bestEffortMatchSummary(m);
  return m;
}

async function getMatch(code) {
  const c = String(code || "").toUpperCase();
  if (!c) return null;

  const col = await initMongo();
  if (!col) {
    await loadFromDiskOnce();
    return mem.get(c) || null;
  }

  const doc = await col.findOne({ _id: c });
  if (!doc) return null;
  // strip mongo fields
  const { _id, ...rest } = doc;
  return rest;
}

async function saveMatch(match) {
  const m = clone(match);
  const code = String(m.matchId || "").toUpperCase();
  if (!code) throw new Error("Missing matchId.");

  const col = await initMongo();
  if (!col) {
    await loadFromDiskOnce();
    mem.set(code, m);
    await flushToDisk();
    return m;
  }

  await col.updateOne(
    { _id: code },
    { $set: { ...m, matchId: code, _id: code } },
    { upsert: true }
  );
  await bestEffortMatchSummary(m);
  return m;
}

async function hasMatch(code) {
  const c = String(code || "").toUpperCase();
  if (!c) return false;

  const col = await initMongo();
  if (!col) {
    await loadFromDiskOnce();
    return mem.has(c);
  }

  const doc = await col.findOne({ _id: c }, { projection: { _id: 1 } });
  return !!doc;
}

module.exports = {
  isMongoConfigured,
  initMongo,
  closeMongo,
  getMongoDiagnostics,
  createMatch,
  getMatch,
  saveMatch,
  hasMatch,
  listRecentMatchSummariesForApi,
};
