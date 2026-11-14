import type { AgentAnswer, RefMaterial } from '../agent/prompts';
/** 结构/原文核验，不能替代语义蕴含判断。 */
export function validateCitations(input: AgentAnswer, materials: RefMaterial[]) {
  const normalize=(s:string)=>s.replace(/\s+/g,'');
  const available=new Map(materials.map(m=>[m.ref,m]));
  const bodyRefs=new Set([...input.answer.matchAll(/\[(资料\d+)\]/g)].map(m=>m[1]));
  const seen=new Set<string>(); let rejected=0,verified=0,unverified=0;
  const citations=input.citations.flatMap(c=>{
    const ref=c.ref.replace(/[\[\]]/g,''); const m=available.get(ref);
    if(!m||!bodyRefs.has(ref)||seen.has(ref)){rejected++;return [];}
    if(c.quote && (normalize(c.quote).length<4||!normalize(m.content).includes(normalize(c.quote)))){rejected++;return [];}
    seen.add(ref);if(c.quote)verified++;else unverified++;
    return [{...c,ref}];
  });
  let answer=input.answer.replace(/\[(资料\d+)\]/g,(tag,ref)=>seen.has(ref)?tag:'');
  let basis=input.basis;
  if((basis==='materials'||basis==='mixed')&&!citations.length){basis='insufficient';answer=(materials.length ? '引用校验未通过：已找到参考资料，但本次回答的引用尚未获得验证。' : '资料不足：没有检索到可用于本次回答的参考资料。')+'\n\n'+answer;}
  return {answer:{...input,answer,basis,citations},metrics:{bodyReferences:bodyRefs.size,accepted:citations.length,rejected,verifiedQuotes:verified,unverifiedQuotes:unverified}};
}
