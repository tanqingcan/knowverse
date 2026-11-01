export type WalkPoint={x:number;z:number};
export type WalkObstacle=WalkPoint & {r:number};
const dist=(a:WalkPoint,b:WalkPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
export function walkSegmentClear(a:WalkPoint,b:WalkPoint,obstacles:WalkObstacle[]) {
 const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
 return obstacles.every(o=>{const t=l?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.z-a.z)*dz)/l)):0;return Math.hypot(a.x+t*dx-o.x,a.z+t*dz-o.z)>=o.r-.0001;});
}
/** Visibility graph around circular footprints; every segment stays on walkable ground. */
export function planWalkPath(start:WalkPoint,target:WalkPoint,all:WalkObstacle[]):WalkPoint[] {
 if(![start.x,start.z,target.x,target.z].every(Number.isFinite))return [];
 const obstacles=all.filter(o=>Number.isFinite(o.r)&&o.r>0&&dist(start,o)>o.r+.01);
 const end={...target};
 for(let n=0;n<8;n++)for(const o of obstacles){const d=dist(end,o);if(d<o.r+.02){const a=d>1e-6?Math.atan2(end.x-o.x,end.z-o.z):0;end.x=o.x+Math.sin(a)*(o.r+.05);end.z=o.z+Math.cos(a)*(o.r+.05);}}
 if(walkSegmentClear(start,end,obstacles))return [{...start},end];
 const nodes:WalkPoint[]=[{...start},end];
 for(const o of obstacles)for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=o.r+Math.max(.08,o.r*.04);const p={x:o.x+Math.sin(a)*r,z:o.z+Math.cos(a)*r};if(obstacles.every(c=>dist(p,c)>=c.r+.01))nodes.push(p);}
 const costs=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),done=new Set<number>();costs[0]=0;
 for(let step=0;step<nodes.length;step++){
  let at=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(at<0||costs[i]<costs[at]))at=i;
  if(at<0||!Number.isFinite(costs[at]))return [];
  if(at===1){const route:WalkPoint[]=[];for(let i=1;i>=0;i=prev[i])route.unshift(nodes[i]);return route;}
  done.add(at);
  for(let i=0;i<nodes.length;i++)if(!done.has(i)){const c=costs[at]+dist(nodes[at],nodes[i]);if(c<costs[i]&&walkSegmentClear(nodes[at],nodes[i],obstacles)){costs[i]=c;prev[i]=at;}}
 }
 return [];
}
