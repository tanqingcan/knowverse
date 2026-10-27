"use client";
/** 资产预览（开发用）：四种花 × 五个阶段；?bloom=1 只看开花特写 */
import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { Flower3D } from "@/components/world/Flower3D";

const SP = ["rose", "sunflower", "iris", "lily"];
const COL = ["rose", "gold", "mist", "cream"];
const ST = ["seed", "sprout", "leaf", "bud", "bloom"] as const;

export default function Page() {
  const [bloom, setBloom] = useState(false);
  const [one, setOne] = useState<string | null>(null);
  useEffect(() => { const q = new URLSearchParams(location.search); setBloom(q.has("bloom")); setOne(q.get("sp")); }, []);
  if (one) return (
    <div style={{ width: "100vw", height: "100vh", background: "linear-gradient(#9CAFC5,#F2C9B6)" }}>
      <Canvas shadows camera={{ position: [0, 0.48, 0.32], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.27, 0)}>
        <hemisphereLight args={["#e9e2ff", "#8c7a6a", 0.9]} />
        <directionalLight position={[-1.5, 2.5, 2]} intensity={2.2} color="#ffe6c8" castShadow />
        {["bud", "bloom"].map((st, i) => <group key={st} position={[(i - 0.5) * 0.16, 0, 0]}><Flower3D species={one} color={one === "sunflower" ? "gold" : one === "iris" ? "mist" : one === "lily" ? "cream" : "rose"} stage={st as any} seed={5} reduced /></group>)}
      </Canvas>
    </div>
  );
  return (
    <div style={{ width: "100vw", height: "100vh", background: "linear-gradient(#9CAFC5,#F2C9B6)" }}>
      <Canvas key={String(bloom)} shadows dpr={[1, 1.5]} camera={bloom ? { position: [0, 0.42, 0.75], fov: 32 } : { position: [0, 1.4, 1.9], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, bloom ? 0.2 : 0.12, 0)}>
        <hemisphereLight args={["#e9e2ff", "#8c7a6a", 0.9]} />
        <directionalLight position={[-1.5, 2.5, 2]} intensity={2.2} color="#ffe6c8" castShadow shadow-mapSize={[1024, 1024]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[4, 4]} /><meshStandardMaterial color="#A8BC91" roughness={1} /></mesh>
        {bloom ? SP.map((s, i) => <group key={s} position={[(i - 1.5) * 0.2, 0, 0]}><Flower3D species={s} color={COL[i]} stage="bloom" seed={i + 3} /></group>)
          : SP.map((s, i) => ST.map((st, j) => (
            <group key={s + st} position={[(j - 2) * 0.24, 0, (i - 1.5) * 0.26]}><Flower3D species={s} color={COL[i]} stage={st} seed={i * 7 + j} scale={1.15} /></group>)))}
      </Canvas>
    </div>
  );
}
