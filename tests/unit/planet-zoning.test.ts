import {scatter} from "@/components/world/layout";
import {describe,it,expect} from 'vitest';
import {layoutBeds} from '@/components/world/bedLayout';
import {homePoses} from '@/lib/home/home-layout';
describe('分区布局最新要求',()=>{
 it('保留两个学科圆形花圃，分区标记不再合并',()=>{
 const plants=Array.from({length:10},(_,i)=>({id:`p${i}`,conceptName:`k${i}`,species:'rose',color:'rose',stage:'seed' as const,gardenIndex:i%2}));
 const beds=layoutBeds([{id:'a',name:'A'},{id:'b',name:'B'}],plants,{__fourzones:{x:0,z:0}});
 expect(beds).toHaveLength(2);expect(new Set(beds.flatMap(b=>b.plants.map(p=>p.id))).size).toBe(10);
 });
 it('移动一个花圃不移动另一个或改变植物ID',()=>{
 const gardens=[{id:'a',name:'A'},{id:'b',name:'B'}];
 const a=layoutBeds(gardens,[]);const b=layoutBeds(gardens,[],{a:{x:1,z:1,rot:30}});
 expect(b[0].x).toBe(1);expect(b[0].rot).toBe(30);expect(b[1]).toEqual(a[1]);
 });
 it('删除书屋的初始化布局不崩溃或补回书屋',()=>{
 const p=homePoses([{id:'home-lamp',kind:'lamp',x:1,z:1,rot:0}] as any);expect(p.cottage).toBeUndefined();
 });
});

describe('当前布局草花避让',()=>{
 it('旧池塘搬走后原位置恢复植被，同时避开当前对象和石径',()=>{
   const points=scatter([],1000,31,4,0,{blocked:[{x:2,z:0,r:.5}],paths:[{x:1,z:1}]});
   expect(points.some(p=>Math.hypot(p.x,p.z-2.24)<.35)).toBe(true);
   expect(points.every(p=>Math.hypot(p.x-2,p.z)>=.5)).toBe(true);
   expect(points.every(p=>Math.hypot(p.x-1,p.z-1)>=.09)).toBe(true);
 });
});
