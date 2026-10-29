"use client";
/**
 * 外部 GLB 模型注册表。
 * 把下载好的模型放进 `public/assets/models/`，在这里按装饰 kind 登记，
 * 对应装饰就会自动改用外部模型；没登记的 kind 继续用程序化模型。
 * 细节见 `docs/assets-integration.md`。
 */
export type ModelDef = {
  url: string;      // /assets/models/xxx.glb
  height?: number;  // 目标尺寸（场景单位），默认 0.3
  fit?: "height" | "max"; // 按高度（默认）还是按最大边长归一化
  rot?: number;     // 绕 Y 旋转（弧度）
  rx?: number;      // 绕 X 旋转（弧度），Z-up 模型用 -Math.PI/2
};

/** 已下载并登记的模型（CC0 / CC-BY，见 public/assets/CREDITS.md） */
export const MODEL_REGISTRY: Partial<Record<string, ModelDef>> = {
  tree:    { url: "/assets/models/tree-a.glb",        height: 0.55 },
  chair:   { url: "/assets/models/bench.glb",         height: 0.5, fit: "max" },
  flower:  { url: "/assets/models/flower-a.glb",      height: 0.3 },
  flower2: { url: "/assets/models/flower-tulip.glb",  height: 0.28 },
  flower3: { url: "/assets/models/flower-daisy.glb",  height: 0.24 },
  lamp:    { url: "/assets/models/lamp.glb",          height: 0.4 },
  fence:   { url: "/assets/models/fence.glb",         height: 0.55, fit: "max" },
  rock:    { url: "/assets/models/rock.glb",          height: 0.2, fit: "max" },
};
