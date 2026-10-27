/**
 * 学习成长规则（可解释、只由后端事务写入）
 *
 *  种子 seed   ：用户确认了目标或知识点（植物存在即为种子）。
 *  嫩芽 sprout ：有阅读 read、提问 asked 或笔记 note 记录。
 *  生叶 leaf   ：有引导练习 guided_practice 记录（使用过提示或处于引导模式，会注明）。
 *  花苞 bud    ：有独立作答 independent_attempt 记录（不论对错），仍需补充验证。
 *  开花 bloom  ：通过符合规则的独立变式验证 independent_variant_pass：
 *                独立模式、未使用提示、题目为变式、判定正确，且该题版本此前从未作答过。
 *
 *  自述理解 self_report 与团队/作品 team_work 会被记录并展示，但不推动阶段。
 *  这些是产品阶段，不是对掌握程度的科学测量；不产生任何百分比。
 *  答错不会让花退化；长期未登录也不会枯萎，只产生温和的“待复习”提示。
 *  证据被修正（撤销）时保留原记录，重新计算阶段，并写入成长事件说明原因。
 */
import type { PoolClient } from "pg";
import { q } from "@/db";

export const STAGES = ["seed", "sprout", "leaf", "bud", "bloom"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { seed: "种子", sprout: "嫩芽", leaf: "生叶", bud: "花苞", bloom: "开花" };

export const EVIDENCE_KINDS = ["self_report", "read", "asked", "note", "guided_practice", "independent_attempt", "independent_variant_pass", "team_work"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  self_report: "自述理解", read: "阅读资料", asked: "提问", note: "笔记",
  guided_practice: "引导练习", independent_attempt: "独立作答", independent_variant_pass: "独立变式通过", team_work: "团队/作品",
};
/** 证据类别：界面上必须区分的四类 */
export const EVIDENCE_CATEGORY: Record<EvidenceKind, "self" | "record" | "assisted" | "independent" | "team"> = {
  self_report: "self", read: "record", asked: "record", note: "record",
  guided_practice: "assisted", independent_attempt: "independent", independent_variant_pass: "independent", team_work: "team",
};

const REVIEW_DAYS: Record<Stage, number> = { seed: 3, sprout: 3, leaf: 5, bud: 4, bloom: 14 };

export function computeStage(kinds: Set<string>): { stage: Stage; reason: string } {
  if (kinds.has("independent_variant_pass")) return { stage: "bloom", reason: "已有一次不使用提示、首次作答即正确的独立变式验证" };
  if (kinds.has("independent_attempt")) return { stage: "bud", reason: "已经尝试过独立作答；还需要一次独立变式验证才会开花" };
  if (kinds.has("guided_practice")) return { stage: "leaf", reason: "完成过引导练习（含提示或引导模式）" };
  if (kinds.has("read") || kinds.has("asked") || kinds.has("note")) return { stage: "sprout", reason: "有阅读、提问或笔记记录" };
  return { stage: "seed", reason: "已确认这个知识点，等待第一条学习记录" };
}

export function nextStepHint(stage: Stage): string {
  switch (stage) {
    case "seed": return "提一个问题、读一段资料或写一条笔记，它就会发芽。";
    case "sprout": return "做一道引导练习（可以看提示），它会长出叶子。";
    case "leaf": return "试着不看提示独立作答一次，它会结出花苞。";
    case "bud": return "完成一道没做过的独立变式题，且不使用提示，它就会开花。";
    case "bloom": return "已经开花。之后的复习会在“待复习”里温和提醒。";
  }
}

export type GrowthEvent = {
  id: string; conceptId: string; eventType: string; fromStage: Stage | null; toStage: Stage | null;
  reason: string; evidenceId: string | null; createdAt: string;
};

async function ensureState(c: PoolClient, userId: string, conceptId: string) {
  await c.query(
    `INSERT INTO learning_states (user_id, concept_id, stage, stage_reason)
     VALUES ($1, $2, 'seed', '已确认这个知识点，等待第一条学习记录')
     ON CONFLICT (user_id, concept_id) DO NOTHING`,
    [userId, conceptId],
  );
  const r = await c.query(`SELECT stage FROM learning_states WHERE user_id = $1 AND concept_id = $2 FOR UPDATE`, [userId, conceptId]);
  return r.rows[0].stage as Stage;
}

/** 在当前事务中按有效证据重新计算并写入状态；若阶段变化则记录 stage_changed 事件 */
async function recompute(c: PoolClient, userId: string, conceptId: string, fromStage: Stage, evidenceId: string | null, cause: string, origin: string): Promise<GrowthEvent[]> {
  const kr = await c.query(
    `SELECT DISTINCT kind FROM learning_evidence WHERE user_id = $1 AND concept_id = $2 AND revoked_at IS NULL`,
    [userId, conceptId],
  );
  const { stage, reason } = computeStage(new Set(kr.rows.map((r) => r.kind)));
  await c.query(
    `UPDATE learning_states SET stage = $3, stage_reason = $4,
        last_evidence_at = (SELECT max(created_at) FROM learning_evidence WHERE user_id = $1 AND concept_id = $2 AND revoked_at IS NULL),
        review_due_at = now() + make_interval(days => $5),
        updated_at = now(), version = version + 1
     WHERE user_id = $1 AND concept_id = $2`,
    [userId, conceptId, stage, reason, REVIEW_DAYS[stage]],
  );
  const out: GrowthEvent[] = [];
  if (stage !== fromStage) {
    const r = await c.query(
      `INSERT INTO growth_events (user_id, concept_id, event_type, from_stage, to_stage, evidence_id, reason, origin)
       VALUES ($1, $2, 'stage_changed', $3, $4, $5, $6, $7)
       RETURNING id, concept_id AS "conceptId", event_type AS "eventType", from_stage AS "fromStage", to_stage AS "toStage", reason, evidence_id AS "evidenceId", created_at AS "createdAt"`,
      [userId, conceptId, fromStage, stage, evidenceId, `${cause}；${reason}`, origin],
    );
    out.push(r.rows[0]);
    await c.query(
      `INSERT INTO outbox_events (topic, aggregate_id, payload) VALUES ('growth.stage_changed', $1, $2)`,
      [conceptId, JSON.stringify({ userId, conceptId, fromStage, toStage: stage, growthEventId: r.rows[0].id })],
    );
  }
  return out;
}

export type EvidenceInput = {
  userId: string; conceptId: string; kind: EvidenceKind; detail: string;
  attemptId?: string | null; messageId?: string | null; noteId?: string | null; materialVersionId?: string | null;
  usedHints?: boolean; aiAssisted?: boolean; origin?: "user" | "seed";
};

/**
 * 写入一条证据，并在同一事务中更新当前状态、成长事件与 outbox。
 * 调用方负责开启事务（withTx），保证“证据—状态—历史—事件”一致提交或一致回滚。
 */
export async function addEvidence(c: PoolClient, ev: EvidenceInput) {
  const from = await ensureState(c, ev.userId, ev.conceptId);
  const r = await c.query(
    `INSERT INTO learning_evidence (user_id, concept_id, kind, attempt_id, message_id, note_id, material_version_id, used_hints, ai_assisted, detail, origin)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, created_at`,
    [ev.userId, ev.conceptId, ev.kind, ev.attemptId ?? null, ev.messageId ?? null, ev.noteId ?? null, ev.materialVersionId ?? null,
      !!ev.usedHints, !!ev.aiAssisted, ev.detail, ev.origin ?? "user"],
  );
  const evidenceId: string = r.rows[0].id;
  const added = await c.query(
    `INSERT INTO growth_events (user_id, concept_id, event_type, evidence_id, reason, origin)
     VALUES ($1, $2, 'evidence_added', $3, $4, $5)
     RETURNING id, concept_id AS "conceptId", event_type AS "eventType", from_stage AS "fromStage", to_stage AS "toStage", reason, evidence_id AS "evidenceId", created_at AS "createdAt"`,
    [ev.userId, ev.conceptId, evidenceId, `${EVIDENCE_LABEL[ev.kind]}：${ev.detail}`, ev.origin ?? "user"],
  );
  const changes = await recompute(c, ev.userId, ev.conceptId, from, evidenceId, `新增${EVIDENCE_LABEL[ev.kind]}证据`, ev.origin ?? "user");
  return { evidenceId, fromStage: from, toStage: (changes[0]?.toStage ?? from) as Stage, events: [added.rows[0] as GrowthEvent, ...changes] };
}

/** 修正（撤销）证据：保留原记录与历史，重新计算阶段并解释原因 */
export async function revokeEvidence(c: PoolClient, userId: string, evidenceId: string, reason: string) {
  const r = await c.query(
    `UPDATE learning_evidence SET revoked_at = now(), revoke_reason = $3
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING concept_id, kind`,
    [evidenceId, userId, reason],
  );
  if (!r.rowCount) return null;
  const conceptId = r.rows[0].concept_id as string;
  const from = await ensureState(c, userId, conceptId);
  const ev = await c.query(
    `INSERT INTO growth_events (user_id, concept_id, event_type, evidence_id, reason)
     VALUES ($1, $2, 'evidence_revoked', $3, $4)
     RETURNING id, concept_id AS "conceptId", event_type AS "eventType", from_stage AS "fromStage", to_stage AS "toStage", reason, evidence_id AS "evidenceId", created_at AS "createdAt"`,
    [userId, conceptId, evidenceId, `修正证据（${EVIDENCE_LABEL[r.rows[0].kind as EvidenceKind]}）：${reason}`],
  );
  const changes = await recompute(c, userId, conceptId, from, evidenceId, "证据被修正", "user");
  return { conceptId, fromStage: from, toStage: (changes[0]?.toStage ?? from) as Stage, events: [ev.rows[0] as GrowthEvent, ...changes] };
}

/** 成长解释（get_growth_explanation 工具也调用它） */
export async function growthExplanation(userId: string, conceptId: string) {
  const [state] = await q(
    `SELECT ls.stage, ls.stage_reason AS "stageReason", ls.last_evidence_at AS "lastEvidenceAt", ls.review_due_at AS "reviewDueAt"
     FROM learning_states ls WHERE ls.user_id = $1 AND ls.concept_id = $2`, [userId, conceptId]);
  const evidence = await q(
    `SELECT e.id, e.kind, e.detail, e.used_hints AS "usedHints", e.ai_assisted AS "aiAssisted", e.created_at AS "createdAt",
            e.revoked_at AS "revokedAt", e.revoke_reason AS "revokeReason", e.origin,
            e.message_id AS "messageId", m.conversation_id AS "conversationId", e.attempt_id AS "attemptId",
            ev.verdict, tv.prompt AS "taskPrompt", e.note_id AS "noteId"
     FROM learning_evidence e
     LEFT JOIN messages m ON m.id = e.message_id AND m.user_id = e.user_id
     LEFT JOIN attempts a ON a.id = e.attempt_id
     LEFT JOIN evaluations ev ON ev.attempt_id = a.id
     LEFT JOIN task_versions tv ON tv.id = a.task_version_id
     WHERE e.user_id = $1 AND e.concept_id = $2
     ORDER BY e.created_at DESC`, [userId, conceptId]);
  const stage = (state?.stage ?? "seed") as Stage;
  return {
    stage, stageLabel: STAGE_LABEL[stage], reason: state?.stageReason ?? "已确认这个知识点，等待第一条学习记录",
    next: nextStepHint(stage), reviewDueAt: state?.reviewDueAt ?? null, lastEvidenceAt: state?.lastEvidenceAt ?? null,
    evidence: evidence.map((e) => ({ ...e, label: EVIDENCE_LABEL[e.kind as EvidenceKind], category: EVIDENCE_CATEGORY[e.kind as EvidenceKind] })),
    disclaimer: "阶段是产品中的成长记录，依据是下列证据，并不是对掌握程度的科学测量。",
  };
}
