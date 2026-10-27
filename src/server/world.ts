/**
 * 星球世界：用户 → 星球；学科 → 花圃；知识点 → 植物；目标 → 探索路线
 */
import type { PoolClient } from "pg";
import { q, q1, withTx } from "@/db";
import type { CurrentUser } from "./auth";
import { AppError, notFound } from "./errors";
import { SPECIES, PALETTE } from "@/lib/flora";
import { createUserConcept } from "./concepts";
import { normName } from "./text";
import { addEvidence, growthExplanation } from "./growth";
import { publicLlmStatus } from "./agent/llm";

const SPECIES_KEYS = SPECIES.map((s) => s.key) as string[];
const COLOR_KEYS = PALETTE.map((p) => p.key) as string[];

/** 植物在星球上的位置：每个花圃占一段经度，花圃内按顺序错落排列（确定性，不随机） */
export function plantPosition(gardenIndex: number, plantIndex: number) {
  const base = gardenIndex * 115 + 20;
  const col = plantIndex % 4, row = Math.floor(plantIndex / 4);
  return { lon: (base + col * 24 + row * 11) % 360, lat: 34 + row * 14 + (col % 2) * 6 };
}

async function nextPlantSlot(c: PoolClient, gardenId: string, planetId: string) {
  const gi = (await c.query(`SELECT count(*)::int AS n FROM gardens WHERE planet_id = $1 AND created_at < (SELECT created_at FROM gardens WHERE id = $2)`, [planetId, gardenId])).rows[0].n;
  const pi = (await c.query(`SELECT count(*)::int AS n FROM plants WHERE garden_id = $1`, [gardenId])).rows[0].n;
  return plantPosition(gi, pi);
}

export async function ensureGarden(c: PoolClient, userId: string, subjectId: string) {
  const p = await c.query(`SELECT id FROM planets WHERE user_id = $1`, [userId]);
  if (!p.rowCount) throw new AppError("no_planet", "还没有星球，请先完成开场");
  const planetId = p.rows[0].id;
  const g = await c.query(`SELECT id FROM gardens WHERE planet_id = $1 AND subject_id = $2`, [planetId, subjectId]);
  if (g.rowCount) return { planetId, gardenId: g.rows[0].id as string };
  const s = await c.query(`SELECT name FROM subjects WHERE id = $1`, [subjectId]);
  const sort = (await c.query(`SELECT count(*)::int AS n FROM gardens WHERE planet_id = $1`, [planetId])).rows[0].n;
  const r = await c.query(`INSERT INTO gardens (planet_id, subject_id, name, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`, [planetId, subjectId, `${s.rows[0].name}花圃`, sort]);
  return { planetId, gardenId: r.rows[0].id as string };
}

/** 种下一株植物（同一花圃中同一知识点只有一株） */
export async function plantConcept(c: PoolClient, userId: string, conceptId: string, look?: { species?: string; color?: string; nickname?: string | null }, origin: "user" | "seed" = "user") {
  const k = await c.query(`SELECT id, subject_id, name FROM concepts WHERE id = $1 AND (owner_user_id IS NULL OR owner_user_id = $2)`, [conceptId, userId]);
  if (!k.rowCount) throw notFound("知识点");
  const { planetId, gardenId } = await ensureGarden(c, userId, k.rows[0].subject_id);
  const existing = await c.query(`SELECT id FROM plants WHERE garden_id = $1 AND concept_id = $2`, [gardenId, conceptId]);
  if (existing.rowCount) return { plantId: existing.rows[0].id as string, created: false };
  const pos = await nextPlantSlot(c, gardenId, planetId);
  const species = look?.species && SPECIES_KEYS.includes(look.species) ? look.species : SPECIES_KEYS[(pos.lon | 0) % SPECIES_KEYS.length];
  const color = look?.color && COLOR_KEYS.includes(look.color) ? look.color : COLOR_KEYS[((pos.lon / 7) | 0) % COLOR_KEYS.length];
  const r = await c.query(`INSERT INTO plants (garden_id, concept_id, species, color, nickname, lon, lat) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [gardenId, conceptId, species, color, look?.nickname ?? null, pos.lon, pos.lat]);
  await c.query(`INSERT INTO learning_states (user_id, concept_id, stage, stage_reason) VALUES ($1,$2,'seed','已确认这个知识点，等待第一条学习记录') ON CONFLICT DO NOTHING`, [userId, conceptId]);
  await c.query(`INSERT INTO growth_events (user_id, concept_id, event_type, to_stage, reason, origin) VALUES ($1,$2,'planted','seed',$3,$4)`,
    [userId, conceptId, `种下「${k.rows[0].name}」`, origin]);
  return { plantId: r.rows[0].id as string, created: true };
}

export type OnboardInput = {
  planetName: string; goalTitle: string; subjectId: string;
  conceptIds: string[]; newConceptNames: string[];
  natal: { conceptRef: string; species: string; color: string; nickname: string };
};

/** 开场：一次事务内创建星球、目标、路线、植物与本命花 */
export async function onboard(user: CurrentUser, inp: OnboardInput) {
  if (!SPECIES_KEYS.includes(inp.natal.species)) throw new AppError("bad_species", "未知花种");
  if (!COLOR_KEYS.includes(inp.natal.color)) throw new AppError("bad_color", "未知花色");
  const subj = await q1(`SELECT id FROM subjects WHERE id = $1 AND (owner_user_id IS NULL OR owner_user_id = $2)`, [inp.subjectId, user.id]);
  if (!subj) throw notFound("学科");
  if (!inp.conceptIds.length && !inp.newConceptNames.length) throw new AppError("no_concepts", "至少确认一个知识点");
  return withTx(async (c) => {
    const has = await c.query(`SELECT id FROM planets WHERE user_id = $1`, [user.id]);
    let planetId: string;
    if (has.rowCount) {
      planetId = has.rows[0].id;
      await c.query(`UPDATE planets SET name = $2 WHERE id = $1`, [planetId, inp.planetName.trim().slice(0, 24) || "无名星球"]);
    } else {
      planetId = (await c.query(`INSERT INTO planets (user_id, name) VALUES ($1,$2) RETURNING id`, [user.id, inp.planetName.trim().slice(0, 24) || "无名星球"])).rows[0].id;
    }
    const ids: { ref: string; id: string }[] = inp.conceptIds.map((id) => ({ ref: id, id }));
    for (const name of inp.newConceptNames.map((n) => n.trim()).filter(Boolean).slice(0, 6)) {
      const r = await createUserConcept(c, user.id, inp.subjectId, name);
      ids.push({ ref: `new:${name}`, id: r.id });
    }
    const goal = await c.query(`INSERT INTO learning_goals (user_id, subject_id, title) VALUES ($1,$2,$3) RETURNING id`, [user.id, inp.subjectId, inp.goalTitle.trim().slice(0, 120)]);
    let order = 0;
    let natalPlantId: string | null = null;
    let natalConceptId: string | null = null;
    for (const x of ids) {
      order += 1;
      await c.query(`INSERT INTO goal_concepts (goal_id, concept_id, route_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [goal.rows[0].id, x.id, order]);
      const isNatal = x.ref === inp.natal.conceptRef || x.id === inp.natal.conceptRef;
      const p = await plantConcept(c, user.id, x.id, isNatal ? { species: inp.natal.species, color: inp.natal.color, nickname: inp.natal.nickname.trim().slice(0, 16) || null } : undefined);
      if (isNatal) { natalPlantId = p.plantId; natalConceptId = x.id; }
    }
    if (!natalPlantId) throw new AppError("no_natal", "请从确认的知识点中选择本命花");
    await c.query(`UPDATE planets SET natal_plant_id = $2 WHERE id = $1`, [planetId, natalPlantId]);
    await c.query(`INSERT INTO growth_events (user_id, concept_id, event_type, reason) VALUES ($1,$2,'natal_chosen',$3)`, [user.id, natalConceptId, `选为本命花「${inp.natal.nickname || "未命名"}」`]);
    await c.query(`UPDATE users SET onboarded_at = coalesce(onboarded_at, now()), last_plant_id = $2 WHERE id = $1`, [user.id, natalPlantId]);
    return { planetId, natalPlantId };
  });
}

/** 个人空间：星球、花圃、植物、状态、目标，以及上次的上下文 */
export async function getSpace(user: CurrentUser) {
  const planet = await q1(`SELECT id, name, natal_plant_id AS "natalPlantId", created_at AS "createdAt" FROM planets WHERE user_id = $1`, [user.id]);
  if (!planet) return { user, planet: null, gardens: [], plants: [], goals: [], llm: publicLlmStatus(), subjects: await listSubjects(user.id) };
  const gardens = await q(`SELECT g.id, g.name, g.subject_id AS "subjectId", s.name AS "subjectName", g.sort_order AS "sortOrder"
                           FROM gardens g JOIN subjects s ON s.id = g.subject_id WHERE g.planet_id = $1 AND g.archived_at IS NULL ORDER BY g.sort_order`, [planet.id]);
  const plants = await q(`SELECT p.id, p.garden_id AS "gardenId", p.concept_id AS "conceptId", k.name AS "conceptName", p.species, p.color, p.nickname, p.lon, p.lat,
                                 coalesce(ls.stage, 'seed') AS stage, ls.stage_reason AS "stageReason", ls.review_due_at AS "reviewDueAt",
                                 (ls.review_due_at IS NOT NULL AND ls.review_due_at < now()) AS "reviewDue",
                                 p.id = $2 AS "isNatal",
                                 (SELECT count(*) FROM learning_evidence e WHERE e.user_id = $3 AND e.concept_id = p.concept_id AND e.revoked_at IS NULL)::int AS "evidenceCount"
                          FROM plants p JOIN gardens g ON g.id = p.garden_id JOIN concepts k ON k.id = p.concept_id
                          LEFT JOIN learning_states ls ON ls.user_id = $3 AND ls.concept_id = p.concept_id
                          WHERE g.planet_id = $1 AND p.archived_at IS NULL ORDER BY p.created_at`, [planet.id, planet.natalPlantId, user.id]);
  const goals = await q(`SELECT g.id, g.title, g.status, g.subject_id AS "subjectId", s.name AS "subjectName",
                                coalesce(json_agg(json_build_object('conceptId', k.id, 'name', k.name, 'order', gc.route_order) ORDER BY gc.route_order) FILTER (WHERE k.id IS NOT NULL), '[]') AS route
                         FROM learning_goals g JOIN subjects s ON s.id = g.subject_id
                         LEFT JOIN goal_concepts gc ON gc.goal_id = g.id LEFT JOIN concepts k ON k.id = gc.concept_id
                         WHERE g.user_id = $1 AND g.status <> 'archived' GROUP BY g.id, s.name ORDER BY g.created_at`, [user.id]);
  return { user, planet, gardens, plants, goals, llm: publicLlmStatus(), subjects: await listSubjects(user.id) };
}

export async function listSubjects(userId: string) {
  return q(`SELECT id, code, name, description, owner_user_id IS NULL AS "isPublic" FROM subjects WHERE owner_user_id IS NULL OR owner_user_id = $1 ORDER BY owner_user_id NULLS FIRST, name`, [userId]);
}

export async function listConcepts(userId: string, subjectId?: string) {
  return q(`SELECT k.id, k.name, k.subject_id AS "subjectId", s.name AS "subjectName", k.owner_user_id IS NULL AS "isPublic",
                   coalesce(array_agg(a.alias) FILTER (WHERE a.id IS NOT NULL), '{}') AS aliases
            FROM concepts k JOIN subjects s ON s.id = k.subject_id LEFT JOIN concept_aliases a ON a.concept_id = k.id
            WHERE k.archived_at IS NULL AND (k.owner_user_id IS NULL OR k.owner_user_id = $1) AND ($2::uuid IS NULL OR k.subject_id = $2)
            GROUP BY k.id, s.name ORDER BY s.name, k.name`, [userId, subjectId ?? null]);
}

/** 植物档案：一株花的全部学习记录（问答、笔记、练习、资料、证据、成长事件） */
export async function plantDossier(user: CurrentUser, plantId: string) {
  const p = await q1(`SELECT p.id, p.concept_id AS "conceptId", k.name AS "conceptName", k.summary, s.name AS "subjectName", k.subject_id AS "subjectId",
                             p.species, p.color, p.nickname, p.created_at AS "plantedAt", pl.natal_plant_id = p.id AS "isNatal", g.name AS "gardenName"
                      FROM plants p JOIN gardens g ON g.id = p.garden_id JOIN planets pl ON pl.id = g.planet_id
                      JOIN concepts k ON k.id = p.concept_id JOIN subjects s ON s.id = k.subject_id
                      WHERE p.id = $1 AND pl.user_id = $2`, [plantId, user.id]);
  if (!p) throw notFound("植物");
  await q(`UPDATE users SET last_plant_id = $2 WHERE id = $1`, [user.id, plantId]);
  const growth = await growthExplanation(user.id, p.conceptId);
  const qa = await q(`SELECT DISTINCT ON (qm.id) qm.id AS "questionId", qm.conversation_id AS "conversationId", qm.content AS question, qm.created_at AS "createdAt",
                             mc.status, c.title, c.origin, to_char(qm.created_at AT TIME ZONE $3, 'YYYY-MM-DD HH24:MI') AS "localTime"
                      FROM message_concepts mc
                      JOIN messages m0 ON m0.id = mc.message_id
                      JOIN messages qm ON qm.id = CASE WHEN m0.role = 'user' THEN m0.id ELSE m0.reply_to_id END
                      JOIN conversations c ON c.id = qm.conversation_id
                      WHERE qm.user_id = $1 AND mc.concept_id = $2 AND mc.status <> 'rejected' AND c.archived_at IS NULL
                      ORDER BY qm.id, mc.status = 'confirmed' DESC`, [user.id, p.conceptId, user.timezone]);
  qa.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const notes = await q(`SELECT id, title, content, created_at AS "createdAt", source_message_id AS "sourceMessageId" FROM notes WHERE user_id = $1 AND concept_id = $2 AND archived_at IS NULL ORDER BY created_at DESC`, [user.id, p.conceptId]);
  const attempts = await q(`SELECT a.id, a.mode, a.submitted_at AS "submittedAt", t.title, tv.version_no AS "versionNo", tv.is_variant AS "isVariant", e.verdict,
                                   (SELECT count(*) FROM hint_events h WHERE h.attempt_id = a.id)::int AS hints
                            FROM attempts a JOIN task_versions tv ON tv.id = a.task_version_id JOIN tasks t ON t.id = tv.task_id
                            JOIN task_concepts tc ON tc.task_id = t.id LEFT JOIN evaluations e ON e.attempt_id = a.id
                            WHERE a.user_id = $1 AND tc.concept_id = $2 AND a.status = 'evaluated' ORDER BY a.submitted_at DESC`, [user.id, p.conceptId]);
  const materials = await q(`SELECT DISTINCT m.id, m.title, v.version_no AS "versionNo", v.id AS "versionId", mc.status
                             FROM material_concepts mc JOIN material_versions v ON v.id = mc.version_id JOIN materials m ON m.id = v.material_id
                             WHERE mc.concept_id = $2 AND mc.status <> 'rejected' AND (m.owner_user_id IS NULL OR m.owner_user_id = $1) AND m.archived_at IS NULL`, [user.id, p.conceptId]);
  const timeline = await q(`SELECT id, event_type AS "eventType", from_stage AS "fromStage", to_stage AS "toStage", reason, origin, created_at AS "createdAt"
                            FROM growth_events WHERE user_id = $1 AND concept_id = $2 ORDER BY created_at DESC LIMIT 40`, [user.id, p.conceptId]);
  const prereqs = await q(`SELECT k.id, k.name, coalesce(ls.stage, 'seed') AS stage FROM concept_prerequisites cp JOIN concepts k ON k.id = cp.prereq_concept_id
                           LEFT JOIN learning_states ls ON ls.user_id = $1 AND ls.concept_id = k.id WHERE cp.concept_id = $2`, [user.id, p.conceptId]);
  const cards = await q(`SELECT kc.id, cv.title, cv.version_no AS "versionNo", cv.created_at AS "createdAt" FROM knowledge_cards kc
                         JOIN LATERAL (SELECT * FROM card_versions v WHERE v.card_id = kc.id ORDER BY version_no DESC LIMIT 1) cv ON true
                         WHERE kc.user_id = $1 AND kc.concept_id = $2 AND kc.archived_at IS NULL`, [user.id, p.conceptId]);
  return { plant: p, growth, qa, notes, attempts, materials, timeline, prereqs, cards };
}

export async function updateAppearance(user: CurrentUser, plantId: string, look: { species?: string; color?: string; nickname?: string | null; natal?: boolean }) {
  return withTx(async (c) => {
    const p = await c.query(`SELECT p.id, p.concept_id, pl.id AS planet_id, p.species, p.color FROM plants p JOIN gardens g ON g.id = p.garden_id JOIN planets pl ON pl.id = g.planet_id
                             WHERE p.id = $1 AND pl.user_id = $2 FOR UPDATE OF p`, [plantId, user.id]);
    if (!p.rowCount) throw notFound("植物");
    const row = p.rows[0];
    if (look.species && !SPECIES_KEYS.includes(look.species)) throw new AppError("bad_species", "未知花种");
    if (look.color && !COLOR_KEYS.includes(look.color)) throw new AppError("bad_color", "未知花色");
    await c.query(`UPDATE plants SET species = coalesce($2, species), color = coalesce($3, color), nickname = CASE WHEN $5 THEN $4 ELSE nickname END WHERE id = $1`,
      [plantId, look.species ?? null, look.color ?? null, look.nickname?.slice(0, 16) ?? null, look.nickname !== undefined]);
    if (look.species || look.color) {
      await c.query(`INSERT INTO growth_events (user_id, concept_id, event_type, reason) VALUES ($1,$2,'appearance_changed','更换外观（不影响学习记录与成长阶段）')`, [user.id, row.concept_id]);
    }
    if (look.natal) {
      await c.query(`UPDATE planets SET natal_plant_id = $2 WHERE id = $1`, [row.planet_id, plantId]);
      await c.query(`INSERT INTO growth_events (user_id, concept_id, event_type, reason) VALUES ($1,$2,'natal_chosen','改选为本命花')`, [user.id, row.concept_id]);
    }
    return { ok: true };
  });
}

export async function addPlant(user: CurrentUser, inp: { conceptId?: string; subjectId?: string; name?: string; species?: string; color?: string }) {
  return withTx(async (c) => {
    let conceptId = inp.conceptId;
    if (!conceptId) {
      if (!inp.subjectId || !inp.name) throw new AppError("bad_input", "需要知识点或（学科 + 名称）");
      conceptId = (await createUserConcept(c, user.id, inp.subjectId, inp.name)).id;
    }
    return plantConcept(c, user.id, conceptId, { species: inp.species, color: inp.color });
  });
}

export async function createNote(user: CurrentUser, inp: { conceptId: string; title: string; content: string; sourceMessageId?: string | null }) {
  if (!inp.content.trim()) throw new AppError("empty", "笔记内容不能为空");
  return withTx(async (c) => {
    const k = await c.query(`SELECT id FROM concepts WHERE id = $1 AND (owner_user_id IS NULL OR owner_user_id = $2)`, [inp.conceptId, user.id]);
    if (!k.rowCount) throw notFound("知识点");
    if (inp.sourceMessageId) {
      const m = await c.query(`SELECT 1 FROM messages WHERE id = $1 AND user_id = $2`, [inp.sourceMessageId, user.id]);
      if (!m.rowCount) throw notFound("消息");
    }
    const n = await c.query(`INSERT INTO notes (user_id, concept_id, source_message_id, title, content) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [user.id, inp.conceptId, inp.sourceMessageId ?? null, inp.title.trim().slice(0, 60) || "笔记", inp.content.slice(0, 8000)]);
    const r = await addEvidence(c, { userId: user.id, conceptId: inp.conceptId, kind: "note", noteId: n.rows[0].id, detail: `写下笔记《${inp.title.trim().slice(0, 30) || "笔记"}》` });
    return { noteId: n.rows[0].id, growth: r.events };
  });
}

export async function selfReport(user: CurrentUser, conceptId: string, text: string) {
  return withTx(async (c) => {
    const r = await addEvidence(c, { userId: user.id, conceptId, kind: "self_report", detail: text.trim().slice(0, 120) || "我觉得我理解了" });
    return { growth: r.events };
  });
}

/** 成长时间轴（只读取真实成长事件） */
export async function timeline(user: CurrentUser, opts: { limit?: number; before?: string } = {}) {
  return q(`SELECT g.id, g.event_type AS "eventType", g.from_stage AS "fromStage", g.to_stage AS "toStage", g.reason, g.origin, g.created_at AS "createdAt",
                   to_char(g.created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS "localDate", to_char(g.created_at AT TIME ZONE $2, 'HH24:MI') AS "localTime",
                   g.concept_id AS "conceptId", k.name AS "conceptName", p.id AS "plantId", p.species, p.color
            FROM growth_events g JOIN concepts k ON k.id = g.concept_id
            LEFT JOIN LATERAL (SELECT p.* FROM plants p JOIN gardens gd ON gd.id = p.garden_id JOIN planets pl ON pl.id = gd.planet_id
                               WHERE pl.user_id = g.user_id AND p.concept_id = g.concept_id LIMIT 1) p ON true
            WHERE g.user_id = $1 AND ($3::timestamptz IS NULL OR g.created_at < $3)
            ORDER BY g.created_at DESC, g.id DESC LIMIT $4`, [user.id, user.timezone, opts.before ?? null, opts.limit ?? 80]);
}

export async function setPreferences(user: CurrentUser, prefs: { reducedMotion?: boolean; renderMode?: "auto" | "3d" | "2d"; timezone?: string }) {
  if (prefs.timezone) {
    const ok = await q1(`SELECT 1 FROM pg_timezone_names WHERE name = $1`, [prefs.timezone]);
    if (!ok) throw new AppError("bad_tz", "未知时区");
  }
  await q(`UPDATE users SET reduced_motion = coalesce($2, reduced_motion), render_mode = coalesce($3, render_mode), timezone = coalesce($4, timezone) WHERE id = $1`,
    [user.id, prefs.reducedMotion ?? null, prefs.renderMode ?? null, prefs.timezone ?? null]);
  return { ok: true };
}

/** 新建个人学科（产品不局限于数据库课程） */
export async function createSubject(user: CurrentUser, name: string) {
  const n = name.trim().slice(0, 30);
  if (!n) throw new AppError("bad_subject", "学科名称不能为空");
  const code = "u-" + normName(n).slice(0, 24);
  const existing = await q1(`SELECT id, name FROM subjects WHERE (owner_user_id IS NULL OR owner_user_id = $1) AND (name = $2 OR code = $3)`, [user.id, n, code]);
  if (existing) return existing;
  return q1(`INSERT INTO subjects (owner_user_id, code, name) VALUES ($1,$2,$3) RETURNING id, name`, [user.id, code, n]);
}
