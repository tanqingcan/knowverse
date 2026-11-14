/** 与 kv_search_terms 对齐：中文二元组、英文/数字完整词。 */
export function searchTerms(text:string):string[]{
 const out=new Set<string>();
 for(const run of text.match(/[一-龥]+|[A-Za-z0-9_]+/g)??[]){
  if(/^[一-龥]+$/.test(run)){for(let i=0;i+1<run.length;i++)out.add(run.slice(i,i+2));}
  else if(run.length>=2&&run.length<=80)out.add(run.toLowerCase());
 }
 return [...out];
}
