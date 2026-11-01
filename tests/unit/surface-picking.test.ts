import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { surfaceCapFromWorld } from "@/components/world/surfacePicking";

describe("rotated planet picking", () => {
  for (const [yaw, tilt] of [[0,0], [1.8,-.3], [-1.8,.62], [Math.PI,-.34]]) {
    it(`keeps clicked cap position after yaw=${yaw}, tilt=${tilt}`, () => {
      const frame = new THREE.Group(); frame.rotation.set(tilt,yaw,0); frame.updateMatrixWorld(true);
      const x=-3.8,z=.7,r=3,polar=Math.hypot(x,z)/r,az=Math.atan2(x,z);
      const worldPoint=frame.localToWorld(new THREE.Vector3(r*Math.sin(polar)*Math.sin(az),r*Math.cos(polar),r*Math.sin(polar)*Math.cos(az)));
      const before=worldPoint.clone();
      const cap=surfaceCapFromWorld(worldPoint,frame,r);
      expect(cap.x).toBeCloseTo(x,10); expect(cap.z).toBeCloseTo(z,10);
      expect(worldPoint.equals(before)).toBe(true);
    });
  }
});
