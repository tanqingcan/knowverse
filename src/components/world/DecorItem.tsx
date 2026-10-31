"use client";
import React from "react";
import * as THREE from "three";
import { vcol } from "./geo";
import { Lamp, Bush, BlossomTree, Bench, Cottage, Greenhouse, Observatory, SeedShed, GardenArch, PondBridge, Sign } from "./Props3D";
import { DecorPot, DecorStone, DecorFence, DecorRose } from "./Decor3D";
import { Model } from "./Model";
import { MODEL_REGISTRY } from "@/lib/models";
import type { DecorKind } from "@/lib/decor";

function Procedural({ kind, seed, lights, stage, signText, signSub }: { kind: DecorKind; seed: number; lights: number; stage?: string; signText?: string; signSub?: string }) {
  switch (kind) {
    case "lamp": return <Lamp lights={lights} />;
    case "bush": return <Bush seed={seed} />;
    case "tree": return <BlossomTree seed={seed} />;
    case "pot": return <DecorPot />;
    case "stone": return <DecorStone />;
    case "fence": return <DecorFence />;
    case "chair": return <Bench />;
    case "flower":
    case "flower2":
    case "flower3": return <DecorPot />;
    case "rock": return <DecorStone />;
    case "rose": return <DecorRose stage={stage} />;
    case "soil":
    case "road": return null;
    case "cottage": return <Cottage lights={lights} />;
    case "greenhouse": return <Greenhouse lights={lights} />;
    case "observatory": return <Observatory lights={lights} />;
    case "seedshed": return <SeedShed lights={lights} />;
    case "arch": return <GardenArch seed={3} />;
    case "pond": return <PondBridge />;
    case "sign": return <Sign text={signText ?? "晚星"} sub={signSub ?? ""} w={0.24} h={0.11} post={0.1} />;
    // H04：群组由 GardenWorld 的实例化草地/野花按密度渲染，不在这里出单株
    case "grassGroup":
    case "wildflowerGroup": return null;
  }
}


/**
 * H29：按部位上色——花瓣/叶片用 `vcol()` 材质身份区分，花心/屋顶/墙面等用模型上的 `userData.part` 标记。
 * 每个网格克隆材质后改色，卸载时 dispose；不影响其他实例（与 H07 的材质隔离同一原则）。
 */
export function PartTint({ parts, children }: { parts?: Record<string, string>; children: React.ReactNode }) {
  const ref = React.useRef<THREE.Group>(null);
  const key = React.useMemo(() => (parts ? JSON.stringify(parts) : ""), [parts]);
  React.useEffect(() => {
    const g = ref.current;
    if (!g || !parts || !Object.keys(parts).length) return;
    const cloned: THREE.Material[] = [];
    const petalMat = vcol("petal");
    const leafMat = vcol("leaf");
    const stemMat = vcol("stem");
    g.traverse((o: any) => {
      if (!o.isMesh || !o.material) return;
      const marked = o.userData?.part as string | undefined;
      const part = marked
        ?? (o.material === petalMat ? "petal" : o.material === leafMat ? "leaf" : o.material === stemMat ? "stem" : undefined);
      if (!part) return;
      const color = parts[part];
      if (!color) return;
      const one = (m: any) => { const c = m.clone(); if (c.color) c.color = new THREE.Color(color); cloned.push(c); return c; };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
    return () => { cloned.forEach((m) => m.dispose()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <group ref={ref}>{children}</group>;
}

/**
 * H07：程序化模型的按实例改色。`matte()` 按颜色做全局缓存，直接改材质会串色（所有同色实例一起变），
 * 所以这里 **克隆材质** 再改色，并在卸载时 dispose；每个实例一份，互不影响。
 */
function Tinted({ tint, children }: { tint?: string; children: React.ReactNode }) {
  const ref = React.useRef<THREE.Group>(null);
  React.useEffect(() => {
    const g = ref.current;
    if (!g || !tint) return;
    const cloned: THREE.Material[] = [];
    g.traverse((o: any) => {
      if (o.isMesh && o.material) {
        const one = (m: any) => {
          const c = m.clone();
          if (c.color) c.color = new THREE.Color(tint);
          cloned.push(c);
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
      }
    });
    return () => { cloned.forEach((m) => m.dispose()); };
  }, [tint]);
  return <group ref={ref}>{children}</group>;
}

/** 有登记 GLB 就用外部模型，否则用程序化模型；加载失败自动回退；tint 给模型换色（按实例克隆材质，不串色） */
export function DecorItem({ kind, seed, lights, tint, stage, signText, signSub, parts }: { kind: DecorKind; seed: number; lights: number; tint?: string; stage?: string; signText?: string; signSub?: string; parts?: Record<string, string> }) {
  const def = MODEL_REGISTRY[kind];
  const fallback = <Procedural kind={kind} seed={seed} lights={lights} stage={stage} signText={signText} signSub={signSub} />;
  const inner = def
    ? <Model def={def} fallback={fallback} tint={tint} />
    : (tint ? <Tinted key={`${kind}:${stage ?? ""}:${tint}`} tint={tint}>{fallback}</Tinted> : fallback);
  // H29：有分区颜色时再包一层 PartTint（key 带上 parts，切换阶段/改色都会重新克隆）
  if (!parts || !Object.keys(parts).length) return inner;
  return <PartTint key={`${kind}:${stage ?? ""}:${JSON.stringify(parts)}`} parts={parts}>{inner}</PartTint>;
}
