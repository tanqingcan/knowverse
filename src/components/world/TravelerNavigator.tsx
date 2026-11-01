"use client";
import React,{useEffect,useRef,useState} from "react";
import {useFrame} from "@react-three/fiber";
import * as THREE from "three";
import {capFrame} from "./layout";
import {Traveler} from "./Characters3D";
import {planWalkPath,type WalkPoint,type WalkObstacle} from "@/lib/home/walk-path";
export type TravelTarget=WalkPoint & {sit?:boolean};
export function TravelerNavigator({target,rest,obstacles,reduced,onArrive,onBlocked}:{target:TravelTarget|null;rest:WalkPoint;obstacles:WalkObstacle[];reduced?:boolean;onArrive:()=>void;onBlocked:()=>void}) {
 const group=useRef<THREE.Group>(null),current=useRef<WalkPoint>({...rest}),route=useRef<WalkPoint[]>([]),at=useRef(1),arrived=useRef(false);
 const [moving,setMoving]=useState(false);
 const callbacks=useRef({onArrive,onBlocked});callbacks.current={onArrive,onBlocked};
 useEffect(()=>{
  if(!target){current.current={...rest};route.current=[];setMoving(false);return;}
  const path=planWalkPath(current.current,target,obstacles);route.current=path;at.current=1;arrived.current=false;setMoving(path.length>1);
  if(!path.length)callbacks.current.onBlocked();
 },[target,obstacles,rest.x,rest.z]);
 useFrame((_,dt)=>{
  const g=group.current;if(!g||!target)return;
  const old=capFrame(current.current.x,current.current.z).pos;
  let budget=reduced?100:Math.min(dt,.05)*.78;
  while(budget>0 && at.current<route.current.length){const next=route.current[at.current],p=current.current,d=Math.hypot(next.x-p.x,next.z-p.z);if(d<=budget){current.current={...next};budget-=d;at.current++;}else{current.current={x:p.x+(next.x-p.x)*budget/d,z:p.z+(next.z-p.z)*budget/d};budget=0;}}
  const f=capFrame(current.current.x,current.current.z,0,.017),forward=f.pos.clone().sub(old),up=f.pos.clone().normalize();
  forward.addScaledVector(up,-forward.dot(up));
  if(forward.lengthSq()>1e-9){forward.normalize();const right=up.clone().cross(forward).normalize();const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));g.quaternion.slerp(q,reduced?1:Math.min(1,dt*12));}
  g.position.copy(f.pos);
  if(at.current>=route.current.length&&!arrived.current){arrived.current=true;setMoving(false);callbacks.current.onArrive();}
 });
 return <group ref={group} visible={!!target} name="walking-traveler"><group scale={1.25}><Traveler pose={moving?"walk":"stand"} reduced={reduced}/></group></group>;
}
