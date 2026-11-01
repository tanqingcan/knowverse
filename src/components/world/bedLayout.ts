/**
 * 花圃在球冠平面上的布局（纯数学，不依赖 three）。
 *
 * 单独成模块的原因：界面层（花圃弹层）需要知道「每个花圃能摆几株、还有几株没摆下」，
 * 但界面层不该为了一个数字把 three 静态打进首屏包。GardenWorld / StaticGarden 仍从
 * `./layout` 引入（那边做了 re-export），行为与之前完全一致。
 */

export type WorldPlant = {
  id: string; conceptName: string; species: string; color: string; stage: "seed" | "sprout" | "leaf" | "bud" | "bloom";
  isNatal?: boolean; reviewDue?: boolean; nickname?: string | null; gardenIndex?: number;
};

const BED_SLOTS = [
  { x: 0, z: 0.3 }, { x: -0.98, z: 0.78 }, { x: 1.02, z: 0.86 }, { x: -1.62, z: -0.12 }, { x: 1.66, z: -0.18 },
  { x: -0.62, z: 1.28 }, { x: 0.66, z: 1.3 },
];
const HEIGHT_ORDER: Record<string, number> = { sunflower: 0, iris: 1, rose: 2, lily: 3 };

/** 8 个及以上的花圃：黄金角螺旋往外扩，保持在球冠内且不挤在一起 */
function bedSlot(i: number) {
  if (i < BED_SLOTS.length) return BED_SLOTS[i];
  const k = i - BED_SLOTS.length;
  const a = 0.7 + k * 2.399963;
  const r = Math.min(2.2, 1.25 + Math.sqrt(k) * 0.26);
  return { x: Math.sin(a) * r, z: Math.cos(a) * r };
}

export type BedMove = { x: number; z: number; rot?: number };
export type BedLayout = {
  index: number; gardenId: string; name: string; x: number; z: number; r: number; main: boolean; rot: number;
  plants: { id: string; x: number; z: number }[];
  /** 超出单圃环位容量、未摆放的株数（分页/收起提示用，不静默丢弃） */
  overflow: number;
};

export function layoutBeds(gardens: { id?: string; name: string }[], plants: WorldPlant[], moves?: Record<string, BedMove | undefined>): BedLayout[] {
  const n = Math.max(1, gardens.length);
  // 本命花所在的花圃放在正中（主花圃）
  const natalG = plants.find((p) => p.isNatal)?.gardenIndex ?? 0;
  const order = [natalG, ...Array.from({ length: n }, (_, i) => i).filter((i) => i !== natalG)];
  return Array.from({ length: n }, (_, gi) => {
    const si = order.indexOf(gi);
    const slot = bedSlot(si);
    const list = plants.filter((p) => (p.gardenIndex ?? 0) === gi || (gi === 0 && (p.gardenIndex ?? -1) < 0));
    const natal = list.find((p) => p.isNatal);
    const rest = list.filter((p) => p !== natal).sort((a, b) => (HEIGHT_ORDER[a.species] ?? 2) - (HEIGHT_ORDER[b.species] ?? 2));
    const spots: { x: number; z: number }[] = [];
    if (natal) {
      const rings = [{ r: 0.25, n: 5 }, { r: 0.44, n: 9 }, { r: 0.63, n: 13 }];
      for (const ring of rings) for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2 + Math.PI + ring.r * 3;
        spots.push({ x: Math.sin(a) * ring.r, z: Math.cos(a) * ring.r * 0.92 });
      }
    } else if (rest.length <= 3) {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI; spots.push({ x: Math.sin(a) * 0.15, z: Math.cos(a) * 0.15 }); }
    } else {
      spots.push({ x: 0, z: 0 });
      const rings = [{ r: 0.23, n: 6 }, { r: 0.43, n: 10 }, { r: 0.63, n: 14 }];
      for (const ring of rings) for (let i = 0; i < ring.n; i++) { const a = (i / ring.n) * Math.PI * 2 + Math.PI; spots.push({ x: Math.sin(a) * ring.r, z: Math.cos(a) * ring.r }); }
    }
    // 环位容量有限：超出的株数计入 overflow，绝不产生 undefined 坐标
    const shown = rest.slice(0, spots.length);
    const overflow = rest.length - shown.length;
    const used = spots.slice(0, shown.length).sort((a, b) => a.z - b.z); // 高的种在后排
    const placed = shown.map((p, i) => ({ id: p.id, ...used[i] }));
    if (natal) placed.unshift({ id: natal.id, x: 0, z: 0.06 });
    const far = placed.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.z)), 0);
    const r = Math.max(natal ? 0.36 : 0.28, far + 0.13);
    // V4-R19：花圃作为独立布局对象——moves 以 **gardenId** 为稳定键覆盖位置/朝向（未设置则用默认槽位）
    const gardenId = gardens[gi]?.id ?? String(gi);
    const mv = moves?.[gardenId];
    const bx = mv ? mv.x : slot.x;
    const bz = mv ? mv.z : slot.z;
    const brot = mv?.rot ?? 0;
    return { index: gi, gardenId, name: gardens[gi]?.name ?? "花圃", x: bx, z: bz, r, main: si === 0, rot: brot, plants: placed, overflow };
  });
}
