import './env';
import fs from 'node:fs';
import {q} from '@/db';
/** 数据库强制的最小非空唯一列组；不将可空/部分唯一索引冒充全局候选键。 */
async function main(){
 const tables=await q<{relname:string}>(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY c.relname`);
 const rows=[];
 for(const table of tables){
  const idx=await q<{name:string;primary:boolean;partial:boolean;expr:boolean;nonnull:boolean;cols:string[]}>(`
   SELECT i.indexrelid::regclass::text name,i.indisprimary AS primary,i.indpred IS NOT NULL AS partial,i.indexprs IS NOT NULL AS expr,
    (SELECT bool_and(a.attnotnull) FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE k.ord<=i.indnkeyatts) nonnull,
    (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE k.ord<=i.indnkeyatts) cols
   FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=$1 AND i.indisunique AND i.indisvalid ORDER BY i.indisprimary DESC,i.indexrelid`,[table.relname]);
  const eligible=idx.filter(k=>!k.partial&&!k.expr&&k.nonnull);
  const minimal=eligible.filter(k=>!eligible.some(other=>other.cols.length<k.cols.length&&other.cols.every(c=>k.cols.includes(c))));
  const fmt=(keys:typeof idx)=>[...new Set(keys.map(k=>k.cols?.length?'('+k.cols.join(', ')+')':'表达式索引'))].join('；')||'—';
  rows.push({table:table.relname,pk:fmt(idx.filter(k=>k.primary)),keys:fmt(minimal),nullable:fmt(idx.filter(k=>!k.partial&&!k.expr&&!k.nonnull)),conditional:fmt(idx.filter(k=>k.partial||k.expr)),superkeys:fmt(eligible.filter(k=>!minimal.includes(k)))});
 }
 const lines=['# 候选键与唯一性约束清单（自动生成）','','> 数据库强制候选键：完整、有效、所有键列 NOT NULL 的唯一索引，剔除含更小唯一列组的超键。INCLUDE 列不参与键。可空 UNIQUE 和部分/表达式唯一性单列，不作为全局候选键。业务函数依赖仍需人工核对。','',`表数：${rows.length}（排除分区子表与视图）。`,'','|表|主键|强制候选键|可空 UNIQUE|条件/表达式唯一性|非最小超键|','|---|---|---|---|---|---|',...rows.map(r=>`|${r.table}|${r.pk}|${r.keys}|${r.nullable}|${r.conditional}|${r.superkeys}|`),''];
 fs.writeFileSync('docs/schema/candidate-keys.md',lines.join('\n'),'utf8');console.log('候选键清单已生成：'+rows.length+' 张表');
}
main().catch(e=>{console.error(e);process.exit(1);});
