export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export const str = (v, max = 200) => String(v ?? "").slice(0, max).trim();
export const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
