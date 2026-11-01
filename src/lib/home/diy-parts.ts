/**
 * H34：DIY 分区的**唯一权威清单**——客户端工作台与服务端校验共用，
 * 避免「前端能选、后端不认」或反过来。
 */
export const DIY_PART_KEYS: Record<string, string[]> = {
  tree:["primary"], bush:["primary"], lamp:["primary"], chair:["primary"], fence:["primary"], stone:["primary"], rock:["primary"], soil:["primary"], road:["primary"], pond:["primary"], lotus:["petal","leaf","core","stem"], arch:["primary"], sign:["primary"], grassGroup:["primary"], wildflowerGroup:["primary"],
  rose: ["petal", "leaf", "stem"],
  flower: ["petal", "core", "leaf", "stem"],
  flower2: ["petal", "leaf", "stem"],
  flower3: ["petal", "leaf", "stem"],
  pot: ["petal", "leaf", "stem"],
  cottage: ["roof", "wall", "window", "trim"],
  greenhouse: ["roofGlass", "frame", "base"],
  seedshed: ["roof", "wall"],
  observatory: ["dome", "wall", "lens"],
};

/** 允许参与 DIY 的 kind（没有分区定义的 kind 不写 parts） */
export function diyAllowedKinds(): string[] {
  return Object.keys(DIY_PART_KEYS);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** 服务端/客户端共用校验：返回 null 表示「无有效分区」；非法则返回错误信息 */
export function validateParts(kind: string, parts: unknown): { ok: true; value: Record<string, string> | null } | { ok: false; error: string } {
  if (parts == null) return { ok: true, value: null };
  if (typeof parts !== "object" || Array.isArray(parts)) return { ok: false, error: "parts 必须是对象" };
  const allowed = DIY_PART_KEYS[kind] ? [...DIY_PART_KEYS[kind], "primary"] : undefined;
  if (!allowed) return { ok: false, error: `素材 ${kind} 不支持分区配色` };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parts as Record<string, unknown>)) {
    if (!allowed.includes(k)) return { ok: false, error: `部位 ${k} 不属于 ${kind}` };
    if (typeof v !== "string" || !HEX.test(v)) return { ok: false, error: `颜色 ${k} 必须是 #rrggbb` };
    out[k] = v.toLowerCase();
  }
  return { ok: true, value: Object.keys(out).length ? out : null };
}
