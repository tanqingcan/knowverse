# 装饰合批建议（交给 B · 前端）—— 来自协调会话，2026-10-31

> 本文件是**只读建议**，不含代码改动；供 B（前端 3D）评估后在自己的文件里实施。
> 目标：把 n=100 / 3 圃 的 draw 从 848 进一步压到 <600（B 已在 `4a25586` 把土丘/茎/叶合并，draw 1031→848）。

## 背景

拾取圆柱、接触阴影、土丘/茎/叶都已实例化/合并，但**纯装饰**仍是逐 mesh 绘制，是当前最大的剩余 draw 源。它们几何完全相同、零交互、无动画，是零风险的 InstancedMesh 目标。

## 建议清单（按收益排序）

### 1. 树木 / 灌木（约 −180 draw，最高收益）

现状（`GardenWorld.tsx` 552–557 行 + `Props3D.tsx` 的 `BlossomTree`/`Bush`）：`TREES`（11 个）+ `WILD`（16 个）逐个渲染；每棵树 = 接触阴影 1 + 树干 1 + 树冠 4 = 6 mesh，每灌木 = 接触阴影 1 + 4 球 + ~3 花 = 5–8 mesh。

建议按「几何类型」分组实例化（`setColorAt` 处理 tint/blossom 色），每组矩阵 = `capFrame(x, z, 0, 0)` 的 pos/quat 再叠种子旋转：

| 组 | 几何 | 数量 | 合批后 | 省 draw |
|---|---|---|---|---|
| 树干 | `cylGeo(0.022,0.035,0.28,10)` | 9 | 1 次 | −8 |
| 树冠 | `sphereGeo(1,16,12)` | 36 | 1 次 + instanceColor | −35 |
| 灌木球 | `sphereGeo(1,14,10)` | 72 | 1 次 + instanceColor | −71 |
| 灌木花 | `sphereGeo(0.012,8,6)` | ~54 | 1 次 + instanceColor（3 色） | −53 |
| 接触阴影 | `contactGeo()` | 27 | 1 次 | −26 |

### 2. 云海 `CloudRing`（−45）

`Props3D.tsx` 的 `CloudRing`：46 个 `sphereGeo(1,16,12)` 逐 mesh。改成 1 个 InstancedMesh，`setColorAt`（3 色），矩阵 = `compose(p.p, 单位四元数, [s*1.3, s*0.8, s])`。模式与 `GardenWorld` 的 `Grass`/`Wildflowers` 完全一致。

### 3. 前景低云 `FrontClouds`（−15）

`GardenWorld.tsx` 208–216 行：16 个逐 mesh。改 InstancedMesh，frame 用 `capFrame(p.x, p.z, 0, p.lift)`（等价于原 `OnCap`），scale `[s*1.4, s*0.7, s]`，`setColorAt` 3 色。

### 4. 花圃边框苔藓 + 木桩（约 −70，可选）

`Props3D.tsx` 的 `GardenBed`：每圃 `moss`（~12 个 `sphereGeo(1,8,6)`）+ `posts`（~14 个 `rbox`）逐 mesh，3 圃约 78 draw。可各合 1–2 次实例化。

## 合计

约 −300 draw：848 → ~550，稳稳 <600（也覆盖 <800 验收）。

## 注意

- 纯装饰无交互、无动画，实例化不影响点选 / 成长动画 / 花圃定位。
- 接触阴影实例化后不再跟随物体（与第十四轮 `BedContacts` 同理），静止画面一致即可。
- 建议每改一类就跑 `/dev/garden?n=100&g=3&perf=1` 复测 draw + 截图比对，改完 `tsc --noEmit` + 单测。
