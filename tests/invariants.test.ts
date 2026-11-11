/**
 * 不变量 + 随机负载（fuzz）集成测试
 *
 * 思路：随机做一串真实业务操作（写证据、撤销、作答、建班、分享），每做一批就检查
 * “数据库不变量”是否仍然成立。种子固定，失败时可复现；失败信息里带 seed 与操作日志。
 */
import { describe, expect, it } from "vitest";
import { q, q1, withTx } from "@/db";
import { addEvidence, revokeEvidence } from "@/server/growth";
import { startAttempt, submitAttemptSafe } from "@/server/practice";
import { createClass, joinClass, setSharing } from "@/server/classes";
import { runInvariantChecks } from "../scripts/invariants";
import { makeUser, concept } from "./helpers";

const SEED = 20261027;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rnd: () => number, arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

describe("数据库不变量 + 随机负载", () => {
  it("基线：种子数据上所有 error 级不变量成立", async () => {
    const checks = await runInvariantChecks();
    const bad = checks.filter((c) => c.severity === "error" && c.violations !== 0);
    expect(bad).toEqual([]);
  });

  it("随机操作 24 步后不变量仍成立（种子固定，可复现）", async () => {
    const rnd = mulberry32(SEED);
    const log: string[] = [];

    const users = [await makeUser("fz"), await makeUser("fy")];
    const concepts = [await concept("左外连接"), await concept("内连接"), await concept("条件概率")];
    const tvRows = await q<{ id: string }>(`SELECT tv.id FROM task_versions tv JOIN tasks t ON t.id = tv.task_id ORDER BY t.title LIMIT 3`);
    const version = await q1<{ id: string }>(`SELECT v.id FROM material_versions v JOIN materials m ON m.id = v.material_id
                                             WHERE m.owner_user_id IS NULL AND v.status = 'ready' LIMIT 1`);
    let classInfo: { classId: string; joinCode: string } | null = null;
    let submitSeq = 0;

    for (let step = 0; step < 24; step++) {
      const user = pick(rnd, users);
      const cid = pick(rnd, concepts);
      const roll = rnd();
      try {
        if (roll < 0.3) {
          const kind = rnd() < 0.5 ? "read" : "self_report";
          await withTx((c) => addEvidence(c, {
            userId: user.id, conceptId: cid, kind,
            detail: `fuzz#${step}`,
            materialVersionId: kind === "read" ? version!.id : null,
          }));
          log.push(`addEvidence(${kind})`);
        } else if (roll < 0.5) {
          const row = await q1<{ id: string }>(`SELECT id FROM learning_evidence WHERE user_id = $1 AND revoked_at IS NULL ORDER BY random() LIMIT 1`, [user.id]);
          if (row) {
            await withTx((c) => revokeEvidence(c, user.id, row.id, `fuzz 撤销 #${step}`));
            log.push("revokeEvidence");
          }
        } else if (roll < 0.7) {
          const a = await startAttempt(user.id, pick(rnd, tvRows).id, pick(rnd, ["guided", "independent"] as const));
          await submitAttemptSafe(user.id, a.attempt.id, `SELECT ${step} AS v`, `fuzz-key-${SEED}-${submitSeq++}`).catch((e) => {
            if (e?.code !== "already_submitted") throw e;
          });
          log.push("startAttempt+submit");
        } else if (roll < 0.85) {
          if (!classInfo) {
            classInfo = await createClass(user, `fuzz 班 ${step}`);
            log.push("createClass");
          } else {
            await joinClass(user, classInfo.joinCode);
            await setSharing(user, classInfo.classId, { sharePlanet: rnd() < 0.5, shareStages: rnd() < 0.5 });
            log.push("joinClass+setSharing");
          }
        } else {
          users.push(await makeUser("fn"));
          log.push("makeUser");
        }
      } catch (e: any) {
        // 业务上允许的唯一失败：重复提交 / 幂等键冲突；其他错误直接暴露
        if (!["already_submitted", "key_reused"].includes(e?.code)) throw e;
      }

      if ((step + 1) % 8 === 0) {
        const checks = await runInvariantChecks();
        const bad = checks.filter((c) => c.severity === "error" && c.violations !== 0);
        if (bad.length) {
          throw new Error(`seed=${SEED} step=${step + 1} 不变量失败：${JSON.stringify(bad)}\n操作：${log.join(" → ")}`);
        }
      }
    }

    const finalChecks = await runInvariantChecks();
    expect(finalChecks.filter((c) => c.severity === "error" && c.violations !== 0)).toEqual([]);
  });
});
