"use client";
/**
 * 微缩花园的原创场景资产（圆润、哑光、手绘纹理）：星灯书屋、资料温室、长椅、路灯、木牌、花圃、
 * 石板小径、灌木、开花小树、草丛（实例化）、云海、远处的共学星球。
 * 本地坐标：y 为地表法线，+z 朝向镜头。
 */
import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { C, matte, glassMat, glowMat, rbox, cylGeo, coneGeo, sphereGeo, torusGeo, grainTexture, signTexture, haloTexture, contactGeo, contactMat, bladeGeo, rand } from "./geo";

export function Halo({ size = 0.3, opacity = 0.8, position }: { size?: number; opacity?: number; position?: [number, number, number] }) {
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthWrite: false, opacity, blending: THREE.AdditiveBlending }), [opacity]);
  return <sprite material={mat} scale={[size, size, 1]} position={position} />;
}

export function Contact({ r = 0.2 }: { r?: number }) {
  return <mesh geometry={contactGeo()} material={contactMat()} scale={r} position={[0, 0.004, 0]} />;
}

export function Sign({ text, sub, w = 0.2, h = 0.1, post = 0.12 }: { text: string; sub?: string; w?: number; h?: number; post?: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: signTexture(text, sub), roughness: 0.9 }), [text, sub]);
  return (
    <group>
      <mesh geometry={cylGeo(0.008, 0.009, post + h * 0.5, 8)} material={matte(C.woodDeep)} position={[0, (post + h * 0.5) / 2, -0.004]} castShadow />
      <mesh geometry={rbox(w + 0.012, h + 0.012, 0.012, 0.005)} material={matte(C.woodDeep)} position={[0, post + h / 2, 0]} castShadow />
      <mesh position={[0, post + h / 2, 0.0065]}><planeGeometry args={[w, h]} /><primitive object={mat} attach="material" /></mesh>
    </group>
  );
}

/** 星灯书屋：圆形小屋、圆窗、微微倾斜的屋顶 */
export function Cottage({ lights = 1 }: { lights?: number }) {
  const wall = useMemo(() => matte(C.plaster, { map: grainTexture("#F6E8D6", "#C9B39A") }), []);
  const glow = 0.25 + 1.6 * lights;
  return (
    <group>
      <Contact r={0.42} />
      <mesh geometry={cylGeo(0.29, 0.3, 0.05, 28)} material={matte(C.stone)} position={[0, 0.025, 0]} receiveShadow castShadow />
      <mesh geometry={cylGeo(0.255, 0.27, 0.36, 28)} material={wall} position={[0, 0.23, 0]} castShadow receiveShadow />
      <mesh geometry={torusGeo(0.262, 0.012, 8, 36)} material={matte(C.wood)} position={[0, 0.405, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <group position={[0, 0.41, 0]} rotation={[0.06, 0, 0.1]}>
        <mesh geometry={coneGeo(0.36, 0.2, 28)} material={matte(C.roof)} position={[0, 0.1, 0]} castShadow />
        <mesh geometry={coneGeo(0.27, 0.2, 28)} material={matte(C.roofDeep)} position={[0, 0.24, 0]} castShadow />
        <mesh geometry={coneGeo(0.16, 0.16, 24)} material={matte(C.roof)} position={[0, 0.37, 0]} castShadow />
        <mesh geometry={sphereGeo(0.028, 12, 8)} material={matte(C.honey)} position={[0, 0.46, 0]} />
        <mesh geometry={rbox(0.07, 0.14, 0.07, 0.015)} material={matte("#B9A3A0")} position={[0.15, 0.2, -0.08]} castShadow />
      </group>
      {/* 圆窗 */}
      <group position={[0.07, 0.25, 0.258]}>
        <mesh geometry={torusGeo(0.062, 0.014, 10, 32)} material={matte(C.wood)} castShadow />
        <mesh material={glowMat(C.window, glow)}><circleGeometry args={[0.055, 28]} /></mesh>
        <mesh geometry={rbox(0.11, 0.008, 0.006, 0.002)} material={matte(C.woodDeep)} position={[0, 0, 0.004]} />
        <mesh geometry={rbox(0.008, 0.11, 0.006, 0.002)} material={matte(C.woodDeep)} position={[0, 0, 0.004]} />
        <Halo size={0.34} opacity={0.45 * lights} position={[0, 0, 0.03]} />
      </group>
      {/* 门 */}
      <group position={[-0.12, 0.05, 0.24]} rotation={[0, -0.42, 0]}>
        <mesh geometry={rbox(0.11, 0.16, 0.025, 0.01)} material={matte(C.woodDeep)} position={[0, 0.08, 0]} castShadow />
        <mesh geometry={cylGeo(0.055, 0.055, 0.025, 16)} material={matte(C.woodDeep)} position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={sphereGeo(0.008, 8, 6)} material={matte(C.honey)} position={[0.034, 0.08, 0.016]} />
        <mesh geometry={cylGeo(0.07, 0.075, 0.014, 18)} material={matte(C.stone)} position={[0, 0.0, 0.05]} receiveShadow />
      </group>
      {/* 门边小灯与花盆 */}
      <group position={[-0.02, 0.2, 0.27]}>
        <mesh geometry={sphereGeo(0.016, 10, 8)} material={glowMat("#FFE0A6", 0.6 + 1.2 * lights)} />
        <Halo size={0.16} opacity={0.5 * lights} />
      </group>
      {[[-0.27, 0.16], [0.24, 0.2]].map(([x, z], i) => (
        <group key={i} position={[x, 0.03, z]}>
          <mesh geometry={cylGeo(0.03, 0.022, 0.045, 12)} material={matte("#C88A6E")} position={[0, 0.022, 0]} castShadow />
          <mesh geometry={sphereGeo(0.032, 10, 8)} material={matte(i ? "#9DBB80" : "#E7A9B1")} position={[0, 0.06, 0]} castShadow />
        </group>
      ))}
      <pointLight color="#FFC98A" intensity={0.9 * lights} distance={1.4} decay={2} position={[0.07, 0.25, 0.45]} />
    </group>
  );
}

/** 资料温室：木框玻璃屋，里面有书本与暖灯 */
export function Greenhouse({ lights = 1 }: { lights?: number }) {
  const W = 0.5, D = 0.34, H = 0.24, R = 0.13;
  const beam = matte(C.woodLight);
  // 山墙三角玻璃：屋脊两端各补一片，避免侧视/顶视时直接看穿屋顶
  const gable = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-D / 2, 0, 0, D / 2, 0, 0, 0, R, 0], 3));
    g.computeVertexNormals();
    return g;
  }, [D, R]);
  const posts: [number, number][] = [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]];
  const roofLen = Math.hypot(D / 2, R);
  const roofAng = Math.atan2(R, D / 2);
  return (
    <group>
      <Contact r={0.42} />
      <mesh geometry={rbox(W + 0.06, 0.05, D + 0.06, 0.02)} material={matte(C.stone)} position={[0, 0.025, 0]} castShadow receiveShadow />
      {posts.map(([x, z], i) => <mesh key={i} geometry={rbox(0.022, H, 0.022, 0.006)} material={beam} position={[x, 0.05 + H / 2, z]} castShadow />)}
      <mesh geometry={rbox(W + 0.03, 0.02, 0.022, 0.006)} material={beam} position={[0, 0.05 + H + R, 0]} castShadow />
      {[-1, 1].map((sd) => <mesh key={sd} geometry={rbox(W + 0.03, 0.018, 0.02, 0.005)} material={beam} position={[0, 0.05 + H, (sd * D) / 2]} />)}
      {[-1, 0, 1].map((k) => (
        <group key={k} position={[(k * W) / 2.05, 0.05 + H, 0]}>
          {[-1, 1].map((sd) => <mesh key={sd} geometry={rbox(0.018, 0.018, roofLen, 0.004)} material={beam} position={[0, R / 2, (sd * D) / 4]} rotation={[sd * roofAng, 0, 0]} />)}
        </group>
      ))}
      {/* 玻璃 */}
      {[-1, 1].map((sd) => <mesh key={`w${sd}`} material={glassMat()} position={[0, 0.05 + H / 2, (sd * D) / 2]}><planeGeometry args={[W, H]} /></mesh>)}
      {[-1, 1].map((sd) => <mesh key={`s${sd}`} material={glassMat()} position={[(sd * W) / 2, 0.05 + H / 2, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[D, H]} /></mesh>)}
      {[-1, 1].map((sd) => <mesh key={`r${sd}`} material={glassMat()} position={[0, 0.05 + H + R / 2, (sd * D) / 4]} rotation={[-Math.PI / 2 + sd * roofAng, 0, 0]}><planeGeometry args={[W, roofLen]} /></mesh>)}
      {/* 山墙（三角）玻璃 */}
      {[-1, 1].map((sd) => <mesh key={`g${sd}`} geometry={gable} material={glassMat()} position={[(sd * W) / 2, 0.05 + H, 0]} rotation={[0, (sd * Math.PI) / 2, 0]} />)}
      {/* 窗棂：玻璃本身很淡，靠木框把「三格玻璃」的节奏读出来（亮背景下也能看出是温室） */}
      {[-1, 1].map((zsd) => (
        <group key={`mm${zsd}`} position={[0, 0, (zsd * D) / 2]}>
          {[-1, 1].map((xsd) => (
            <mesh key={xsd} geometry={rbox(0.009, H, 0.008, 0.003)} material={beam} position={[(xsd * W) / 6, 0.05 + H / 2, 0]} castShadow />
          ))}
          <mesh geometry={rbox(W, 0.008, 0.008, 0.003)} material={beam} position={[0, 0.05 + H * 0.52, 0]} castShadow />
        </group>
      ))}
      {[-1, 1].map((xsd) => (
        <mesh key={`me${xsd}`} geometry={rbox(0.008, H, 0.009, 0.003)} material={beam} position={[(xsd * W) / 2, 0.05 + H / 2, 0]} castShadow />
      ))}
      {/* 室内：书桌、书本、绿植、暖灯 */}
      <mesh geometry={rbox(0.26, 0.02, 0.14, 0.006)} material={matte(C.wood)} position={[0.03, 0.15, 0]} castShadow />
      {[-0.1, 0.13].map((x) => <mesh key={x} geometry={rbox(0.016, 0.1, 0.016, 0.004)} material={matte(C.woodDeep)} position={[x, 0.1, 0]} />)}
      {[["#C56E6E", 0.036], ["#6F8FB8", 0.03], ["#D9B46A", 0.033]].map(([col, h], i) => (
        <mesh key={i} geometry={rbox(0.075, h as number, 0.055, 0.006)} material={matte(col as string)} position={[-0.04, 0.162 + (h as number) / 2 + i * 0.034, 0.005 * i]} rotation={[0, 0.18 * i - 0.1, 0]} castShadow />
      ))}
      <group position={[0.08, 0.166, 0.01]} rotation={[0, -0.3, 0]}>
        <mesh geometry={rbox(0.05, 0.006, 0.07, 0.002)} material={matte("#FFF7E8")} position={[-0.026, 0, 0]} rotation={[0, 0, 0.12]} />
        <mesh geometry={rbox(0.05, 0.006, 0.07, 0.002)} material={matte("#FFF7E8")} position={[0.026, 0, 0]} rotation={[0, 0, -0.12]} />
      </group>
      {[[-0.18, -0.09], [0.19, -0.1], [0.2, 0.09]].map(([x, z], i) => (
        <group key={i} position={[x, 0.05, z]}>
          <mesh geometry={cylGeo(0.026, 0.02, 0.04, 10)} material={matte("#C88A6E")} position={[0, 0.02, 0]} />
          <mesh geometry={sphereGeo(0.036, 10, 8)} material={matte(i === 1 ? "#E4A1AA" : "#94B77C")} position={[0, 0.065, 0]} />
        </group>
      ))}
      <group position={[0.14, 0.27, 0]}>
        <mesh geometry={sphereGeo(0.018, 10, 8)} material={glowMat("#FFE3A8", 0.6 + 1.4 * lights)} />
        <Halo size={0.26} opacity={0.55 * lights} />
      </group>
      <pointLight color="#FFD49A" intensity={0.7 * lights} distance={1} decay={2} position={[0.1, 0.25, 0.05]} />
    </group>
  );
}

export function Bench() {
  const wood = matte(C.wood, { map: grainTexture("#B5835C", "#7C5435") });
  return (
    <group>
      <Contact r={0.18} />
      {[-0.08, 0.08].map((x) => (
        <group key={x}>
          <mesh geometry={rbox(0.016, 0.06, 0.06, 0.005)} material={matte(C.ink)} position={[x, 0.03, 0]} />
          <mesh geometry={rbox(0.014, 0.08, 0.014, 0.004)} material={matte(C.ink)} position={[x, 0.09, -0.032]} rotation={[-0.15, 0, 0]} />
        </group>
      ))}
      {[-0.02, 0.0, 0.022].map((z, i) => <mesh key={i} geometry={rbox(0.22, 0.012, 0.02, 0.005)} material={wood} position={[0, 0.064, z]} castShadow />)}
      {[0.1, 0.13].map((y) => <mesh key={y} geometry={rbox(0.22, 0.02, 0.012, 0.005)} material={wood} position={[0, y, -0.04 - (y - 0.1) * 0.2]} rotation={[-0.15, 0, 0]} castShadow />)}
    </group>
  );
}

export function Lamp({ lights = 1 }: { lights?: number }) {
  return (
    <group>
      <Contact r={0.07} />
      <mesh geometry={cylGeo(0.022, 0.03, 0.02, 12)} material={matte(C.ink)} position={[0, 0.01, 0]} />
      <mesh geometry={cylGeo(0.007, 0.009, 0.34, 8)} material={matte(C.ink)} position={[0, 0.18, 0]} castShadow />
      <group position={[0, 0.37, 0]}>
        <mesh geometry={rbox(0.05, 0.06, 0.05, 0.008)} material={glowMat("#FFE2A6", 0.5 + 1.6 * lights)} />
        <mesh geometry={coneGeo(0.045, 0.035, 4)} material={matte(C.ink)} position={[0, 0.045, 0]} rotation={[0, Math.PI / 4, 0]} />
        <Halo size={0.36} opacity={0.6 * lights} />
        <pointLight color="#FFD49A" intensity={0.6 * lights} distance={0.9} decay={2} />
      </group>
    </group>
  );
}

/** 花圃：木质边框 + 微微隆起的松软土壤 + 边缘的苔藓与小石子 */
export function GardenBed({ r, wood = C.wood }: { r: number; wood?: string }) {
  const soil = useMemo(() => { const t = grainTexture("#A07C63", "#6E5242", 128, 340); t.repeat.set(3, 3); return matte("#B08A6E", { map: t }); }, []);
  const posts = Math.round(r * 46);
  const moss = useMemo(() => Array.from({ length: Math.round(r * 40) }, (_, i) => {
    const a = rand(i, 3) * Math.PI * 2, rr = r * (0.8 + rand(i, 4) * 0.16);
    return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, s: 0.012 + rand(i, 5) * 0.012, c: i % 4 === 0 ? "#C9C2B4" : i % 3 === 0 ? "#B3C98F" : "#8EAD74", y: i % 4 === 0 ? 0.3 : 0.6 };
  }), [r]);
  return (
    <group>
      <mesh geometry={sphereGeo(1, 40, 12)} material={soil} scale={[r, 0.05, r]} position={[0, 0.008, 0]} receiveShadow />
      <mesh geometry={cylGeo(r * 1.0, r * 1.02, 0.03, 40)} material={matte(C.soilDeep)} position={[0, 0.0, 0]} receiveShadow />
      {moss.map((m, i) => <mesh key={`m${i}`} geometry={sphereGeo(1, 8, 6)} material={matte(m.c)} scale={[m.s, m.s * m.y, m.s]} position={[m.x, 0.03, m.z]} />)}
      {Array.from({ length: posts }, (_, i) => {
        const a = (i / posts) * Math.PI * 2;
        const h = 0.06 + rand(i, r * 10) * 0.02;
        return <mesh key={i} geometry={rbox(0.042, h, 0.034, 0.014)} material={matte(i % 4 ? wood : C.woodLight)} position={[Math.cos(a) * r * 1.04, h / 2, Math.sin(a) * r * 1.04]} rotation={[0, -a + Math.PI / 2, (rand(i, 2) - 0.5) * 0.12]} castShadow receiveShadow />;
      })}
    </group>
  );
}

export function SteppingStone({ s = 1, seed = 0 }: { s?: number; seed?: number }) {
  return <mesh geometry={sphereGeo(0.05, 14, 8)} material={matte(seed % 3 ? C.stone : "#C9C2D6")} scale={[s * (1 + rand(seed, 1) * 0.3), 0.18, s]} rotation={[0, rand(seed, 2) * 3, 0]} position={[0, 0.004, 0]} receiveShadow />;
}

export function Bush({ seed = 0, tint = "#8DAF78" }: { seed?: number; tint?: string }) {
  const balls = [[0, 0.06, 0, 0.08], [0.07, 0.045, 0.02, 0.06], [-0.06, 0.045, 0.03, 0.058], [0.01, 0.04, 0.07, 0.05]];
  return (
    <group rotation={[0, rand(seed, 1) * 6, 0]}>
      <Contact r={0.14} />
      {balls.map(([x, y, z, r], i) => <mesh key={i} geometry={sphereGeo(1, 14, 10)} material={matte(i % 2 ? tint : "#A3C28B")} position={[x, y, z]} scale={r} castShadow />)}
      {rand(seed, 5) > 0.4 && [0, 1, 2].map((i) => <mesh key={`f${i}`} geometry={sphereGeo(0.012, 8, 6)} material={matte(["#F4D9DF", "#FFF7E8", "#F2C9B6"][i])} position={[Math.cos(i * 2.1) * 0.07, 0.1 - i * 0.012, Math.sin(i * 2.1) * 0.07]} />)}
    </group>
  );
}

export function BlossomTree({ seed = 0, blossom = "#EBB2BB" }: { seed?: number; blossom?: string }) {
  return (
    <group rotation={[0, rand(seed, 1) * 6, 0]}>
      <Contact r={0.22} />
      <mesh geometry={cylGeo(0.022, 0.035, 0.28, 10)} material={matte(C.woodDeep)} position={[0, 0.14, 0]} rotation={[0, 0, 0.08]} castShadow />
      {[[0, 0.36, 0, 0.15], [0.1, 0.31, 0.03, 0.11], [-0.1, 0.32, 0.02, 0.11], [0.02, 0.43, -0.03, 0.1]].map(([x, y, z, r], i) => (
        <mesh key={i} geometry={sphereGeo(1, 16, 12)} material={matte(i % 2 ? blossom : "#F2C6CC")} position={[x, y, z]} scale={r} castShadow />
      ))}
    </group>
  );
}

/** 草丛：实例化网格，一次绘制 */
export function GrassField({ items }: { items: { pos: THREE.Vector3; quat: THREE.Quaternion; s: number; tone: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const h = 0.05 + i * 0.012;
      const b = bladeGeo(h, 0.006).clone();
      b.rotateZ((i - 1) * 0.35); b.translate((i - 1) * 0.008, 0, 0);
      blades.push(b);
    }
    // 合并三片草叶
    const pos: number[] = [];
    for (const b of blades) { const nb = b.toNonIndexed(); pos.push(...(nb.attributes.position.array as Float32Array)); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 1, color: "#ffffff" }), []);
  useMemo(() => {
    setTimeout(() => {
      const m = ref.current; if (!m) return;
      const mx = new THREE.Matrix4(); const col = new THREE.Color();
      const tones = ["#8EAD74", "#9DBB80", "#7FA06B", "#B3C98F"];
      items.forEach((it, i) => {
        mx.compose(it.pos, it.quat, new THREE.Vector3(it.s, it.s, it.s));
        m.setMatrixAt(i, mx); m.setColorAt(i, col.set(tones[it.tone % tones.length]));
      });
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} receiveShadow />;
}

/** 云海：环绕星球腰部的绘本云团，遮住下半球 */
export function CloudRing({ R }: { R: number }) {
  const puffs = useMemo(() => Array.from({ length: 46 }, (_, i) => {
    const a = (i / 46) * Math.PI * 2 + rand(i, 1) * 0.2;
    const y = -R * (0.2 + rand(i, 2) * 0.22);
    const rr = Math.sqrt(R * R - y * y) * (1.0 + rand(i, 3) * 0.08);
    return { p: [Math.sin(a) * rr, y, Math.cos(a) * rr] as [number, number, number], s: 0.32 + rand(i, 4) * 0.34, c: i % 4 === 0 ? "#F7DCCF" : i % 3 === 0 ? "#EDE3F2" : "#FFF7EE" };
  }), [R]);
  return <group>{puffs.map((p, i) => <mesh key={i} geometry={sphereGeo(1, 16, 12)} material={matte(p.c, { rough: 1 })} position={p.p} scale={[p.s * 1.3, p.s * 0.8, p.s]} />)}</group>;
}

/** 观星台：石台 + 低圆顶 + 望远镜 + 门口暖灯，放在星球背面，环绕时有可去的地方 */
export function Observatory({ lights = 1 }: { lights?: number }) {
  const dome = useMemo(() => new THREE.SphereGeometry(0.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), []);
  const stone = matte("#BDB6C9", { map: grainTexture("#C4BDD1", "#8E88A6", 128, 180) });
  return (
    <group>
      <Contact r={0.3} />
      <mesh geometry={cylGeo(0.28, 0.3, 0.05, 22)} material={stone} position={[0, 0.025, 0]} receiveShadow castShadow />
      <mesh geometry={cylGeo(0.2, 0.22, 0.07, 18)} material={matte("#D8CFC0")} position={[0, 0.085, 0]} castShadow />
      <mesh geometry={dome} material={matte("#C9C2D6", { rough: 0.85 })} position={[0, 0.12, 0]} castShadow />
      <group position={[0, 0.19, 0]} rotation={[-0.55, 0.5, 0]}>
        <mesh geometry={cylGeo(0.018, 0.026, 0.24, 10)} material={matte("#C9A25E", { rough: 0.6 })} position={[0, 0.1, 0]} castShadow />
        <mesh geometry={cylGeo(0.03, 0.03, 0.02, 10)} material={matte("#8C6A3F")} position={[0, 0.21, 0]} />
      </group>
      <mesh geometry={sphereGeo(0.016, 8, 6)} material={glowMat("#FFDFA8", 0.6 + 1.2 * lights)} position={[0.19, 0.07, 0.1]} />
      <Halo size={0.3} opacity={0.45 * lights} position={[0.19, 0.1, 0.1]} />
      <pointLight color="#FFD49A" intensity={0.5 * lights} distance={0.8} decay={2} position={[0.19, 0.12, 0.1]} />
    </group>
  );
}

/** 远处的共学星球（低细节） */
export function DistantPlanet({ color, ring = true, size = 0.5 }: { color: string; ring?: boolean; size?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((st) => { if (g.current) g.current.rotation.y = st.clock.elapsedTime * 0.08; });
  return (
    <group ref={g}>
      <mesh geometry={sphereGeo(size, 24, 16)} material={matte(color)} />
      <mesh geometry={sphereGeo(size * 0.18, 10, 8)} material={matte("#94B77C")} position={[0, size * 0.98, 0]} scale={[1.6, 0.6, 1.6]} />
      {ring && <mesh geometry={torusGeo(size * 1.55, size * 0.05, 6, 48)} material={matte("#F2D7B8")} rotation={[Math.PI / 2.4, 0.2, 0]} />}
    </group>
  );
}
