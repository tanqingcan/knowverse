# 3D 性能预算与实测（B5）

> 场景：`/dev/garden`（7 株植物 + 全部道具 + 512 丛草）。1440×900，Chrome headless + SwiftShader（软件渲染）。
> 探针：打开 `/dev/garden?perf=1`，左上角实时显示 `FPS · draw calls · 三角面`。

## 实测（2026-10-29）

| 指标 | 数值 | 建议预算 | 结论 |
|---|---|---|---|
| draw calls | **435** | ≤ 120 | 偏高：每片花瓣 / 叶片都是独立 mesh |
| 三角面 | **211,454** | ≤ 120k | 偏高 |
| FPS（软件渲染） | 截图环境不可靠 | ≥ 12 | 需真实浏览器实测 |

## 主要开销

1. **花瓣逐片 mesh**：每株花约 20 片花瓣 × 13 株 ≈ 260 次 draw call。
2. **叶片**：每种花 3–5 片，各自独立 mesh。
3. **草丛 / 野花**：已经实例化（各 1 次 draw），不是瓶颈。

## 优化方向

- 同一株花的花瓣用 `BufferGeometryUtils.mergeGeometries` 合并成 1 个 geometry + 1 个 material → 每株 1–3 次 draw。
- 叶片同理合并。
- 远处 / 未选中的植物降低细节（LOD）。
- 目标：draw calls ≤ 120、三角面 ≤ 120k、软件渲染 ≥ 12fps。

## 备注

- headless 的 FPS 采样受虚拟时间影响，截图里显示 `0 fps`；真实浏览器打开 `/dev/garden?perf=1` 可看到实时值。
- 这个探针只写 `#perf-hud` 的文本，不参与生产逻辑（`perf` 默认 false）。
