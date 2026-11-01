import { describe, expect, it } from "vitest";
import { layoutBeds, type WorldPlant } from "@/components/world/layout";

const SPECIES = ["rose", "iris", "lily", "sunflower"];

function makePlants(n: number, gardens: number): WorldPlant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    conceptName: `知识 ${i}`,
    species: SPECIES[i % SPECIES.length],
    color: "rose",
    stage: i % 5 === 0 ? "seed" : i % 5 === 1 ? "sprout" : i % 5 === 2 ? "leaf" : i % 5 === 3 ? "bud" : "bloom",
    gardenIndex: i % gardens,
    isNatal: i === 0,
  }));
}

describe("layoutBeds", () => {
  for (const n of [0, 1, 10, 30, 50, 100]) {
    for (const g of [1, 3, 7, 12]) {
      it(`${n} 株 / ${g} 个花圃：坐标有限、不丢、不重复`, () => {
        const beds = layoutBeds(Array.from({ length: g }, (_, i) => ({ name: `花圃 ${i}` })), makePlants(n, g));
        expect(beds).toHaveLength(g);
        const seen = new Set<string>();
        for (const b of beds) {
          expect(Number.isFinite(b.x)).toBe(true);
          expect(Number.isFinite(b.z)).toBe(true);
          expect(Number.isFinite(b.r)).toBe(true);
          for (const p of b.plants) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.z)).toBe(true);
            expect(seen.has(p.id)).toBe(false);
            seen.add(p.id);
          }
        }
        const total = beds.reduce((s, b) => s + b.plants.length, 0);
        const overflow = beds.reduce((s, b) => s + b.overflow, 0);
        expect(total + overflow).toBe(n);
        expect(seen.size).toBe(total);
      });
    }
  }

  it("同一个知识点不会在两个花圃重复出现", () => {
    const plants = makePlants(20, 3);
    const beds = layoutBeds([{ name: "A" }, { name: "B" }, { name: "C" }], plants);
    const ids = beds.flatMap((b) => b.plants.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("新增植物时已有花圃的位置保持稳定", () => {
    const gardens = [{ name: "A" }, { name: "B" }];
    const before = layoutBeds(gardens, makePlants(12, 2));
    const after = layoutBeds(gardens, makePlants(14, 2));
    for (const b of before) {
      const na = after.find((x) => x.index === b.index)!;
      expect(na.x).toBeCloseTo(b.x);
      expect(na.z).toBeCloseTo(b.z);
      for (const p of b.plants) {
        const np = na.plants.find((x) => x.id === p.id);
        expect(np).toBeTruthy();
        expect(Number.isFinite(np!.x)).toBe(true);
        expect(Number.isFinite(np!.z)).toBe(true);
      }
    }
  });

  it("7 个花圃的中心距离大于半径和的一半（不重叠）", () => {
    const beds = layoutBeds(Array.from({ length: 7 }, (_, i) => ({ name: `花圃 ${i}` })), makePlants(35, 7));
    for (let i = 0; i < beds.length; i++) {
      for (let j = i + 1; j < beds.length; j++) {
        const d = Math.hypot(beds[i].x - beds[j].x, beds[i].z - beds[j].z);
        expect(d).toBeGreaterThan((beds[i].r + beds[j].r) * 0.55);
      }
    }
  });

  it("12 个花圃的坐标都在球冠范围内（不飞出可见区域）", () => {
    const beds = layoutBeds(Array.from({ length: 12 }, (_, i) => ({ name: `花圃 ${i}` })), makePlants(60, 12));
    for (const b of beds) {
      expect(Math.hypot(b.x, b.z)).toBeLessThan(2.6);
    }
  });
});
