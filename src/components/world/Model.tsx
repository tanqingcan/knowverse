"use client";
import React, { Suspense, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelDef } from "@/lib/models";

/** 播放一个 GLB；加载失败时由 ModelBoundary 回退到程序化模型 */
function GlbModel({ def }: { def: ModelDef }) {
  const gltf = useLoader(GLTFLoader, def.url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  return <primitive object={scene} scale={def.scale ?? 1} position={[0, def.y ?? 0, 0]} rotation={[0, def.rot ?? 0, 0]} />;
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
