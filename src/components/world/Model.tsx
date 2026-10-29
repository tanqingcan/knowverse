"use client";
import React, { Suspense, useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelDef } from "@/lib/models";

/** 播放一个 GLB：按目标高度自动缩放并贴地；tint 换色；失败时由 ModelBoundary 回退 */
function GlbModel({ def, tint }: { def: ModelDef; tint?: string }) {
  const gltf = useLoader(GLTFLoader, def.url);
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    if (tint && tint.toLowerCase() !== "#ffffff") {
      s.traverse((o: any) => {
        if (o.isMesh && o.material) {
          const one = (m: any) => { const c = m.clone(); c.color = new THREE.Color(tint); return c; };
          o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
        }
      });
    }
    return s;
  }, [gltf, tint]);
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
export function Model({ def, fallback, tint }: { def: ModelDef; fallback: React.ReactNode; tint?: string }) {
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GlbModel def={def} tint={tint} />
      </Suspense>
    </ModelBoundary>
  );
}
