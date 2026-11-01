"use client";
/**
 * 球面贴地 surface（泥土/道路/草地覆盖层）：
 * 在球冠平面 (x,z) 处以 width×length 生成网格，每个顶点用 capFrame 投影到理想球面（+ 微高高差），
 * 轮廓沿球面弯曲、边缘贴地，不会像单块平面那样悬空或穿入星球。
 * 数据只存可重建参数（x/z/rot/width/length/材质键/高差），不存逐帧网格。
 */
import React, { useMemo } from "react";
import * as THREE from "three";
import { capFrame } from "./layout";
import { matte } from "./geo";
import { terrainHeightAt } from "@/lib/home/terrain";

const SURFACE_COLORS: Record<string, string> = {
  soil: "#A07C63",
  road: "#C9C2B6",
  grass: "#9DB983",
};

export function SphereSurface({ cx, cz, width, length, rot = 0, heightOffset = 0.02, segW = 14, segL = 14, colorKey = "soil", heights = null }: {
  cx: number; cz: number; width: number; length: number; rot?: number; heightOffset?: number; segW?: number; segL?: number; colorKey?: string;
  /** V4-R28：地形高度场——每顶点按局部高度抬升，泥土/道路跟着地形起伏 */
  heights?: Float32Array | null;
}) {
  const geo = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    const a = (rot * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    const rows = segL + 1, cols = segW + 1;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const u = (i / segW - 0.5) * width;
        const v = (j / segL - 0.5) * length;
        const dx = u * cos - v * sin;
        const dz = u * sin + v * cos;
        const px = cx + dx, pz = cz + dz;
        const th = heights ? terrainHeightAt(heights, px, pz) : 0;
        const f = capFrame(px, pz, 0, heightOffset + th);
        positions.push(f.pos.x, f.pos.y, f.pos.z);
      }
    }
    for (let j = 0; j < segL; j++) {
      for (let i = 0; i < segW; i++) {
        const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [cx, cz, width, length, rot, heightOffset, segW, segL, heights]);

  const mat = useMemo(() => matte(SURFACE_COLORS[colorKey] ?? SURFACE_COLORS.soil, { rough: 1 }), [colorKey]);

  return <mesh geometry={geo} material={mat} receiveShadow />;
}
