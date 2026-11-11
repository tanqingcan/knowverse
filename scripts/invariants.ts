import "./env";
import { q } from "@/db";

/**
 * 数据库不变量自检
 *
 * 把“业务上永远必须成立”的条件写成 SQL，定期跑一遍：
 *   - 阶段是否与证据一致（汇总表跑偏检测）
 *   - 评价与作答是否一一对应
 *   - 证据是否可溯源、是否跨用户
 *   - 受控冗余（messages.user_id）是否与父表一致
 *   - 本命花是否属于本星球、引用是否指向真实片段
 *   - 新增带 user_id 的表是否忘了启用 RLS
 *
 * 用法：npm run verify:invariants            # 只跑检查
 *       npx tsx scripts/invariants.ts --json # 机器可读
 * 退出码：存在 error 级违规时非 0（可挂 CI）。
 */

export type CheckResult = {
  id: string;
  title: string;
  severity: "error" | "warn";
  violations: number;
  sample: string[];
};

/** RLS 允许的例外：这些表跨用户读由函数/视图收口，见 docs/database-design.md §8.3 */
const RLS_ALLOWLIST = [
  "auth_sessions", "planets", "learning_states", "class_members", "sharing_preferences",
  "learning_intents", "study_group_members", "contributions",
  // 学习卡：本人卡片 + 已发布到班级的卡片都要可读，跨用户读由 card_publications 条件约束
  "knowledge_cards",
];

async function check(id: string, title: string, severity: "error" | "warn", sql: string, params: unknown[] = []): Promise<CheckResult> {
  try {
    const rows = await q<any>(sql, params);
    const total = rows.length ? Number(rows[0].total ?? rows.length) : 0;
    return { id, title, severity, violations: total, sample: rows.slice(0, 3).map((r) => {
      const { total: _t, ...rest } = r;
      return JSON.stringify(rest);
    }) };
  } catch (e: any) {
    return { id, title, severity: "error", violations: -1, sample: [`检查本身报错：${e.message}`] };
  }
}

export async function runInvariantChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // E1 阶段漂移：learning_states 与“按有效证据重算”的结果不一致
  results.push(await check("E1", "阶段与证据一致（汇总表无漂移）", "error", `
    SELECT count(*) OVER () AS total, u.handle, k.name AS concept, ls.stage, fn_stage_at(ls.user_id, ls.concept_id, now()) AS replay
      FROM learning_states ls JOIN users u ON u.id = ls.user_id JOIN concepts k ON k.id = ls.concept_id
     WHERE ls.stage <> fn_stage_at(ls.user_id, ls.concept_id, now())
     LIMIT 3`));

  // E2 评价与作答一一对应
  results.push(await check("E2", "作答与评价一一对应", "error", `
    SELECT count(*) OVER () AS total, a.id, a.status, e.id AS evaluation_id
      FROM attempts a LEFT JOIN evaluations e ON e.attempt_id = a.id
     WHERE (a.status = 'evaluated' AND e.id IS NULL) OR (a.status <> 'evaluated' AND e.id IS NOT NULL)
     LIMIT 3`));

  // E3 证据可溯源：练习类必须有作答，笔记类必须有笔记
  results.push(await check("E3", "证据可溯源（练习→作答、笔记→笔记）", "error", `
    SELECT count(*) OVER () AS total, e.id, e.kind
      FROM learning_evidence e
     WHERE (e.kind IN ('guided_practice','independent_attempt','independent_variant_pass') AND e.attempt_id IS NULL)
        OR (e.kind = 'note' AND e.note_id IS NULL)
     LIMIT 3`));

  // E4 证据不得跨用户引用别人的作答
  results.push(await check("E4", "证据与作答属于同一用户", "error", `
    SELECT count(*) OVER () AS total, e.id, e.user_id, a.user_id AS attempt_user
      FROM learning_evidence e JOIN attempts a ON a.id = e.attempt_id
     WHERE a.user_id <> e.user_id
     LIMIT 3`));

  // E5 受控冗余：messages.user_id 必须等于会话的 user_id
  results.push(await check("E5", "messages.user_id 与会话一致", "error", `
    SELECT count(*) OVER () AS total, m.id
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE m.user_id <> c.user_id
     LIMIT 3`));

  // E6 本命花属于本星球
  results.push(await check("E6", "本命花属于本星球", "error", `
    SELECT count(*) OVER () AS total, pl.id AS planet_id, pl.natal_plant_id
      FROM planets pl JOIN plants p ON p.id = pl.natal_plant_id JOIN gardens g ON g.id = p.garden_id
     WHERE g.planet_id <> pl.id
     LIMIT 3`));

  // E7 幂等键不得重复
  results.push(await check("E7", "幂等键唯一", "error", `
    SELECT count(*) OVER () AS total, user_id, submit_key, count(*) AS n
      FROM attempts WHERE submit_key IS NOT NULL GROUP BY user_id, submit_key HAVING count(*) > 1
     LIMIT 3`));

  // E8 成长事件引用的证据必须存在
  results.push(await check("E8", "成长事件无悬空证据引用", "error", `
    SELECT count(*) OVER () AS total, g.id, g.evidence_id
      FROM growth_events g
     WHERE g.evidence_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM learning_evidence e WHERE e.id = g.evidence_id)
     LIMIT 3`));

  // E9 汇总字段 last_evidence_at 与证据一致
  results.push(await check("E9", "last_evidence_at 与证据时间一致", "error", `
    SELECT count(*) OVER () AS total, ls.user_id, ls.concept_id, ls.last_evidence_at
      FROM learning_states ls
     WHERE ls.last_evidence_at IS DISTINCT FROM (
             SELECT max(e.created_at) FROM learning_evidence e
              WHERE e.user_id = ls.user_id AND e.concept_id = ls.concept_id AND e.revoked_at IS NULL)
     LIMIT 3`));

  // E10 新增带 user_id 的表必须启用 RLS（允许清单见上）
  results.push(await check("E10", "带 user_id 的表都已启用 RLS（或已登记例外）", "error", `
    SELECT count(*) OVER () AS total, c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'user_id'
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity
       AND NOT (c.relname = ANY($1::text[]))
     LIMIT 3`, [RLS_ALLOWLIST]));

  // E11 增量统计与真实聚合一致
  results.push(await check("E11", "class_stats 增量值与真实聚合一致", "error", `
    SELECT count(*) OVER () AS total, class_id, truth_members, stats_members,
           truth_shared, stats_shared, truth_active, stats_active
      FROM v_class_stats_drift
     LIMIT 3`));

  // E12 笔记的 user_id 与来源消息一致（反规范化的补偿检查）
  results.push(await check("E12", "笔记与来源消息属于同一用户", "error", `
    SELECT count(*) OVER () AS total, n.id, n.user_id, m.user_id AS message_user
      FROM notes n JOIN messages m ON m.id = n.source_message_id
     WHERE m.user_id <> n.user_id
     LIMIT 3`));

  // E13 成长事件的 user_id 与证据一致
  results.push(await check("E13", "成长事件与证据属于同一用户", "error", `
    SELECT count(*) OVER () AS total, g.id, g.user_id, e.user_id AS evidence_user
      FROM growth_events g JOIN learning_evidence e ON e.id = g.evidence_id
     WHERE e.user_id <> g.user_id
     LIMIT 3`));

  // W1 未投递的 outbox 事件堆积（超过 1 小时）
  results.push(await check("W1", "outbox 未投递事件未堆积", "warn", `
    SELECT count(*) OVER () AS total, topic, min(created_at) AS oldest
      FROM outbox_events WHERE delivered_at IS NULL AND created_at < now() - interval '1 hour'
     GROUP BY topic LIMIT 3`));

  // W2 审计数据落到了 DEFAULT 分区（说明缺月份分区，不丢数据但不理想）
  results.push(await check("W2", "审计数据未落 DEFAULT 分区", "warn", `
    SELECT count(*) OVER () AS total, tableoid::regclass::text AS part
      FROM audit_log WHERE tableoid = 'audit_log_default'::regclass
     LIMIT 3`));

  return results;
}

async function main() {
  const results = await runInvariantChecks();
  const errors = results.filter((r) => r.severity === "error" && r.violations !== 0);
  const warns = results.filter((r) => r.severity === "warn" && r.violations !== 0);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      const mark = r.violations === 0 ? "✓" : r.severity === "error" ? "✗" : "!";
      console.log(`${mark} ${r.id.padEnd(4)} ${r.title}${r.violations === 0 ? "" : `  ← ${r.violations} 处`}`);
      for (const s of r.sample) console.log(`      ${s}`);
    }
    console.log(`\n${results.length} 项检查：${errors.length} 项错误，${warns.length} 项警告`);
  }
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && /invariants\.(ts|js)$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
