# Pitch Pulse server

Node.js + Express + Socket.IO. Loads env from `server/.env` (see `.env.example`).

## Local Mongo (`pitchpulse` DB)

1. Start MongoDB (e.g. `docker compose up -d mongo` from repo root).
2. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` / `MONGODB_DB=pitchpulse`.
3. Run: `npm run dev` from this folder (or `.\scripts\run-server.ps1` from repo root).

On startup the server ensures the `data` collection exists and upserts a bootstrap document (`_id: __pitchpulse_app__`). Match state lives in `match_summary` rows in `data` (index) and full documents in `matches`.

## Verification

With Mongo running and `server/.env` configured:

```bash
curl http://localhost:3001/api/health
```

Expect `mongo.connected: true`, `mongo.database: "pitchpulse"`, `collections` including `data` and `matches`, `dataCollectionInitialized: true`.

Create and fetch a match:

```bash
curl -X POST http://localhost:3001/api/matches -H "Content-Type: application/json" -d "{\"teamAName\":\"A\",\"teamBName\":\"B\",\"overs\":2}"
curl http://localhost:3001/api/matches/REPLACE_WITH_CODE
```

Recent summaries from `data`:

```bash
curl "http://localhost:3001/api/data/matches?limit=5"
```

Mongo shell / Compass: connect to `mongodb://localhost:27017`, database `pitchpulse`, collections `data` and `matches`. In `data`, expect `__pitchpulse_app__` and `match:<CODE>` documents.
