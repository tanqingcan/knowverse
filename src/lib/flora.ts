/** 花种与花色只代表审美选择，与能力高低无关；更换外观不影响学习记录 */
export const SPECIES = [
  { key: "rose", name: "玫瑰", line: "层层花瓣，慢慢打开" },
  { key: "iris", name: "鸢尾", line: "三片垂瓣，像一封信" },
  { key: "sunflower", name: "向日葵", line: "总是朝着有光的地方" },
  { key: "lily", name: "铃兰", line: "一串小小的铃铛" },
] as const;
export type SpeciesKey = (typeof SPECIES)[number]["key"];

export const PALETTE = [
  { key: "rose", name: "玫瑰粉", petal: "#D98C9A", deep: "#B5677A", light: "#F1C6CC" },
  { key: "cream", name: "奶油白", petal: "#F3E9D6", deep: "#D9C7A6", light: "#FFF8EC" },
  { key: "mist", name: "雾紫", petal: "#B8ACD9", deep: "#8D7FBC", light: "#DCD3F0" },
  { key: "gold", name: "暖金", petal: "#E2C27F", deep: "#C29A4E", light: "#F4E2B5" },
  { key: "coral", name: "珊瑚", petal: "#E3A08A", deep: "#C27860", light: "#F5CDBE" },
  { key: "sky", name: "晨蓝", petal: "#A9C3DD", deep: "#7C9CBF", light: "#D6E4F1" },
] as const;
export type ColorKey = (typeof PALETTE)[number]["key"];
export const colorOf = (k: string) => PALETTE.find((p) => p.key === k) ?? PALETTE[0];

export const STAGE_ORDER = ["seed", "sprout", "leaf", "bud", "bloom"] as const;
export type StageKey = (typeof STAGE_ORDER)[number];
export const STAGE_NAME: Record<StageKey, string> = { seed: "种子", sprout: "嫩芽", leaf: "生叶", bud: "花苞", bloom: "开花" };
