# B1 建模前后对比

2026-11-17。前：`5480ae4`（Initial commit）Git 归档；后：`ae53fe6` 加本轮收尾工作区。8 组 16 张真实截图，不将旧截图和当前静态降级图冒充建模改动。

环境：Windows、Edge + SwiftShader；桌面 1440×900，手机 390×844，`prefers-reduced-motion: reduce`，开发 fixture、固定 query、相同 viewport。花朵单种页旧取景过近导致模型裁切，因此**两边取景台同时**使用 position=[0,0.65,1.4]、lookAt=[0,0.27,0]、fov=30；旧模型源码不改。花园使用各版本自身默认相机，构图变化也是比较对象，不能宣称其相机矩阵相同。

| 组 | 内容 / URL | 前 | 后 |
|---|---|---|---|
| 01 | 玫瑰花苞/开花 `/dev/flowers?sp=rose` | [前](b1-01-before.png) | [后](b1-01-after.png) |
| 02 | 向日葵 `/dev/flowers?sp=sunflower` | [前](b1-02-before.png) | [后](b1-02-after.png) |
| 03 | 鸢尾 `/dev/flowers?sp=iris` | [前](b1-03-before.png) | [后](b1-03-after.png) |
| 04 | 铃兰 `/dev/flowers?sp=lily` | [前](b1-04-before.png) | [后](b1-04-after.png) |
| 05 | 桌面花园 `/dev/garden?reduced` | [前](b1-05-before.png) | [后](b1-05-after.png) |
| 06 | 桌面选中植物 `/dev/garden?reduced&sel=1&pose=tend` | [前](b1-06-before.png) | [后](b1-06-after.png) |
| 07 | 手机花园 `/dev/garden?reduced` | [前](b1-07-before.png) | [后](b1-07-after.png) |
| 08 | 手机选中植物 `/dev/garden?reduced&sel=1&pose=tend` | [前](b1-08-before.png) | [后](b1-08-after.png) |

当前 `/space` 植物档案、提问、引用、练习与检索截图属于浏览器功能验收，另见 `../../test-report.md`；本表只比较建模/构图，开发 fixture 不含档案面板。没有真实 GPU/真机帧率数据。

复现：归档旧提交到仓库外的临时目录，两边复用锁定依赖；为旧版单种花朵页应用上述同一相机取景（仅取景台）。历史版启动 3001，当前版在 3000 开启开发页（生产运行需 `KV_DEV_PAGES=1`），运行：

```powershell
$env:BEFORE_URL='http://localhost:3001'
$env:BASE_URL='http://localhost:3000'
node tests/e2e/visual-comparison.mjs
```

需要可用 Playwright 浏览器；已有 playwright-core 时可用 `PLAYWRIGHT_MODULE` 指定模块路径，用 `BROWSER_CHANNEL=msedge` 复用本机 Edge。逐图错误、溢出与尺寸见 [截图记录](../../test-evidence/b1-comparison.json)。
