/**
 * 家园模式 v3 · 全场景素材目录与实例登记（H01）
 *
 * 约定：
 *  - `assetId` 是「素材类型」的稳定 ID，**不是**场景实例 ID；场景实例由布局数据（planet_layout_items 或初始模板）持有。
 *  - 所有地表建模默认 `editable: true`；天空/恒星/星球本体归为 `environment`，编辑语义单独说明（H04）。
 *  - `initial` 来自现有固定布局（`SPOTS` / `TREES` / `WILD_ROCKS`），H03 会把它们迁成可编辑实例后只作为「首次创建」模板。
 *  - `colorParts` 为 DIY 工作台（H28–H34）可改色分区；没有独立材质槽的模型先补建模结构（H29），不能整栋统一染色。
 */
import { SPOTS, TREES, WILD_ROCKS } from "@/components/world/layout";
import { DECOR_CATALOG, type DecorKind } from "@/lib/decor";

export type AssetCategory =
  | "building"   // 房屋/温室/观星台/棚/拱门
  | "flora"      // 树/灌木/草/花
  | "stone"      // 石头/石堆
  | "ground"     // 泥土/草地覆盖/花圃边界
  | "path"       // 道路/石径
  | "water"      // 池塘/木桥
  | "light"      // 路灯
  | "sign"       // 木牌/标签
  | "furniture"  // 长椅等
  | "environment" // 天空/恒星/星球本体
  | "system";    // 星灯/角色停靠点等系统交互点

export type AssetSemantics =
  | "business-entry" // 点击进入业务（学习/资料等）
  | "hotspot"        // 点击有热点行为
  | "decor"          // 纯装饰
  | "environment"    // 环境，不参与地表编辑
  | "system";        // 系统点（星灯停靠、角色交互）

export type SceneAssetDef = {
  assetId: string;
  name: string;
  category: AssetCategory;
  /** 模型来源：程序化组件名 / 外部 CC 素材 / 装饰 kind / 环境 */
  source: string;
  /** 初始姿态（球冠平面 x/z + yaw[deg]；环境类可空） */
  initial?: { x: number; z: number; yaw?: number; scale?: number };
  /** 可变换范围（球冠 x/z 以 PLANET_R 为半径的可见区；scale 与服务端校验一致 0.2–5） */
  limits?: { x?: [number, number]; z?: [number, number]; yaw?: [number, number]; scale?: [number, number] };
  /** DIY 可改色分区；空数组表示当前模型无独立材质槽，需要先补结构（H29） */
  colorParts: string[];
  semantics: AssetSemantics;
  /** 地表建模默认可编辑；环境类单独处理（H04） */
  editable: boolean;
  /** 是否可从素材栏再次放置（对应 DECOR_CATALOG 的 kind） */
  placeable?: boolean;
  /** 是否为程序化群组（草地/野花）：整组调整密度/位置，不逐株编辑（H04） */
  group?: boolean;
  /** 点击后打开的业务面板（business-entry） */
  opens?: string;
};

/** 地表可变换的通用范围：球冠半径约 2.4 内（再远到背面仍可达，H10 用球面投影处理） */
const GROUND_LIMITS: SceneAssetDef["limits"] = { x: [-4.2, 4.2], z: [-4.2, 4.2], yaw: [-180, 180], scale: [0.2, 5] };

/**
 * 装饰 kind → 目录类别（显式穷尽映射，新增 DecorKind 会在此处 TS 报缺键）。
 * 第一遍用 includes 链兜底，审查发现新增 kind 会静默落到 furniture，故改为 Record 穷尽。
 */
export const DECOR_CATEGORY: Record<DecorKind, AssetCategory> = {
  lamp: "light",
  bush: "flora",
  tree: "flora",
  pot: "flora",
  stone: "stone",
  fence: "building",
  chair: "furniture",
  flower: "flora",
  flower2: "flora",
  flower3: "flora",
  rock: "stone",
  rose: "flora",
  soil: "ground",
  road: "path",
};

export const SCENE_ASSETS: SceneAssetDef[] = [
  /* ───────── 建筑：全部可编辑（H02 要求不允许「原模型固定」双轨） ───────── */
  {
    assetId: "bld.cottage", name: "暖光书屋", category: "building", source: "Props3D.Cottage",
    initial: { ...SPOTS.cottage, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: ["roof", "wall", "window", "doorTrim"], semantics: "business-entry", opens: "chat", editable: true,
  },
  {
    assetId: "bld.greenhouse", name: "资料温室", category: "building", source: "Props3D.Greenhouse",
    initial: { ...SPOTS.greenhouse, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: ["roofGlass", "frame", "base"], semantics: "business-entry", opens: "materials", editable: true,
  },
  {
    assetId: "bld.observatory", name: "观测台", category: "building", source: "Props3D.Observatory",
    initial: { ...SPOTS.observatory, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: ["dome", "wall", "lens"], semantics: "hotspot", editable: true,
  },
  {
    assetId: "bld.seedShed", name: "种子小棚", category: "building", source: "Props3D.SeedShed",
    initial: { ...SPOTS.seedShed, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: ["roof", "wall"], semantics: "decor", editable: true,
  },
  {
    assetId: "bld.arch", name: "花园拱门", category: "building", source: "Props3D.GardenArch",
    initial: { ...SPOTS.arch, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: ["frame", "vine"], semantics: "decor", editable: true,
  },

  /* ───────── 家具 / 灯 / 牌 / 水 ───────── */
  {
    assetId: "furn.bench", name: "长椅", category: "furniture", source: "Props3D.Bench",
    initial: { ...SPOTS.bench, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: ["wood", "leg"], semantics: "decor", editable: true,
  },
  {
    assetId: "light.lamp", name: "路灯", category: "light", source: "Props3D.Lamp",
    initial: { x: SPOTS.lamp.x, z: SPOTS.lamp.z, yaw: 0, scale: 1 }, limits: GROUND_LIMITS,
    // 初始路灯实例：可编辑；「可再次放置」的灯素材由 decor.lamp 承担，避免类型/实例双记录
    colorParts: ["post", "shade", "bulb"], semantics: "decor", editable: true,
  },
  {
    assetId: "sign.board", name: "木牌", category: "sign", source: "Props3D.Sign",
    initial: { ...SPOTS.sign, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: ["board", "post", "ink"], semantics: "decor", editable: true,
  },
  {
    assetId: "water.pond", name: "小池塘与木桥", category: "water", source: "Props3D.PondBridge",
    initial: { ...SPOTS.pond, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: ["water", "bridge", "rim"], semantics: "decor", editable: true,
  },

  /* ───────── 系统点：星灯停靠 / 门口 / 角色 ───────── */
  {
    assetId: "sys.lampSpot", name: "星灯停靠点", category: "system", source: "layout.SPOTS.lampSpot",
    initial: { x: SPOTS.lampSpot.x, z: SPOTS.lampSpot.z, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: [], semantics: "system", editable: true,
  },
  {
    assetId: "sys.cottageDoor", name: "书屋门口", category: "system", source: "layout.SPOTS.cottageDoor",
    initial: { x: SPOTS.cottageDoor.x, z: SPOTS.cottageDoor.z, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: [], semantics: "system", editable: true,
  },
  {
    assetId: "sys.greenhouseDoor", name: "温室门口", category: "system", source: "layout.SPOTS.greenhouseDoor",
    initial: { x: SPOTS.greenhouseDoor.x, z: SPOTS.greenhouseDoor.z, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: [], semantics: "system", editable: true,
  },

  /* ───────── 固定植被：树 / 灌木（H04 说明：地表建模默认可编辑） ───────── */
  ...TREES.map((t, i): SceneAssetDef => ({
    assetId: `flora.tree${i + 1}`,
    name: t.kind === "tree" ? `开花树 ${i + 1}` : `灌木 ${i + 1}`,
    category: "flora", source: "GardenWorld.FloraField",
    initial: { x: t.x, z: t.z, scale: 1 }, limits: GROUND_LIMITS,
    colorParts: ["crown", "trunk"], semantics: "decor", editable: true,
  })),

  /* ───────── 石头 ───────── */
  ...WILD_ROCKS.map((r: { x: number; z: number }, i: number): SceneAssetDef => ({
    assetId: `stone.wild${i + 1}`, name: `野石 ${i + 1}`, category: "stone",
    source: "GardenWorld.DecorStone", initial: { x: r.x, z: r.z, scale: 1.3 }, limits: GROUND_LIMITS,
    colorParts: ["body"], semantics: "decor", editable: true,
  })),

  /* ───────── 草地 / 野花群组（H04：程序化群组，可整组调整密度/位置，不逐株编辑） ───────── */
  {
    assetId: "flora.grassGroup", name: "草地群组", category: "ground", source: "GardenWorld.GrassField (instanced)",
    limits: { x: [-4.2, 4.2], z: [-4.2, 4.2], scale: [0.2, 5] },
    colorParts: ["blade"], semantics: "decor", editable: true, group: true,
  },
  {
    assetId: "flora.wildflowerGroup", name: "野花群组", category: "flora", source: "GardenWorld.Wildflowers (instanced)",
    limits: { x: [-4.2, 4.2], z: [-4.2, 4.2], scale: [0.2, 5] },
    colorParts: ["petal", "center"], semantics: "decor", editable: true, group: true,
  },

  /* ───────── 道路：现有四条固定小路（H09：道路随端点重建或成为独立可编辑对象） ───────── */
  {
    assetId: "path.memory", name: "回忆小径", category: "path", source: "layout.MEMORY_PATH",
    limits: { scale: [0.2, 5] }, colorParts: ["stone"], semantics: "decor", editable: true,
  },
  {
    assetId: "path.green", name: "温室小路", category: "path", source: "layout.GREEN_PATH",
    limits: { scale: [0.2, 5] }, colorParts: ["stone"], semantics: "decor", editable: true,
  },
  {
    assetId: "path.star", name: "星径", category: "path", source: "layout.STAR_PATH",
    limits: { scale: [0.2, 5] }, colorParts: ["stone"], semantics: "decor", editable: true,
  },
  {
    assetId: "path.seed", name: "种子小径", category: "path", source: "layout.SEED_PATH",
    limits: { scale: [0.2, 5] }, colorParts: ["stone"], semantics: "decor", editable: true,
  },

  /* ───────── 可放置装饰素材（来自 DECOR_CATALOG，14 种） ───────── */
  ...DECOR_CATALOG.map((d): SceneAssetDef => ({
    assetId: `decor.${d.kind}`,
    name: d.label,
    category: DECOR_CATEGORY[d.kind],
    source: `Decor3D/${d.kind}`,
    limits: { x: [-4.2, 4.2], z: [-4.2, 4.2], yaw: [-180, 180], scale: [0.2, 5] },
    colorParts: d.surface ? ["surface"] : ["primary"],
    semantics: "decor", editable: true, placeable: true,
  })),

  /* ───────── 环境：天空 / 恒星 / 星球本体（H04，语义与地表家具分开） ───────── */
  {
    assetId: "env.sky", name: "天空与星点", category: "environment", source: "ui.Sky（4 层 sky-layer）",
    colorParts: ["skyTheme"], semantics: "environment", editable: false,
  },
  {
    assetId: "env.stars", name: "恒星与远景行星", category: "environment", source: "GardenWorld.DistantPlanet ×3",
    colorParts: ["tint"], semantics: "environment", editable: false,
  },
  {
    assetId: "env.planet", name: "星球本体与地形", category: "environment", source: "terrain.planetGeometry + paintTerrain",
    colorParts: ["terrain"], semantics: "environment", editable: false,
  },
  {
    assetId: "env.clouds", name: "云环", category: "environment", source: "GardenWorld.FrontClouds",
    colorParts: ["cloud"], semantics: "environment", editable: false,
  },
];

/** 按素材 ID 查定义 */
export function assetById(assetId: string): SceneAssetDef | undefined {
  return SCENE_ASSETS.find((a) => a.assetId === assetId);
}

/** 可放置素材（素材栏/快捷栏用），不含环境与系统点 */
export const PLACEABLE_ASSETS = SCENE_ASSETS.filter((a) => a.placeable);

/** 可编辑的地表实例（H02/H03 迁移用），不含环境 */
export const EDITABLE_ASSETS = SCENE_ASSETS.filter((a) => a.editable);

/** 统计：供 H01 审查核对数量 */
export function catalogStats() {
  const byCat: Record<string, number> = {};
  for (const a of SCENE_ASSETS) byCat[a.category] = (byCat[a.category] ?? 0) + 1;
  return { total: SCENE_ASSETS.length, byCat, placeable: PLACEABLE_ASSETS.length, editable: EDITABLE_ASSETS.length };
}
