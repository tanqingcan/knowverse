"use client";
import React, { Suspense, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelDef } from "@/lib/models";

/** 播放一个 GLB：按目标高度自动缩放并贴地；tint 换色；失败时由 ModelBoundary 回退 */
function GlbModel({ def, tint, parts }: { def: ModelDef; tint?: string; parts?: Record<string,string> }) {
  const gltf = useLoader(GLTFLoader, def.url);
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    if (def.rx) s.rotation.x = def.rx;
    if (tint || parts) {
      s.traverse((o: any) => {
        if (o.isMesh && o.material) {
          const one = (m: any) => {
            const c = m.clone();
            const name=String(m.name).toLowerCase();
            const part=name.includes("yellow") ? "core" : name.includes("green") || name.includes("4caf50") ? "leaf" : "petal";
            const chosen=parts?.[part] ?? (part === "leaf" ? parts?.stem : undefined) ?? tint;
            if(chosen) { c.color=new THREE.Color(chosen); c.vertexColors=false; if(parts?.[part])c.map=null; }
            return c;
          };
          o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
        }
      });
    }
    return s;
  }, [gltf, tint, parts, def.rx]);
  useEffect(() => {
    if (!tint && !parts) return;
    return () => {
      const materials = new Set<THREE.Material>();
      scene.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); });
      materials.forEach(m => m.dispose());
    };
  }, [scene, tint, parts]);
  const { s, y } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const measure = def.fit === "max" ? Math.max(size.x, size.y, size.z) : size.y;
    const sc = (def.height ?? 0.3) / (measure || 1);
    return { s: sc, y: -box.min.y * sc };
  }, [scene, def.height, def.fit]);
  return <primitive object={scene} scale={s} position={[0, y, 0]} rotation={[0, def.rot ?? 0, 0]} />;
}

class ModelBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** 外部模型 + 回退：先显示程序化模型，加载好后替换；404/解析失败则保持程序化 */
export function Model({ def, fallback, tint, parts }: { def: ModelDef; fallback: React.ReactNode; tint?: string; parts?: Record<string,string> }) {
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GlbModel def={def} tint={tint} parts={parts} />
      </Suspense>
    </ModelBoundary>
  );
}
