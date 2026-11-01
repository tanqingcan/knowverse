/**
 * 星球地表：球体 + 俯视投影的手绘纹理（草地斑块、笔触、沙色小路、花圃周围的压痕、建筑石台）。
 * 纹理 1024²，只生成一次。
 */
import * as THREE from "three";
import { PLANET_R } from "./geo";
import { capToWorldXZ, pathCurve, MEMORY_PATH, GREEN_PATH, STAR_PATH, SPOTS, type BedLayout } from "./layout";
import { terrainHeightAt } from "@/lib/home/terrain";

const S = 1024;
function toPx(x: number, z: number) {
  const w = capToWorldXZ(x, z);
  return { px: (w.x / (2 * PLANET_R) + 0.5) * S, py: (w.z / (2 * PLANET_R) + 0.5) * S };
}
const U = S / (2 * PLANET_R); // 每单位多少像素（极点附近近似）

export function paintTerrain(beds: BedLayout[], poses?: Record<string, { x: number; z: number; yaw: number }>, manualPaths = false) {
  // H09：建筑地表印迹按实例位置绘制（poses 由布局推导），不再固定用 SPOTS，避免搬走后留下旧印
  // V4-H13：已有布局(poses 存在)但该建筑已被删除 → 返回 null 不画印迹（避免印迹回落 SPOTS 原位）
  const at = (k: string, dx: number, dz: number): { x: number; z: number } | null => {
    const p = poses?.[k];
    if (poses && !p) return null;
    return p ? { x: p.x, z: p.z } : { x: dx, z: dz };
  };
  const cv = document.createElement("canvas"); cv.width = cv.height = S;
  const g = cv.getContext("2d")!;
  let s = 3;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

  // 底色：中心偏亮的草绿，边缘稍深
  const grd = g.createRadialGradient(S / 2, S / 2 - 30, 20, S / 2, S / 2, S * 0.52);
  grd.addColorStop(0, "#C2D2A2"); grd.addColorStop(0.35, "#AFC390"); grd.addColorStop(0.7, "#97AE7E"); grd.addColorStop(1, "#7E9670");
  g.fillStyle = grd; g.fillRect(0, 0, S, S);

  // 水彩斑块
  for (let i = 0; i < 70; i++) {
    const x = r() * S, y = r() * S, rad = 30 + r() * 90;
    const c = ["#C9D8A8", "#8FA978", "#B5C592", "#A2B98A", "#D5CFA2"][i % 5];
    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, c); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 0.22 + r() * 0.18; g.fillStyle = rg; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // 草的笔触
  g.lineCap = "round";
  for (let i = 0; i < 4200; i++) {
    const x = r() * S, y = r() * S;
    g.globalAlpha = 0.08 + r() * 0.12;
    g.strokeStyle = r() > 0.5 ? "#6F8C5E" : "#D6E2B6";
    g.lineWidth = 1 + r() * 1.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 5, y - 3 - r() * 6); g.stroke();
  }
  // 少量小野花点
  for (let i = 0; i < 160; i++) {
    const x = r() * S, y = r() * S;
    g.globalAlpha = 0.55; g.fillStyle = ["#FFF7E8", "#F4D9DF", "#F2C9B6", "#EADFA8"][i % 4];
    g.beginPath(); g.arc(x, y, 1.4 + r() * 1.4, 0, Math.PI * 2); g.fill();
  }

  // 花圃与建筑周围：压实的浅色地面
  const ring = (x: number, z: number, rad: number, color: string, a: number) => {
    const p = toPx(x, z), R = rad * U;
    const rg = g.createRadialGradient(p.px, p.py, R * 0.5, p.px, p.py, R);
    rg.addColorStop(0, color); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = a; g.fillStyle = rg; g.beginPath(); g.arc(p.px, p.py, R, 0, Math.PI * 2); g.fill();
  };
  for (const b of beds) ring(b.x, b.z, b.r + 0.16, "#7F8F62", 0.35);
  {
    const c = at("cottage", SPOTS.cottage.x, SPOTS.cottage.z);
    const gh = at("greenhouse", SPOTS.greenhouse.x, SPOTS.greenhouse.z);
    const b = at("bench", SPOTS.bench.x, SPOTS.bench.z);
    const o = at("observatory", SPOTS.observatory.x, SPOTS.observatory.z);
    if (c) ring(c.x, c.z, 0.55, "#D8CBA8", 0.55);
    if (gh) ring(gh.x, gh.z, 0.52, "#D8CBA8", 0.5);
    if (b) ring(b.x, b.z, 0.14, "#D8CBA8", 0.25);
    if (o) ring(o.x, o.z, 0.44, "#D8CBA8", 0.5);
  }

  // 沙色小路（软边 + 碎石点）
  const drawPath = (pts: [number, number][], width: number) => {
    const c = pathCurve(pts).getSpacedPoints(60).map((v) => toPx(v.x, v.z));
    g.globalAlpha = 0.55; g.strokeStyle = "#BFAE88"; g.lineWidth = width * U * 1.35; g.lineJoin = "round";
    g.beginPath(); c.forEach((p, i) => (i ? g.lineTo(p.px, p.py) : g.moveTo(p.px, p.py))); g.stroke();
    g.globalAlpha = 0.9; g.strokeStyle = "#E7D8B8"; g.lineWidth = width * U;
    g.beginPath(); c.forEach((p, i) => (i ? g.lineTo(p.px, p.py) : g.moveTo(p.px, p.py))); g.stroke();
    for (let i = 0; i < c.length * 5; i++) {
      const p = c[Math.floor(r() * c.length)];
      g.globalAlpha = 0.35; g.fillStyle = r() > 0.5 ? "#C9B894" : "#FFF7E8";
      g.beginPath(); g.arc(p.px + (r() - 0.5) * width * U, p.py + (r() - 0.5) * width * U, 1 + r() * 1.5, 0, Math.PI * 2); g.fill();
    }
  };
  if (!manualPaths) {
  drawPath(MEMORY_PATH, 0.15);
  drawPath(GREEN_PATH, 0.11);
  drawPath(STAR_PATH, 0.1);
  }
  g.globalAlpha = 1;

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** 球体，UV 改为俯视投影（与纹理一致） */
export function planetGeometry(heights?: Float32Array | null, zoned = false, pond?: {x:number;z:number;radius?:number;depth?:number}) {
  const geo = new THREE.SphereGeometry(PLANET_R, 160, 120);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const colors: number[] = [];
  let displaced = false;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv.setXY(i, x / (2 * PLANET_R) + 0.5, 0.5 - z / (2 * PLANET_R));
    const tint = new THREE.Color(zoned && y < -0.4 ? (y < -2.1 ? "#b2b5c9" : "#9895ab") : "#ffffff");
    colors.push(tint.r, tint.g, tint.b);
    // V4-R26/R27：有高度场则按局部采样把顶点沿径向推出/压入（真实地形起伏，不是贴图）
    if (heights || zoned || pond) {
      const rad = Math.hypot(x, y, z) || 1;
      const polar = Math.acos(Math.max(-1, Math.min(1, y / rad)));
      const az = Math.atan2(x, z);
      const cx = polar * PLANET_R * Math.sin(az), cz = polar * PLANET_R * Math.cos(az);
      let h = heights && Math.abs(cx) <= 3 && Math.abs(cz) <= 3 ? terrainHeightAt(heights, cx, cz) : 0;
      if (pond) {
        const d=Math.hypot(cx-pond.x,cz-pond.z);
        const basinRadius=(pond.radius ?? 1.18)*1.36;
        if(d<basinRadius)h-=(pond.depth ?? .32)*Math.pow(Math.cos(d/basinRadius*Math.PI/2),2);
      }
      if (zoned && y / rad < -0.12) {
        // 下半球未知山脊：连续径向地形，而非放置在云上的独立锥体。
        const south = Math.min(1, (-y / rad - 0.12) / 0.55);
        const ridge = Math.pow(Math.abs(Math.sin(az * 5 + polar * 3.5)), 3);
        h += south * (0.12 + 0.65 * ridge + 0.22 * Math.pow(Math.sin(polar * 7 + az * 2), 2));
      }
      if (h !== 0) {
        const r = Math.hypot(x, y, z) || 1;
        const k = (r + h) / r;
        pos.setXYZ(i, x * k, y * k, z * k);
        displaced = true;
      }
    }
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (zoned && geo.index) {
    const upper: number[] = [], lower: number[] = [];
    for(let t=0;t<geo.index.count;t+=3){
      const a=geo.index.getX(t), b=geo.index.getX(t+1), c=geo.index.getX(t+2);
      (pos.getY(a)+pos.getY(b)+pos.getY(c)<-1.2 ? lower : upper).push(a,b,c);
    }
    geo.setIndex([...upper,...lower]); geo.clearGroups();
    geo.addGroup(0,upper.length,0);geo.addGroup(upper.length,lower.length,1);
  }
  if (!zoned && geo.index) { geo.clearGroups(); geo.addGroup(0,geo.index.count,0); }
  uv.needsUpdate = true;
  if (displaced) {
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return geo;
}
