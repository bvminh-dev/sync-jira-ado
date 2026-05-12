/**
 * Persists last-sync cursor in Vercel KV (Upstash Redis REST).
 * Falls back to a sliding window if KV is not configured.
 */
import axios from "axios";

const {
  KV_REST_API_URL,
  KV_REST_API_TOKEN,
  SYNC_WINDOW_MINUTES = "5",
} = process.env;
const KEY = "sync-jira-ado:lastSyncIso";

const kvEnabled = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);

const kv = kvEnabled
  ? axios.create({
      baseURL: KV_REST_API_URL,
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
      timeout: 10_000,
    })
  : null;

export async function getLastSyncIso() {
  if (kv) {
    try {
      const { data } = await kv.get(`/get/${KEY}`);
      if (data?.result) return data.result;
    } catch (e) {
      console.warn("KV get failed, falling back to sliding window:", e.message);
    }
  }
  const minutes = Number(SYNC_WINDOW_MINUTES);
  return new Date(Date.now() - minutes * 10000 * 60_000).toISOString();
}

export async function setLastSyncIso(iso) {
  if (!kv) return;
  try {
    await kv.post(`/set/${KEY}/${encodeURIComponent(iso)}`);
  } catch (e) {
    console.warn("KV set failed:", e.message);
  }
}
