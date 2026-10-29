"use client";
import React from "react";
import { Lamp, Bush, BlossomTree, Bench } from "./Props3D";
import { DecorPot, DecorStone, DecorFence } from "./Decor3D";
import { Model } from "./Model";
import { MODEL_REGISTRY } from "@/lib/models";
import type { DecorKind } from "@/lib/decor";

function Procedural({ kind, seed, lights }: { kind: DecorKind; seed: number; lights: number }) {
  switch (kind) {
    case "lamp": return <Lamp lights={lights} />;
    case "bush": return <Bush seed={seed} />;
    case "tree": return <BlossomTree seed={seed} />;
    case "pot": return <DecorPot />;
    case "stone": return <DecorStone />;
    case "fence": return <DecorFence />;
    case "chair": return <Bench />;
    case "flower": return <DecorPot />;
  }
}

/** 有登记 GLB 就用外部模型，否则用程序化模型；加载失败自动回退 */
export function DecorItem({ kind, seed, lights }: { kind: DecorKind; seed: number; lights: number }) {
  const def = MODEL_REGISTRY[kind];
  const fallback = <Procedural kind={kind} seed={seed} lights={lights} />;
  return def ? <Model def={def} fallback={fallback} /> : fallback;
}
