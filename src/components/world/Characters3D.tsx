"use client";
/**
 * 原创角色：旅人（圆润身形、针织帽、短围巾）与向导“星灯”（漂浮的小灯）。
 * 姿态：idle 待机（坐在长椅上）/ read 阅读 / tend 照料 / think 思考 / celebrate 庆祝。
 * 本地坐标：y 为地表法线，+z 为角色正面。
 */
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { C, matte, glowMat, sphereGeo, cylGeo, torusGeo, rbox, surfaceFrame } from "./geo";
import { Halo } from "./Props3D";

export type Pose = "idle" | "read" | "tend" | "think" | "celebrate";

const COAT = "#8FA3C2", COAT_D = "#7186A8", SKIN = "#F4D7C3", HAIR = "#4E3F5E", HAT = "#DDB56D", SCARF = "#E4A1AA", BOOT = "#5B4A63";

/** 旅人模型。sitting=true 时臀部位于局部原点上方 0.03（外套球底 ≈ 长椅坐面 0.064+0.006） */
export function Traveler({ pose, reduced }: { pose: Pose; reduced?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const can = useRef<THREE.Group>(null);
  const dots = useRef<THREE.Group>(null);
  const sitting = pose === "idle" || pose === "read";
  const cur = useRef({ lift: 0, lean: 0, hd: 0, al: 0, ar: 0, hop: 0 });

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    const k = reduced ? 1 : Math.min(1, dt * 5);
    // 目标姿态
    const target = {
      idle: { lean: 0, hd: 0.05, al: 0.25, ar: 0.25 },
      read: { lean: 0.08, hd: 0.38, al: 1.15, ar: 1.15 },
      tend: { lean: 0.32, hd: 0.3, al: 0.35, ar: 1.05 },
      think: { lean: 0, hd: -0.12, al: 0.2, ar: 2.3 },
      celebrate: { lean: -0.06, hd: -0.2, al: 2.7, ar: 2.7 },
    }[pose];
    const c = cur.current;
    c.lean += (target.lean - c.lean) * k; c.hd += (target.hd - c.hd) * k; c.al += (target.al - c.al) * k; c.ar += (target.ar - c.ar) * k;
    const breathe = reduced ? 0 : Math.sin(t * 1.6) * 0.004;
    const hop = pose === "celebrate" && !reduced ? Math.max(0, Math.sin(t * 6)) * 0.03 : 0;
    if (root.current) { root.current.position.y = (sitting ? 0.03 : 0) + breathe + hop; root.current.rotation.x = c.lean; }
    if (head.current) {
      head.current.rotation.x = c.hd + (pose === "think" && !reduced ? Math.sin(t * 0.9) * 0.05 : 0);
      head.current.rotation.z = pose === "think" ? 0.18 : pose === "idle" && !reduced ? Math.sin(t * 0.5) * 0.06 : 0;
    }
    if (armL.current) armL.current.rotation.x = -c.al + (pose === "celebrate" && !reduced ? Math.sin(t * 6) * 0.15 : 0);
    if (armR.current) { armR.current.rotation.x = -c.ar; armR.current.rotation.z = pose === "think" ? 0.5 : 0; }
    if (tail.current && !reduced) { tail.current.rotation.z = Math.sin(t * 2.2) * 0.25 + 0.15; tail.current.rotation.x = 0.2 + Math.sin(t * 1.7) * 0.12; }
    if (can.current) can.current.rotation.x = pose === "tend" && !reduced ? 0.5 + Math.sin(t * 1.4) * 0.12 : 0.5;
    if (dots.current) dots.current.children.forEach((d, i) => { d.scale.setScalar(reduced ? 1 : 0.6 + 0.4 * Math.max(0, Math.sin(t * 3 - i * 0.7))); });
  });

  const legs = useMemo(() => [-1, 1].map((sd) => (
    <group key={sd} position={[sd * 0.022, sitting ? 0.068 : 0.05, sitting ? 0.008 : 0]} rotation={[sitting ? -1.5 : 0, 0, 0]}>
      <mesh geometry={cylGeo(0.012, 0.013, 0.05, 8)} material={matte(COAT_D)} position={[0, -0.025, 0]} castShadow />
      <mesh geometry={sphereGeo(0.017, 10, 8)} material={matte(BOOT)} position={[0, -0.05, 0.008]} scale={[1, 0.75, 1.35]} castShadow />
    </group>
  )), [sitting]);

  return (
    <group>
      {!sitting && <mesh geometry={sphereGeo(1, 12, 8)} material={matte("#3F3657", { rough: 1 })} scale={[0.05, 0.002, 0.04]} position={[0, 0.002, 0]} />}
      {legs}
      <group ref={root}>
        {/* 身体：圆润外套 */}
        <mesh geometry={sphereGeo(1, 20, 16)} material={matte(COAT)} scale={[0.05, 0.058, 0.045]} position={[0, 0.085, 0]} castShadow />
        <mesh geometry={rbox(0.008, 0.05, 0.004, 0.002)} material={matte(COAT_D)} position={[0, 0.085, 0.045]} />
        {[0.07, 0.095].map((y) => <mesh key={y} geometry={sphereGeo(0.0045, 8, 6)} material={matte(HAT)} position={[0.008, y, 0.045]} />)}
        {/* 手臂 */}
        {[-1, 1].map((sd) => (
          <group key={sd} ref={sd < 0 ? armL : armR} position={[sd * 0.048, 0.12, 0]}>
            <mesh geometry={cylGeo(0.011, 0.012, 0.05, 8)} material={matte(COAT)} position={[0, -0.025, 0]} castShadow />
            <mesh geometry={sphereGeo(0.012, 10, 8)} material={matte(SKIN)} position={[0, -0.052, 0]} />
            {sd > 0 && pose === "tend" && (
              <group ref={can} position={[0, -0.06, 0.01]}>
                <mesh geometry={cylGeo(0.018, 0.02, 0.032, 14)} material={matte("#9CB8B0")} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.012]} castShadow />
                <mesh geometry={cylGeo(0.003, 0.004, 0.04, 6)} material={matte("#9CB8B0")} rotation={[Math.PI / 2.6, 0, 0]} position={[0, 0.006, 0.045]} />
              </group>
            )}
          </group>
        ))}
        {pose === "read" && (
          <group position={[0, 0.088, 0.07]} rotation={[-0.7, 0, 0]}>
            <mesh geometry={rbox(0.034, 0.003, 0.046, 0.001)} material={matte("#FFF7E8")} position={[-0.018, 0, 0]} rotation={[0, 0, 0.18]} />
            <mesh geometry={rbox(0.034, 0.003, 0.046, 0.001)} material={matte("#FFF7E8")} position={[0.018, 0, 0]} rotation={[0, 0, -0.18]} />
            <mesh geometry={rbox(0.074, 0.004, 0.05, 0.001)} material={matte(C.roofDeep)} position={[0, -0.004, 0]} />
          </group>
        )}
        {/* 围巾 */}
        <mesh geometry={torusGeo(0.032, 0.011, 8, 20)} material={matte(SCARF)} position={[0, 0.138, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow />
        <group ref={tail} position={[0.022, 0.135, -0.022]}>
          <mesh geometry={rbox(0.018, 0.05, 0.008, 0.004)} material={matte(SCARF)} position={[0.006, -0.02, -0.01]} rotation={[0.5, 0, 0.4]} castShadow />
          <mesh geometry={sphereGeo(0.007, 8, 6)} material={matte("#F4D9DF")} position={[0.016, -0.044, -0.026]} />
        </group>
        {/* 头 */}
        <group ref={head} position={[0, 0.15, 0]}>
          <mesh geometry={sphereGeo(0.042, 20, 16)} material={matte(SKIN)} position={[0, 0.035, 0]} castShadow />
          <mesh geometry={sphereGeo(0.044, 20, 12)} material={matte(HAIR)} position={[0, 0.042, -0.006]} scale={[1, 0.85, 1]} />
          {/* 针织帽 */}
          <mesh geometry={sphereGeo(0.044, 20, 12)} material={matte(HAT)} position={[0, 0.056, -0.004]} scale={[1.02, 0.72, 1.02]} castShadow />
          <mesh geometry={torusGeo(0.04, 0.008, 8, 24)} material={matte("#C99D52")} position={[0, 0.05, -0.002]} rotation={[Math.PI / 2 + 0.15, 0, 0]} />
          <mesh geometry={sphereGeo(0.012, 10, 8)} material={matte("#FFF7E8")} position={[0, 0.092, -0.008]} />
          {/* 脸 */}
          {[-1, 1].map((sd) => <mesh key={sd} geometry={sphereGeo(0.0045, 8, 6)} material={matte(C.ink)} position={[sd * 0.014, 0.034, 0.039]} scale={[1, pose === "celebrate" ? 0.5 : 1.25, 0.6]} />)}
          {[-1, 1].map((sd) => <mesh key={`b${sd}`} geometry={sphereGeo(0.006, 8, 6)} material={matte("#EFA9A4")} position={[sd * 0.024, 0.024, 0.034]} scale={[1, 0.6, 0.4]} />)}
        </group>
        {pose === "think" && (
          <group ref={dots} position={[0.05, 0.27, 0]}>
            {[0, 1, 2].map((i) => <mesh key={i} geometry={sphereGeo(0.007 + i * 0.002, 8, 6)} material={matte("#FFF7E8")} position={[i * 0.018, i * 0.014, 0]} />)}
          </group>
        )}
      </group>
    </group>
  );
}

/** 星灯：漂浮的小灯（核心 + 纸罩 + 小星），thinking 时脉动更快，celebrate 时轻轻旋转 */
export function StarLamp({ state = "idle", reduced }: { state?: "idle" | "think" | "celebrate" | "guide"; reduced?: boolean }) {
  const g = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    if (g.current) {
      g.current.position.y = reduced ? 0 : Math.sin(t * 1.3) * 0.018;
      g.current.rotation.y = state === "celebrate" && !reduced ? t * 2 : reduced ? 0 : Math.sin(t * 0.6) * 0.3;
    }
    if (core.current) { const s = 1 + (reduced ? 0 : Math.sin(t * (state === "think" ? 6 : 2)) * (state === "think" ? 0.12 : 0.05)); core.current.scale.setScalar(s); }
  });
  const star = useMemo(() => new THREE.OctahedronGeometry(0.018, 0), []);
  return (
    <group ref={g}>
      <mesh ref={core} geometry={sphereGeo(0.026, 16, 12)} material={glowMat("#FFE6A8", 1.8)} />
      <mesh geometry={sphereGeo(0.038, 16, 12)} material={useMemo(() => new THREE.MeshStandardMaterial({ color: "#FFF1D2", transparent: true, opacity: 0.35, roughness: 0.4, emissive: new THREE.Color("#FFD9A0"), emissiveIntensity: 0.4, depthWrite: false }), [])} />
      <mesh geometry={cylGeo(0.016, 0.022, 0.012, 12)} material={matte(C.woodDeep)} position={[0, 0.04, 0]} />
      <mesh geometry={torusGeo(0.008, 0.0025, 6, 12)} material={matte(C.woodDeep)} position={[0, 0.052, 0]} />
      <mesh geometry={star} material={glowMat("#FFF7E8", 1.2)} position={[0, -0.052, 0]} scale={[0.7, 1.2, 0.35]} />
      <Halo size={0.32} opacity={0.8} />
      <pointLight color="#FFD89A" intensity={0.35} distance={0.7} decay={2} />
    </group>
  );
}

/** 让子物体沿星球表面平滑移动到目标 (az, polar, yaw)，并保持“站立”朝向 */
export function SurfaceMover({ az, polar, yaw = 0, lift = 0, speed = 2.2, reduced, children }: { az: number; polar: number; yaw?: number; lift?: number; speed?: number; reduced?: boolean; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const init = useRef(false);
  const tgt = useMemo(() => surfaceFrame(az, polar, yaw, lift), [az, polar, yaw, lift]);
  useFrame((_, dt) => {
    const o = g.current; if (!o) return;
    if (!init.current || reduced) { o.position.copy(tgt.pos); o.quaternion.copy(tgt.quat); init.current = true; return; }
    const k = Math.min(1, dt * speed);
    const r = tgt.pos.length();
    const cur = o.position.clone().normalize();
    cur.lerp(tgt.pos.clone().normalize(), k).normalize();
    o.position.copy(cur.multiplyScalar(r));
    o.quaternion.slerp(tgt.quat, k);
  });
  return <group ref={g}>{children}</group>;
}

