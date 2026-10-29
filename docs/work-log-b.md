# B 部分工作日志（呈现与宇宙）

> 记录 B 从 W1 起的实现过程、关键决策与验收证据。任务卡编号对应 `division.md` 的 B1–B8。
> 状态标记：⬜ 未开始 · 🟡 进行中（待确认） · 🟢 完成（证据已回填） · ⏸ 阻塞

## 约定

- 分支：`feature/b-visual`，每个任务卡一个 PR；改到别人目录（`src/db/`、`drizzle/`）必须在 PR 里 @ 对方。
- 验收证据：截图入 `docs/screenshots/ui/`；PR 写「做什么 / 怎么验证 / 影响」。
- 对接口子：A2（`/api/classes/[id]/galaxy` 契约，W2 冻结）、C5（记忆面板 API）、D（报告模板 / 术语表 / 图号）。

## 路线回顾（已确认的排序）

**B7 → B1 → B2 → B5 → B3 → B4 → B6 → B8**

- P0：B7（1）、B1（3）
- P1：B2（2）、B5（2）、B3（4）
- P2：B4（2）、B6（2）、B8（1）
- 保护项：B1 + B2 + B3 是「第一眼的差异化」三件套，时间紧时优先保这三项。

## W1 · B7 + B1（🟡 进行中）

### 任务目标

1. **B7**：修两个真实缺陷（时区硬编码、缺 favicon）+ 1440/768/390 三档响应式回归 + 焦点/对比度/键盘路径清单。
2. **B1**：建模修复 6 项——温室玻璃旋转符号、玫瑰 cup/curl、花瓣 segU 6→10、花苞造型、旅人坐姿穿模、草丛圆润曲面。

### B7 实现方案（草稿）

| 项 | 现状 | 拟改 |
|---|---|---|
| 时区硬编码 | `lib/api.ts` 的 `fmtTime`/`fmtDate` 与 `SpaceApp.tsx` 重放标签都写死 `Asia/Taipei`；`SettingsPanel` 已有用户时区下拉 | 在 `lib/api.ts` 增加模块级 `currentTimeZone` + `setTimeZone`，`SpaceApp` 在拿到 `user.timezone` 后调用；格式化统一读它。默认值可回退浏览器 `Intl...resolvedOptions().timeZone` |
| favicon | `src/app/` 与 `public/` 均无 icon 文件 | 加 `src/app/icon.svg`（Next App Router 自动识别），图案待定（星灯 / 玫瑰 / 「知」字） |
| 响应式 | 已有 1440×900、390×844 截图 | 补 768 档；三档检查横向溢出、底部抽屉、侧卡 |
| 可访问性 | 已有部分键盘截图 | 输出焦点态/对比度/键盘 Tab 路径清单，入 `docs/` |

### B1 实现方案（草稿，均已有精确位置）

| # | 位置 | 改法 |
|---|---|---|
| 1 | `Props3D.tsx:102` | 玻璃旋转 `-π/2 + sd*roofAng*-1 + (sd>0?0:0)` 改为与木梁 `Props3D.tsx:96` 同号的 `-π/2 + sd*roofAng`，删除死代码项 |
| 2 | `Flower3D.tsx:38–41,43` | 重调玫瑰 `cup`/`curl`（内层 1.25/-0.04 → 更收拢；外层逐层展开），以 `/dev/flowers` 三倍像素截图反复比对 |
| 3 | `geo.ts:128,169` | 花瓣默认 `segU` 6→10（或仅玫瑰显式传 `segU:10`，避免全局涨面数） |
| 4 | `Flower3D.tsx:44–54` | 花苞由 4 片近乎直立的尖瓣改为圆润闭合花苞（更宽、更正 tilt、分层包裹） |
| 5 | `Characters3D.tsx:26,44,57` | 坐姿偏移 0.03 / 0.058 与长椅坐面 0.075 不匹配，抬高臀部并调大腿/小腿角度，消除穿模 |
| 6 | `Props3D.tsx:210–216`、`GardenWorld.tsx:107–111` | 草丛 `ConeGeometry` 低分段（3/5）改圆润曲面（弯叶或细分锥），保留实例化一次绘制 |

### W1 进展与证据（2026-10-29）

**已改（代码，`feature/b-visual` 分支）**

| 项 | 改动 | 证据 |
|---|---|---|
| B7 时区 | `lib/api.ts` 新增 `setTimeZone` / `currentTimeZone`；`fmtTime`/`fmtDate` 改读它；`SpaceApp` 载入空间时 `setTimeZone(user.timezone)`；重放标签改用 `fmtDate` | `grep Asia/Taipei` 在 `src/lib`、`src/components` 只剩 `SettingsPanel` 下拉选项（合法）；`tsc --noEmit` 通过 |
| B7 favicon | 新增 `src/app/icon.svg`（玫瑰） | landing HTML 出现 `<link rel="icon" href="/icon.svg">`；`/icon.svg` 返回 200 |
| B1 屋顶玻璃 | `Props3D.tsx` 玻璃旋转改为与木梁同号 `-π/2 + sd*roofAng`，删死代码 | `tsc` 通过；`/dev/garden` 200 |
| B1 segU | `geo.ts` 花瓣默认 `segU` 6→10（叶片仍显式 6） | — |
| B1 玫瑰 | `Flower3D.tsx` 内/外层 `cup`/`curl` 收拢重调 | 待视觉比对 |
| B1 花苞 | 4 片尖瓣 → 6 片宽杯形包裹 + 球形花萼 | 待视觉比对 |
| B1 草丛 | `geo.ts` 新增 `bladeGeo`（6 段细锥 + 顶部外弯），`Props3D`/`GardenWorld` 两处草丛替换掉低分段圆锥 | 待视觉比对 |
| B1 旅人坐姿 | 坐姿前移 0.022，避开靠背穿模 | 待视觉比对 |

**已验证**

- `npm run typecheck` 通过。
- `/`、`/dev/flowers`、`/dev/garden` 均 200，dev server 编译无报错。
- favicon 链路通。

**未验证 / 待补**

- 3D 视觉（玫瑰/花苞/草丛/旅人/玻璃）需在浏览器里看一遍；沙箱内无法起 Chrome（Mojo 命名管道被禁），截图需在本机做。
- 768 档横向溢出、键盘 Tab 路径、对比度清单：需浏览器逐项看。
- `npm test` 未在沙箱运行（vitest worker 需管道）；前端改动不影响服务端用例，建议本机 `npm test` 确认 47 例。

**验收清单**

- [ ] `/dev/flowers`、`/dev/garden` 三倍像素前后对比图各入库
- [ ] 无 z-fighting、无明显穿模；软件渲染帧率不下降
- [ ] 1440 / 768 / 390 三档无横向溢出
- [ ] 键盘 Tab 可走完主流程；焦点态与对比度清单
- [x] 时区随用户设置变化（代码层）；favicon 出现在标签页
- [x] `npm run typecheck` 通过；`npm test` 待本机确认

### 工作流

1. `git switch -c feature/b-visual`
2. 先 B7（小、独立、解锁截图）→ 再 B1（3D 逐项，每项一次提交）
3. 每完成一项：截图 → 更新本日志 → 提交

## W1.5 · 视觉方向调研 + 天空重做（2026-10-29）

### 新增文档 / 脚本

| 文件 | 内容 |
|---|---|
| `docs/visual-references.md` | 对标案例（Sky: CotL、尘歌壶、动森、Palia、Sims 建造、Duolingo/Habitica/Forest）+ 素材来源（Quaternius / Kenney / Poly Pizza / Poly Haven，CC0 优先）+ **复杂度预算**（花 ≤800 面、树 ≤2000、椅 ≤500、旅人 ≤2500、单星球 ≤50000）+ 「成长渐变用 shader，不找成长动画模型」 |
| `docs/decor-system.md` | 装饰目录 + 星球装饰实例的数据模型草案、API 契约（交 A）、自由摆放交互、差异化设计（空间/主题/组合/解锁/社区）、负荷机制 |
| `scripts/fetch-assets.ps1` | 素材下载清单（本机运行；沙箱内出网被禁），含记录模板 |

### 天空重做（`src/app/globals.css` 的 `.sky`）

- 基础渐变：深空 `#25204a` → 暮紫 → 雾蓝 → 浅桃 → 奶油，10 个色标，比原来的 6 段更有深度。
- 叠加：地平线暖光、右上冷光、极光带。
- `::before` 平铺星点（向下渐隐，`prefers-reduced-motion` 下停止闪烁）。
- `::after` SVG 颗粒（feTurbulence）消色带。
- 验证：`tsc` 通过；`/`、`/dev/garden` 200；编译后 `layout.css` 含 `skytwinkle` / `feTurbulence` / `25204a`。
- 待你本机看效果：`/`（开场）、`/space`（花园）、`/welcome`。

### 结论（给下一步）

- **素材**：本机跑 `scripts/fetch-assets.ps1` 下载；优先 Kenney / Quaternius（低模、CC0）。
- **成长渐变**：用现有 `Flower3D` 的 `open` + 顶点 shader grow 参数，不引入带骨骼动画模型。
- **装饰系统**：先等 A 确认 `decor_items` / `planet_decor` 两张表与 `/api/decor` 契约，再动前端。

## W1.6 · 植物入场生长动画（2026-10-29）

- `GardenWorld.tsx` 的 `PlantNode`：入场按 `hashId(p.id) % 320ms` 错峰，0.9s 内从 0.22 长到 1（ease-out + 轻微过冲）；`prefers-reduced-motion` 下直接 1。
- 与原有「成长庆祝」`fx` 分支不冲突：`fx` 时仍按 `before/after` 缩放与 `open` 展开。
- 验证：`tsc` 通过；`/`、`/dev/garden`、`/dev/flowers` 200。
- 待本机看：进 `/space` 时 13 株植物依次长出。

## W1.7 · 天空主题（2026-10-29）

- `.sky` 改为 CSS 变量驱动，新增 `theme-night`（星夜）、`theme-mist`（晨雾）、`theme-aurora`（极光）；默认 `theme-dusk` 沿用暮色。
- 新增 `src/lib/sky.ts`（主题类型、localStorage、`useSkyTheme` 订阅）与 `src/components/ui/Sky.tsx`；Landing / Onboarding / SpaceApp 三处天空统一换成 `<Sky />`。
- `SettingsPanel` 增加「天空」一行 4 个主题切换。
- 验证：`tsc` 通过；`/`、`/welcome`、`/dev/garden` 200；编译后 layout.css 含 `theme-night` / `theme-aurora` / `--s1`。
- 待办：跨设备持久化需 A 在 `users` 加 `sky_theme`（或 `planet_settings`）。

## W1.8 · 星球装饰原型（2026-10-29）

- 新增 `src/lib/decor.ts`：装饰类型（路灯 / 灌木 / 开花小树）、预设落点、`localStorage` 读写、`useDecor`（localStorage + 自定义事件跨组件同步）。
- `GardenWorld` 增加 `decor?: DecorPlacement[]`，按 `(x, z, rot, scale)` 用 `OnCap` 渲染到球面。
- `SpaceApp` 用 `useDecor()` 把装饰传给场景；`SettingsPanel` 增加「星球装饰」：添加 / 清空 / 每个装饰的左移右移前移后移 / 左转右转 / 放大缩小 / 移除。
- 验证：`tsc` 通过；`/`、`/dev/garden`、`/welcome` 200。
- 说明：现在存本机浏览器；接 A 的 `/api/decor` 后改成接口即可，并开放「参观别人的星球」。

## W2–W6（占位，待 W1 完成后细化）

- W2：B2 自转/手感 + B5 预算表/LOD + B3 原型（吃现有 `planets`，等 A2 契约）
- W3：B3 完成（3D GalaxyScene + 2D 降级 + 键盘 + 帧率）
- W4：B4 引用浮层/空错态（记忆面板等 C5）+ B6 首轮截图 + §3.6 初稿
- W5：B6 四组重拍 + 答辩 4 页
- W6：B8 定稿（截图编号、图注、与 D 对齐）
