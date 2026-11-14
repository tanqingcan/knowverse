import {describe,it,expect} from 'vitest';
import {rankMaterials} from '../../src/server/retrieval/rank';
import {validateCitations} from '../../src/server/retrieval/citations';
import {renderContext,type AgentAnswer,type RefMaterial} from '../../src/server/agent/prompts';
import type {MaterialHit} from '../../src/server/materials';
const hit=(id:string,content:string,heading=''):MaterialHit=>({chunkId:id,versionId:'v',versionNo:2,materialId:'m',materialTitle:'课程资料',fileType:'md',pageNo:null,paragraphNo:1,heading,content,score:1});
const ref:RefMaterial={ref:'资料1',chunkId:'a',versionId:'v',ord:1,materialTitle:'连接',versionNo:2,location:'第1页',content:'LEFT JOIN保留左表全部元组，没有匹配时右表补NULL。'};
const answer=(extra:Partial<AgentAnswer>={}):AgentAnswer=>({answer:'左表会保留。[资料1]',basis:'materials',citations:[{ref:'资料1',quote:'保留左表全部元组'}],concepts:[],followups:[],...extra});
describe('C4 检索与引用',()=>{
 it('相同词法覆盖下优先标题命中，确定性排序',()=>{
  const rows=[hit('a','LEFT JOIN 的规则'),hit('b','LEFT JOIN 的规则细节','LEFT JOIN')];
  expect(rankMaterials(rows,['LEFT JOIN'],[0],['LEFT JOIN'],4)[0].chunkId).toBe('b');
 });
 it('同义词属于同一组，不靠重复别名刷分',()=>{
  const rows=[hit('a','LEFT JOIN 左外连接'),hit('b','LEFT JOIN WHERE')];
  expect(rankMaterials(rows,['LEFT JOIN','左外连接','WHERE'],[0,0,1],['LEFT JOIN'],4)[0].chunkId).toBe('b');
 });
 it('过滤弱匹配并去重，不跨版本去重',()=>{
  expect(rankMaterials([hit('a','常见词')],['常见词'],[0],[],4)).toHaveLength(0);
  const a=hit('a','LEFT JOIN');
  expect(rankMaterials([a,{...a,chunkId:'b'},{...a,versionId:'other',chunkId:'c'}],['LEFT JOIN'],[0],['LEFT JOIN'],4)).toHaveLength(2);
 });
 it('假编号、孤立引用和非原文摘录被拒绝，不能静默洗成通用知识',()=>{
  for(const citations of [[{ref:'资料9'}],[{ref:'资料1',quote:'这是原文中不存在的句子'}]]){
   const r=validateCitations(answer({citations}),[ref]);
   expect(r.answer.basis).toBe('insufficient');expect(r.answer.answer).toContain('引用校验未通过');expect(r.answer.citations).toHaveLength(0);
  }
  expect(validateCitations(answer({answer:'没有引用标记'}),[ref]).answer.citations).toHaveLength(0);
 });
 it('原文摘录核验通过；缺摘录的旧格式单独记为未验证',()=>{
  expect(validateCitations(answer(),[ref]).metrics.verifiedQuotes).toBe(1);
  expect(validateCitations(answer({citations:[{ref:'资料1',quote:'保留左表全部元组'}]}),[{...ref,content:'保留左表全部\n元组'}]).metrics.verifiedQuotes).toBe(1);
  expect(validateCitations(answer({citations:[{ref:'资料1'}]}),[ref]).metrics.unverifiedQuotes).toBe(1);
 });
 it('重复引用只保留一次',()=>{
  expect(validateCitations(answer({citations:[{ref:'资料1'},{ref:'[资料1]'}]}),[ref]).answer.citations).toHaveLength(1);
 });
 it('同页相邻片段合组呈现，但保留独立引用，不跨版本合组',()=>{
  const next={...ref,ref:'资料2',chunkId:'b',ord:2,content:'WHERE在连接后过滤。'};
  const ctx=(materials:RefMaterial[])=>renderContext({learning:{},materials,history:[],intent:'ask'});
  expect(ctx([ref,next])).toContain('同页相邻片段');
  expect(ctx([ref,next])).toContain('[资料2]');
  expect(ctx([ref,{...next,versionId:'v3'}])).not.toContain('同页相邻片段');
 });
});
