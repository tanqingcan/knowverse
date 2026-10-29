"use client";
/** 开发页：把 MODEL_REGISTRY 里登记的外部模型并排展示，方便检查缩放/朝向。 */
import React from "react";
import { Canvas } from "@react-three/fiber";
import { MODEL_REGISTRY } from "@/lib/models";
import { Model } from "@/components/world/Model";

const entries = Object.entries(MODEL_REGISTRY);

export default function DevModelsPage() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(180deg,#9CAFC5,#F2C9B6)" }}>
      <Canvas shadows camera={{ position: [2.0, 1.3, 2.0], fov: 45 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 3]} intensity={2} castShadow />
        {entries.map(([key, def], i) => (
          <group key={key} position={[(i - (entries.length - 1) / 2) * 0.7, 0, 0]}>
            <mesh position={[0, -0.02, 0]} receiveShadow>
              <cylinderGeometry args={[0.14, 0.14, 0.04, 24]} />
              <meshStandardMaterial color="#8fa587" />
            </mesh>
            {def && (
              <Model
                def={def}
                fallback={<mesh position={[0, 0.15, 0]}><boxGeometry args={[0.08, 0.3, 0.08]} /><meshStandardMaterial color="#c56e6e" /></mesh>}
              />
            )}
          </group>
        ))}
      </Canvas>
    </div>
  );
}
