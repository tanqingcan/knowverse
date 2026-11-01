"use client";
/**
 * 资产近景预览（开发用）：B1 视觉验收的取景台。
 *   /dev/props?asset=greenhouse&view=front|side|top|iso
 *   /dev/props?asset=bench&view=front|side|back|close   （长椅 + 旅人坐姿）
 *   /dev/props?asset=grass&view=front|side|top
 * 固定机位、同一套光照，方便改前/改后逐像素对比。
 */
import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { Bench, Greenhouse } from "@/components/world/Props3D";
import { Traveler } from "@/components/world/Characters3D";
import { grassTuftGeo } from "@/components/world/geo";

type View = "front" | "side" | "top" | "iso" | "back" | "close";
type Asset = "greenhouse" | "bench" | "grass";

const CAM: Record<Asset, Partial<Record<View, { pos: [number, number, number]; look: [number, number, number]; fov?: number }>>> = {
  greenhouse: {
    front: { pos: [0, 0.3, 1.05], look: [0, 0.17, 0], fov: 32 },
    side: { pos: [1.05, 0.3, 0], look: [0, 0.17, 0], fov: 32 },
    top: { pos: [0.002, 1.62, 0.004], look: [0, 0.16, 0.004], fov: 32 },
    iso: { pos: [0.78, 0.58, 0.78], look: [0, 0.15, 0], fov: 32 },
  },
  bench: {
    front: { pos: [0, 0.2, 0.62], look: [0, 0.11, 0.01], fov: 32 },
    side: { pos: [0.62, 0.18, 0.02], look: [0, 0.11, 0.02], fov: 32 },
    back: { pos: [0, 0.22, -0.62], look: [0, 0.11, -0.01], fov: 32 },
    close: { pos: [0.3, 0.17, 0.38], look: [0, 0.1, 0.02], fov: 30 },
  },
  grass: {
    front: { pos: [0, 0.085, 0.28], look: [0, 0.024, 0], fov: 30 },
    side: { pos: [0.28, 0.085, 0.01], look: [0, 0.024, 0], fov: 30 },
    top: { pos: [0.001, 0.3, 0.004], look: [0, 0.01, 0.004], fov: 30 },
  },
};

function Tufts() {
  const geo = grassTuftGeo();
  const rows = [-0.11, -0.055, 0, 0.055, 0.11];
  return (
    <>
      {rows.map((x, i) => (
        <mesh key={x} geometry={geo} position={[x, 0.001, (i % 2 ? 0.012 : -0.01)]} rotation={[0, i * 0.9, 0]} scale={1 + (i % 3) * 0.15} castShadow receiveShadow>
          <meshStandardMaterial color={["#9DB983", "#AFC791", "#8FAD78", "#BCD09B", "#A8C18B"][i]} roughness={1} />
        </mesh>
      ))}
    </>
  );
}

export default function Page() {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [view, setView] = useState<View>("front");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setAsset((q.get("asset") as Asset) ?? "greenhouse");
    setView((q.get("view") as View) ?? "front");
  }, []);
  if (!asset) return null;
  const cam = CAM[asset][view] ?? CAM[asset].front!;
  const label = `${asset} · ${view}`;
  return (
    <div style={{ width: "100vw", height: "100vh", background: "linear-gradient(180deg,#9CAFC5,#F2C9B6)" }}>
      <Canvas
        key={`${asset}-${view}`}
        shadows
        dpr={[1, 2]}
        camera={{ position: cam.pos, fov: cam.fov ?? 32 }}
        onCreated={({ camera, scene }) => {
          camera.lookAt(new THREE.Vector3(...cam.look));
          scene.background = new THREE.Color("#B9C6D2");
        }}
      >
        <hemisphereLight args={["#e9e2ff", "#8c7a6a", 0.9]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[-1.5, 2.5, 2]} intensity={2.2} color="#ffe6c8" castShadow
          shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[6, 6]} />
          <meshStandardMaterial color="#A8BC91" roughness={1} />
        </mesh>
        {asset === "greenhouse" && <Greenhouse />}
        {asset === "bench" && (
          <>
            <Bench />
            <group position={[0, 0, 0.022]} scale={1.25}><Traveler pose="idle" reduced /></group>
          </>
        )}
        {asset === "grass" && <Tufts />}
      </Canvas>
      <div style={{ position: "fixed", left: 12, bottom: 10, font: "12px/1.4 system-ui", color: "#3b3346", opacity: 0.7 }}>{label}</div>
    </div>
  );
}
