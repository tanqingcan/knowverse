/** C3 deterministic shared fixture, for D2/A6 reuse; no real student data. */
import type { Pool } from 'pg';
export const SEARCH_BENCH_TOPICS=['索引','事务','连接','分组','聚合','概率','分母','条件','外键','主键','范式','死锁','回滚','提交','隔离','日志','视图','触发','约束','游标','条件概率','函数依赖','左外连接','全概率式','随机变量','样本空间','并发控制','事务隔离','数据完整','关系代数','LEFT JOIN','INNER JOIN','GROUP BY','HAVING','WHERE','NULL','SELECT','COMMIT','ROLLBACK','COUNT'];
export const SEARCH_BENCH_VERSION='c3-v1-40000';

/** 两个压测入口共用，禁止在业务库/测试库运行。只替换本 fixture 的用户。 */
export async function seedSearchBenchmark(pool: Pool) {
 const db=(await pool.query('SELECT current_database() AS name')).rows[0].name;
 if(!['knowverse_bench','knowverse_search_bench'].includes(db))throw Error('造数只允许独立基准库');
 await pool.query(`DELETE FROM classes WHERE join_code='D2BENCH' AND owner_user_id IN (SELECT id FROM users WHERE handle='c3_bench_a')`);
 await pool.query(`DELETE FROM users WHERE handle IN ('c3_bench_a','c3_bench_b')`);
 const user:string[]=(await pool.query(`INSERT INTO users(handle,display_name,password_hash) VALUES('c3_bench_a','模拟A','disabled'),('c3_bench_b','模拟B','disabled') RETURNING id`)).rows.map(r=>r.id);
 const subject:string=(await pool.query(`INSERT INTO subjects(code,name) VALUES('c3_bench','C3模拟课程') ON CONFLICT(code) WHERE owner_user_id IS NULL DO UPDATE SET name=excluded.name RETURNING id`)).rows[0].id;
 const concepts:string[]=[];
 for(let i=0;i<10;i++){
  const id:string=(await pool.query(`INSERT INTO concepts(subject_id,name,name_norm) VALUES($1,$2,$2) ON CONFLICT(subject_id,name_norm) WHERE owner_user_id IS NULL DO UPDATE SET name=excluded.name RETURNING id`,[subject,'知识主题'+i])).rows[0].id;
  concepts.push(id);
  await pool.query(`INSERT INTO concept_aliases(concept_id,alias,alias_norm) VALUES($1,$2,$2) ON CONFLICT DO NOTHING`,[id,'课程别名'+i]);
 }
 console.log('生成20000组模拟问答、40000条消息…');
 await pool.query(`WITH gen AS (SELECT g,($1::uuid[])[1+(g/40)%2] AS uid,($2::text[])[1+g%40] AS topic FROM generate_series(0,19999)g),
 cv AS (INSERT INTO conversations(user_id,title,origin,created_at) SELECT uid,'模拟课程回顾 '||g,'seed',timestamptz '2026-01-01'+g*interval '1 minute' FROM gen RETURNING id,user_id,title,created_at),
 qm AS (INSERT INTO messages(conversation_id,user_id,seq,role,content,created_at) SELECT id,user_id,1,'user','问题：'||($2::text[])[1+(substring(title from '[0-9]+')::int)%40]||'，'||repeat('这是合成学习记录。',10),created_at FROM cv RETURNING id,conversation_id,user_id,created_at)
 INSERT INTO messages(conversation_id,user_id,seq,role,content,reply_to_id,created_at) SELECT conversation_id,user_id,2,'assistant',repeat('解释与示例。',15),id,created_at FROM qm`,[user,SEARCH_BENCH_TOPICS]);
 for(let i=0;i<10;i++)await pool.query(`INSERT INTO message_concepts(message_id,concept_id,source,status) SELECT id,$1,'user','confirmed' FROM messages WHERE user_id=ANY($3::uuid[]) AND role='user' AND content LIKE $2`,[concepts[i],'问题：'+SEARCH_BENCH_TOPICS[i]+'，%',user]);
 return { user, subject, concepts };
}
