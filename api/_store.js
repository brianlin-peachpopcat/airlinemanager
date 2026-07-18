// Shared cloud store for Vercel serverless (Upstash Redis REST / Vercel KV).
// Without KV_REST_API_URL + KV_REST_API_TOKEN, cloud sync is disabled.

const crypto = require("crypto");

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length) return real.trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function ipKey(req) {
  const ip = clientIp(req);
  const hash = crypto.createHash("sha256").update(ip + "|skytycoon").digest("hex").slice(0, 32);
  return `skytycoon:save:${hash}`;
}

function kvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvGet(key) {
  if (!kvConfigured()) return { cloud: false, value: null };
  const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  if (!res.ok) throw new Error(`KV get ${res.status}`);
  const data = await res.json();
  // Upstash returns { result: "..." } — result may already be parsed JSON
  let value = data.result;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch (_) {}
  }
  return { cloud: true, value };
}

async function kvSet(key, value) {
  if (!kvConfigured()) return { cloud: false, ok: false };
  const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`KV set ${res.status}`);
  return { cloud: true, ok: true };
}

module.exports = { clientIp, ipKey, kvConfigured, kvGet, kvSet };
