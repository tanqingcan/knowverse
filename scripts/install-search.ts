import './env';
import fs from 'node:fs/promises';
import {Pool} from 'pg';
async function main(){const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('仅允许本机数据库');const p=new Pool({connectionString:url.href});try{await p.query(await fs.readFile('docs/sql/drafts/message-terms.sql','utf8'));console.log('C3索引草案已安装并回填');}finally{await p.end();}}
main().catch(()=>{console.error('安装失败，请检查数据库和权限');process.exitCode=1});
