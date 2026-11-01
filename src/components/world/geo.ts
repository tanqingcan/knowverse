/**
 * 3D 绘本微缩世界：共享的程序化几何体、材质与手绘纹理。
 * 所有几何体与材质按参数缓存复用，避免每株植物都新建资源。
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export const C = {
  dusk: "#756B99", fog: "#9CAFC5", peach: "#F2C9B6", cream: "#FFF7E8",
  grass: "#A8BC91", grassDeep: "#7E9A6E", grassLight: "#C4D3A8", rose: "#E4A1AA", honey: "#DDB56D",
  soil: "#8A6A55", soilDeep: "#6E5242", wood: "#B5835C", woodDeep: "#8C5F40", woodLight: "#D4A87C",
  plaster: "#F6E8D6", roof: "#C98478", roofDeep: "#A8665E", stone: "#B9B2C9", stoneDeep: "#9590AA",
  glass: "#D9EAF0", leaf: "#94B77C", leafDeep: "#668A58", leafLight: "#C6DCA4", stem: "#76985F",
  window: "#FFD38A", ink: "#3F3657",
};

const cache = new Map<string, any>();
function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

/* ───────── 材质 ───────── */
export function matte(color: string, opts: { rough?: number; emissive?: string; emissiveIntensity?: number; side?: THREE.Side; map?: THREE.Texture | null } = {}) {
  const key = `m:${color}:${opts.rough ?? 0.9}:${opts.emissive ?? ""}:${opts.emissiveIntensity ?? 0}:${opts.side ?? 0}:${opts.map ? opts.map.uuid : ""}`;
  return memo(key, () => new THREE.MeshStandardMaterial({
    color, roughness: opts.rough ?? 0.9, metalness: 0, emissive: new THREE.Color(opts.emissive ?? "#000000"),
    emissiveIntensity: opts.emissiveIntensity ?? 0, side: opts.side ?? THREE.FrontSide, map: opts.map ?? null,
  }));
}
/** 顶点色材质（花瓣、叶片的绘本式渐变） */
export function vcol(key: string, side: THREE.Side = THREE.DoubleSide) {
  return memo(`vc:${key}:${side}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side }));
}
export const glassMat = () => memo("glass", () => new THREE.MeshStandardMaterial({ color: C.glass, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
export const glowMat = (color: string, intensity = 1.6) => memo(`glow:${color}:${intensity}`, () => new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.6 }));

/* ───────── 手绘纹理（Canvas 生成，尺寸受限） ───────── */
export function grainTexture(base: string, dark: string, size = 128, strokes = 220) {
  return memo(`grain:${base}:${dark}:${size}`, () => {
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const g = cv.getContext("2d")!;
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    let s = 7;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < strokes; i++) {
      g.globalAlpha = 0.05 + r() * 0.08; g.strokeStyle = dark; g.lineWidth = 1 + r() * 2;
      const x = r() * size, y = r() * size;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.2) * 6); g.stroke();
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** 文字木牌纹理 */
export function signTexture(text: string, sub = "") {
  return memo(`sign:${text}:${sub}`, () => {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
    const g = cv.getContext("2d")!;
    const grd = g.createLinearGradient(0, 0, 0, 128); grd.addColorStop(0, "#E2B98C"); grd.addColorStop(1, "#C6956A");
    g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
    g.globalAlpha = 0.15; g.strokeStyle = "#7B5236";
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, 12 + i * 13); g.bezierCurveTo(80, 8 + i * 13, 170, 18 + i * 13, 256, 11 + i * 13); g.stroke(); }
    g.globalAlpha = 1; g.fillStyle = "#4A3426"; g.textAlign = "center";
    g.font = `600 ${sub ? 40 : 46}px "Noto Serif SC","Noto Serif CJK SC","Songti SC",serif`;
    g.fillText(text, 128, sub ? 58 : 78);
    if (sub) { g.font = `400 26px "Noto Sans SC","Noto Sans CJK SC",sans-serif`; g.fillStyle = "#6B4C36"; g.fillText(sub, 128, 98); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  });
}

/** 向日葵花盘：黄金角排列的种子 */
export function seedDiskTexture() {
  return memo("seeddisk", () => {
    const n = 128, cv = document.createElement("canvas"); cv.width = cv.height = n;
    const g = cv.getContext("2d")!;
    const grd = g.createRadialGradient(n / 2, n / 2, 4, n / 2, n / 2, n / 2);
    grd.addColorStop(0, "#9A6B37"); grd.addColorStop(0.7, "#6B4526"); grd.addColorStop(1, "#4E321C");
    g.fillStyle = grd; g.beginPath(); g.arc(n / 2, n / 2, n / 2, 0, Math.PI * 2); g.fill();
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 260; i++) {
      const r = Math.sqrt(i / 260) * (n / 2 - 4), a = i * ga;
      g.fillStyle = i % 3 ? "rgba(40,24,12,.55)" : "rgba(190,140,70,.55)";
      g.beginPath(); g.arc(n / 2 + r * Math.cos(a), n / 2 + r * Math.sin(a), 1.2 + r / 40, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** 柔和光晕（用于灯与星灯的 Sprite，克制的发光） */
export function haloTexture() {
  return memo("halo", () => {
    const n = 64, cv = document.createElement("canvas"); cv.width = cv.height = n;
    const g = cv.getContext("2d")!;
    const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grd.addColorStop(0, "rgba(255,236,190,0.9)"); grd.addColorStop(0.35, "rgba(255,214,150,0.35)"); grd.addColorStop(1, "rgba(255,214,150,0)");
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
    return new THREE.CanvasTexture(cv);
  });
}

/** 接触阴影（柔和暗斑贴在地面上，避免物体漂浮） */
export function contactShadowTexture() {
  return memo("contact", () => {
    const n = 64, cv = document.createElement("canvas"); cv.width = cv.height = n;
    const g = cv.getContext("2d")!;
    const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grd.addColorStop(0, "rgba(40,30,60,0.42)"); grd.addColorStop(0.6, "rgba(40,30,60,0.16)"); grd.addColorStop(1, "rgba(40,30,60,0)");
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
    return new THREE.CanvasTexture(cv);
  });
}
export const contactMat = () => memo("contactMat", () => new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
export const contactGeo = () => memo("contactGeo", () => new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2));

/* ───────── 曲面网格：花瓣与叶片（顶点色渐变） ───────── */

type Surf = {
  len: number; width: number; segU?: number; segV?: number;
  profile: (t: number) => number;                 // 宽度轮廓 0..1
  shape: (s: number, t: number, w: number) => number; // z 偏移（杯状、折痕、弯曲）
  color: (s: number, t: number) => THREE.Color;
};
function surface(p: Surf) {
  const segU = p.segU ?? 13, segV = p.segV ?? 11;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let v = 0; v <= segV; v++) {
    const t = v / segV, w = p.width * p.profile(t);
    for (let u = 0; u <= segU; u++) {
      const s = u / segU - 0.5;
      pos.push(s * w, t * p.len, p.shape(s, t, w));
      const c = p.color(s, t); col.push(c.r, c.g, c.b);
    }
  }
  for (let v = 0; v < segV; v++) for (let u = 0; u < segU; u++) {
    const a = v * (segU + 1) + u, b = a + 1, c = a + segU + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const lerpC = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));

export type PetalOpts = { len: number; width: number; cup: number; curl: number; base: string; mid: string; tip: string; round?: number; stripe?: string };
export function petalGeo(o: PetalOpts) {
  const key = `petal:${JSON.stringify(o)}`;
  return memo(key, () => surface({
    len: o.len, width: o.width,
    profile: (t) => 0.16 * (1 - t) + Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), o.round ?? 0.6),
    // 边缘向内卷起（-z 为内侧），尖端可外翻
    shape: (s, t, w) => -o.cup * (4 * s * s) * w * 0.55 + o.curl * t * t * o.len,
    color: (s, t) => {
      const c = t < 0.45 ? lerpC(o.base, o.mid, t / 0.45) : lerpC(o.mid, o.tip, (t - 0.45) / 0.55);
      if (o.stripe && Math.abs(s) < 0.12 && t < 0.6) c.lerp(new THREE.Color(o.stripe), 0.85);
      return c.lerp(new THREE.Color("#ffffff"), Math.abs(s) * 0.16);
    },
  }));
}

export type LeafKind = "almond" | "heart" | "sword" | "broad" | "round";
export function leafGeo(kind: LeafKind, len: number, width: number, bend = 0.25) {
  return memo(`leaf:${kind}:${len}:${width}:${bend}`, () => surface({
    len, width, segU: 6, segV: kind === "sword" ? 10 : 8,
    profile: (t) => kind === "heart" ? Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.8) * (1 - 0.15 * t)
      : kind === "sword" ? (0.6 + 0.4 * Math.sin(Math.PI * t * 0.6)) * (1 - Math.pow(t, 4))
      : kind === "broad" ? Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.7)
      : kind === "round" ? Math.pow(Math.sin(Math.PI * t), 0.5)
      : Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.9),
    shape: (s, t, w) => Math.abs(s) * w * 0.5 + bend * t * t * len,   // 沿主脉的 V 形折痕 + 向外弯
    color: (s, t) => {
      const c = lerpC(C.leafDeep, C.leaf, Math.min(1, t * 1.6));
      if (Math.abs(s) < 0.06) c.lerp(new THREE.Color(C.leafLight), 0.55);       // 主脉
      return c.lerp(new THREE.Color(C.leafLight), Math.max(0, 0.25 - Math.abs(s)) * 0.6 + t * 0.12);
    },
  }));
}

/** 茎：沿曲线的细管（按 bend/height 缓存） */
export function stemGeo(height: number, bend: number, radius = 0.012) {
  return memo(`stem:${height.toFixed(3)}:${bend.toFixed(3)}:${radius}`, () => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(bend * 0.3, height * 0.35, 0),
      new THREE.Vector3(bend * 0.9, height * 0.7, bend * 0.2), new THREE.Vector3(bend, height, bend * 0.3)]);
    return new THREE.TubeGeometry(curve, 12, radius, 6, false);
  });
}
export function stemCurvePoint(height: number, bend: number, t: number) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(bend * 0.3, height * 0.35, 0),
    new THREE.Vector3(bend * 0.9, height * 0.7, bend * 0.2), new THREE.Vector3(bend, height, bend * 0.3)]);
  return curve.getPoint(t);
}

/** 铃兰的小铃铛（车削体 + 波浪边） */
export function bellGeo() {
  return memo("bell", () => {
    const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.007, -0.0016), new THREE.Vector2(0.012, -0.007), new THREE.Vector2(0.0135, -0.014), new THREE.Vector2(0.017, -0.019), new THREE.Vector2(0.02, -0.02)];
    const g = new THREE.LatheGeometry(pts, 20);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < -0.0175) { const x = p.getX(i), z = p.getZ(i); const a = Math.atan2(z, x); const k = 1 + 0.06 * Math.cos(6 * a); p.setX(i, x * k); p.setZ(i, z * k); }
    }
    g.computeVertexNormals();
    return g;
  });
}

export const sphereGeo = (r = 1, w = 16, h = 12) => memo(`sph:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));
export const cylGeo = (rt: number, rb: number, h: number, seg = 16) => memo(`cyl:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
export const coneGeo = (r: number, h: number, seg = 18) => memo(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg));
/** 圆润草叶：细锥 + 顶部外弯，可配径向细分与弯度，替代低分段圆锥 */
export function bladeGeo(h: number, r = 0.006, seg = 6, bendK = 0.42) {
  return memo(`blade:${h}:${r}:${seg}:${bendK}`, () => {
    const g = new THREE.CylinderGeometry(r * 0.3, r, h, seg, 1, false);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + h / 2) / h; // 0 底部 → 1 顶部
      const bend = t * t * h * bendK;
      pos.setX(i, pos.getX(i) + bend);
      pos.setZ(i, pos.getZ(i) + bend * 0.3);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.translate(0, h / 2, 0);
    return g;
  });
}
/** 一丛圆润的草：N 片宽而短的叶片绕中心错开、顶端外弯，合并成单一几何（实例化用） */
export function grassTuftGeo(blades = 8, seg = 8, bendK = 0.55) {
  return memo(`tuft:${blades}:${seg}:${bendK}`, () => {
    const parts: number[] = [];
    for (let i = 0; i < blades; i++) {
      const h = 0.026 + (i % 4) * 0.005;
      const a = (i / blades) * Math.PI * 2 + (i % 2 ? 0.14 : -0.1);
      const b = bladeGeo(h, 0.0075, seg, bendK).clone()
        .rotateZ(i % 2 ? 0.1 : -0.08) // 轻微左右交错，避免完全同心
        .rotateY(a)
        .translate(Math.cos(a) * 0.006, 0, -Math.sin(a) * 0.006)
        .toNonIndexed();
      parts.push(...(b.attributes.position.array as Float32Array));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(parts, 3));
    g.computeVertexNormals();
    return g;
  });
}
export const torusGeo = (r: number, t: number, rs = 10, ts = 28) => memo(`tor:${r}:${t}:${rs}:${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts));
export function rbox(w: number, h: number, d: number, r = 0.02) {
  return memo(`rbox:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r) as THREE.BufferGeometry);
}

/* ───────── 星球表面坐标 ───────── */
export const PLANET_R = 3;
export const CAM_DIR = new THREE.Vector3(0, Math.sin((50 * Math.PI) / 180), Math.cos((50 * Math.PI) / 180)).normalize();

/** 以北极为花园中心的“球冠坐标”：az 方位（0 = 朝向镜头），polar 离北极的角度 */
export function surfacePoint(az: number, polar: number, r = PLANET_R) {
  const a = (az * Math.PI) / 180, p = (polar * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(p) * Math.sin(a) * r, Math.cos(p) * r, Math.sin(p) * Math.cos(a) * r);
}

/** 地表局部坐标系：上 = 法线，前 = 朝向镜头方向在切平面上的投影；yaw 额外绕法线旋转（度） */
export function surfaceFrame(az: number, polar: number, yaw = 0, lift = 0) {
  const n = surfacePoint(az, polar, 1);
  let f = CAM_DIR.clone().sub(n.clone().multiplyScalar(CAM_DIR.dot(n)));
  if (f.lengthSq() < 1e-6) f = new THREE.Vector3(0, 0, 1);
  f.normalize();
  const r = new THREE.Vector3().crossVectors(n, f).normalize();
  const m = new THREE.Matrix4().makeBasis(r, n, f);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (yaw) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (yaw * Math.PI) / 180));
  const pos = n.clone().multiplyScalar(PLANET_R + lift);
  return { pos, quat: q, normal: n };
}

/** 在某个地表点的切平面内偏移 (dx 向右, dz 向镜头) 后重新贴回球面，返回新的 az/polar */
export function offsetOnSurface(az: number, polar: number, dx: number, dz: number) {
  const { pos, quat } = surfaceFrame(az, polar);
  const p = pos.clone().add(new THREE.Vector3(dx, 0, dz).applyQuaternion(quat)).normalize();
  const pol = (Math.acos(Math.max(-1, Math.min(1, p.y))) * 180) / Math.PI;
  const a = (Math.atan2(p.x, p.z) * 180) / Math.PI;
  return { az: a, polar: pol };
}

export function hash(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }
export function rand(seed: number, i: number) { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); }
