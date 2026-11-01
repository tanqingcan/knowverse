"use client";
import React,{useMemo,useEffect} from "react";
import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {petalGeo,matte,vcol,sphereGeo,cylGeo} from "./geo";

/** Layered pointed petals, a notched floating leaf, and a small seed pod. */
export function Lotus3D({seed=0}:{seed?:number}) {
 const petals=useMemo(()=>{
  const pieces:THREE.BufferGeometry[]=[];
  const rows=[{n:10,len:.108,width:.047,tilt:1.13,r:.018,y:.032},{n:8,len:.092,width:.042,tilt:.82,r:.012,y:.04},{n:6,len:.073,width:.033,tilt:.48,r:.007,y:.043}];
  rows.forEach((row,j)=>{const g=petalGeo({len:row.len,width:row.width,cup:.65,curl:.035,round:1.35,base:"#fff0dc",mid:j===2?"#f7d4df":"#efb5ca",tip:"#d77b9f"});for(let i=0;i<row.n;i++){
   const az=i/row.n*Math.PI*2+j*.32+seed*.13;
   const m=new THREE.Matrix4().makeRotationY(az).multiply(new THREE.Matrix4().makeTranslation(0,row.y,row.r)).multiply(new THREE.Matrix4().makeRotationX(row.tilt));
   pieces.push(g.clone().applyMatrix4(m));
  }});
  const g=mergeGeometries(pieces,false)!;pieces.forEach(p=>p.dispose());return g;
 },[seed]);
 const leaf=useMemo(()=>{
  const r=.155,s=new THREE.Shape();s.moveTo(0,0);s.lineTo(Math.cos(.16)*r,Math.sin(.16)*r);s.absarc(0,0,r,.16,Math.PI*2-.16,false);s.lineTo(0,0);s.closePath();
  const g=new THREE.ShapeGeometry(s,48);g.rotateX(-Math.PI/2);
  const p=g.attributes.position;for(let i=0;i<p.count;i++){const d=Math.hypot(p.getX(i),p.getZ(i))/r;p.setY(i,.004*d*d+.0012*d*Math.sin(Math.atan2(p.getZ(i),p.getX(i))*9));}g.computeVertexNormals();return g;
 },[]);
 const veins=useMemo(()=>{
  const p:number[]=[];for(let i=0;i<10;i++){const a=.3+i/10*(Math.PI*2-.6);p.push(0,.002,0,Math.cos(a)*.142,.006,Math.sin(a)*.142);}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(p,3));return g;
 },[]);
 const stamens=useMemo(()=>{
  const pieces:THREE.BufferGeometry[]=[];for(let i=0;i<16;i++){const a=i/16*Math.PI*2,x=Math.cos(a)*.023,z=Math.sin(a)*.023;
   pieces.push(cylGeo(.0011,.0013,.014,5).clone().translate(x,.077,z));pieces.push(sphereGeo(.0025,6,4).clone().translate(x,.085,z));}
  const g=mergeGeometries(pieces,false)!;pieces.forEach(p=>p.dispose());return g;
 },[]);
 useEffect(()=>()=>{petals.dispose();},[petals]);
 useEffect(()=>()=>{leaf.dispose();veins.dispose();stamens.dispose();},[leaf,veins,stamens]);
 return <group>
  <group position={[0,.014,0]} rotation={[0,.45+seed*.17,0]}>
   <mesh geometry={leaf} material={matte("#588e76",{side:THREE.DoubleSide,rough:1})} userData={{part:"leaf"}} receiveShadow/>
   <lineSegments geometry={veins}><lineBasicMaterial color="#8caf8e" transparent opacity={.55}/></lineSegments>
  </group>
  <mesh geometry={cylGeo(.003,.0035,.03,7)} material={matte("#6b9a74")} position={[0,.031,0]} userData={{part:"stem"}}/>
  <mesh geometry={petals} material={vcol("petal")} userData={{part:"petal"}} castShadow/>
  <mesh geometry={stamens} material={matte("#e8bf60")} userData={{part:"core"}}/>
  <mesh geometry={sphereGeo(.017,14,8)} material={matte("#e5cc79")} scale={[1,.5,1]} position={[0,.077,0]} userData={{part:"core"}}/>
  {Array.from({length:7},(_,i)=>{const a=i/7*Math.PI*2;return <mesh key={i} geometry={sphereGeo(.0018,6,4)} material={matte("#9c914d")} position={[Math.cos(a)*.009,.085,Math.sin(a)*.009]}/>;})}
 </group>;
}
