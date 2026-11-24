# 12 条交付 QA

2026-11-17。演示模式、独立测试库；业务库未 reset。浏览器测试、HTTP 验收与服务层测试分开标明。四页讲解素材见 `visual-pages.md`，正式报告/PPT 不在本轮。

| # | 步骤 | 期望 | 状态与本轮证据 |
|---|---|---|---|
| 1 | 首页点“以演示账号进入” | 登录成功，展示花园/演示标识 | 通过（浏览器）；最终 15/15 检查点通过 |
| 2 | 新建用户，提交开场学科/目标/本命花 | 创建星球、花圃、1 株植物；默认上海时区 | 通过（HTTP）；qa-api 的 QA02 |
| 3 | 问 LEFT JOIN，点击回答引用 | 回答含资料版本与页/段号，定位片段 | 通过（浏览器）；服务层 chat-agent 通过 |
| 4 | 回顾输入关键词 + 当日日期 + 左外连接 | 缩小结果且保留本轮问题 | 通过（浏览器）：6 组→2 组；history 组合/边界/权限用例通过 |
| 5 | 点命中消息，继续问 RIGHT JOIN，再刷新 | 原消息高亮，新问答追加在原会话并保留 | 通过（浏览器）；history 定位/续问用例通过 |
| 6 | 分别上传 TXT/MD/文本 PDF/PPTX | ready，有片段/页码/备注 | 通过（真实 HTTP 四次上传）；qa-api QA06；损坏/扫描件由 materials-collab 与 extract 测试覆盖 |
| 7 | 为知识点请求练习，查看推荐题/理由 | 推荐来自真实记录；能启动指定题 | 通过（HTTP）；qa-api QA07/08；practice-growth 的诊断/理由用例通过 |
| 8 | 提交 SQL、选择题 B、数值 0.18 | 三种题型均 correct；SQL 走只读沙箱 | 通过（HTTP）；qa-api QA07/08；sandbox 23 例、结算幂等/回滚测试通过 |
| 9 | 写笔记，撤销对应学习证据 | 记录撤销时间与原因，按规则重算成长 | 通过（HTTP）；qa-api QA09；practice-growth 撤销测试通过 |
| 10 | 读取成长时间轴，打开当前时刻 as-of | 有撤销事件，可返回历史花园快照 | 通过（HTTP）；qa-api QA10；asof 5 例覆盖历史/跨用户拒绝 |
| 11 | 非成员访问班级，再加入/切换公开星球 | 非成员 403；未公开者隐藏，分享后出现 | 通过（HTTP + kv_app）；qa-api QA11、galaxy-view 3 例；2D SVG，未交付 3D 环绕 |
| 12 | 新建学习卡并发布到班级，另一成员读取 | 指定版本可见 | 通过（HTTP + kv_app）；qa-api QA12 |

## 复现

先按 `release.md` 建好独立测试库，使用其 DATABASE_URL / APP_DATABASE_URL 启动生产构建；`LLM_MODE=demo`。不要同时让 Vitest reset 正在浏览器验收的库。

```powershell
npm run build
# 一个终端启动服务（默认 3000）
npm run start
# 另一个同库环境终端：每次主流程前恢复 demo 账号
npm run demo:reset
node tests/e2e/demo-flow.mjs test-results/e2e-2026-11-17
node tests/e2e/qa-api.mjs
```

浏览器需要 Playwright（或 `PLAYWRIGHT_MODULE` 指定已安装的 playwright-core 目录，并用 `BROWSER_CHANNEL=msedge`）。设置 `E2E_STATIC=1` 会禁用 WebGL，专门验证静态绘本降级主流程；B1 的 3D 软件渲染截图单独验收。

证据：`test-evidence/qa-api-2026-11-17.json`、`test-evidence/e2e-2026-11-17.json`、`screenshots/acceptance-2026-11-17/`。开发建模固定数据见 `screenshots/ui/b1-comparison.md`。首轮脚本失败记录不作为产品功能失败或通过结论；以修复后的最终结果为准。

本轮完整浏览器流程为 Windows Edge、1440×900、**禁用 WebGL 的静态绘本降级**，15/15 检查点通过。B1 的 16 张图另用 SwiftShader 渲染 3D，并检查 390×844 视口；这不等于完整业务流程已在手机或真实 GPU 重跑。

## 已知边界

上传与第 7–12 条本轮以真实 HTTP/服务层为主，没有逐一点击所有界面控件；新用户开场写入已验证，完整欢迎页逐步点击仍为人工演示前检查。真实模型、真机与屏幕阅读器未复测。主流程的初始阶段来自实际 API，不固定为“种子”；当前预置学习足迹可令左外连接已生叶，这是演示数据规则，并非 UI 随机成长。

远程 CI、main 规则与 tag 待实际发布时执行；功能清单不得将这些本地配置文件当作远程验收已通过。
