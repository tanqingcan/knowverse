/**
 * 端到端冒烟：按 docs/demo-scripts.md 的三分钟流程在真实浏览器中操作，并截图。
 * 依赖 Playwright（未列入项目依赖）：npm i -D playwright && npx playwright install chromium
 * 运行前：npm run demo:reset && npm run start；然后 node tests/e2e/demo-flow.mjs [输出目录]
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const out = process.argv[2] ?? "test-results/e2e";
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const W = +(process.env.W ?? 1440), H = +(process.env.H ?? 900);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
const steps = [];
const check = (name, ok, extra = "") => { steps.push({ name, ok, extra }); console.log(ok ? "✓" : "✗", name, extra); };

const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
const errors = []; p.on("pageerror", (e) => errors.push(e.message));
const shot = async (n) => { await p.waitForTimeout(600); await p.screenshot({ path: `${out}/${n}.png`, timeout: 60000 }); };

await p.goto(BASE + "/"); await p.waitForTimeout(4800); await shot("01-intro");
check("开场出现提问", await p.getByText("你想在上面种下什么").isVisible());
await p.getByRole("button", { name: /以演示账号进入/ }).click(); await p.waitForURL("**/space**"); await p.waitForTimeout(4500); await shot("01b-garden");
check("花园模式：场景与入口可见", await p.getByRole("toolbar", { name: "花园场景入口" }).isVisible() && await p.locator(".today").isVisible());
const openPlant = async (re) => { await p.getByRole("toolbar", { name: "花园场景入口" }).getByRole("button", { name: /花圃/ }).click(); await p.getByRole("menuitem", { name: re }).first().click(); };
await openPlant(/左外连接/); await p.waitForTimeout(2500); await shot("02-dossier");
check("档案显示种子阶段", await p.locator(".stage-track .cur").innerText() === "种子");
await p.getByRole("button", { name: "问星灯" }).click(); await p.waitForTimeout(800);
await p.fill("#chat-input", "LEFT JOIN 之后把右表条件写在 WHERE 里，为什么结果像内连接？");
await p.getByRole("button", { name: "发送" }).click(); await p.waitForTimeout(4000); await shot("03-answer");
const cites = await p.locator(".cite").allInnerTexts();
check("回答带资料引用（版本 + 位置）", cites.length > 0 && cites.every((c) => /v\d+ · 第 \d+ (页|段)/.test(c)), cites.join(" | "));
await p.locator(".cite").first().click(); await p.waitForTimeout(2000); await shot("04-cited-chunk");
check("引用定位到资料片段", await p.getByText("被引用的片段").isVisible());
await p.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "学习" }).click(); await p.waitForTimeout(1500);
check("专注学习模式：宽阅读区 + 侧边小场景", await p.locator(".app.is-focus .focus").isVisible());
await p.getByRole("button", { name: "做练习" }).first().click(); await p.waitForTimeout(2000);
await p.locator(".card", { hasText: "每位学生的本学期选课数" }).getByRole("button", { name: /引导练习开始/ }).click(); await p.waitForTimeout(1500);
await p.getByRole("button", { name: /看提示/ }).click();
await p.fill('textarea[aria-label="SQL 答案"]', "SELECT s.name, COUNT(e.cid) AS n FROM students s LEFT JOIN enrollments e ON e.sid = s.sid WHERE e.term = '2026秋' GROUP BY s.sid, s.name");
await p.getByRole("button", { name: "提交" }).click(); await p.waitForTimeout(3500); await shot("05-guided-wrong");
check("规则诊断指出 WHERE 问题", await p.getByText("学期条件写在了 WHERE").isVisible());
await p.getByRole("button", { name: "再练一道" }).click(); await p.waitForTimeout(2000);
await p.locator(".card", { hasText: "每门课程的高分人数" }).getByRole("button", { name: /独立作答开始/ }).click(); await p.waitForTimeout(1500);
await p.fill('textarea[aria-label="SQL 答案"]', "SELECT c.title, COUNT(e.sid) AS n FROM courses c LEFT JOIN enrollments e ON e.cid = c.cid AND e.term = '2026秋' AND e.score >= 80 GROUP BY c.cid, c.title");
await p.getByRole("button", { name: "提交" }).click(); await p.waitForTimeout(1500); await shot("06-bloom-animation");
const card = await p.locator(".growth-card", { hasText: "→ 开花" }).waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
const cardBtn = card && await p.getByRole("button", { name: "查看这次成长" }).isVisible();
await shot("07-bloom");
check("独立变式通过 → 开花", await p.getByText("花苞 → 开花").first().isVisible());
check("成长反馈卡片（查看这次成长）", cardBtn);
await p.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "回顾" }).click(); await p.waitForTimeout(1200);
await p.fill('input[placeholder^="例如：LEFT JOIN"]', "LEFT JOIN"); await p.getByRole("button", { name: /^检索$/ }).click(); await p.waitForTimeout(1500);
const all = await p.locator(".hit").count(); await shot("08-history-keyword");
await p.locator('input[type="date"]').nth(0).fill(today); await p.locator('input[type="date"]').nth(1).fill(today);
await p.getByRole("button", { name: /选择知识点/ }).click(); await p.locator(".concept-picker").getByRole("button", { name: "左外连接", exact: true }).click();
await p.getByRole("button", { name: /^检索$/ }).click(); await p.waitForTimeout(1500); await shot("09-history-combined");
const narrowed = await p.locator(".hit").count();
check("组合检索缩小结果", all >= 2 && narrowed === 1, `关键词 ${all} 组 → 组合 ${narrowed} 组`);
await p.locator(".hit").first().click(); await p.waitForTimeout(2500); await shot("10-located");
check("定位原消息（高亮）", await p.locator(".msg.focused").count() === 1);
await p.fill("#chat-input", "那 RIGHT JOIN 也会这样吗？"); await p.getByRole("button", { name: "发送" }).click(); await p.waitForTimeout(3500); await shot("11-continue");
check("从原位置继续提问", (await p.locator(".msg.user .bubble").allInnerTexts()).some((t) => t.includes("RIGHT JOIN")));
await p.reload(); await p.waitForTimeout(3500);
check("刷新后恢复会话", (await p.locator(".msg.user .bubble").allInnerTexts()).some((t) => t.includes("RIGHT JOIN")));
await p.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "花园" }).click(); await p.waitForTimeout(1500);
await openPlant(/条件概率/); await p.waitForTimeout(2500); await shot("12-probability");
check("概率统计植物开花（预置）", await p.locator(".stage-track .cur").innerText() === "开花");
check("页面无运行时错误", errors.length === 0, errors.join("; "));
fs.writeFileSync(`${out}/result.json`, JSON.stringify({ at: new Date().toISOString(), viewport: [W, H], steps }, null, 2));
await b.close();
process.exit(steps.every((s) => s.ok) ? 0 : 1);
