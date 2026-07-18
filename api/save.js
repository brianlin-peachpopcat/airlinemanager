const { ipKey, kvConfigured, kvSet } = require("./_store");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }

  if (!kvConfigured()) {
    res.setHeader("x-sky-cloud", "off");
    res.status(200).json({ ok: true, cloud: false, note: "KV not configured — local saves only" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const state = body.state;
    if (!state || typeof state !== "object") {
      res.status(400).json({ ok: false, error: "missing state" });
      return;
    }
    // Soft size guard (~1.5MB JSON)
    const raw = JSON.stringify(state);
    if (raw.length > 1.5e6) {
      res.status(413).json({ ok: false, error: "save too large" });
      return;
    }
    state.lastSeen = Date.now();
    const key = ipKey(req);
    await kvSet(key, state);
    res.status(200).json({ ok: true, cloud: true, keyHint: key.slice(-8) });
  } catch (err) {
    console.error("save failed", err);
    res.status(500).json({ ok: false, cloud: true, error: "save failed" });
  }
};
