/**
 * 学习路线规划（A9）
 *
 * 验证“扩展 SQL”的四个性质：
 *   - 递归 CTE 求先修闭包：目标的所有（间接）先修都在结果里；
 *   - 拓扑排序：任何先修都排在它的后继之前；
 *   - 加权：同层里弱阶段/有错题的更靠前，并给出理由；
 *   - 安全：不能替别的用户规划（42501）。
 */
import { describe, expect, it } from "vitest";
import { q, q1, withTx } from "@/db";
import { getUserById } from "@/server/auth";
import { planPath } from "@/server/plan";
import { concept } from "./helpers";

async function demoUser() {
  const row = await q1<{ id: string }>(`SELECT id FROM users WHERE handle = 'demo'`);
  return (await getUserById(row!.id))!;
}

describe("学习路线规划（fn_plan_path）", () => {
  it("按先修顺序给出路线，并标注可跳过 / 优先补", async () => {
    const user = await demoUser();
    const goal = await concept("贝叶斯公式");
    const plan = await planPath(user, goal, 10);

    expect(plan.goal.name).toBe("贝叶斯公式");
    expect(plan.steps[0].name).toBe("样本空间与事件");   // 最深先修
    expect(plan.steps[plan.steps.length - 1].name).toBe("贝叶斯公式"); // 目标在最后
    expect(plan.steps[plan.steps.length - 1].depth).toBe(0);

    // 深度单调不增（拓扑序的必要条件）
    for (let i = 1; i < plan.steps.length; i++) {
      expect(plan.steps[i].depth).toBeLessThanOrEqual(plan.steps[i - 1].depth);
    }
    // 种子数据里“全概率公式”有一次错题，应被标为优先补
    const full = plan.steps.find((s) => s.name === "全概率公式")!;
    expect(full.mistakes).toBeGreaterThan(0);
    expect(full.reason).toContain("错题");
    expect(plan.steps.find((s) => s.name === "条件概率")!.stage).toBe("bloom");
  });

  it("拓扑性质：任何先修都排在后继之前", async () => {
    const user = await demoUser();
    const goal = await concept("贝叶斯公式");
    const steps = (await planPath(user, goal, 20)).steps;
    const pos = new Map(steps.map((s, i) => [s.conceptId, i]));
    const ids = [...pos.keys()];
    const edges = await q<{ prereq: string; concept: string }>(
      `SELECT prereq_concept_id AS prereq, concept_id AS concept FROM concept_prerequisites
        WHERE concept_id = ANY($1::uuid[]) AND prereq_concept_id = ANY($1::uuid[])`, [ids]);
    for (const e of edges) {
      expect(pos.get(e.prereq)!).toBeLessThan(pos.get(e.concept)!);
    }
  });

  it("limit 生效；未知知识点 404", async () => {
    const user = await demoUser();
    const goal = await concept("贝叶斯公式");
    expect((await planPath(user, goal, 3)).steps).toHaveLength(3);
    await expect(planPath(user, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 404 });
  });

  it("不能替其他用户规划（数据库函数拒绝，42501）", async () => {
    const a = await q1<{ id: string }>(`SELECT id FROM users WHERE handle = 'demo'`);
    const b = await q1<{ id: string }>(`SELECT id FROM users WHERE handle = 'xingye'`);
    const goal = await concept("贝叶斯公式");
    await expect(
      withTx(async (c) => {
        await c.query("SELECT set_config('app.user_id', $1, true)", [a!.id]);
        return c.query("SELECT fn_plan_path($1, $2, 5)", [b!.id, goal]);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
