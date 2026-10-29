"use client";
/**
 * 外部 GLB 模型注册表。
 * 把下载好的模型放进 `public/assets/models/`，在这里按装饰 kind 登记，
 * 对应装饰就会自动改用外部模型；没登记的 kind 继续用程序化模型。
 * 细节见 `docs/assets-integration.md`。
 */
export type ModelDef = {
  url: string;      // /assets/models/xxx.glb
  scale?: number;   // 统一缩放
  y?: number;       // 贴地偏移
  rot?: number;     // 绕 Y 旋转（弧度）
};

/** 默认空：不改变现有画面；登记后生效 */
export const MODEL_REGISTRY: Partial<Record<string, ModelDef>> = {
  // 例：
  // lamp:  { url: "/assets/models/lamp.glb",  scale: 0.6 },
  // tree:  { url: "/assets/models/tree.glb",  scale: 0.5, y: 0 },
  // flower:{ url: "/assets/models/flower.glb", scale: 0.4 },
};
