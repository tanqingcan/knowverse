/** 同库同数据对照：owner/kv_app、冷热知识点、并发 1/4。需先 npm run bench。 */
import './env';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {buildHistorySql} from '../src/server/history';
import {setupAppRole} from './security-setup';
const pct=(a:number[],p:number)=>[...a].sort((x,y)=>x-y)[Math.ceil(a.length*p)-1];
async function main(){
 const url=new URL(process.env.DATABASE_URL!);url.pathname='/knowverse_bench';
 const appUrl=new URL(process.env.APP_DATABASE_URL!);appUrl.pathname='/knowverse_bench';
 const admin=new URL(process.env.ADMIN_DATABASE_URL??url.href);
 if(![url,appUrl,admin].every(u=>['localhost','127.0.0.1','[::1]'].includes(u.hostname))||url.host!==appUrl.host||url.host!==admin.host)throw Error('仅允许同一本机实例的独立基准库');
 process.env.DATABASE_URL=url.href;process.env.APP_DATABASE_URL=appUrl.href;
 await setupAppRole();
 const owner=new Pool({connectionString:url.href,max:5});const app=new Pool({connectionString:appUrl.href,max:4});
 const guard=await owner.connect();let locked=false;
 try{
  locked=(await guard.query('SELECT pg_try_advisory_lock(73413003) ok')).rows[0].ok;if(!locked)throw Error('基准库正忙');
  const users=(await owner.query("SELECT id FROM users WHERE handle IN ('c3_bench_a','c3_bench_b') ORDER BY handle")).rows.map(r=>r.id);
  assert.equal(users.length,2,'先运行 npm run bench');
  const subject=(await owner.query("SELECT id FROM subjects WHERE code='c3_bench' AND owner_user_id IS NULL")).rows[0].id;
  const concepts:string[]=[];
  for(const name of ['D3热门知识点','D3冷门知识点'])concepts.push((await owner.query(`INSERT INTO concepts(subject_id,name,name_norm) VALUES($1,$2,$2) ON CONFLICT(subject_id,name_norm) WHERE owner_user_id IS NULL DO UPDATE SET name=excluded.name RETURNING id`,[subject,name])).rows[0].id);
  await owner.query('DELETE FROM message_concepts WHERE concept_id=ANY($1::uuid[])',[concepts]);
  await owner.query(`INSERT INTO message_concepts(message_id,concept_id,source,status) SELECT id,$2,'user','confirmed' FROM (SELECT id,row_number() OVER(PARTITION BY user_id ORDER BY created_at,id) rn FROM messages WHERE user_id=ANY($1::uuid[]) AND role='user') m WHERE rn<=3000`,[users,concepts[0]]);
  await owner.query(`INSERT INTO message_concepts(message_id,concept_id,source,status) SELECT id,$2,'user','confirmed' FROM (SELECT id,row_number() OVER(PARTITION BY user_id ORDER BY created_at,id) rn FROM messages WHERE user_id=ANY($1::uuid[]) AND role='user') m WHERE rn<=5`,[users,concepts[1]]);
  await owner.query('ANALYZE');
  const role=(await app.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.deepEqual(role,{rolsuper:false,rolbypassrls:false});
  const run=async(kind:string,uid:string,stmt:{text:string;params:unknown[]},plan=false)=>{
   const c=await(kind==='owner'?owner:app).connect();
   try{await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='30000ms'");if(kind==='kv_app')await c.query("SELECT set_config('app.user_id',$1,true)",[uid]);
    const r=await c.query((plan?'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ':'')+stmt.text,stmt.params);return r.rows;
   }finally{await c.query('ROLLBACK');c.release();}
  };
  assert.equal(Number((await app.query('SELECT count(*) n FROM messages')).rows[0].n),0,'无上下文不得看到个人消息');
  for(const uid of users)assert.equal(Number((await run('kv_app',uid,{text:'SELECT count(*) n FROM messages WHERE user_id<>$1',params:[uid]}))[0].n),0,'RLS不能泄露其他用户消息');
  const rows:any[]=[];
  for(const [temperature,cid] of [['cold',concepts[1]],['hot',concepts[0]]]){
   const input={conceptIds:[cid],page:1,pageSize:10};const query=(uid:string,opt:boolean)=>buildHistorySql(input,uid,'Asia/Shanghai',true,opt);
   for(const uid of users){const baseline=await run('owner',uid,query(uid,false));assert.equal(Number(baseline[0]?.total),temperature==='hot'?3000:5);
    for(const kind of ['owner','kv_app'])for(const opt of [false,true])assert.deepEqual(await run(kind,uid,query(uid,opt)),baseline,'结果/排序/总数必须一致');
   }
   for(const kind of ['owner','kv_app'])for(const concurrency of [1,4])for(const optimized of [false,true]){
    for(let i=0;i<2;i++)await run(kind,users[i%2],query(users[i%2],optimized));
    const samples:number[]=[];let next=0;const start=performance.now();
    await Promise.all(Array.from({length:concurrency},async()=>{while(true){const n=next++;if(n>=20)return;const uid=users[n%2];const t=performance.now();const r=await run(kind,uid,query(uid,optimized));assert.equal(Number(r[0]?.total),temperature==='hot'?3000:5);samples.push(performance.now()-t);}}));
    const wallMs=performance.now()-start;
    const plan=(await run(kind,users[0],query(users[0],optimized),true))[0]['QUERY PLAN'][0];
    const row={temperature,role:kind,concurrency,optimized,requests:samples.length,p50:pct(samples,.5),p95:pct(samples,.95),wallMs,requestsPerSecond:samples.length*1000/wallMs,samples,plan};rows.push(row);console.log(temperature,kind,concurrency,optimized?'after':'before',row.p95.toFixed(2)+'ms');
   }
  }
  const report={at:new Date().toISOString(),postgres:(await owner.query('SELECT version() v')).rows[0].v,messages:Number((await owner.query('SELECT count(*) n FROM messages WHERE user_id=ANY($1::uuid[])',[users])).rows[0].n),fixture:'c3-v1-40000 + D3 tags: 每人 hot=3000 / cold=5',roleVerified:role,rlsChecks:'无上下文0行；两名用户分别看不到对方消息',measurement:'含获取连接、BEGIN READ ONLY、kv_app set_config、SELECT、ROLLBACK；数据库请求，不含 HTTP/浏览器',warmup:2,requestsPerCase:20,equivalence:'两名用户、两种角色、两种查询均验证完整返回行/顺序/总数相同',rows};
  await fs.writeFile('docs/sql/history-optimization.json',JSON.stringify(report,null,2)+'\n');
  await fs.writeFile('docs/sql/history-optimization.md',`# 知识点检索优化对照\n\n${report.at}；${report.fixture}；40000 消息，2 名模拟用户。每组预热2次、20请求，并发1/4，轮流两名用户。${report.measurement}。${report.equivalence}。\n\n|冷热|角色|并发|改写|P50 ms|P95 ms|请求/秒|\n|---|---|---:|---|---:|---:|---:|\n${rows.map(r=>`|${r.temperature}|${r.role}|${r.concurrency}|${r.optimized?'候选集':'原 EXISTS'}|${r.p50.toFixed(2)}|${r.p95.toFixed(2)}|${r.requestsPerSecond.toFixed(2)}|`).join('\n')}\n\n原始采样及每组 EXPLAIN ANALYZE BUFFERS 见 [JSON](history-optimization.json)。同组先原查询后改写，缓存/系统负载可能影响结果；小样本、并发闭环客户端、合成数据，不能当作线上 SLA。无新增索引或迁移。\n`);
 }finally{if(locked)await guard.query('SELECT pg_advisory_unlock(73413003)');guard.release();await Promise.all([owner.end(),app.end()]);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
