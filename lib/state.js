/**
 * Persists last-sync cursor in MongoDB.
 * Falls back to a sliding window if Mongo is not configured / unreachable.
 */
import { getStateCollection } from "./db.js";

const { SYNC_WINDOW_MINUTES = "5", MONGODB_URI } = process.env;
const KEY = "sync-jira-ado:lastSyncIso";

const mongoEnabled = Boolean(MONGODB_URI);

function fallbackIso() {
  const minutes = Number(SYNC_WINDOW_MINUTES);
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export async function getLastSyncIso() {
  if (mongoEnabled) {
    try {
      const col = await getStateCollection();
      const doc = await col.findOne({ _id: KEY });
      if (doc?.value) return doc.value;
    } catch (e) {
      console.warn(
        "[state] Mongo get failed, falling back to sliding window:",
        e.message,
      );
    }
  }
  return fallbackIso();
}

export async function setLastSyncIso(iso) {
  if (!mongoEnabled) return;
  try {
    const col = await getStateCollection();
    await col.updateOne(
      { _id: KEY },
      { $set: { value: iso, updatedAt: new Date() } },
      { upsert: true },
    );
  } catch (e) {
    console.warn("[state] Mongo set failed:", e.message);
  }
}
