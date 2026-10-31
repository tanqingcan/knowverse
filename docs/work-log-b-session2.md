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

## 未验证 / 风险（如实，不要在报告标通过）

- **视觉构图**（比例/配色/遮挡/球面贴合）未逐项人工确认——本会话模型无图像输入，截图只能做像素统计，无法「看」效果；需 image-capable 模型或真机复核。
- `/space` 真实链路（点击开花档案、花圃弹层「定位」按钮、移动端底部抽屉）**未验证**（依赖数据库）。
- 「定位」的 `yaw = -atan2(x,z)` 已按 `surfaceFrame` 的 az 定义推导，但未在浏览器逐圃点按验证。
- 真实 GPU 帧时间 / 60 秒内存稳定、真机触屏、`backdrop-filter` 低端机成本：均未验证。

## 下一步（给任何续作会话）

1. 用户确认后重建 PostgreSQL（`db:reset` = migrate + seed）→ 补测 `/space` 全链路与「定位」按钮；
2. image-capable 模型逐项复核种子小棚/拱门的比例、配色、遮挡与球面贴合；
3. 继续 Round 3 第 3 个建筑（如小桥）、B3/B4 接口契约（交 A/C/D）。
