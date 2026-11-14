import {createHash} from 'node:crypto';
import {z} from 'zod';
export const MemoryProposal=z.object({kind:z.enum(['fact','preference','event']),content:z.string().trim().min(4).max(240),confidence:z.number().min(0).max(1).default(.8),importance:z.number().int().min(1).max(5).default(3),conceptId:z.string().uuid().nullish()});
export type MemoryProposal=z.infer<typeof MemoryProposal>;
export const memoryNorm=(s:string)=>s.toLowerCase().replace(/[\s，。！？、：；,.!?;:'"“”‘’（）()]/g,'');
export const memoryKey=(s:string)=>createHash('sha256').update(memoryNorm(s)).digest('hex');
export function memoryEligible(text:string){return /(?:我|请记住|记住我|以后)/.test(text)&&/(不懂|不会|搞不懂|困难|薄弱|喜欢|偏好|习惯|希望|目标|正在学|准备|复习|考试|请记住|以后.*(?:讲|解释))/.test(text);}
export function validProposal(source:string,p:MemoryProposal){
 // 只记当前用户的直接自述，原样摘录；不允许模型改写否定、数字或代入第三人。
 return p.confidence>=.7&&source.includes(p.content)&&/^(我|请记住|记住我|以后)/.test(p.content)&&memoryEligible(p.content)&&!/(sk-[a-zA-Z0-9]+|密码|身份证|API.?KEY)/i.test(p.content);
}
export const ttlDays={fact:30,preference:180,event:7} as const;
export const MEMORY_PROPOSAL_PROMPT='只从当前用户消息提议值得跨会话保存的学习事实、解释偏好或近期学习事件。只记直接自述，不记资料引用、假设、第三人、密钥或密码。content必须是当前消息中连续原样摘录、以我/请记住/以后开头的4–240字，不改写也不推断掌握程度。仅输出扁平JSON {"proposals":[{"kind":"fact","content":"我一直搞不懂LEFT JOIN","confidence":0.9,"importance":4}]}。示例不是事实，无合适内容返回{"proposals":[]}。';
