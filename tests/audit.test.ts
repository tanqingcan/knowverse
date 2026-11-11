/**
 * 审计表（A4）
 *
 * 验证：
 *   - 触发器记录 sharing_preferences / class_members / learning_evidence 的变更；
 *   - actor 取自 app.user_id，能追溯到具体用户；
 *   - 按月分区：范围查询只扫描目标分区，超出范围的数据落 DEFAULT 分区；
 *   - audit_log 自身有 RLS：应用角色只能看到自己的操作记录。
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { q, q1, withTx } from "@/db";
import { createClass, joinClass, setSharing } from "@/server/classes";
import { addEvidence } from "@/server/growth";
import { concept, makeUser } from "./helpers";

function readDotEnv(key: string): string | undefined {
  const p = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(p)) return undefined;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`));
    if (m) return m[1].replace(/^"(.*)"$/, "$1");
  }
  return undefined;
}

async function asUser<T>(uid: string, fn: (c: any) => Promise<T>): Promise<T> {
  return withTx(async (c) => {
    await c.query("SELECT set_config('app.user_id', $1, true)", [uid]);
    return fn(c);
  });
}

describe("audit_log（分区 + 触发器 + RLS）", () => {
  let app: Client;

  beforeAll(async () => {
    const raw = process.env.TEST_APP_DATABASE_URL ?? readDotEnv("APP_DATABASE_URL");
    if (raw) {
      app = new Client({ connectionString: raw.replace(/\/[^/?]+(\?|$)/, "/knowverse_test$1") });
      await app.connect();
    }
  });

  afterAll(async () => { if (app) await app.end(); });

  it("修改分享偏好：记录 actor、旧值与新值", async () => {
    const u = await makeUser("au");
    const { classId } = await createClass(u, "审计星系");
    await asUser(u.id, (c) => c.query("UPDATE sharing_preferences SET share_planet = true WHERE user_id = $1 AND class_id = $2", [u.id, classId]));
    const row = await q1<any>(
      `SELECT actor_user_id, table_name, op, old_row, new_row FROM audit_log
        WHERE table_name = 'sharing_preferences' AND actor_user_id = $1 ORDER BY at DESC LIMIT 1`, [u.id]);
    expect(row.op).toBe("UPDATE");
    expect(row.old_row.share_planet).toBe(false);
    expect(row.new_row.share_planet).toBe(true);
  });

  it("加入班级与写入学习证据都会留下审计行", async () => {
    const a = await makeUser("av");
    const b = await makeUser("aw");
    const { classId, joinCode } = await createClass(a, "审计星系 2");
    await joinClass(b, joinCode);
    const joined = await q1<{ n: number }>(
      `SELECT count(*)::int n FROM audit_log WHERE table_name = 'class_members' AND op = 'INSERT' AND new_row->>'user_id' = $1`, [b.id]);
    expect(joined!.n).toBeGreaterThan(0);

    const cid = await concept("左外连接");
    await withTx((c) => addEvidence(c, { userId: b.id, conceptId: cid, kind: "note", detail: "审计测试笔记" }));
    const ev = await q1<{ n: number }>(
      `SELECT count(*)::int n FROM audit_log WHERE table_name = 'learning_evidence' AND op = 'INSERT' AND new_row->>'user_id' = $1`, [b.id]);
    expect(ev!.n).toBeGreaterThan(0);
    void classId;
  });

  it("按月分区：范围查询只扫目标分区，超出范围落 DEFAULT 分区", async () => {
    await q(`INSERT INTO audit_log (at, table_name, op, row_pk)
             VALUES ('2026-11-15', 't', 'INSERT', 'nov'), ('2026-12-15', 't', 'INSERT', 'dec'), ('2030-01-01', 't', 'INSERT', 'far-future')`);
    const plan = await q<Record<string, string>>(
      `EXPLAIN (FORMAT TEXT) SELECT * FROM audit_log WHERE at >= '2026-11-01' AND at < '2026-12-01'`);
    const text = Object.values(plan[0]).join("\n");
    expect(text).toContain("audit_log_2026_11");
    expect(text).not.toContain("audit_log_2026_12");

    const where = await q1<{ part: string }>(
      `SELECT tableoid::regclass::text AS part FROM audit_log WHERE row_pk = 'far-future'`);
    expect(where!.part).toBe("audit_log_default");
  });

  it("audit_log 的 RLS：应用角色只能看到自己的操作", async () => {
    if (!app) return; // 未配置 APP_DATABASE_URL 时跳过（RLS 由 security.test.ts 覆盖）
    const a = await makeUser("ax");
    const b = await makeUser("ay");
    const { classId } = await createClass(a, "审计 RLS");
    await asUser(a.id, (c) => c.query("UPDATE sharing_preferences SET share_stages = true WHERE user_id = $1 AND class_id = $2", [a.id, classId]));
    await asUser(b.id, (c) => c.query("UPDATE sharing_preferences SET share_stages = true WHERE user_id = $1 AND class_id = $2", [b.id, classId]));

    await app.query("BEGIN");
    await app.query("SELECT set_config('app.user_id', $1, true)", [a.id]);
    const rows = (await app.query("SELECT actor_user_id FROM audit_log")).rows;
    await app.query("ROLLBACK");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: any) => r.actor_user_id === a.id || r.actor_user_id === null)).toBe(true);
    expect(rows.some((r: any) => r.actor_user_id === b.id)).toBe(false);
  });
});
