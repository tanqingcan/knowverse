import {afterEach,describe,it,expect,vi} from 'vitest';
import {chatCompletion, extractJson} from '../../src/server/agent/llm';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function config(){vi.stubEnv('LLM_MODE','live');vi.stubEnv('LLM_API_KEY','secret-test');vi.stubEnv('LLM_BASE_URL','https://api.deepseek.com/v1');}
describe('DeepSeek 客户端',()=>{
 it('保留 JSON 回答内部的 SQL 代码块',()=>{
  const answer={answer:'示例：\n```sql\nSELECT * FROM students;\n```',basis:'general'};
  expect(extractJson(JSON.stringify(answer))).toEqual(answer);
 });
 it('非思考工具调用模式可正常返回工具参数',async()=>{
  config(); const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:null,tool_calls:[{id:'t',type:'function',function:{name:'search_materials',arguments:'{"query":"LEFT JOIN"}'}}]}}]})));
  vi.stubGlobal('fetch',fetcher);
  const r=await chatCompletion([{role:'user',content:'查资料'}],{tools:[{type:'function',function:{name:'search_materials',description:'检索',parameters:{type:'object'}}}]});
  expect(JSON.parse(fetcher.mock.calls[0][1].body).thinking).toEqual({type:'disabled'});
  expect(r.toolCalls[0].function.name).toBe('search_materials');
 });
 it('上游错误不能把密钥写进错误信息',async()=>{
  config();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('invalid secret-test',{status:401})));
  await expect(chatCompletion([])).rejects.toMatchObject({code:'llm_http_401',message:expect.not.stringContaining('secret-test')});
 });
 it('缺少消息的响应明确失败',async()=>{
  config();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}')));
  await expect(chatCompletion([])).rejects.toMatchObject({code:'llm_bad_response'});
 });
});
