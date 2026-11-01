import * as THREE from "three";

/** Convert a world-space hit into the rotated planet's own cap coordinates. */
export function surfaceCapFromWorld(point: THREE.Vector3, frame: THREE.Object3D | null, radius: number) {
  const p = frame ? frame.worldToLocal(point.clone()) : point;
  const polar = Math.acos(THREE.MathUtils.clamp(p.y / (p.length() || 1), -1, 1));
  const az = Math.atan2(p.x, p.z);
  return { x: Math.sin(az) * polar * radius, z: Math.cos(az) * polar * radius };
}
