// 读取 GLB 的包围盒与三角面数（不依赖渲染），用于给 MODEL_REGISTRY 设 scale。
// 用法：node scripts/glb-info.mjs public/assets/models/tree-a.glb
import fs from "node:fs";

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/glb-info.mjs <file.glb>"); process.exit(1); }
const buf = fs.readFileSync(file);
if (buf.toString("ascii", 0, 4) !== "glTF") throw new Error("not a glb: " + file);
const total = buf.readUInt32LE(8);
let off = 12, json = null;
while (off < total) {
  const clen = buf.readUInt32LE(off);
  const ctype = buf.readUInt32LE(off + 4);
  off += 8;
  if (ctype === 0x4e4f534a) json = JSON.parse(buf.toString("utf8", off, off + clen));
  off += clen;
}
const acc = json.accessors ?? [];
let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
let tris = 0;
for (const m of json.meshes ?? []) for (const p of m.primitives ?? []) {
  const pi = p.attributes?.POSITION;
  if (pi == null) continue;
  const a = acc[pi];
  if (a?.min && a?.max) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i]); }
  const n = a?.count ?? 0;
  tris += p.indices != null ? (acc[p.indices]?.count ?? 0) / 3 : n / 3;
}
const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
console.log(JSON.stringify({ file, size: size.map((v) => +v.toFixed(3)), min: mn.map((v) => +v.toFixed(3)), max: mx.map((v) => +v.toFixed(3)), tris: Math.round(tris), meshes: (json.meshes ?? []).length, images: (json.images ?? []).length }));
