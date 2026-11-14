import type { MaterialHit } from "../materials";
export function rankMaterials(rows: MaterialHit[], terms: string[], groups: number[], conceptTerms: string[], limit: number): MaterialHit[] {
  const result = rows.map(row => {
    const body=row.content.toLowerCase(), heading=(row.heading??"").toLowerCase(), title=row.materialTitle.toLowerCase();
    const matched=new Set<number>(); let headingHits=0, titleHits=0, first=Infinity;
    terms.forEach((raw,i)=>{const t=raw.toLowerCase(),pos=body.indexOf(t); if(pos>=0){matched.add(groups[i]);first=Math.min(first,pos);} if(heading.includes(t))headingHits++;if(title.includes(t))titleHits++;});
    const concept=conceptTerms.some(t=>body.includes(t.toLowerCase()));
    if(matched.size<2&&!concept&&!headingHits&&!titleHits)return null;
    const score=matched.size*10+(concept?8:0)+Math.min(headingHits,3)*4+Math.min(titleHits,3)*2+(first<Infinity?2/(1+first/100):0);
    return {...row,score};
  }).filter((r):r is MaterialHit=>r!==null).sort((a,b)=>b.score-a.score||a.chunkId.localeCompare(b.chunkId));
  // 同版本相同正文只保留一份；不跨版本拼接引用。
  const seen=new Set<string>();
  return result.filter(r=>{const key=r.versionId+":"+r.content.trim();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,limit);
}
