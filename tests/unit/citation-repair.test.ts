import {describe,it,expect,vi} from 'vitest';
import {checkAndRepairCitations} from '../../src/server/retrieval/repair';
import type {AgentAnswer,RefMaterial} from '../../src/server/agent/prompts';
const refs:RefMaterial[]=[{ref:'资料1',chunkId:'a',materialTitle:'连接',versionNo:1,location:'第1段',content:'内连接只保留满足连接条件的元组组合。没有匹配的行不会出现。'}];
const draft:AgentAnswer={answer:'内连接只保留匹配行。',basis:'materials',citations:[{ref:'资料1',quote:'内连接只保留满足连接条件的元组组合。'}],concepts:[],followups:[]};
describe('有界引用修复',()=>{
 it('漏正文标记由模型修复后重新核验',async()=>{
  const repair=vi.fn().mockResolvedValue({...draft,answer:'内连接只保留匹配行。[资料1]'});
  const r=await checkAndRepairCitations(draft,refs,repair);
  expect(r.repair.succeeded).toBe(true);expect(r.metrics.verifiedQuotes).toBe(1);expect(repair).toHaveBeenCalledTimes(1);
 });
 it('编造摘录不能因修复而被接受，不自动匹配另一个片段',async()=>{
  const bad={...draft,answer:'内连接保留全部行。[资料1]',citations:[{ref:'资料1',quote:'内连接保留全部行'}]};
  const repair=vi.fn().mockResolvedValue(bad);
  const r=await checkAndRepairCitations(bad,refs,repair);
  expect(r.repair.succeeded).toBe(false);expect(r.answer.basis).toBe('insufficient');expect(r.answer.answer).toContain('引用校验未通过');expect(repair).toHaveBeenCalledTimes(1);
 });
 it('没有资料时不进行修复调用',async()=>{
  const repair=vi.fn();const r=await checkAndRepairCitations(draft,[],repair);
  expect(repair).not.toHaveBeenCalled();expect(r.answer.answer).toContain('资料不足');
 });
 it('有效引用不额外调用；异常保留已验证引用',async()=>{
  const valid={...draft,answer:'内连接只保留匹配行。[资料1]'};
  const no=vi.fn();expect((await checkAndRepairCitations(valid,refs,no)).metrics.accepted).toBe(1);expect(no).not.toHaveBeenCalled();
  const mixed={...valid,citations:[...valid.citations,{ref:'资料9'}]};
  const r=await checkAndRepairCitations(mixed,refs,async()=>{throw Error('timeout')});expect(r.metrics.accepted).toBe(1);expect(r.repair.succeeded).toBe(false);
 });
 it('不能改basis为general或去掉quote绕过原文检查',async()=>{
  const r=await checkAndRepairCitations(draft,refs,async()=>({...draft,basis:'general',answer:'结论[资料1]',citations:[{ref:'资料1'}]}));
  expect(r.repair.succeeded).toBe(false);
 });
});
