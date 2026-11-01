/**
 * V4-R25/R27：球面地形高度场（纯函数，无 three 依赖，可单测）。
 *
 * 设计要点（与 docs/home-mode-v4/R25.md 一致）：
 * - 高度存在「球冠平面坐标 (x,z)」上的低分辨率网格里，与 capFrame/rayToCap/worldToCap 共用同一套坐标；
 * - 网格覆盖球冠 [-3,3]²，49×49（cell 0.125），插值时边界夹紧；
 * - 高度是「相对球面 R 的径向增量」，正=隆起、负=凹陷；限幅 ±0.6，且不做「掏穿球体」的深洞；
 * - 保存时只序列化非零稀疏点（见 toSparse/fromSparse）。
 */

export const TERRAIN_MIN = -3;
export const TERRAIN_MAX = 3;
export const TERRAIN_N = 49;
export const TERRAIN_MAX_HEIGHT = 0.6;
export const TERRAIN_MIN_HEIGHT = -0.35;

export type BrushMode = "up" | "down" | "restore";

export function makeHeights(): Float32Array {
  return new Float32Array(TERRAIN_N * TERRAIN_N);
}

function toGrid(v: number): number {
  const t = Math.max(0, Math.min(1, (v - TERRAIN_MIN) / (TERRAIN_MAX - TERRAIN_MIN)));
  return t * (TERRAIN_N - 1);
}

/** 双线性采样：任意球冠坐标 → 高度（越界夹到边缘） */
export function terrainHeightAt(heights: Float32Array, x: number, z: number): number {
  const fx = toGrid(x), fz = toGrid(z);
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const x1 = Math.min(TERRAIN_N - 1, x0 + 1), z1 = Math.min(TERRAIN_N - 1, z0 + 1);
  const ax = fx - x0, az = fz - z0;
  const h = (i: number, j: number) => heights[j * TERRAIN_N + i] ?? 0;
  const a = h(x0, z0) * (1 - ax) + h(x1, z0) * ax;
  const b = h(x0, z1) * (1 - ax) + h(x1, z1) * ax;
  return a * (1 - az) + b * az;
}

/** 网格索引 → 球冠坐标 */
export function gridToCap(i: number, j: number): { x: number; z: number } {
  const sx = (TERRAIN_MAX - TERRAIN_MIN) / (TERRAIN_N - 1);
  return { x: TERRAIN_MIN + i * sx, z: TERRAIN_MIN + j * sx };
}

/**
 * 施加一笔（就地修改 heights，返回是否真的改了）。
 * 柔边：以笔刷中心为 1、边缘为 0 的余弦衰减，避免出现"硬边台阶"。
 */
export function applyBrush(
  heights: Float32Array,
  cx: number,
  cz: number,
  radius: number,
  strength: number,
  mode: BrushMode,
): boolean {
  if (!Number.isFinite(cx) || !Number.isFinite(cz) || radius <= 0) return false;
  const r = Math.min(2.5, Math.max(0.12, radius));
  const s = Math.max(0, Math.min(1, strength));
  const cell = (TERRAIN_MAX - TERRAIN_MIN) / (TERRAIN_N - 1);
  const i0 = Math.max(0, Math.floor(toGrid(cx - r)));
  const i1 = Math.min(TERRAIN_N - 1, Math.ceil(toGrid(cx + r)));
  let changed = false;
  for (let j = 0; j < TERRAIN_N; j++) {
    for (let i = i0; i <= i1; i++) {
      const p = gridToCap(i, j);
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d > r) continue;
      // 余弦柔边：中心 1 → 边缘 0
      const w = 0.5 * (1 + Math.cos((d / r) * Math.PI));
      const idx = j * TERRAIN_N + i;
      const prev = heights[idx];
      let next = prev;
      if (mode === "up") next = prev + s * 0.12 * w;
      else if (mode === "down") next = prev - s * 0.12 * w;
      else next = prev * (1 - Math.min(1, s * w * 1.6)); // restore：向 0 收
      next = Math.max(TERRAIN_MIN_HEIGHT, Math.min(TERRAIN_MAX_HEIGHT, next));
      if (Math.abs(next - prev) > 1e-4) { heights[idx] = next; changed = true; }
    }
  }
  // cell 变量仅为可读性保留
  void cell;
  return changed;
}

/** 稀疏保存：只存非零格点（i,j,h） */
export function toSparse(heights: Float32Array): { i: number; j: number; h: number }[] {
  const out: { i: number; j: number; h: number }[] = [];
  for (let j = 0; j < TERRAIN_N; j++) {
    for (let i = 0; i < TERRAIN_N; i++) {
      const h = heights[j * TERRAIN_N + i];
      if (Math.abs(h) > 1e-4) out.push({ i, j, h: +h.toFixed(4) });
    }
  }
  return out;
}

export function fromSparse(points: { i: number; j: number; h: number }[] | null | undefined): Float32Array {
  const heights = makeHeights();
  for (const p of points ?? []) {
    if (p && p.i >= 0 && p.i < TERRAIN_N && p.j >= 0 && p.j < TERRAIN_N) {
      heights[p.j * TERRAIN_N + p.i] = Math.max(TERRAIN_MIN_HEIGHT, Math.min(TERRAIN_MAX_HEIGHT, p.h));
    }
  }
  return heights;
}

/** 统计：最大高度/最低深度/非零格点数（用于证据与限额） */
export function terrainStats(heights: Float32Array) {
  let max = 0, min = 0, nz = 0;
  for (let k = 0; k < heights.length; k++) {
    const h = heights[k];
    if (Math.abs(h) > 1e-4) nz++;
    if (h > max) max = h;
    if (h < min) min = h;
  }
  return { max: +max.toFixed(4), min: +min.toFixed(4), nonzero: nz, total: heights.length };
}
