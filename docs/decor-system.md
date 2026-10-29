# 星球装饰系统（差异化外观 + 自由摆放）设计草案

> 目标：把「个人星球」从只读花园，升级成**可布置的家园**；每个玩家的星球外观不同；装饰可自由挪动。
> Owner：B（前端 / 交互）；DB 与 API 归 A，本文给出契约草案，等 A 确认后落地。

## 1. 目标与边界

- 玩家能：摆放 / 移动 / 旋转 / 缩放（可选）/ 取下装饰；装饰来自「目录」（catalog）。
- 差异化：位置、朝向、组合、主题色、解锁顺序不同；不做「模板化皮肤」。
- 与现有：`planets`、`gardens`、`plants` 不冲突；装饰是独立层。
- 性能：装饰总量受「负荷」限制（见 `visual-references.md` §3）。

## 2. 数据模型（草案，交 A）

```sql
-- 装饰目录（全局；owner_user_id 为空表示公共）
decor_items (
  id uuid pk,
  key text unique,              -- 'bench_wood', 'flower_tulip_pink'
  name text,
  category text,                -- flower/tree/furniture/decor/ground
  model_key text,               -- 前端模型注册表 key（不存 URL，便于换素材）
  load numeric,                 -- 三角面/1000，用于负荷封顶
  unlock_rule jsonb,            -- {type:'concept_stage', conceptId, stage} | {type:'default'}
  owner_user_id uuid null
)

-- 玩家星球上的装饰实例
planet_decor (
  id uuid pk,
  user_id uuid fk,
  planet_id uuid fk,
  decor_item_id uuid fk,
  x real, z real,               -- 与 garden 同坐标系
  rot real,                     -- 绕法线旋转（弧度）
  scale real default 1,
  color text null,              -- 可选换色（主题）
  placed_at timestamptz,
  created_at timestamptz
)
-- 索引 (planet_id)；权限：只能改自己的行
```

- `load` 总量在 API 层校验：`sum(load) <= 50`。
- 解锁：`unlock_rule` 由后端根据学习证据判断；前端只显示「已解锁 / 未解锁」。
- 权限：只能改自己的 `planet_decor`。

## 3. API 契约（草案，交 A）

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/decor/catalog` | 可用装饰（含 unlock 状态、load） |
| GET | `/api/decor` | 我的星球装饰 |
| POST | `/api/decor` | 新增 `{decorItemId,x,z,rot,scale,color}` |
| PATCH | `/api/decor/[id]` | 移动 / 旋转 / 缩放 / 换色 |
| DELETE | `/api/decor/[id]` | 取下 |
| GET | `/api/planets/[id]/decor` | 只读：看别人的星球（社区 / 班级星系） |

返回统一 `{ok, data}`；错误码沿用现有 `AppError`。

## 4. 前端交互（B 实现）

- **编辑模式**：进入「布置」后装饰显示选中框；拖拽移动（贴地投影），滚轮 / 按钮旋转 15°，Shift 吸附。
- **放置**：从目录拖出 → 半透明预览 → 松手落地；负荷不足时红色提示。
- **撤销 / 重做**：本地栈，保存时批量 PATCH。
- **移动端**：单指拖动，双指旋转（或按钮）。
- **键盘**：Tab 选中装饰，方向键微移，R 旋转，Delete 取下。
- **空态 / 错误态**：无装饰、加载失败、负荷满。
- **降级**：无 WebGL 时，装饰以 2D 图标显示在静态绘本场景。

## 5. 差异化设计（关键）

1. **空间**：x / z / rot / scale 自由 → 同一套素材也能摆出不同构图。
2. **主题**：`color` 换色 + 天空主题 → 每人「配色」不同。
3. **组合**：花坛、座椅角、灯串、路径。
4. **解锁**：装饰由学习证据解锁 → 外观反映学习轨迹（差异化 + 叙事）。
5. **社区**：只读参观 +「收藏布局」；后续可做「布局码」（JSON 分享）。

## 6. 天空主题（与装饰联动）

- 天空（`.sky`）支持 3–4 个主题：暮色（默认）、星夜、晨雾、极光。
- 主题存 `users.sky_theme` 或 `planet_settings`；切换即时生效。
- 这也直接解决「天空很丑」：先用 CSS 主题，后续可换 HDRI（Poly Haven CC0）。

## 7. 分阶段与实现现状

- **v1（W2–W3）**：只读展示 + 固定装饰位（先用 3–5 个预设位验证观感）。
- **v1.5（已做，2026-10-29）**：前端原型——`src/lib/decor.ts` + `GardenWorld` 的 `decor` 渲染 + `SettingsPanel` 的「星球装饰」操作区（添加 / 四向移动 / 旋转 / 缩放 / 移除），存 localStorage。
- **v2（W3–W4）**：自由拖拽（3D 拾取）+ 旋转 + 负荷；接 A 的 `/api/decor`。
- **v3（W5+）**：目录解锁 + 主题 + 社区参观。

## 8. 验收

- 两个账号的星球装饰位置 / 组合不同（截图）。
- 拖拽后刷新位置保持（DB 持久化）。
- 负荷满时拒绝并提示。
- 移动端可摆放；键盘可摆放。
