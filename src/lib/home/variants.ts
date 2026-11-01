/**
 * H32：DIY 素材变体（个人配色方案）——按 kind 各存一份，只在新放置时复用，
 * **绝不隐式修改同类已有对象**（那些对象各自持有自己的 parts）。
 */
const KEY = "kv-diy-variants";

export type DiyVariants = Record<string, Record<string, string>>;

export function loadVariants(): DiyVariants {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: DiyVariants = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const parts: Record<string, string> = {};
        for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
          if (typeof pv === "string" && /^#[0-9a-fA-F]{6}$/.test(pv)) parts[pk] = pv;
        }
        if (Object.keys(parts).length) out[k] = parts;
      }
    }
    return out;
  } catch {
    return {};
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function saveVariant(kind: string, parts: Record<string, string>): DiyVariants {
  const all = loadVariants();
  // H56：变体存前先过滤——非法颜色不能混进来（否则下次 loadVariants 才发现，语义不一致）
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(parts || {})) {
    if (typeof v === "string" && HEX.test(v)) clean[k] = v.toLowerCase();
  }
  if (Object.keys(clean).length) all[kind] = clean;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* 隐私模式等写失败忽略 */ }
  return all;
}

export function variantOf(kind: string): Record<string, string> | undefined {
  return loadVariants()[kind];
}
