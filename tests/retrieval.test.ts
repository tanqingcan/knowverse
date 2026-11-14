import {describe,it,expect,beforeAll} from 'vitest';
import {makeUser,subject} from './helpers';
import {uploadMaterial,searchMaterials} from '@/server/materials';
import type {CurrentUser} from '@/server/auth';
let owner:CurrentUser,other:CurrentUser,sid:string;
beforeAll(async()=>{owner=await makeUser('ragowner');other=await makeUser('ragother');sid=await subject('dbms');});
describe('C4检索集成',()=>{
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
});
