import './env';
import fs from 'node:fs/promises';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {buildHistorySql} from '../src/server/history';
import {escapeLike} from '../src/server/text';
import {SEARCH_BENCH_TOPICS as topics,SEARCH_BENCH_VERSION} from './search-bench-data';
const percentile=(values:number[],p:number)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]??0;
async function main(){
 const base=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw Error('仅允许本机');
 const url=new URL(base);url.pathname='/knowverse_search_bench';
 const admin=new Pool({connectionString:process.env.ADMIN_DATABASE_URL??base.href});
 if(!(await admin.query(`SELECT 1 FROM pg_database WHERE datname='knowverse_search_bench'`)).rowCount)await admin.query('CREATE DATABASE knowverse_search_bench');await admin.end();
 const pool=new Pool({connectionString:url.href});
 const guard=await pool.connect();
 try{
 if(!(await guard.query('SELECT pg_try_advisory_lock(73413003) AS ok')).rows[0].ok)throw Error('已有同一数据集压测在运行');
 await migrate(drizzle(pool),{migrationsFolder:'./drizzle'});
 // Dedicated benchmark DB only. Delete only this fixture's previous synthetic users.
 await pool.query(`DELETE FROM users WHERE handle IN ('c3_bench_a','c3_bench_b')`);
 await pool.query(await fs.readFile('docs/sql/drafts/message-terms.sql','utf8'));
 const user=(await pool.query(`INSERT INTO users(handle,display_name,password_hash) VALUES('c3_bench_a','模拟A','disabled'),('c3_bench_b','模拟B','disabled') RETURNING id`)).rows.map(r=>r.id);
 const subject=(await pool.query(`INSERT INTO subjects(code,name) VALUES('c3_bench','C3模拟课程') ON CONFLICT(code) WHERE owner_user_id IS NULL DO UPDATE SET name=excluded.name RETURNING id`)).rows[0].id;
 const concepts=[];for(let i=0;i<10;i++){const id=(await pool.query(`INSERT INTO concepts(subject_id,name,name_norm) VALUES($1,$2,$2) ON CONFLICT(subject_id,name_norm) WHERE owner_user_id IS NULL DO UPDATE SET name=excluded.name RETURNING id`,[subject,'知识主题'+i])).rows[0].id;concepts.push(id);await pool.query(`INSERT INTO concept_aliases(concept_id,alias,alias_norm) VALUES($1,$2,$2) ON CONFLICT DO NOTHING`,[id,'课程别名'+i]);}
 console.log('生成20000组模拟问答、40000条消息…');
 await pool.query(`WITH gen AS (SELECT g,($1::uuid[])[1+(g/40)%2] AS uid,($2::text[])[1+g%40] AS topic FROM generate_series(0,19999)g),
 cv AS (INSERT INTO conversations(user_id,title,origin,created_at) SELECT uid,'模拟课程回顾 '||g,'seed',timestamptz '2026-01-01'+g*interval '1 minute' FROM gen RETURNING id,user_id,title,created_at),
 qm AS (INSERT INTO messages(conversation_id,user_id,seq,role,content,created_at) SELECT id,user_id,1,'user','问题：'||($2::text[])[1+(substring(title from '[0-9]+')::int)%40]||'，'||repeat('这是合成学习记录。',10),created_at FROM cv RETURNING id,conversation_id,user_id,created_at)
 INSERT INTO messages(conversation_id,user_id,seq,role,content,reply_to_id,created_at) SELECT conversation_id,user_id,2,'assistant',repeat('解释与示例。',15),id,created_at FROM qm`,[user,topics]);
 // Stable topic-to-concept assignment independent of random message UUIDs.
 for(let i=0;i<10;i++)await pool.query(`INSERT INTO message_concepts(message_id,concept_id,source,status) SELECT id,$1,'user','confirmed' FROM messages WHERE role='user' AND content LIKE $2`,[concepts[i],'问题：'+topics[i]+'，%']);
 for(const table of ['message_terms','messages','conversations','message_concepts'])await pool.query('VACUUM (ANALYZE) '+table);
 const cases=[...topics.map(keyword=>({keyword,concept:null as string|null})),...concepts.map((concept,i)=>({keyword:'课程别名'+i,concept}))];
 const rows:any[]=[];const all:{before:number[],after:number[]}={before:[],after:[]};
 for(const c of cases){
  const gold=(await pool.query(`SELECT m.id FROM messages m JOIN conversations cv ON cv.id=m.conversation_id WHERE m.user_id=$1 AND m.role='user' AND (m.content ILIKE $2 ESCAPE '\\' OR cv.title ILIKE $2 ESCAPE '\\' OR EXISTS(SELECT 1 FROM message_concepts mc WHERE mc.message_id=m.id AND mc.concept_id=$3::uuid AND mc.status<>'rejected'))`,[user[0],'%'+escapeLike(c.keyword)+'%',c.concept])).rows.map(r=>r.id);
  const record:any={keyword:c.keyword,goldCount:gold.length};
  for(const mode of ['before','after'] as const){const stmt=buildHistorySql({keyword:c.keyword,page:1,pageSize:10},user[0],'Asia/Shanghai',mode==='after');await pool.query(stmt.text,stmt.params);const samples=[];let result:any;
   for(let repeat=0;repeat<5;repeat++){const t=performance.now();result=await pool.query(stmt.text,stmt.params);samples.push(performance.now()-t);}
   all[mode].push(...samples);record[mode]={p50:percentile(samples,.5),p95:percentile(samples,.95),total:Number(result.rows[0]?.total??0),topIds:result.rows.map((r:any)=>r.question_id),samples,topPrecision:result.rows.length?result.rows.filter((r:any)=>gold.includes(r.question_id)).length/result.rows.length:null};
  }rows.push(record);console.log(c.keyword,record.before.p95.toFixed(1),record.after.p95.toFixed(1));
 }
 const stmt=buildHistorySql({keyword:'索引',page:1,pageSize:10},user[0],'Asia/Shanghai');
 const plan=(await pool.query('EXPLAIN (ANALYZE,BUFFERS) '+stmt.text,stmt.params)).rows.map(r=>r['QUERY PLAN']).join('\n');
 const counts=(await pool.query(`SELECT (SELECT count(*) FROM messages WHERE user_id=ANY($1::uuid[])) AS messages,(SELECT count(*) FROM message_terms mt JOIN messages m ON m.id=mt.message_id WHERE m.user_id=ANY($1::uuid[])) AS terms`,[user])).rows[0];
 const summary=Object.fromEntries((['before','after']as const).map(mode=>[mode,{p50:percentile(all[mode],.5),p95:percentile(all[mode],.95),hitQueries:rows.filter(r=>r[mode].total>0).length,exactCount:rows.filter(r=>r[mode].total===r.goldCount).length}]));
 await fs.writeFile('docs/test-evidence/search-eval.json',JSON.stringify({date:new Date().toISOString(),dataset:SEARCH_BENCH_VERSION,postgres:(await pool.query('SELECT version() AS v')).rows[0].v,counts,summary,rows,plan},null,2));
 console.log(JSON.stringify(summary));
 }finally{await guard.query('SELECT pg_advisory_unlock(73413003)');guard.release();await pool.end();}
}
main().catch(e=>{console.error('压测失败：'+e.message);process.exitCode=1});
