import {describe,it,expect} from 'vitest';
import JSZip from 'jszip';
import fs from 'node:fs';
import {detectType,extractContent,splitLong,MAX_UPLOAD_BYTES} from '../../src/server/extract';
const fixture=(name:string)=>fs.readFileSync(new URL('../../seed/materials/'+name,import.meta.url));
describe('C2 资料流水线',()=>{
 it('演示上传样例可提取备注与标题层级',async()=>{
  const ppt=await extractContent('pptx',fixture('C2-含备注的连接查询课件.pptx'));
  expect(ppt.chunks.find(c=>c.content.includes('星灯备注实验'))).toMatchObject({pageNo:1,heading:expect.stringContaining('备注')});
  const md=await extractContent('md',fixture('C2-标题与长段落示例.md'));
  expect(md.chunks[0].heading).toBe('C2资料流水线演示 > 左连接 > ON与WHERE');
  expect(md.chunks.every(c=>c.content.length<=700)).toBe(true);
 });
 it('无标点长文本也严格限长，并保留重叠和全部正文',()=>{
  const text=Array.from({length:1800},(_,i)=>String.fromCharCode(0x4e00+i)).join('');
  const chunks=splitLong(text);
  expect(chunks.every(c=>c.length<=700)).toBe(true);
  expect(chunks[0].slice(-80)).toBe(chunks[1].slice(0,80));
  expect(chunks[0]+chunks.slice(1).map(c=>c.slice(80)).join('')).toBe(text);
 });
 it('Markdown 无空行的多级标题也建立层级，代码块里的#不是标题',async()=>{
  const r=await extractContent('md',Buffer.from('# 连接\n## 左连接\n保留左表\n\n```sql\n# 注释\nSELECT 1;\n```\n## 内连接\n只保留匹配'));
  expect(r.chunks[0]).toMatchObject({heading:'连接 > 左连接',paragraphNo:3});
  expect(r.chunks[1].content).toContain('# 注释');
  expect(r.chunks.at(-1)?.heading).toBe('连接 > 内连接');
 });
 it('TXT 段号可定位，长段不跨段重叠',async()=>{
  const r=await extractContent('txt',Buffer.from('首段\n\n'+'正文'.repeat(800)+'\n\n末段'));
  expect(r.chunks[0].paragraphNo).toBe(1);
  expect(r.chunks.filter(c=>c.paragraphNo===2).length).toBeGreaterThan(1);
  expect(r.chunks.at(-1)).toMatchObject({paragraphNo:3,content:'末段'});
 });
 it('PPT 备注按关系绑定页码，排除页码占位符，支持仅备注页',async()=>{
  const z=new JSZip();z.file('[Content_Types].xml','presentationml');
  z.file('ppt/slides/slide1.xml','<p:sld/>');
  z.file('ppt/slides/_rels/slide1.xml.rels','<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide9.xml"/></Relationships>');
  z.file('ppt/notesSlides/notesSlide9.xml','<p:sp><p:ph type="body"/><a:p><a:r><a:t>备注中独有的 LEFT JOIN 解释</a:t></a:r></a:p></p:sp><p:sp><p:ph type="sldNum"/><a:p><a:t>99</a:t></a:p></p:sp>');
  const r=await extractContent('pptx',await z.generateAsync({type:'nodebuffer'}));
  expect(r.status).toBe('ready');expect(r.chunks).toHaveLength(1);
  expect(r.chunks[0]).toMatchObject({pageNo:1,heading:'幻灯片 · 备注',content:'备注中独有的 LEFT JOIN 解释'});
 });
 it.each(['docx','xlsx'])('%s 保存元数据但不声称提取正文',async ext=>{
  const z=new JSZip();z.file(ext==='docx'?'word/document.xml':'xl/workbook.xml','<document/>');
  const buf=await z.generateAsync({type:'nodebuffer'});
  expect(detectType('a.'+ext,buf).problem).toBeUndefined();
  expect((await extractContent('other',buf,'a.'+ext)).status).toBe('unsupported');
  expect((await extractContent('other',buf,ext==='docx'?'a.xlsx':'a.docx')).status).toBe('failed');
 });
 it('文本PDF保存页码，扫描件与损坏文件状态可区分',async()=>{
  const text=await extractContent('pdf',fixture('条件概率讲义.pdf'));
  expect(text.status).toBe('ready');expect(text.chunks.find(c=>c.content.includes('贝叶斯公式'))?.pageNo).toBe(3);
  expect((await extractContent('pdf',fixture('扫描版习题-示例.pdf'))).status).toBe('needs_ocr');
  expect((await extractContent('pdf',Buffer.from('%PDF-broken'))).status).toBe('failed');
 });
 it('阻止伪造扩展名与超限文件',async()=>{
  expect(detectType('a.txt',Buffer.from('%PDF-test')).problem).toBeTruthy();
  expect(detectType('a.md',Buffer.from([65,0,66])).problem).toBeTruthy();
  expect(detectType('a.docx',Buffer.from('fake')).problem).toBeTruthy();
  expect((await extractContent('txt',Buffer.alloc(MAX_UPLOAD_BYTES+1))).status).toBe('failed');
 });
});
