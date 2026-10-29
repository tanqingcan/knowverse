"use client";
import React, { Suspense, useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelDef } from "@/lib/models";

/** 播放一个 GLB：按目标高度自动缩放并贴地；失败时由 ModelBoundary 回退 */
function GlbModel({ def }: { def: ModelDef }) {
  const gltf = useLoader(GLTFLoader, def.url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  const { s, y } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.getSize(new THREE.Vector3()).y || 1;
    const sc = (def.height ?? 0.3) / h;
    return { s: sc, y: -box.min.y * sc };
  }, [scene, def.height]);
  return <primitive object={scene} scale={s} position={[0, y, 0]} rotation={[0, def.rot ?? 0, 0]} />;
}

class ModelBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** 外部模型 + 回退：先显示程序化模型，加载好后替换；404/解析失败则保持程序化 */
export function Model({ def, fallback }: { def: ModelDef; fallback: React.ReactNode }) {
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GlbModel def={def} />
      </Suspense>
    </ModelBoundary>
  );
}
