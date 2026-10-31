"use client";
import React from "react";
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

/** 有登记 GLB 就用外部模型，否则用程序化模型；加载失败自动回退；tint 给 GLB 换色 */
export function DecorItem({ kind, seed, lights, tint, stage, signText, signSub }: { kind: DecorKind; seed: number; lights: number; tint?: string; stage?: string; signText?: string; signSub?: string }) {
  const def = MODEL_REGISTRY[kind];
  const fallback = <Procedural kind={kind} seed={seed} lights={lights} stage={stage} signText={signText} signSub={signSub} />;
  return def ? <Model def={def} fallback={fallback} tint={tint} /> : fallback;
}
