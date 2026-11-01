"use client";
/** 程序化装饰件（不依赖外部模型）：花盆、石堆、木栅栏。 */
import React from "react";
import { C, matte, cylGeo, sphereGeo, rbox } from "./geo";
import { Flower3D } from "./Flower3D";

/** 小花盆：陶盆 + 土 + 一朵小花 */
export function DecorPot() {
  return (
    <group>
      <mesh geometry={cylGeo(0.055, 0.042, 0.07, 12)} material={matte("#C88A6E")} position={[0, 0.035, 0]} castShadow />
      <mesh geometry={cylGeo(0.05, 0.05, 0.01, 12)} material={matte("#8B5E4A")} position={[0, 0.072, 0]} />
      <group position={[0, 0.074, 0]} scale={0.55}>
        <Flower3D species="rose" color="rose" stage="bloom" open={0.75} seed={7} scale={0.5} />
      </group>
    </group>
  );
}

/** 石堆：三块圆润石头 */
export function DecorStone() {
  return (
    <group>
      <mesh geometry={sphereGeo(0.06, 10, 8)} material={matte("#9AA5B1")} position={[0, 0.03, 0]} scale={[1, 0.7, 0.9]} castShadow />
      <mesh geometry={sphereGeo(0.04, 9, 7)} material={matte("#AEB7C0")} position={[0.03, 0.07, 0.01]} scale={[1, 0.8, 1]} castShadow />
      <mesh geometry={sphereGeo(0.026, 8, 6)} material={matte("#8A96A3")} position={[-0.035, 0.055, -0.02]} castShadow />
    </group>
  );
}

/** 木栅栏：三根立柱 + 两道横梁 */
export function DecorFence() {
  return (
    <group>
      {[-0.14, 0, 0.14].map((x) => (
        <mesh key={x} geometry={cylGeo(0.012, 0.014, 0.22, 6)} material={matte(C.wood)} position={[x, 0.11, 0]} castShadow />
      ))}
      {[0.07, 0.16].map((y) => (
        <mesh key={y} geometry={rbox(0.32, 0.014, 0.012, 0.004)} material={matte(C.woodDeep)} position={[0, y, 0]} castShadow />
      ))}
    </group>
  );
}

/** 装饰玫瑰：复用 Flower3D 的 rose，支持选取外观阶段（纯装饰，不产生学习证据） */
export function DecorRose({ stage = "bloom" }: { stage?: string }) {
  const s = (["seed", "sprout", "leaf", "bud", "bloom"].includes(stage) ? stage : "bloom") as "seed" | "sprout" | "leaf" | "bud" | "bloom";
  return (
    <group>
      <Flower3D species="rose" color="rose" stage={s} open={s === "bloom" ? 0.9 : s === "bud" ? 0.3 : 1} seed={13} scale={1} />
    </group>
  );
}
