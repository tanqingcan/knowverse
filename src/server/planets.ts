/**
 * 公开只读星球（参观 /visit）：跨用户读取，只返回对方在任意班级里显式打开的内容。
 *  - share_planet → 星球名、本命花外观、花圃结构
 *  - share_stages → 植物列表（含成长阶段，不含对话/练习/证据等私有内容）
 * 复用 sharing_preferences 的分享开关（与 classes.ts 的 galaxy() 同一套权限语义），
 * 未公开任何内容时返回 403。
 */
import { q, q1 } from "@/db";
import { forbidden, notFound } from "./errors";

export type PublicPlanet = {
  userId: string;
  displayName: string;
  planetName: string | null;
  natalPlant: {
    id: string;
    conceptName: string | null;
    species: string;
    color: string;
    nickname: string | null;
  } | null;
  gardens: { id: string; name: string; subjectId: string; subjectName: string; sortOrder: number }[];
  plants: {
    id: string;
    gardenId: string;
    conceptId: string;
    conceptName: string;
    species: string;
    color: string;
    nickname: string | null;
    stage: string;
    isNatal: boolean;
  }[];
  /** 参观只读：对方「已发布」的创造模式布局（未发布则为空数组） */
  decor: {
    kind: string; x: number; z: number; rot: number; scale: number;
    width: number | null; length: number | null; color: string | null; stage: string | null;
  }[];
};

export async function publicPlanet(targetUserId: string): Promise<PublicPlanet> {
  const target = await q1<{
    id: string;
    displayName: string;
    planetId: string | null;
    planetName: string | null;
    natalPlantId: string | null;
    natalSpecies: string | null;
    natalColor: string | null;
    natalNickname: string | null;
    natalConceptName: string | null;
  }>(
    `SELECT u.id, u.display_name AS "displayName", pl.id AS "planetId", pl.name AS "planetName",
            pl.natal_plant_id AS "natalPlantId", np.species AS "natalSpecies", np.color AS "natalColor",
            np.nickname AS "natalNickname", k.name AS "natalConceptName"
     FROM users u
     LEFT JOIN planets pl ON pl.user_id = u.id
     LEFT JOIN plants np ON np.id = pl.natal_plant_id
     LEFT JOIN concepts k ON k.id = np.concept_id
     WHERE u.id = $1`,
    [targetUserId],
  );
  if (!target) throw notFound("用户");

  const sp = await q1<{ sharePlanet: boolean | null; shareStages: boolean | null }>(
    `SELECT bool_or(share_planet) AS "sharePlanet", bool_or(share_stages) AS "shareStages"
     FROM sharing_preferences WHERE user_id = $1`,
    [targetUserId],
  );
  const sharePlanet = !!sp?.sharePlanet;
  const shareStages = !!sp?.shareStages;
  if (!sharePlanet && !shareStages) throw forbidden();

  const natalPlant = sharePlanet && target.natalPlantId && target.natalSpecies && target.natalColor
    ? {
        id: target.natalPlantId,
        conceptName: target.natalConceptName,
        species: target.natalSpecies,
        color: target.natalColor,
        nickname: target.natalNickname,
      }
    : null;

  let gardens: PublicPlanet["gardens"] = [];
  if (sharePlanet && target.planetId) {
    gardens = await q(
      `SELECT g.id, g.name, g.subject_id AS "subjectId", s.name AS "subjectName", g.sort_order AS "sortOrder"
       FROM gardens g JOIN subjects s ON s.id = g.subject_id
       WHERE g.planet_id = $1 AND g.archived_at IS NULL ORDER BY g.sort_order, g.created_at`,
      [target.planetId],
    );
  }

  let plants: PublicPlanet["plants"] = [];
  if (shareStages && target.planetId) {
    plants = await q(
      `SELECT p.id, p.garden_id AS "gardenId", p.concept_id AS "conceptId", k.name AS "conceptName",
              p.species, p.color, p.nickname, coalesce(ls.stage, 'seed') AS stage,
              p.id = $2 AS "isNatal"
       FROM plants p JOIN gardens g ON g.id = p.garden_id JOIN concepts k ON k.id = p.concept_id
       LEFT JOIN learning_states ls ON ls.user_id = $3 AND ls.concept_id = p.concept_id
       WHERE g.planet_id = $1 AND p.archived_at IS NULL ORDER BY p.created_at`,
      [target.planetId, target.natalPlantId, targetUserId],
    );
  }

  // 创造模式布局：只有对方明确「发布」过，才向参观者展示（只读）
  let decor: PublicPlanet["decor"] = [];
  if (sharePlanet && target.planetId) {
    const layout = await q1<{ id: string; status: string }>(
      `SELECT id, status FROM planet_layouts WHERE planet_id = $1`, [target.planetId]);
    if (layout?.status === "published") {
      decor = await q<PublicPlanet["decor"][number]>(
        `SELECT kind, x, z, rot, scale, width, length, color, stage
         FROM planet_layout_items WHERE layout_id = $1 ORDER BY sort_order`, [layout.id]);
    }
  }

  return {
    userId: target.id,
    displayName: target.displayName,
    planetName: sharePlanet ? target.planetName : null,
    natalPlant,
    gardens,
    plants,
    decor,
  };
}
