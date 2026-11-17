/** 只读导出 public 逻辑表的目录信息，不读取用户数据。 */
import './env';
import fs from 'node:fs/promises';
import {Client} from 'pg';
async function main(){
 const c=new Client({connectionString:process.env.DATABASE_URL});
 try{
  await c.connect();await c.query('BEGIN READ ONLY');
  const tables=(await c.query(`SELECT c.oid::int oid,c.relname name,c.relkind kind,c.relrowsecurity rls,obj_description(c.oid) comment FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY c.relname`)).rows;
  for(const t of tables){
   t.columns=(await c.query(`SELECT a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull AS not_null,a.attnum ordinal,pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,[t.oid])).rows;
   t.constraints=(await c.query(`SELECT con.conname name,con.contype type,con.condeferrable deferrable,con.condeferred initially_deferred,con.confrelid::regclass::text target,pg_get_constraintdef(con.oid) definition,ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.num ORDER BY k.ord) columns,ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.num ORDER BY k.ord) target_columns FROM pg_constraint con WHERE con.conrelid=$1 ORDER BY con.contype,con.conname`,[t.oid])).rows;
   t.indexes=(await c.query(`SELECT ic.relname name,i.indisprimary is_primary,i.indisunique is_unique,i.indisvalid valid,i.indexprs IS NOT NULL expression,pg_get_expr(i.indpred,i.indrelid) predicate,pg_get_indexdef(i.indexrelid) definition,ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE k.ord<=i.indnkeyatts ORDER BY k.ord) columns FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=$1 ORDER BY ic.relname`,[t.oid])).rows;
   t.triggers=(await c.query(`SELECT tgname name,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid=$1 AND NOT tgisinternal ORDER BY tgname`,[t.oid])).rows;
   t.policies=(await c.query(`SELECT policyname name,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=$1 ORDER BY policyname`,[t.name])).rows;
   delete t.oid;
  }
  await c.query('ROLLBACK');
  const report={captured_at:new Date().toISOString(),postgres:(await c.query('SELECT version() version')).rows[0].version,scope:'public逻辑表，排除分区子表与视图；只读系统目录，不含业务行',tables};
  await fs.mkdir('docs/er/advanced',{recursive:true});await fs.writeFile('docs/er/advanced/schema-metadata.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({tables:tables.length,foreign_keys:tables.reduce((n,t)=>n+t.constraints.filter((x:any)=>x.type==='f').length,0),rls_tables:tables.filter(t=>t.rls).length,triggers:tables.reduce((n,t)=>n+t.triggers.length,0)}));
 }finally{await c.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
