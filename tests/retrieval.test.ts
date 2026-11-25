import {describe,it,expect,beforeAll} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Client} from 'pg';
import {makeUser,q,q1,subject,concept} from './helpers';
import {uploadMaterial,searchMaterials,materialDetail,findConceptPassages,reviewChunkConcept} from '@/server/materials';
import {indexEmbeddings,backfillChunkConcepts} from '@/server/retrieval/material-index';
import type {CurrentUser} from '@/server/auth';
let owner:CurrentUser,other:CurrentUser,sid:string;
beforeAll(async()=>{owner=await makeUser('ragowner');other=await makeUser('ragother');sid=await subject('dbms');});
describe('C4检索集成',()=>{
 it.each([
   ['C2-含备注的连接查询课件.pptx', '星灯备注实验', 1],
   ['条件概率讲义.pdf', '贝叶斯公式', 3],
 ] as const)('上传 %s 后可通过术语查回原版本和页码', async (fileName, term, pageNo) => {
   const course = await q1("INSERT INTO subjects(owner_user_id,code,name) VALUES($1,$2,$3) RETURNING id",[owner.id,fileName,'课件检索测试']);
   const upload = await uploadMaterial({
     userId: owner.id, subjectId: course.id, title: '本周教材', course: '测试', kind: 'notes',
     fileName, mimeType: null, buf: await readFile(new URL('../seed/materials/' + fileName, import.meta.url)),
   });
   expect(upload.status).toBe('ready');
   const result = await searchMaterials(owner.id, `课件中“${term}”在哪一页？`, {subjectIds:[course.id]});
   const hit = result.hits.find(h => h.content.includes(term) && h.pageNo === pageNo);
   expect(hit).toMatchObject({materialId:upload.materialId,versionId:upload.versionId,versionNo:1});
   if (fileName.endsWith('.pptx')) expect(hit?.heading).toContain('备注');
 });
 it('教材标题命中不会把无关页当作证据，未入目录的术语可用引号检索', async () => {
   const term = '时隙归并窗口';
   const paragraphs = Array.from({length: 45}, (_, i) => `课堂练习第${i + 1}题，请复习本周例题。`);
   const passage = `${term}只合并相邻时隙中的记录。`;
   const upload = await uploadMaterial({
     userId: owner.id, subjectId: sid, title: term, course: '测试', kind: 'notes',
     fileName: 'supplement.txt', mimeType: 'text/plain',
     buf: Buffer.from([...paragraphs, passage].join('\n\n')),
   });
   const result = await searchMaterials(owner.id, `请解释“${term}”`);
   const own = result.hits.filter(hit => hit.materialId === upload.materialId);
   expect(own.map(hit => hit.content)).toEqual([passage]);
   expect(own[0].paragraphNo).toBe(46);
   const natural = await searchMaterials(owner.id, `什么是${term}？`);
   expect(natural.hits.filter(hit => hit.materialId === upload.materialId).map(hit => hit.content)).toEqual([passage]);
   const privateResult = await searchMaterials(other.id, `“${term}”`);
   expect(privateResult.hits.some(hit => hit.materialId === upload.materialId)).toBe(false);
 });
 it('只从本人可见的最新可用版本召回，保留真实片段与位置',async()=>{
  const input={userId:owner.id,subjectId:sid,title:'重排验证资料',course:'测试',kind:'notes',fileName:'rag.md',mimeType:'text/markdown'};
  const v1=await uploadMaterial({...input,buf:Buffer.from('# LEFT JOIN\n\n重排标记：LEFT JOIN旧版本说明。')});
  const v2=await uploadMaterial({...input,materialId:v1.materialId,buf:Buffer.from('# LEFT JOIN\n\n重排标记：LEFT JOIN保留左表全部元组，右表无匹配补NULL。')});
  const r=await searchMaterials(owner.id,'重排标记 LEFT JOIN');
  const own=r.hits.filter(h=>h.materialId===v1.materialId);
  expect(own.length).toBeGreaterThan(0);expect(own.every(h=>h.versionId===v2.versionId)).toBe(true);
  expect(own[0].paragraphNo).toBe(2);expect(own[0].ord).toBe(1);
  expect((await searchMaterials(other.id,'重排标记 LEFT JOIN')).hits.some(h=>h.materialId===v1.materialId)).toBe(false);
 });
 it('保存分片知识点，允许逐个确认和驳回；回填保留原片段 ID 和人工决策', async () => {
   const input = {subjectId:sid, kind:'notes', course:'测试', fileName:'chunk-links.md', mimeType:null};
   const upload = await uploadMaterial({...input,userId:owner.id,title:'片段知识点自编课件',
     buf:Buffer.from('# 联查\n\n左外连接能保留左表的行。\n\n也可以使用左外连接展示尚未登记的行。\n\n卷星系工作簿独有记录。')});
   const detail = await materialDetail(owner.id, upload.materialId);
   const [first, second, manual] = detail.chunks;
   const id = await concept('左外连接');
   expect(first.conceptLinks).toEqual(expect.arrayContaining([expect.objectContaining({id,status:'candidate',source:'catalog'})]));
   await expect(reviewChunkConcept(other.id, first.id, id, 'confirmed')).rejects.toMatchObject({code:'not_found'});
   await reviewChunkConcept(owner.id, first.id, id, 'rejected');
   await reviewChunkConcept(owner.id, second.id, id, 'confirmed');
   await reviewChunkConcept(owner.id, manual.id, id, 'confirmed');
   await q("UPDATE material_chunks SET concepts_indexed_at=NULL WHERE id=$1",[first.id]);
   await backfillChunkConcepts();
   const found = (await findConceptPassages(owner.id,[id])).filter(hit=>hit.materialId===upload.materialId);
   expect(found.map(hit=>[hit.chunkId,hit.status,hit.source])).toEqual([[second.id,'confirmed','catalog'],[manual.id,'confirmed','user']]);
   expect((await findConceptPassages(other.id,[id])).some(hit=>hit.materialId===upload.materialId)).toBe(false);
   const updated = await materialDetail(owner.id, upload.materialId);
   expect(updated.chunks[0].conceptLinks.find((link: {id:string})=>link.id===id)).toMatchObject({status:'rejected'});
   const revised = await uploadMaterial({...input,userId:owner.id,title:input.fileName,materialId:upload.materialId,
     buf:Buffer.from('# 联查\n\n左外连接要区别过滤和配对。')});
   expect((await findConceptPassages(owner.id,[id])).filter(hit=>hit.materialId===upload.materialId).map(hit=>hit.versionId)).toEqual([revised.versionId]);
   expect((await materialDetail(owner.id,upload.materialId,1)).chunks.map(ch=>ch.id)).toEqual([first.id,second.id,manual.id]);
 });

 it('超过 192 个片段仍从持久向量找回本人最新资料，混合召回覆盖跨讲问题', async () => {
   const course = await q1("INSERT INTO subjects(code,name) VALUES('semantic-test','语义检索权限测试') RETURNING id");
   const input = {subjectId:course.id, kind:'notes', course:'测试', fileName:'semantic.txt', mimeType:null};
   const v1 = await uploadMaterial({...input,userId:owner.id,title:'复习讲义',buf:Buffer.from('版本过期内容。')});
   const body = [...Array.from({length: 220}, (_, i) => `与题意无关的整理记录第${i}条。`), '青栎桥接步骤保存原页定位。'];
   const v2 = await uploadMaterial({...input,userId:owner.id,title:'复习讲义',materialId:v1.materialId,buf:Buffer.from(body.join('\n\n'))});
   const competing = await uploadMaterial({...input,userId:other.id,title:'复习讲义',buf:Buffer.from('青栎桥接步骤他人的独有说明。')});
   const lectureTwo = await uploadMaterial({...input,userId:owner.id,title:'第二讲',buf:Buffer.from('琥珀页锁只有会话结束才释放。')});
   const requests: {kind:string;texts:string[]}[] = [];
   const modelKey = 'fixture-rag-model';
   const asVector = (axis: number) => Array.from({length:512},(_, i)=>i===axis?1:0);
   const server = createServer(async (req, res) => {
     if (req.url==='/model') {res.end(JSON.stringify({modelKey}));return;}
     let payload = '';
     for await (const chunk of req) payload += chunk;
     const request = JSON.parse(payload) as {kind:string;texts:string[]};
     requests.push(request);
     const vectors = request.texts.map(text=>asVector(request.kind==='query'
       ? text.includes('琥珀页锁') ? 2 : text.includes('不同的长问题') ? 1 : 3
       : text.includes('琥珀页锁') ? 2 : /青栎桥接|版本过期/.test(text) ? 1 : 0));
     res.end(JSON.stringify({modelKey,vectors}));
   });
   await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
   const saved = process.env.RAG_LOCAL_PORT;
   process.env.RAG_LOCAL_PORT = String((server.address() as AddressInfo).port);
   try {
     for (const versionId of [v1.versionId,v2.versionId,competing.versionId,lectureTwo.versionId]) await indexEmbeddings({versionId});
     expect(await indexEmbeddings({versionId:v2.versionId})).toMatchObject({indexed:0});
     const ids = (await materialDetail(owner.id, v2.materialId, 2)).chunks.map(row=>row.id);
     const client = new Client({connectionString:process.env.TEST_APP_DATABASE_URL});
     await client.connect();
     try {
       await client.query("SELECT set_config('app.user_id',$1,false)",[other.id]);
       const count = await client.query("SELECT count(*)::int AS n FROM material_chunk_embeddings WHERE chunk_id=ANY($1::uuid[])",[ids]);
       expect(count.rows[0].n).toBe(0);
       await client.query("SELECT set_config('app.user_id',$1,false)",[owner.id]);
       const own = await client.query("SELECT count(*)::int AS n FROM material_chunk_embeddings WHERE chunk_id=ANY($1::uuid[])",[ids]);
       expect(own.rows[0].n).toBe(221);
     } finally {await client.end();}
     requests.length=0;
     const query = () => searchMaterials(owner.id, '另外再问一个完全不同的长问题；“琥珀页锁”什么时候释放', {subjectIds:[course.id]});
     const output = await query();
     expect(requests).toEqual([{kind:'query',texts:['另外再问一个完全不同的长问题','“琥珀页锁”什么时候释放']}]);
     expect(output.semantic).toBe('used');
     expect(output.hits.slice(0,2).map(hit=>hit.versionId)).toEqual([v2.versionId,lectureTwo.versionId]);
     expect(output.hits[0]?.paragraphNo).toBe(221);
     expect((await searchMaterials(owner.id, '斜纹隧道的原式', {subjectIds:[course.id]})).hits).toEqual([]);
     await new Promise<void>(resolve=>server.close(()=>resolve()));
     expect((await query()).hits.some(hit=>hit.versionId===lectureTwo.versionId)).toBe(true);
   } finally {
     if (server.listening) await new Promise<void>(resolve=>server.close(()=>resolve()));
     if (saved === undefined) delete process.env.RAG_LOCAL_PORT;
     else process.env.RAG_LOCAL_PORT = saved;
   }
 });
});
