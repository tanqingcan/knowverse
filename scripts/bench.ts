/** D2：五类查询统一基准。仅本机 knowverse_bench，不 reset/seed 业务库。 */
import './env';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { buildHistorySql } from '../src/server/history';
import { seedSearchBenchmark, SEARCH_BENCH_VERSION } from './search-bench-data';

const percentile = (values: number[], p: number) => [...values].sort((a,b) => a-b)[Math.ceil(values.length*p)-1] ?? 0;
const local = (url: URL) => ['localhost','127.0.0.1','[::1]'].includes(url.hostname);

async function main() {
  const base = new URL(process.env.DATABASE_URL!);
  const url = new URL(process.env.BENCH_DATABASE_URL ?? base.href);
  if (!process.env.BENCH_DATABASE_URL) url.pathname = '/knowverse_bench';
  const adminUrl = new URL(process.env.ADMIN_DATABASE_URL ?? base.href);
  if (!local(url) || !local(adminUrl) || url.pathname !== '/knowverse_bench' || adminUrl.hostname !== url.hostname || adminUrl.port !== url.port) {
    throw Error('bench 只允许同一本机实例的固定 knowverse_bench 库');
  }
  adminUrl.pathname = '/postgres';
  const admin = new Pool({connectionString: adminUrl.href});
  try {
    const exists = (await admin.query("SELECT 1 FROM pg_database WHERE datname='knowverse_bench'")).rowCount;
    if (!exists) await admin.query('CREATE DATABASE knowverse_bench');
    else if (process.env.BENCH_REBUILD === '1') {
      const backup = 'knowverse_bench_backup_' + Date.now(); // 固定前缀 + 数字，非用户标识符
      await admin.query(`CREATE DATABASE "${backup}" TEMPLATE knowverse_bench`);
      console.log('已备份旧基准库：'+backup);
    }
  } finally { await admin.end(); }
  const pool = new Pool({connectionString: url.href});
  const guard = await pool.connect();
  let locked = false;
  try {
    locked = (await guard.query('SELECT pg_try_advisory_lock(73413003) AS ok')).rows[0].ok;
    if (!locked) throw Error('同一基准库已有压测在运行');
    // 仅用于旧版 explain 创建、迁移 journal 不兼容的合成基准库；默认不清库。
    if (process.env.BENCH_REBUILD === '1') {
      if ((await pool.query('SELECT current_database() AS name')).rows[0].name !== 'knowverse_bench') throw Error('基准库校验失败');
      await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE');
    }
    await migrate(drizzle(pool), {migrationsFolder:'./drizzle'});
    const fixture = await seedSearchBenchmark(pool);
    const user = fixture.user[0];
    // 时间轴与班级统计补充合成数据，均随 fixture 用户删除；不冒充真实学习证据。
    await pool.query(`INSERT INTO growth_events(user_id,concept_id,event_type,reason,origin,created_at)
      SELECT $1,($2::uuid[])[1+g%10],'planted','基准模拟事件','seed',timestamptz '2026-01-01'+g*interval '1 minute'
      FROM generate_series(0,1999)g`,[user,fixture.concepts]);
    const classId = (await pool.query(`INSERT INTO classes(name,join_code,owner_user_id) VALUES('模拟基准班','D2BENCH',$1) RETURNING id`,[user])).rows[0].id;
    await pool.query(`INSERT INTO class_members(class_id,user_id) SELECT $1,unnest($2::uuid[])`,[classId,fixture.user]);
    await pool.query('ANALYZE');
    const history = (input: Parameters<typeof buildHistorySql>[0]) => buildHistorySql(input,user,'Asia/Shanghai');
    const cases = [
      {name:'历史关键词', ...history({keyword:'索引',page:1,pageSize:10})},
      {name:'日期范围', ...history({from:'2026-01-04',to:'2026-01-07',page:1,pageSize:10})},
      {name:'知识点', ...history({conceptIds:[fixture.concepts[0]],page:1,pageSize:10})},
      {name:'时间轴',text:`SELECT g.id,g.event_type,k.name,g.created_at FROM growth_events g JOIN concepts k ON k.id=g.concept_id WHERE g.user_id=$1 ORDER BY g.created_at DESC,g.id DESC LIMIT 80`,params:[user]},
      {name:'班级统计',text:'SELECT member_count,shared_planet_count,last_active_at FROM class_stats WHERE class_id=$1',params:[classId]},
    ];
    const rows = [];
    for (const c of cases) {
      for (let i=0;i<3;i++) await pool.query(c.text,c.params);
      const samples:number[]=[];
      let rowCount = 0;
      for (let i=0;i<30;i++) {
        const start = performance.now();
        const r = await pool.query(c.text,c.params);
        samples.push(performance.now()-start);
        rowCount = r.rowCount ?? 0;
      }
      if (!rowCount) throw Error(`${c.name} 未命中 fixture，拒绝输出空查询的成绩`);
      const plan = (await pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+c.text,c.params)).rows[0]['QUERY PLAN'][0];
      const nodes:string[]=[];
      const visit=(node:any) => { nodes.push(node['Node Type']+(node['Index Name'] ? ': '+node['Index Name'] : '')); for(const child of node.Plans ?? []) visit(child); };
      visit(plan.Plan);
      rows.push({name:c.name,rowCount,p50:percentile(samples,.5),p95:percentile(samples,.95),samples,sql:c.text,params:c.params,planSummary:[...new Set(nodes)],plan});
    }
    const counts=(await pool.query(`SELECT (SELECT count(*)::int FROM messages WHERE user_id=ANY($1::uuid[])) messages,(SELECT count(*)::int FROM growth_events WHERE user_id=$2) events`,[fixture.user,user])).rows[0];
    if(counts.messages!==40000) throw Error('fixture 消息数不是 40000');
    const report={at:new Date().toISOString(),dataset:SEARCH_BENCH_VERSION,database:'knowverse_bench',postgres:(await pool.query('SELECT version() AS v')).rows[0].v,node:process.version,cpu:os.cpus()[0]?.model.trim(),counts,warmup:3,repeats:30,connection:'owner（不包含 RLS 开销）',rows};
    await fs.mkdir('docs/sql',{recursive:true});
    await fs.writeFile('docs/sql/bench-results.json',JSON.stringify(report,null,2)+'\n');
    const md=`# 五类查询基准\n\n> ${report.at}；命令：\`npm run bench\`。独立本机 knowverse_bench，${SEARCH_BENCH_VERSION} 合成数据。每类预热 3 次、采样 30 次；P50/P95 是应用往返耗时，非性能承诺。所有者连接，不包含 RLS 开销；时间轴与班级统计复用业务表，采用精简投影，完整业务查询仍需单独测量。\n\n- PostgreSQL：${report.postgres}\n- Node：${report.node}；CPU：${report.cpu}\n- 消息 ${counts.messages} 条（两人各半）；时间轴事件 ${counts.events} 条；班级仅 2 人，不能代表大班负载。\n\n| 查询 | 返回行 | P50 (ms) | P95 (ms) | 执行计划摘要 |\n|---|---:|---:|---:|---|\n${rows.map(r=>`| ${r.name} | ${r.rowCount} | ${r.p50.toFixed(3)} | ${r.p95.toFixed(3)} | ${r.planSummary.join(' / ')} |`).join('\n')}\n\n原始采样、SQL、参数和 EXPLAIN ANALYZE BUFFERS JSON 见 [bench-results.json](bench-results.json)。重复运行只替换本 fixture 的模拟用户及关联数据，保留其它数据。更多检索对照见 \`npm run bench:search\`（50 条词表/别名查询）。\n`;
    await fs.writeFile('docs/sql/bench-results.md',md);
    console.log(md);
  } finally {
    if(locked) await guard.query('SELECT pg_advisory_unlock(73413003)');
    guard.release();
    await pool.end();
  }
}
main().catch(e=>{console.error('基准失败：'+(e.cause?.message ?? e.message));process.exitCode=1;});
