"use client";
/**
 * 外部 GLB 模型注册表。
 * 把下载好的模型放进 `public/assets/models/`，在这里按装饰 kind 登记，
 * 对应装饰就会自动改用外部模型；没登记的 kind 继续用程序化模型。
 * 细节见 `docs/assets-integration.md`。
 */
export type ModelDef = {
  url: string;      // /assets/models/xxx.glb
  height?: number;  // 目标高度（场景单位），默认 0.3
  rot?: number;     // 绕 Y 旋转（弧度）
};

/** 已下载并登记的模型（CC0 / CC-BY，见 public/assets/CREDITS.md） */
export const MODEL_REGISTRY: Partial<Record<string, ModelDef>> = {
  tree:    { url: "/assets/models/tree-a.glb",        height: 0.55 },
  chair:   { url: "/assets/models/chair-a.glb",       height: 0.22 },
  flower:  { url: "/assets/models/flower-a.glb",      height: 0.3 },
  flower2: { url: "/assets/models/flower-tulip.glb",  height: 0.28 },
  flower3: { url: "/assets/models/flower-daisy.glb",  height: 0.24 },
};
