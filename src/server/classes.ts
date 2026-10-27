/**
 * 增强功能：班级星系、分享偏好、学习意愿、互补伙伴匹配、共学小组（名额并发安全）、贡献、学习卡、outbox 投递
 * 默认不公开任何内容：只有用户在该班级里显式打开的分享项才会被他人看到。
 */
import crypto from "node:crypto";
import { q, q1, withTx } from "@/db";
import type { CurrentUser } from "./auth";
import { AppError, notFound, forbidden } from "./errors";
import { addEvidence } from "./growth";

async function requireMember(userId: string, classId: string) {
  const m = await q1(`SELECT role FROM class_members WHERE class_id = $1 AND user_id = $2`, [classId, userId]);
  if (!m) throw forbidden();
  return m.role as string;
}

export async function createClass(user: CurrentUser, name: string) {
  const code = crypto.randomBytes(4).toString("base64url").slice(0, 6).toUpperCase();
  return withTx(async (c) => {
    const r = await c.query(`INSERT INTO classes (name, join_code, owner_user_id) VALUES ($1,$2,$3) RETURNING id, join_code`, [name.trim().slice(0, 40) || "未命名星系", code, user.id]);
    await c.query(`INSERT INTO class_members (class_id, user_id, role) VALUES ($1,$2,'teacher')`, [r.rows[0].id, user.id]);
    await c.query(`INSERT INTO sharing_preferences (class_id, user_id) VALUES ($1,$2)`, [r.rows[0].id, user.id]);
    return { classId: r.rows[0].id, joinCode: r.rows[0].join_code };
  });
}

export async function joinClass(user: CurrentUser, code: string) {
  const cl = await q1(`SELECT id FROM classes WHERE join_code = $1`, [code.trim().toUpperCase()]);
  if (!cl) throw new AppError("bad_code", "邀请码不存在");
  await withTx(async (c) => {
    await c.query(`INSERT INTO class_members (class_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [cl.id, user.id]);
    await c.query(`INSERT INTO sharing_preferences (class_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [cl.id, user.id]);
  });
  return { classId: cl.id };
}

export async function myClasses(user: CurrentUser) {
  return q(`SELECT c.id, c.name, c.join_code AS "joinCode", m.role, (SELECT count(*) FROM class_members x WHERE x.class_id = c.id)::int AS members,
                   sp.share_planet AS "sharePlanet", sp.share_stages AS "shareStages", sp.open_to_partner AS "openToPartner"
            FROM class_members m JOIN classes c ON c.id = m.class_id
            LEFT JOIN sharing_preferences sp ON sp.class_id = c.id AND sp.user_id = m.user_id
            WHERE m.user_id = $1 ORDER BY c.created_at`, [user.id]);
}

export async function setSharing(user: CurrentUser, classId: string, prefs: { sharePlanet?: boolean; shareStages?: boolean; openToPartner?: boolean }) {
  await requireMember(user.id, classId);
  await q(`UPDATE sharing_preferences SET share_planet = coalesce($3, share_planet), share_stages = coalesce($4, share_stages),
                  open_to_partner = coalesce($5, open_to_partner), updated_at = now() WHERE class_id = $1 AND user_id = $2`,
    [classId, user.id, prefs.sharePlanet ?? null, prefs.shareStages ?? null, prefs.openToPartner ?? null]);
  return { ok: true };
}

/** 班级星系：只返回对方明确公开的内容 */
export async function galaxy(user: CurrentUser, classId: string) {
  await requireMember(user.id, classId);
  const cls = await q1(`SELECT id, name, join_code AS "joinCode" FROM classes WHERE id = $1`, [classId]);
  const members = await q(`SELECT u.id AS "userId", u.display_name AS "displayName", u.id = $2 AS "isMe", sp.share_planet AS "sharePlanet", sp.share_stages AS "shareStages",
                                  pl.name AS "planetName", np.species AS "natalSpecies", np.color AS "natalColor"
                           FROM class_members m JOIN users u ON u.id = m.user_id
                           JOIN sharing_preferences sp ON sp.class_id = m.class_id AND sp.user_id = m.user_id
                           LEFT JOIN planets pl ON pl.user_id = u.id LEFT JOIN plants np ON np.id = pl.natal_plant_id
                           WHERE m.class_id = $1 ORDER BY m.joined_at`, [classId, user.id]);
  const visible = members.filter((m) => m.isMe || m.sharePlanet);
  const ids = visible.filter((m) => m.isMe || m.shareStages).map((m) => m.userId);
  const plants = ids.length ? await q(`SELECT pl.user_id AS "userId", k.name AS "conceptName", p.species, p.color, coalesce(ls.stage,'seed') AS stage, p.lon, p.lat
                                       FROM plants p JOIN gardens g ON g.id = p.garden_id JOIN planets pl ON pl.id = g.planet_id JOIN concepts k ON k.id = p.concept_id
                                       LEFT JOIN learning_states ls ON ls.user_id = pl.user_id AND ls.concept_id = p.concept_id
                                       WHERE pl.user_id = ANY($1::uuid[]) AND p.archived_at IS NULL`, [ids]) : [];
  return {
    class: cls,
    hiddenCount: members.length - visible.length,
    planets: visible.map((m) => ({
      userId: m.userId, displayName: m.displayName, isMe: m.isMe, planetName: m.planetName ?? "（尚未建立星球）",
      natalSpecies: m.natalSpecies, natalColor: m.natalColor,
      plants: m.isMe || m.shareStages ? plants.filter((p) => p.userId === m.userId) : null,
    })),
  };
}

export async function addIntent(user: CurrentUser, inp: { classId: string; conceptId: string; direction: "seek" | "offer"; note?: string }) {
  await requireMember(user.id, inp.classId);
  await q(`INSERT INTO learning_intents (class_id, user_id, concept_id, direction, note) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (class_id, user_id, concept_id, direction) WHERE withdrawn_at IS NULL DO UPDATE SET note = EXCLUDED.note`,
    [inp.classId, user.id, inp.conceptId, inp.direction, inp.note?.slice(0, 120) ?? null]);
  return { ok: true };
}

export async function withdrawIntent(user: CurrentUser, intentId: string) {
  await q(`UPDATE learning_intents SET withdrawn_at = now() WHERE id = $1 AND user_id = $2 AND withdrawn_at IS NULL`, [intentId, user.id]);
  return { ok: true };
}

export async function myIntents(user: CurrentUser, classId: string) {
  return q(`SELECT li.id, li.direction, li.note, k.id AS "conceptId", k.name AS "conceptName" FROM learning_intents li JOIN concepts k ON k.id = li.concept_id
            WHERE li.class_id = $1 AND li.user_id = $2 AND li.withdrawn_at IS NULL ORDER BY li.created_at`, [classId, user.id]);
}

/**
 * 互补伙伴匹配（可解释）：
 *   我想获得帮助的知识点 ∩ 对方可以提供帮助的知识点，以及反方向；双方都需开启 open_to_partner。
 *   只使用公开意愿，不读取对方的学习状态或聊天内容。
 */
export const PARTNER_SQL = `
WITH me AS (SELECT concept_id, direction FROM learning_intents WHERE class_id = $1 AND user_id = $2 AND withdrawn_at IS NULL),
     others AS (
       SELECT li.user_id, li.concept_id, li.direction FROM learning_intents li
       JOIN sharing_preferences sp ON sp.class_id = li.class_id AND sp.user_id = li.user_id AND sp.open_to_partner
       WHERE li.class_id = $1 AND li.user_id <> $2 AND li.withdrawn_at IS NULL),
     pairs AS (
       SELECT o.user_id, o.concept_id, CASE WHEN me.direction = 'seek' THEN 'they_offer' ELSE 'they_seek' END AS kind
       FROM me JOIN others o ON o.concept_id = me.concept_id AND o.direction <> me.direction)
SELECT p.user_id AS "userId", u.display_name AS "displayName",
       array_agg(k.name ORDER BY k.name) FILTER (WHERE p.kind = 'they_offer') AS "theyCanHelp",
       array_agg(k.name ORDER BY k.name) FILTER (WHERE p.kind = 'they_seek') AS "youCanHelp",
       count(*)::int AS score,
       bool_or(p.kind = 'they_offer') AND bool_or(p.kind = 'they_seek') AS mutual
FROM pairs p JOIN users u ON u.id = p.user_id JOIN concepts k ON k.id = p.concept_id
WHERE EXISTS (SELECT 1 FROM sharing_preferences s WHERE s.class_id = $1 AND s.user_id = $2 AND s.open_to_partner)
GROUP BY p.user_id, u.display_name
ORDER BY mutual DESC, score DESC, u.display_name
LIMIT 10`;

export async function findPartners(userId: string, classId: string) {
  await requireMember(userId, classId);
  const rows = await q(PARTNER_SQL, [classId, userId]);
  return rows.map((r) => ({
    ...r, theyCanHelp: r.theyCanHelp ?? [], youCanHelp: r.youCanHelp ?? [],
    why: [r.theyCanHelp?.length ? `TA 愿意在「${r.theyCanHelp.join("、")}」上提供帮助，这是你想获得帮助的` : "", r.youCanHelp?.length ? `你可以在「${r.youCanHelp.join("、")}」上帮助 TA` : ""].filter(Boolean).join("；"),
  }));
}

export async function createGroup(user: CurrentUser | string, inp: { classId: string; conceptId: string; title: string; capacity: number }) {
  const userId = typeof user === "string" ? user : user.id;
  await requireMember(userId, inp.classId);
  return withTx(async (c) => {
    const g = await c.query(`INSERT INTO study_groups (class_id, concept_id, title, capacity, created_by_user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [inp.classId, inp.conceptId, inp.title.slice(0, 60), inp.capacity, userId]);
    await c.query(`INSERT INTO study_group_members (group_id, user_id) VALUES ($1,$2)`, [g.rows[0].id, userId]);
    await c.query(`INSERT INTO outbox_events (topic, aggregate_id, payload) VALUES ('group.created', $1, $2)`, [g.rows[0].id, JSON.stringify({ classId: inp.classId, title: inp.title })]);
    return { groupId: g.rows[0].id };
  });
}

export async function listGroups(user: CurrentUser, classId: string) {
  await requireMember(user.id, classId);
  return q(`SELECT g.id, g.title, g.capacity, g.status, k.id AS "conceptId", k.name AS "conceptName", u.display_name AS "creator",
                   (SELECT count(*) FROM study_group_members m WHERE m.group_id = g.id)::int AS "memberCount",
                   EXISTS (SELECT 1 FROM study_group_members m WHERE m.group_id = g.id AND m.user_id = $2) AS joined,
                   coalesce((SELECT json_agg(json_build_object('displayName', uu.display_name, 'kind', ct.kind, 'content', ct.content, 'at', ct.created_at) ORDER BY ct.created_at)
                             FROM contributions ct JOIN users uu ON uu.id = ct.user_id WHERE ct.group_id = g.id), '[]') AS contributions
            FROM study_groups g JOIN concepts k ON k.id = g.concept_id JOIN users u ON u.id = g.created_by_user_id
            WHERE g.class_id = $1 ORDER BY g.created_at DESC`, [classId, user.id]);
}

/** 申请加入：数据库触发器锁住小组行后计数，保证并发争抢最后一个名额时不超员 */
export async function joinGroup(userId: string, groupId: string) {
  const g = await q1(`SELECT class_id FROM study_groups WHERE id = $1`, [groupId]);
  if (!g) throw notFound("共学小组");
  await requireMember(userId, g.class_id);
  try {
    await withTx(async (c) => {
      await c.query(`INSERT INTO study_group_members (group_id, user_id) VALUES ($1,$2)`, [groupId, userId]);
      await c.query(`INSERT INTO outbox_events (topic, aggregate_id, payload) VALUES ('group.joined', $1, $2)`, [groupId, JSON.stringify({ userId })]);
    });
    return { joined: true };
  } catch (e: any) {
    if (e?.code === "23505") return { joined: true, already: true };
    if (/study group full/.test(e?.message ?? "")) throw new AppError("group_full", "名额已满", 409);
    if (/study group closed/.test(e?.message ?? "")) throw new AppError("group_closed", "小组已关闭", 409);
    throw e;
  }
}

/** 贡献：记录在小组中，同时作为该知识点的“团队/作品”证据（单独分类，不推动个人阶段） */
export async function addContribution(user: CurrentUser, groupId: string, kind: "explanation" | "question" | "review", content: string) {
  if (!content.trim()) throw new AppError("empty", "内容不能为空");
  return withTx(async (c) => {
    const g = await c.query(`SELECT g.concept_id, g.title FROM study_groups g JOIN study_group_members m ON m.group_id = g.id AND m.user_id = $2 WHERE g.id = $1`, [groupId, user.id]);
    if (!g.rowCount) throw forbidden();
    await c.query(`INSERT INTO contributions (group_id, user_id, kind, content) VALUES ($1,$2,$3,$4)`, [groupId, user.id, kind, content.slice(0, 2000)]);
    const r = await addEvidence(c, { userId: user.id, conceptId: g.rows[0].concept_id, kind: "team_work", detail: `在共学「${g.rows[0].title}」中贡献${kind === "explanation" ? "讲解" : kind === "question" ? "提问" : "复核"}` });
    return { growth: r.events };
  });
}

/* ───────── 学习卡 ───────── */

export async function saveCard(user: CurrentUser, inp: { cardId?: string; conceptId: string; title: string; body: string; changeNote?: string; draftedBy: "user" | "ai_draft"; sourceMessageIds: string[] }) {
  return withTx(async (c) => {
    let cardId = inp.cardId;
    if (cardId) {
      const own = await c.query(`SELECT id FROM knowledge_cards WHERE id = $1 AND user_id = $2 FOR UPDATE`, [cardId, user.id]);
      if (!own.rowCount) throw notFound("学习卡");
    } else {
      cardId = (await c.query(`INSERT INTO knowledge_cards (user_id, concept_id) VALUES ($1,$2) RETURNING id`, [user.id, inp.conceptId])).rows[0].id;
    }
    const v = await c.query(`INSERT INTO card_versions (card_id, version_no, title, body, change_note, drafted_by)
                             VALUES ($1, (SELECT coalesce(max(version_no),0)+1 FROM card_versions WHERE card_id = $1), $2, $3, $4, $5) RETURNING id, version_no`,
      [cardId, inp.title.slice(0, 80), inp.body.slice(0, 8000), inp.changeNote?.slice(0, 200) || (inp.cardId ? "修订" : "初版"), inp.draftedBy]);
    for (const mid of inp.sourceMessageIds.slice(0, 10)) {
      const ok = await c.query(`SELECT 1 FROM messages WHERE id = $1 AND user_id = $2`, [mid, user.id]);
      if (ok.rowCount) await c.query(`INSERT INTO card_sources (card_version_id, message_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [v.rows[0].id, mid]);
    }
    return { cardId, versionId: v.rows[0].id, versionNo: v.rows[0].version_no };
  });
}

export async function listCards(user: CurrentUser) {
  return q(`SELECT kc.id, kc.concept_id AS "conceptId", k.name AS "conceptName", cv.id AS "versionId", cv.version_no AS "versionNo", cv.title, cv.body, cv.change_note AS "changeNote",
                   cv.drafted_by AS "draftedBy", cv.created_at AS "updatedAt",
                   coalesce((SELECT json_agg(json_build_object('messageId', cs.message_id, 'conversationId', m.conversation_id)) FROM card_sources cs JOIN messages m ON m.id = cs.message_id WHERE cs.card_version_id = cv.id), '[]') AS sources,
                   coalesce((SELECT json_agg(json_build_object('classId', cp.class_id, 'className', cl.name, 'versionNo', v2.version_no))
                             FROM card_publications cp JOIN card_versions v2 ON v2.id = cp.card_version_id JOIN classes cl ON cl.id = cp.class_id
                             WHERE v2.card_id = kc.id AND cp.withdrawn_at IS NULL), '[]') AS publications
            FROM knowledge_cards kc JOIN concepts k ON k.id = kc.concept_id
            JOIN LATERAL (SELECT * FROM card_versions v WHERE v.card_id = kc.id ORDER BY v.version_no DESC LIMIT 1) cv ON true
            WHERE kc.user_id = $1 AND kc.archived_at IS NULL ORDER BY cv.created_at DESC`, [user.id]);
}

export async function cardHistory(user: CurrentUser, cardId: string) {
  const own = await q1(`SELECT id FROM knowledge_cards WHERE id = $1 AND user_id = $2`, [cardId, user.id]);
  if (!own) throw notFound("学习卡");
  return q(`SELECT id, version_no AS "versionNo", title, body, change_note AS "changeNote", drafted_by AS "draftedBy", created_at AS "createdAt" FROM card_versions WHERE card_id = $1 ORDER BY version_no DESC`, [cardId]);
}

export async function publishCard(user: CurrentUser, versionId: string, classId: string) {
  await requireMember(user.id, classId);
  const v = await q1(`SELECT cv.id, cv.card_id FROM card_versions cv JOIN knowledge_cards kc ON kc.id = cv.card_id WHERE cv.id = $1 AND kc.user_id = $2`, [versionId, user.id]);
  if (!v) throw notFound("学习卡版本");
  await withTx(async (c) => {
    // 同一张卡在同一班级只保留一个公开版本：撤下旧版本，发布新版本（旧记录保留）
    await c.query(`UPDATE card_publications cp SET withdrawn_at = now() FROM card_versions v WHERE cp.card_version_id = v.id AND v.card_id = $1 AND cp.class_id = $2 AND cp.withdrawn_at IS NULL`, [v.card_id, classId]);
    await c.query(`INSERT INTO card_publications (card_version_id, class_id) VALUES ($1,$2) ON CONFLICT (card_version_id, class_id) DO UPDATE SET withdrawn_at = NULL, published_at = now()`, [versionId, classId]);
    await c.query(`INSERT INTO outbox_events (topic, aggregate_id, payload) VALUES ('card.published', $1, $2)`, [versionId, JSON.stringify({ classId })]);
  });
  return { ok: true };
}

export async function classCards(user: CurrentUser, classId: string) {
  await requireMember(user.id, classId);
  return q(`SELECT cv.id AS "versionId", cv.version_no AS "versionNo", cv.title, cv.body, cp.published_at AS "publishedAt", u.display_name AS author, k.name AS "conceptName"
            FROM card_publications cp JOIN card_versions cv ON cv.id = cp.card_version_id JOIN knowledge_cards kc ON kc.id = cv.card_id
            JOIN users u ON u.id = kc.user_id JOIN concepts k ON k.id = kc.concept_id
            WHERE cp.class_id = $1 AND cp.withdrawn_at IS NULL ORDER BY cp.published_at DESC`, [classId]);
}

/** outbox 投递：事务外批量处理。本项目的投递目标是服务端日志（演示用途），失败会累计重试次数 */
export async function drainOutbox(limit = 50) {
  return withTx(async (c) => {
    const r = await c.query(`SELECT id, topic, aggregate_id, payload FROM outbox_events WHERE delivered_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit]);
    for (const e of r.rows) {
      if (process.env.NODE_ENV !== "test") console.log(`[outbox] deliver #${e.id} ${e.topic} ${e.aggregate_id}`);
      await c.query(`UPDATE outbox_events SET delivered_at = now(), attempts = attempts + 1 WHERE id = $1`, [e.id]);
    }
    return { delivered: r.rowCount };
  });
}
