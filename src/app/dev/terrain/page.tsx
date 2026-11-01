"use client";
/**
 * V4-R25：地形方案 A（球面高度场）的**隔离预览**。
 * 只验证几何/笔刷/性能三件事，不接布局保存、不接其他编辑能力、不影响正式 /space。
 */
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { applyBrush, makeHeights, terrainHeightAt, terrainStats, type BrushMode } from "@/lib/home/terrain";
import { worldToCap } from "@/components/world/layout";

const R = 3;

function Planet({ heights, version, onPaint }: { heights: Float32Array; version: number; onPaint: (e: ThreeEvent<PointerEvent>) => void }) {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(R, 96, 64);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const cap = worldToCap(v);
      const h = terrainHeightAt(heights, cap.x, cap.z);
      pos.setXYZ(i, v.x * (R + h), v.y * (R + h), v.z * (R + h));
    }
    g.computeVertexNormals();
    return g;
    // version 变化即重建几何（原型阶段可接受；正式实现要做局部 buffer 更新）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  const perf = useMemo(() => ({ verts: (96 + 1) * (64 + 1) }), []);
  return (
    <>
      <mesh geometry={geo} onPointerDown={onPaint} onPointerMove={(e) => { if (e.buttons === 1) onPaint(e); }}>
        <meshStandardMaterial color="#9DB983" roughness={1} />
      </mesh>
      <mesh visible={false} geometry={geo} userData={perf} />
    </>
  );
}

export default function TerrainPreview() {
  const heights = useRef<Float32Array>(makeHeights());
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState<BrushMode>("up");
  const [radius, setRadius] = useState(0.6);
  const [strength, setStrength] = useState(0.7);
  const [msg, setMsg] = useState("拖动/点击星球进行雕刻");
  const [fps, setFps] = useState(0);
  const last = useRef({ t: 0, n: 0 });

  const paint = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const cap = worldToCap(e.point);
    const changed = applyBrush(heights.current, cap.x, cap.z, radius, strength, mode);
    if (changed) {
      setVersion((v) => v + 1);
      const st = terrainStats(heights.current);
      setMsg(`已雕刻 @ (${cap.x.toFixed(2)}, ${cap.z.toFixed(2)}) · 最高 ${st.max} / 最低 ${st.min} / 非零 ${st.nonzero} 格`);
    }
    // 简易 FPS
    const now = performance.now();
    last.current.n++;
    if (now - last.current.t > 500) {
      setFps(Math.round((last.current.n * 1000) / (now - last.current.t)));
      last.current = { t: now, n: 0 };
    }
  };

  const st = terrainStats(heights.current);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#2A2338" }}>
      <Canvas camera={{ fov: 30, position: [0, 8, 8] }} dpr={[1, 1.5]}>
        <hemisphereLight args={["#EDE4F7", "#8C7E86", 0.95]} />
        <ambientLight intensity={0.2} />
        <directionalLight position={[6, 8, 4]} intensity={1.1} />
        <Planet heights={heights.current} version={version} onPaint={paint} />
      </Canvas>
      <div style={{ position: "fixed", left: 16, top: 16, color: "#fff", fontFamily: "sans-serif", fontSize: 13, lineHeight: 1.7 }}>
        <b>地形隔离预览（R25）</b>
        <div>顶点 97×65 · FPS(软件渲染) {fps}</div>
        <div>最高 {st.max} / 最低 {st.min} / 非零 {st.nonzero} 格</div>
        <div style={{ marginTop: 8 }}>{msg}</div>
      </div>
      <div style={{ position: "fixed", left: 16, bottom: 16, display: "flex", gap: 8, alignItems: "center", color: "#fff", fontFamily: "sans-serif", fontSize: 13 }}>
        {(["up", "down", "restore"] as BrushMode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)} style={{ padding: "6px 12px", borderRadius: 8, border: 0, cursor: "pointer", background: mode === m ? "#DDB56D" : "#4A4159", color: mode === m ? "#2A2338" : "#fff" }}>
            {m === "up" ? "抬高" : m === "down" ? "降低" : "恢复"}
          </button>
        ))}
        <label>半径 {radius.toFixed(2)} <input type="range" min={0.2} max={1.6} step={0.05} value={radius} onChange={(e) => setRadius(+e.target.value)} /></label>
        <label>强度 {strength.toFixed(2)} <input type="range" min={0.1} max={1} step={0.05} value={strength} onChange={(e) => setStrength(+e.target.value)} /></label>
        <button onClick={() => { heights.current = makeHeights(); setVersion((v) => v + 1); setMsg("已重置为球面"); }} style={{ padding: "6px 12px", borderRadius: 8, border: 0, cursor: "pointer", background: "#4A4159", color: "#fff" }}>全部重置</button>
      </div>
    </div>
  );
}
