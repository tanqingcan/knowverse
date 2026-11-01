"use client";
import React,{useEffect,useState} from 'react';
import {api} from '@/lib/api';
type Entry={conceptId:string;place:'seed'|'rose'|'aquatic';name:string};
export function ZonePanel({zone,onZone,plants,onSelect,onEntries,openKey=0,onClose}:{onClose?:()=>void;openKey?:number;zone:string;onZone:(s:string)=>void;plants:{conceptId:string;conceptName:string;id:string}[];onSelect:(id:string)=>void;onEntries:(e:Entry[])=>void}){
 const [open,setOpen]=useState(false),[entries,setEntries]=useState<Entry[]>([]),[candidates,setCandidates]=useState<{id:string;name:string}[]>([]),[err,setErr]=useState('');
 const load=async()=>{try{const r=await api<{entries:Entry[];candidates:{id:string;name:string}[]}>('/api/garden-zones');setEntries(r.entries);setCandidates(r.candidates);onEntries(r.entries);}catch(e){setErr(String(e));}};
 useEffect(()=>{void load();},[]);
 useEffect(()=>{if(openKey>0)setOpen(true);},[openKey]);
 useEffect(()=>{const f=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);onClose?.();}};window.addEventListener("keydown",f);return()=>window.removeEventListener("keydown",f);},[onClose]);
 const save=async(conceptId:string,place:Entry['place'],remove=false)=>{try{await api('/api/garden-zones',{body:{conceptId,place,remove}});await load();}catch(e){setErr(String(e));}};
 if(!open)return null;
 return <aside className="zone-nav hanging-window" aria-label="种子小屋">
 {open&&<div className="zone-content" role="dialog" aria-label="种子小屋" aria-modal="false"><button className="zone-close" onClick={()=>{setOpen(false);onClose?.();}} aria-label="关闭区域面板">×</button>
 <h3>{zone==='seeds'?'种子小屋':zone==='mountains'?'云间未知知识 · 探索种子':zone==='roses'?'玫瑰林 · 自由布置':zone==='pond'?'荷花池 · 自由布置':'知识花园'}</h3>
 <p>{zone==='mountains'?'探索后收进花园的种子小屋。种子只是待探索知识，不代表已经掌握。':zone==='roses'?'玫瑰是独立装饰，可在创造模式中移动、复制和配色。':zone==='pond'?'荷花暂不绑定知识，可在创造模式中移动、复制与配色。':'在云间探索新知识，收进种子小屋。'}</p>
 {err&&<p role="alert">{err}</p>}
 {(zone==='mountains'||zone==='seeds')?<>{candidates.map(c=><div className="zone-row" key={c.id}><span>{c.name}</span><button onClick={()=>save(c.id,'seed')}>发现并收进种子屋</button></div>)}{!candidates.length&&<p>当前可探索知识均已收集。</p>}</>:<>{plants.map(p=><div className="zone-row" key={p.id}><button onClick={()=>onSelect(p.id)}>{p.conceptName}</button></div>)}</>}
 <h4>种子小屋 · {entries.filter(e=>e.place==='seed').length} 颗待探索种子</h4>{entries.filter(e=>e.place==='seed').map(e=><div className="zone-row" key={e.conceptId}><span>{e.name}</span><button onClick={()=>save(e.conceptId,'seed',true)}>移出种子屋</button></div>)}
 </div>}</aside>;
}
