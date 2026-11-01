import {it,expect} from "vitest";
import {planWalkPath,walkSegmentClear} from "@/lib/home/walk-path";
it("walks directly across clear ground",()=>{expect(planWalkPath({x:0,z:0},{x:1,z:1},[])).toEqual([{x:0,z:0},{x:1,z:1}]);});
it("routes around a pond rather than crossing its water",()=>{const obstacles=[{x:0,z:0,r:.8}];const route=planWalkPath({x:-2,z:0},{x:2,z:0},obstacles);expect(route.length).toBeGreaterThan(2);for(let i=1;i<route.length;i++)expect(walkSegmentClear(route[i-1],route[i],obstacles)).toBe(true);expect(route.at(-1)).toEqual({x:2,z:0});});
it("a click inside a blocked footprint finishes safely at its edge",()=>{const route=planWalkPath({x:-2,z:0},{x:0,z:0},[{x:0,z:0,r:.8}]);const end=route.at(-1)!;expect(Math.hypot(end.x,end.z)).toBeGreaterThan(.8);});
it("rejects invalid click coordinates",()=>{expect(planWalkPath({x:0,z:0},{x:NaN,z:0},[])).toEqual([]);});
