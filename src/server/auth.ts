import crypto from "node:crypto";
import { cookies } from "next/headers";
import { q, q1 } from "@/db";
import { AppError } from "./errors";

export const SESSION_COOKIE = "kv_session";
const SESSION_DAYS = 30;

export type CurrentUser = {
  id: string; handle: string; displayName: string; isDemo: boolean; timezone: string;
  reducedMotion: boolean; renderMode: "auto" | "3d" | "2d"; onboardedAt: string | null;
  lastConversationId: string | null; lastPlantId: string | null;
};

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, s, h] = stored.split("$");
  if (alg !== "scrypt" || !s || !h) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(s, "base64"), 32);
  const expected = Buffer.from(h, "base64");
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await q(
    "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))",
    [userId, sha256(token), SESSION_DAYS],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400, secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIE !== "1" });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) await q("UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1", [sha256(t)]);
  jar.delete(SESSION_COOKIE);
}

const USER_COLS = `u.id, u.handle, u.display_name AS "displayName", u.is_demo AS "isDemo", u.timezone,
  u.reduced_motion AS "reducedMotion", u.render_mode AS "renderMode", u.onboarded_at AS "onboardedAt",
  u.last_conversation_id AS "lastConversationId", u.last_plant_id AS "lastPlantId"`;

export async function userFromToken(token: string | undefined): Promise<CurrentUser | null> {
  if (!token) return null;
  return q1<CurrentUser>(
    `SELECT ${USER_COLS} FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [sha256(token)],
  );
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AppError("unauthenticated", "请先登录", 401);
  return u;
}

export async function getUserById(id: string) {
  return q1<CurrentUser>(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [id]);
}

export async function registerUser(handle: string, displayName: string, password: string) {
  const h = handle.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,32}$/.test(h)) throw new AppError("bad_handle", "登录名需为 3–32 位小写字母、数字或 _ . -");
  if (password.length < 6) throw new AppError("weak_password", "密码至少 6 位");
  const exists = await q1("SELECT 1 FROM users WHERE handle = $1", [h]);
  if (exists) throw new AppError("handle_taken", "这个登录名已被使用");
  const row = await q1<{ id: string }>(
    "INSERT INTO users (handle, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id",
    [h, displayName.trim() || h, hashPassword(password)],
  );
  return row!.id;
}

export async function loginUser(handle: string, password: string) {
  const row = await q1<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE handle = $1", [handle.trim().toLowerCase()]);
  if (!row || !verifyPassword(password, row.password_hash)) throw new AppError("bad_credentials", "登录名或密码不正确", 401);
  return row.id;
}
