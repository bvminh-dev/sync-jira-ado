import { runSync } from "../lib/sync.js";

export default async function handler(req, res) {
  // Vercel cron sends GET with `Authorization: Bearer $CRON_SECRET`.
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers["authorization"];
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const result = await runSync();
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error("[api/sync] failed:", e.response?.data || e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
