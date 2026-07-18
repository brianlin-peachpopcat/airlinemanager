const { ipKey, kvConfigured, kvGet } = require("./_store");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "GET only" });
    return;
  }

  if (!kvConfigured()) {
    res.setHeader("x-sky-cloud", "off");
    res.status(204).end();
    return;
  }

  try {
    const key = ipKey(req);
    const { value } = await kvGet(key);
    if (!value) {
      res.status(204).end();
      return;
    }
    res.status(200).json({ ok: true, cloud: true, state: value });
  } catch (err) {
    console.error("load failed", err);
    res.status(500).json({ ok: false, error: "load failed" });
  }
};
