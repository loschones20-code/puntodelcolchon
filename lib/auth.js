import crypto from "node:crypto";

const COOKIE = "pdc_admin";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET no está configurada");
  return s;
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function checkPassword(pw) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || typeof pw !== "string") return false;
  const a = crypto.createHash("sha256").update(pw).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `admin.${exp}`;
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function isAdmin(req) {
  const raw = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(COOKIE + "="));
  if (!raw) return false;
  const value = raw.slice(COOKIE.length + 1);
  const i = value.lastIndexOf(".");
  if (i < 0) return false;
  const payload = value.slice(0, i), mac = value.slice(i + 1);
  let good;
  try { good = sign(payload); } catch { return false; }
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return false;
  const exp = Number(payload.split(".")[1]);
  return Number.isFinite(exp) && exp > Date.now() / 1000;
}
