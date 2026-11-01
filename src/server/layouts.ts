/**
 * 创造模式：星球布局持久化（G4 数据库闭环 / G5 并发与权限）。
 *  - getLayout：当前用户星球的工作布局（revision + status + items）。
 *  - saveDraft：乐观并发保存（baseRevision 必须匹配当前 revision，否则 409），revision+1，事务内替换 items。
 *  - publishLayout：把当前 revision 标记为 published（publishedRevision=revision）。
 * 服务端校验 kind、数值范围、数量与有限性，不信任前端。
 */
import { q, q1, withTx } from "@/db";
import { validateParts } from "@/lib/home/diy-parts";
import type { CurrentUser } from "./auth";
import { AppError, notFound } from "./errors";

export type LayoutItemInput = {
  instanceId?: string | null; kind: string; x: number; z: number; rot?: number; scale?: number;
  width?: number | null; length?: number | null; color?: string | null; stage?: string | null;
};

// H14：与服务端 schema 的 kind 约束（迁移 0005/0006）保持一致——建筑 7 种 + 群组 2 种也必须可保存，
// 否则「搬走/复制初始建筑」在保存时会被判「未知素材」而整体失败。
const VALID_KINDS = new Set([
  "lamp", "bush", "tree", "pot", "stone", "fence", "chair", "flower", "flower2", "flower3", "rock", "rose", "soil", "road",
  "cottage", "greenhouse", "observatory", "seedshed", "arch", "pond", "sign",
  "lotus", "grassGroup", "wildflowerGroup",
]);
const MAX_ITEMS = 300;

function num(v: unknown, min: number, max: number, what: string): number {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < min || n > max) throw new AppError("bad_layout", `${what} 超出范围 ${min}~${max}`, 400);
  return n;
}

async function findPlanet(user: CurrentUser): Promise<string> {
  const p = await q1(`SELECT id FROM planets WHERE user_id = $1`, [user.id]);
  if (!p) throw notFound("星球");
  return p.id as string;
}

export async function getLayout(user: CurrentUser) {
  const planetId = await findPlanet(user);
  const layout = await q1(
    `SELECT id, revision, status, schema_version AS "schemaVersion", published_revision AS "publishedRevision", terrain, water, (published_items IS NOT NULL) AS "hasPublished", bed_moves AS "bedMoves", updated_at AS "updatedAt"
     FROM planet_layouts WHERE planet_id = $1`, [planetId]);
  if (!layout) return { planetId, revision: 0, status: "draft" as const, schemaVersion: 1, publishedRevision: null, hasPublished: false, bedMoves: {} as BedMoves, terrain: null as TerrainPoints | null, water: null as number | null, items: [] as LayoutItemInput[] };
  const items = await q(
    `SELECT instance_id AS "instanceId", kind, x, z, rot, scale, width, length, color, stage, parts
     FROM planet_layout_items WHERE layout_id = $1 ORDER BY sort_order`, [layout.id]);
  return { planetId, revision: layout.revision as number, status: layout.status as string, schemaVersion: (layout.schemaVersion as number) ?? 1, publishedRevision: layout.publishedRevision as number | null, hasPublished: !!layout.hasPublished, bedMoves: (layout.bedMoves as BedMoves) ?? {}, items: items as LayoutItemInput[] , terrain: (layout.terrain as TerrainPoints | null) ?? null, water: (layout.water as number | null) ?? null };
}

export type BedMoves = Record<string, { x: number; z: number; rot?: number }>;
/** V4-R30：地形稀疏高度场 */
export type TerrainPoints = { i: number; j: number; h: number }[];

/** V4-R22：花圃位移清洗——键必须是 gardenId 形态、坐标在球冠内 */
function cleanBedMoves(input: unknown): BedMoves {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new AppError('bad_beds', 'bedMoves 必须是对象', 400);
  const out: BedMoves = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(k)) throw new AppError('bad_beds', `花圃键非法：${k}`, 400);
    const o = v as { x?: unknown; z?: unknown; rot?: unknown } | null;
    if (!o || typeof o !== 'object') throw new AppError('bad_beds', `花圃 ${k} 的值非法`, 400);
    out[k] = { x: num(o.x, -6, 6, 'bed.x'), z: num(o.z, -6, 6, 'bed.z'), rot: o.rot == null ? 0 : num(o.rot, -3600, 3600, 'bed.rot') };
  }
  return out;
}

export async function saveDraft(user: CurrentUser, baseRevision: number, items: LayoutItemInput[], bedMoves?: unknown, terrain?: unknown, water?: unknown) {
  const planetId = await findPlanet(user);
  if (!Array.isArray(items)) throw new AppError("bad_layout", "items 必须是数组", 400);
  if (items.length > MAX_ITEMS) throw new AppError("too_many", `对象太多（上限 ${MAX_ITEMS}）`, 400);
  const beds = cleanBedMoves(bedMoves);
  const clean = items.map((it, i) => {
    if (!it || !VALID_KINDS.has(it.kind)) throw new AppError("bad_kind", `未知素材 ${it?.kind}`, 400);
    return {
      instanceId: (it as { instanceId?: unknown }).instanceId != null ? String((it as { instanceId?: unknown }).instanceId).slice(0, 64) : null,
      kind: it.kind,
      x: num(it.x, -6, 6, "x"), z: num(it.z, -6, 6, "z"),
      rot: it.rot == null ? 0 : num(it.rot, -3600, 3600, "rot"),
      scale: it.scale == null ? 1 : num(it.scale, 0.2, 5, "scale"),
      width: it.width == null ? null : num(it.width, 0.05, 4, "width"),
      length: it.length == null ? null : num(it.length, 0.05, 4, "length"),
      color: it.color ?? null, stage: it.stage ?? null, sortOrder: i,
      // H34：服务端校验 DIY 分区——部位必须属于该 kind、颜色必须 #rrggbb；旧数据无 parts 则为 null
      parts: (() => {
        const r = validateParts(it.kind, (it as { parts?: unknown }).parts);
        if (!r.ok) throw new AppError("bad_parts", r.error, 400);
        return r.value;
      })(),
    };
  });
  return withTx(async (c) => {
    const cur = await c.query(`SELECT id, revision FROM planet_layouts WHERE planet_id = $1 FOR UPDATE`, [planetId]);
    let layoutId: string, nextRevision: number;
    if (!cur.rowCount) {
      const r = await c.query(`INSERT INTO planet_layouts (planet_id, revision, status, schema_version, bed_moves, terrain, water) VALUES ($1, 1, 'draft', 2, $2, $3, $4) RETURNING id, revision`, [planetId, JSON.stringify(beds), terrain ? JSON.stringify(terrain) : null, typeof water === 'number' ? water : null]);
      layoutId = r.rows[0].id; nextRevision = 1;
    } else {
      if (baseRevision !== cur.rows[0].revision) throw new AppError("conflict", "布局已被其他窗口修改，请重载", 409);
      layoutId = cur.rows[0].id; nextRevision = cur.rows[0].revision + 1;
      await c.query(`UPDATE planet_layouts SET revision = $2, status = 'draft', schema_version = 2, bed_moves = $3, terrain = $4, water = $5, updated_at = now() WHERE id = $1`, [layoutId, nextRevision, JSON.stringify(beds), terrain ? JSON.stringify(terrain) : null, typeof water === 'number' ? water : null]);
      await c.query(`DELETE FROM planet_layout_items WHERE layout_id = $1`, [layoutId]);
    }
    for (const it of clean) {
      await c.query(
        `INSERT INTO planet_layout_items (layout_id, instance_id, kind, x, z, rot, scale, width, length, color, stage, parts, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [layoutId, it.instanceId, it.kind, it.x, it.z, it.rot, it.scale, it.width, it.length, it.color, it.stage, it.parts ?? null, it.sortOrder]);
    }
    return { planetId, revision: nextRevision, status: "draft" as const };
  });
}

export async function publishLayout(user: CurrentUser, baseRevision: number) {
  const planetId = await findPlanet(user);
  return withTx(async (c) => {
    const r = await c.query(`SELECT id, revision, bed_moves, terrain, water FROM planet_layouts WHERE planet_id = $1 FOR UPDATE`, [planetId]);
    if (!r.rowCount) throw notFound("布局");
    if (baseRevision !== r.rows[0].revision) throw new AppError("conflict", "布局已被其他窗口修改，请重载", 409);
    const items = await c.query(
      `SELECT instance_id AS "instanceId", kind, x, z, rot, scale, width, length, color, stage, parts
       FROM planet_layout_items WHERE layout_id = $1 ORDER BY sort_order`, [r.rows[0].id]);
    // 发布时把当前布局固化成快照：参观只读与「恢复上一已发布版本」都用它
    await c.query(
      `UPDATE planet_layouts SET status = 'published', published_revision = revision, published_items = $2::jsonb, updated_at = now() WHERE id = $1`,
      [r.rows[0].id, JSON.stringify({ version: 2, items: items.rows, bedMoves: r.rows[0].bed_moves ?? {}, terrain: r.rows[0].terrain ?? null, water: r.rows[0].water ?? null })]);
    return { planetId, revision: r.rows[0].revision as number, status: "published" as const };
  });
}

/** 恢复上一已发布版本：用 published_items 快照替换当前草稿（revision+1，不直接发布）。 */
export async function revertToPublished(user: CurrentUser) {
  const planetId = await findPlanet(user);
  return withTx(async (c) => {
    const r = await c.query(`SELECT id, revision, published_items AS "publishedItems" FROM planet_layouts WHERE planet_id = $1 FOR UPDATE`, [planetId]);
    if (!r.rowCount) throw notFound("布局");
    const raw = r.rows[0].publishedItems as LayoutItemInput[] | { items: LayoutItemInput[]; bedMoves: BedMoves; terrain: TerrainPoints | null; water: number | null } | null;
    if (!raw) throw notFound("已发布版本");
    const snap = Array.isArray(raw) ? raw : raw.items;
    // Legacy array snapshots did not contain terrain/bed transforms: preserve those fields.
    if (!Array.isArray(raw)) {
      await c.query(`UPDATE planet_layouts SET bed_moves = $2, terrain = $3, water = $4 WHERE id = $1`,
        [r.rows[0].id, JSON.stringify(raw.bedMoves), raw.terrain == null ? null : JSON.stringify(raw.terrain), raw.water]);
    }
    const nextRev = (r.rows[0].revision as number) + 1;
    await c.query(`UPDATE planet_layouts SET revision = $2, status = 'draft', updated_at = now() WHERE id = $1`, [r.rows[0].id, nextRev]);
    await c.query(`DELETE FROM planet_layout_items WHERE layout_id = $1`, [r.rows[0].id]);
    let i = 0;
    for (const it of snap) {
      await c.query(
        `INSERT INTO planet_layout_items (layout_id, instance_id, kind, x, z, rot, scale, width, length, color, stage, parts, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [r.rows[0].id, it.instanceId ?? null, it.kind, it.x, it.z, it.rot ?? 0, it.scale ?? 1, it.width ?? null, it.length ?? null, it.color ?? null, it.stage ?? null, (it as { parts?: Record<string, string> | null }).parts ?? null, i++]);
    }
    return { planetId, revision: nextRev, status: "draft" as const, items: snap, ...(Array.isArray(raw) ? {} : { bedMoves: raw.bedMoves, terrain: raw.terrain, water: raw.water }) };
  });
}
