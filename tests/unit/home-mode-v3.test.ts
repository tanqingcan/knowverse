import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_LAYOUT, homePoses } from "@/lib/home/home-layout";
import { DEFAULT_TEMPLATE, DECOR_CATALOG, translateDecorSelection, addDecorAt, removeDecor, updateDecor, isBuildingKind, type DecorPlacement } from "@/lib/decor";
import { MY_PLANET_LAYOUT } from "@/lib/home/my-default-layout";
import { DIY_PART_KEYS, validateParts } from "@/lib/home/diy-parts";
import { toLayoutItem, fromLayoutItem, type LayoutItem } from "@/lib/layout-api";
import { saveVariant, variantOf, loadVariants } from "@/lib/home/variants";

describe("H03/H14/H52 初始对象迁移与版本", () => {
  it("初始布局里包含全部建筑实例（不是只含装饰）", () => {
    const kinds = new Set(DEFAULT_HOME_LAYOUT.map((d) => d.kind));
    for (const k of ["cottage", "greenhouse", "observatory", "seedshed"]) {
      expect(kinds.has(k as never)).toBe(true);
    }
    // 初始布局 = 建筑实例 + 两个「区域群组」（草/野花），群组不是 building，但必须都在
    expect(DEFAULT_HOME_LAYOUT.filter((d) => isBuildingKind(d.kind)).length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_HOME_LAYOUT.some((d) => d.kind === "grassGroup" || d.kind === "wildflowerGroup")).toBe(true);
  });

  it("初始建筑实例姿态可被 homePoses 解析（搬家后门口/标签跟着走）", () => {
    const poses = homePoses(DEFAULT_HOME_LAYOUT);
    expect(poses.cottage).toBeTruthy();
    // 把小屋挪到别处，姿态应随之变化
    const moved = DEFAULT_HOME_LAYOUT.map((d) => (d.kind === "cottage" ? { ...d, x: d.x + 0.8 } : d));
    const poses2 = homePoses(moved);
    expect(poses2.cottage!.x).not.toBeCloseTo(poses.cottage!.x, 3);
  });

  it("DEFAULT_TEMPLATE = 我的星球完整布局（含建筑），不再只含装饰", () => {
    // ⚠️ 契约变更（V4，2026-11-01）：
    // V3 的契约是「DEFAULT_TEMPLATE 只含装饰，建筑来自 DEFAULT_HOME_LAYOUT」，
    // 但 `applyTemplate()` 是**整体替换**（commit(next)）——沿用 6 件装饰模板意味着
    // 用户一点「恢复默认模板」，搭好的 3 栋 cottage / 2 栋 greenhouse 等建筑会被一起清掉。
    // 因此 V4 把模板改为**我的星球实际布局**（141 件，由 planet_layout_items revision 94 导出），
    // 「恢复默认模板」= 恢复我自己的星球。旧断言（不含建筑）随契约一起废弃。
    expect(DEFAULT_TEMPLATE).toBe(MY_PLANET_LAYOUT);
    expect(DEFAULT_TEMPLATE.length).toBe(141);
    // 必须包含建筑，否则整体替换会丢建筑
    expect(DEFAULT_TEMPLATE.filter((d) => isBuildingKind(d.kind)).length).toBeGreaterThanOrEqual(4);
    // 也必须包含两个区域群组
    expect(DEFAULT_TEMPLATE.some((d) => d.kind === "grassGroup")).toBe(true);
    expect(DEFAULT_TEMPLATE.some((d) => d.kind === "wildflowerGroup")).toBe(true);
  });

  it("DEFAULT_HOME_LAYOUT 仍是「首次进入」的初始布局（新账号用，不受模板变更影响）", () => {
    // 与 DEFAULT_TEMPLATE 分离：新账号仍从 11 件初始布局起步，而不是直接铺 141 件
    expect(DEFAULT_HOME_LAYOUT.length).toBe(11);
    expect(DEFAULT_TEMPLATE).not.toBe(DEFAULT_HOME_LAYOUT);
  });
});

describe("H06/H52 复制独立性", () => {
  const base: DecorPlacement[] = DEFAULT_HOME_LAYOUT.slice();
  it("复制出的对象 id 与原件不同，且位置有偏移", () => {
    const list = addDecorAt(base, "rose", 0.2, 0.2);
    const orig = list.find((d) => d.kind === "rose")!;
    const copy = { ...orig, id: `${orig.id}-copy`, x: orig.x + 0.1 };
    expect(copy.id).not.toBe(orig.id);
    expect(copy.x).not.toBe(orig.x);
  });

  it("改复制品的 parts 不影响原件（数据层引用独立）", () => {
    const orig = { id: "a", kind: "rose" as const, x: 0, z: 0, rot: 0, scale: 1, parts: { petal: "#111111" } };
    const copy = { ...orig, id: "b", parts: { ...orig.parts } };
    copy.parts!.petal = "#222222";
    expect(orig.parts!.petal).toBe("#111111");
  });

  it("删除只影响目标 id", () => {
    const list = addDecorAt(addDecorAt(base, "rose", 0.1, 0.1), "rose", 0.2, 0.2);
    const roses = list.filter((d) => d.kind === "rose");
    const after = removeDecor(list, roses[0].id);
    expect(after.filter((d) => d.kind === "rose")).toHaveLength(1);
  });
});

describe("H34 保存还原（toLayoutItem / fromLayoutItem 往返）", () => {
  it("parts / stage / 尺寸在往返后保持", () => {
    const d: DecorPlacement = { id: "x", kind: "rose", x: 0.31, z: -0.42, rot: 33, scale: 1.25, stage: "bud", parts: { petal: "#aabbcc", leaf: "#112233" } };
    const item = toLayoutItem(d);
    const back = fromLayoutItem(item);
    expect(back.kind).toBe("rose");
    expect(back.x).toBeCloseTo(0.31, 5);
    expect(back.z).toBeCloseTo(-0.42, 5);
    expect(back.rot).toBeCloseTo(33, 5);
    expect(back.scale).toBeCloseTo(1.25, 5);
    expect(back.stage).toBe("bud");
    expect(back.parts).toEqual({ petal: "#aabbcc", leaf: "#112233" });
  });

  it("parts 颜色统一小写（与服务端归一化一致，避免刷新后判为不一致）", () => {
    const item = toLayoutItem({ id: "y", kind: "rose", x: 0, z: 0, rot: 0, scale: 1, parts: { petal: "#AABBCC" } });
    expect(item.parts).toEqual({ petal: "#aabbcc" });
  });

  it("旧数据没有 parts 时还原为 undefined（用模型默认色）", () => {
    const legacy: LayoutItem = { kind: "cottage", x: 0.5, z: 0.5 };
    const back = fromLayoutItem(legacy);
    expect(back.parts).toBeUndefined();
    expect(back.rot).toBe(0);
    expect(back.scale).toBe(1);
  });
});

describe("H34 服务端分区校验", () => {
  it("合法部位与颜色通过", () => {
    const r = validateParts("rose", { petal: "#AABBCC" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ petal: "#aabbcc" });
  });
  it("部位不属于该 kind → 拒绝", () => {
    expect(validateParts("rose", { roof: "#aabbcc" }).ok).toBe(false);
  });
  it("颜色格式非法 → 拒绝", () => {
    expect(validateParts("cottage", { roof: "red" }).ok).toBe(false);
  });
  it("没有分区定义的 kind → 拒绝", () => {
    expect(validateParts("unknown-kind", { primary: "#ffffff" }).ok).toBe(false);
  });
  it("每类素材具有整体配色或有效分区", () => {
    for (const [kind, keys] of Object.entries(DIY_PART_KEYS)) {
      expect(keys.length, kind).toBeGreaterThanOrEqual(1);
      for(const key of keys) expect(validateParts(kind,{[key]:"#ABCDEF"}).ok,`${kind}/${key}`).toBe(true);
    }
    expect(DIY_PART_KEYS.rose).toContain("petal");
    expect(DIY_PART_KEYS.cottage).toEqual(expect.arrayContaining(["roof", "wall"]));
  });
});

describe("H32 素材变体（变体只影响新放置）", () => {
  it("保存后可按 kind 取回；坏颜色被过滤", () => {
    // node 环境没有 localStorage：loadVariants 应安全返回 {}
    expect(loadVariants()).toEqual({});
    const all = saveVariant("rose", { petal: "#123456", bad: "not-a-color" });
    // 无 localStorage 时仍返回内存结构
    expect(all.rose).toBeTruthy();
    expect(all.rose.petal).toBe("#123456");
    expect(all.rose.bad).toBeUndefined();
    expect(variantOf("cottage")).toBeUndefined();
  });
});

describe("H54/H56 数据健康", () => {
  it("初始布局数值全部有限且在球面可达范围内", () => {
    for (const d of DEFAULT_HOME_LAYOUT) {
      for (const k of ["x", "z", "rot", "scale"] as const) {
        const v = d[k] as number;
        expect(Number.isFinite(v), `${d.kind}.${k}`).toBe(true);
      }
      // capFrame 的合法圆心范围：|(x,z)| < PLANET_R(=3)
      expect(Math.hypot(d.x, d.z)).toBeLessThan(3);
      expect(d.scale).toBeGreaterThan(0);
    }
  });
  it("updateDecor 只改目标项且不产生 NaN", () => {
    const list = addDecorAt(DEFAULT_HOME_LAYOUT, "rose", 0.1, 0.1);
    const id = list[list.length - 1].id;
    const next = updateDecor(list, id, { x: 0.42, parts: { petal: "#abcdef" } });
    const t = next.find((d) => d.id === id)!;
    expect(t.x).toBeCloseTo(0.42, 5);
    expect(t.parts!.petal).toBe("#abcdef");
    expect(next.filter((d) => d.id !== id).every((d) => d.x === list.find((o) => o.id === d.id)!.x)).toBe(true);
  });
});

describe("全素材DIY与批量移动",()=>{
 it("目录内每类素材整体色均可校验和保存还原",()=>{
  for(const {kind} of DECOR_CATALOG){
   expect(validateParts(kind,{primary:"#ABCDEF"}).ok,kind).toBe(true);
   const d={id:`check-${kind}`,kind,x:0,z:0,rot:0,scale:1,parts:{primary:"#abcdef"}};
   expect(fromLayoutItem(toLayoutItem(d)).parts,kind).toEqual(d.parts);
  }
 });
 it("批量移动保留相对间距、尺寸与颜色，未选项不改变",()=>{
  const list=DEFAULT_HOME_LAYOUT.slice(0,3),ids=list.slice(0,2).map(d=>d.id);
  const next=translateDecorSelection(list,ids,.3,-.2);
  expect(next[0].x-list[0].x).toBeCloseTo(.3);
  expect(next[1].z-list[1].z).toBeCloseTo(-.2);
  expect(next[1].x-next[0].x).toBeCloseTo(list[1].x-list[0].x);
  expect(next[2]).toBe(list[2]);expect(next[0].scale).toBe(list[0].scale);
  expect(()=>translateDecorSelection(list,ids,100,0)).toThrow();
 });
});

it("池塘移动及缩放携带荷花而不移动岸边长椅",()=>{
 const p:DecorPlacement={id:"landscape-pond",kind:"pond",x:3,z:0,rot:0,scale:1};
 const l:DecorPlacement={id:"lotus",kind:"lotus",x:3.5,z:.2,rot:0,scale:1};
 const c:DecorPlacement={id:"bench",kind:"chair",x:4,z:1,rot:0,scale:1};
 const n=updateDecor([p,l,c],p.id,{x:2,z:1,scale:2});
 expect(n[1].x).toBe(3);expect(n[1].z).toBe(1.4);expect(n[2]).toBe(c);
});
