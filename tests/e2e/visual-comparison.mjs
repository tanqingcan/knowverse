/** B1：启动历史/当前服务器后截图。只访问固定开发 fixture，不依赖业务库。
 * BEFORE_URL=http://localhost:3001 BASE_URL=http://localhost:3000 node tests/e2e/visual-comparison.mjs
 * 可选 PLAYWRIGHT_MODULE（已安装模块路径）、BROWSER_CHANNEL（如 msedge）。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const out = 'docs/screenshots/ui';
const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const cases = [
  ...['rose','sunflower','iris','lily'].map(species=>({name:species,path:'/dev/flowers?sp='+species,width:1440,height:900})),
  {name:'garden',path:'/dev/garden?reduced',width:1440,height:900},
  {name:'selected',path:'/dev/garden?reduced&sel=1&pose=tend',width:1440,height:900},
  {name:'mobile-garden',path:'/dev/garden?reduced',width:390,height:844},
  {name:'mobile-selected',path:'/dev/garden?reduced&sel=1&pose=tend',width:390,height:844},
];
const evidence=[];
try {
  for (const [version,base] of [['before',process.env.BEFORE_URL ?? 'http://localhost:3001'],['after',process.env.BASE_URL ?? 'http://localhost:3000']]) {
    for (const [i,c] of cases.entries()) {
      const context=await browser.newContext({viewport:{width:c.width,height:c.height},reducedMotion:'reduce'});
      const page=await context.newPage();
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const response=await page.goto(base+c.path,{waitUntil:'networkidle',timeout:120000});
      if(!response?.ok()) throw Error(`${version} ${c.name}: HTTP ${response?.status()}`);
      await page.locator('canvas').waitFor({timeout:60000});
      await page.waitForFunction(()=>{const el=document.querySelector('canvas');return el && el.width>0 && el.height>0;});
      await page.waitForTimeout(3500);
      const file=`b1-${String(i+1).padStart(2,'0')}-${version}.png`;
      await page.screenshot({path:out+'/'+file,timeout:60000});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      evidence.push({version,...c,file,errors,overflow});
      console.log(version,c.name,errors.length ? errors : 'OK');
      await context.close();
    }
  }
  await fs.writeFile('docs/test-evidence/b1-comparison.json',JSON.stringify({at:new Date().toISOString(),beforeCommit:'5480ae4',afterBaseCommit:'ae53fe6',renderer:'Edge / SwiftShader（软件渲染，不代表真机帧率）',note:'旧版为 Git 归档模型；花朵单种预览在两边使用相同的扩大取景相机 position=[0,0.65,1.4], lookAt=[0,0.27,0], fov=30，未修改旧版模型。其余为相同开发 fixture URL/视口/低动效参数，花园的默认构图由对应版本决定。',screenshots:evidence},null,2)+'\n');
  if(evidence.some(e=>e.errors.length||e.overflow>0))process.exitCode=1;
} finally { await browser.close(); }
