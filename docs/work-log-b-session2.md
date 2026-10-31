# B 部分工作日志 · 并行会话（2026-10-31 17:44–17:56）

> 与 `progress-sphere.md` 的「第十四轮」是同一仓库的两个并行会话。第十四轮做了跨株实例化（拾取圆柱/接触阴影），本会话做了新建筑、花圃定位与底部抽屉。两边都改过 `GardenWorld.tsx`，最终合并回同一分支，无冲突。
> 本文件单独存放，避免与并行会话对 `progress-sphere.md` 的持续改写发生写冲突。

## 现场（恢复时）

- 分支 `feature/b-visual`，起点 HEAD `c8b1a1d`，工作区干净。
- 环境限制与解锁：
  - `tsc --noEmit` 始终可用；
  - `vitest` 在默认沙箱下因 esbuild `spawn EPERM` 失败，切到 danger-full-access 后恢复（34/34 通过）；
  - 无头 Edge 截图在默认沙箱下因 Mojo 命名管道 FATAL（`platform_channel.cc 拒绝访问`）失败，切 full-access 后可用（`--headless=new --use-angle=swiftshader`）；
  - Playwright 1.55 + chromium 缓存可用（`.dsh-tools/shoot.py` 直接跑）。
- PostgreSQL：数据目录 `%TEMP%\knowverse-pgdata` 已消失（第十四轮已确认），本会话**未重建、未 seed**，`/space` 未验证。

## 改动（本会话）

| # | 内容 | 文件 |
|---|---|---|
| 1 | **种子小棚 SeedShed**：石板地台 + 木墙 + 斜顶 + 双层架板摆 5 个种子罐 + 门口暖灯，纯程序化 | `Props3D.tsx` |
| 2 | **花园拱门 GardenArch**：两立柱 + 半圆拱（`TorusGeometry arc=π`）+ 8 朵攀援小花 + 顶部星点 | `Props3D.tsx` |
| 3 | 布局：`SPOTS.seedShed`(-1.62,-1.15)、`SPOTS.arch`(0,1.22)、`SEED_PATH`（温室→种子小棚）；加入 scatter 阻挡与 pathPts | `layout.ts` |
| 4 | 场景挂载：`SeedShed`/`GardenArch` 带 register 锚点 + `LabelHit`（只悬停标签、不接假功能入口）；种子小径石板 | `GardenWorld.tsx` |
| 5 | **花圃定位**：`focusBed` prop + 相机 effect（`yaw = -atan2(x,z)` 把该圃转到中央 + 拉近）；花圃弹层每圃加「定位」按钮 | `GardenWorld.tsx`、`SpaceApp.tsx` |
| 6 | 悬停标签补 `observatory` / `seedshed` / `arch` | `SpaceApp.tsx` |
| 7 | 底部抽屉键盘安全区：`height: min(72dvh, calc(100dvh - 132px - env(safe-area-inset-bottom)))` | `globals.css` |

## 验证

- `tsc --noEmit` 通过；单测 **34/34**（`vitest --config vitest.unit.config.ts`）。
- `/dev/garden?n=10&perf=1&reduced=1`（1440×900，SwiftShader）：**502 draw / 406,818 tri**（第十四轮实例化后 466 draw 基线 + 新建筑约 +36 draw）。`/`、`/dev/garden`、`/dev/props`、`/dev/flowers` 均 200。
- 截图证据（仓库外 `.dsh-tools/`）：`b2-newbuild-n10.png`、`b3-reduced-n10.png`；像素抽样非空白（mean≈147/136/116，std 31/35/45，采样 3030 色）。
- 提交：`2fe4cf4 feat(world): 种子小棚与花园拱门 + 花圃定位镜头跳转`；`34a7269 polish(ui): 底部抽屉键盘安全区高度上限`。

## 补充验证（第二回合，2026-10-31 18:10）

> 并行会话已把 PostgreSQL 从临时目录迁到工作区 `.pg16`（程序）+ `.pgdata`（数据），并完成 migrate + seed（demo / xingye / ahe 三个演示账号）。数据库可用后补测了 `/space`。

- `/space`（demo 登录 `POST /api/auth/demo` → **200**）：3D 场景 + HUD 正常渲染，无 pageerror；像素 mean≈146/135/116、std 40/42/44（非空白）。
- **花圃「定位」按钮实测可用**：点「花圃」打开弹层 → 点「定位」→ 相机移动（前后两帧 **59% 像素变化 / 平均绝对差 110.8**，且弹层关闭）。截图 `.dsh-tools/locate-before.png`、`locate-after.png`、`space-after-newbuild.png`。
- 环境事实：`knowverse` 库 44 表 + 3 演示用户；开发站 `http://127.0.0.1:3000`。

## 仍未验证 / 风险（如实，不要在报告标通过）

- **视觉构图**（比例/配色/遮挡/球面贴合）未逐项人工确认——本会话模型无图像输入，截图只能做像素统计，无法「看」效果；需 image-capable 模型或真机复核。
- 「定位」只验证了**一次点击后相机确实移动**，未逐圃（7+ 圃）点按、也未验证它是否准确对准目标圃中心。
- 移动端底部抽屉（`390×844`）键盘安全区、`backdrop-filter` 低端机成本、真实 GPU 帧时间 / 60 秒内存稳定、真机触屏：均未验证。

## 第三回合（2026-10-31 18:06+）：小池塘 + 木桥（第三个探索节点）

- 新增 `PondBridge`：不透明浅蓝水面（避免透明排序）+ 岸边 14 块石子 + 跨水木桥（桥面 + 双侧栏杆 + 立柱），纯程序化。
- 位置 `SPOTS.pond`(-1.32, 1.05)，加入 scatter 阻挡；`register("pond")` + `LabelHit`（悬停标签「小池塘 · 木桥」，不接假功能）。
- 验证：`tsc` 通过、单测 34/34；`/dev/garden?n=10&perf=1&reduced=1` **528 draw / 413,578 tri**（+26 draw）；`/space` demo 登录 200、渲染无 pageerror。截图 `.dsh-tools/b3-pond-n10.png`、`space-pond.png`。
- 提交：`c5eb0ed feat(world): 小池塘与木桥（第三个探索节点）`。
- 坐标核对：pond 到 arch 距离 ≈1.33、到 sign ≈1.75、到 greenhouse ≈1.94，均无重叠。

## 下一步（给任何续作会话）

1. image-capable 模型逐项复核种子小棚/拱门/池塘木桥的比例、配色、遮挡与球面贴合；逐圃点按「定位」核对是否对准；
2. Round 3 已满足「2–3 个新节点」（种子小棚 + 拱门 + 池塘木桥 = 3 个）；剩余 Round 6 的 B3/B4 接口契约（交 A/C/D）；
3. 移动端 `390×844` 复核底部抽屉与「定位」按钮（`touch.py` 触屏模拟）。

## 第四回合：装饰合批（按协调会话 `docs/lead-render-suggestions.md` 实施）

- 云海 `CloudRing`（46 mesh）、前景低云 `FrontClouds`（16 mesh）各改单个 `InstancedMesh` + 实例色。
- 树木/灌木 `TREES`(11) + `WILD`(16) 新组件 `FloraField`：按几何类型 5 个 `InstancedMesh`（树干/树冠/灌木球/灌木花/接触阴影），`setColorAt` 处理 tint/blossom 色，矩阵 = `capFrame` pos/quat × 种子旋转。删掉逐 mesh 的 `BlossomTree`/`Bush` 渲染。
- **实测**（`/dev/garden?perf=1&reduced=1`，SwiftShader）：n=10 **487 → 347 draw**（−140）；n=100/3 圃 **848 → 565 draw**（−283，−33%，达 <600 目标）。三角面因 InstancedMesh 整组计入而略升（n=10 430,158），draw 是瓶颈、可接受。
- 验证：`tsc` 通过、单测 34/34、无 pageerror、截图 `b8-flora-final.png` 像素正常（mean 148/137/116）。
- 提交：`a0cd20a perf(world): 树木/灌木/云海/前景云按几何合批为 InstancedMesh，n=100 draw 848 -> 565`。
- 未做：`GardenBed` 苔藓/木桩合批（建议里 ~−70，可选）；未逐帧比对树木外观（同几何同色，静止画面应一致，但未逐像素确认）。

## 第五回合：花圃苔藓/木桩合批 + 位置重叠修复

- `GardenBed` 的苔藓（~40 个 sphere）与木桩（~46 个 rbox）各改 1 个 `InstancedMesh`（实例色；木桩统一高 0.07、丢掉 ±0.01 高度抖动，视觉可忽略）。
- **实测**：n=10 **347 → 266 draw**（−81）；n=100/3 圃 **565 → 391 draw**（−174，−31%）。**100 株从最初 1,320 降到 391（−70%）**。
- 提交：`6028f72 perf(world): 花圃苔藓/木桩合批为 InstancedMesh，n=100 draw 565 -> 391`。
- **位置重叠修复**：种子小棚（-1.62,-1.15）原重叠温室 + 树 + 灌木，池塘（-1.32,1.05）原重叠概率统计花圃槽位；改为种子小棚(-0.15,-0.95)、池塘(0,2.24)、拱门(0,1.35)，并在 `layout.ts` 顶部加坐标系说明（用户可自行改 SPOTS 的 x/z）。提交 `7c1c7c8`。
