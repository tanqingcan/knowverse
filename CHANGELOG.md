# 更新日志

> 本文件按**代码变化**说明本项目从初始仓库到当前版本的实际改动。
> 数据库设计、ER 图、schema、截图等课程材料在 `docs/` 下，不在此文件的覆盖范围。

---

## 2026-11-01 · 家园模式与创造模式

### 一、3D 星球场景

| 代码 | 内容 |
|---|---|
| `src/components/world/Surface3D.tsx`、`terrain.ts` | 球面星球几何；顶点级高度位移 + `computeVertexNormals()`，支持高度场接入 |
| `src/components/world/surfacePicking.ts` | 球面拾取：把屏幕坐标经实际相机与 world 逆变换投到球面，供放置/移动使用 |
| `src/components/world/Model.tsx`、`src/lib/models.ts` | GLB 模型加载管线：注册表 + `Suspense` + 加载失败回退到程序化几何；按模型高度自动缩放 |
| `public/assets/models/*.glb`、`CREDITS.md`、`scripts/fetch-assets.ps1` | 接入 9 个低模素材（长椅 / 栅栏 / 路灯 / 石头 / 树 / 旅人 / 三种花），授权与来源登记在 CREDITS |
| `src/components/ui/Sky.tsx`、`src/lib/sky.ts` | 天空系统：暮色 / 星夜 / 晨雾 / 极光 四主题，可在设置切换 |
| `src/components/world/Flower3D.tsx` | 植物生长：`seed → sprout → leaf → bud → bloom` 五阶段，入场错峰动画，`reduced-motion` 直出 |
| `src/components/world/Characters3D.tsx`、`TravelerNavigator.tsx`、`benchSeat.ts` | 角色与旅人：沿实际路径行走、长椅坐姿、朝向贴合地表 |
| `src/components/world/Decor3D.tsx`、`DecorItem.tsx`、`Lotus3D.tsx`、`Props3D.tsx` | 装饰物件渲染：按 kind 分派模型/程序化，支持染色（GLB 材质 tint）与水面荷花 |
| `src/app/dev/{models,props,static,garden,terrain}/page.tsx` | 五个开发预览页，用于检查模型缩放/朝向、静态降级、地形 |

### 二、家园模式

| 代码 | 内容 |
|---|---|
| `src/lib/home/home-layout.ts` | 建筑从「固定渲染」改为**可编辑实例**：位置 / 朝向 / 缩放全部由布局数据驱动；`homePoses()` 把实例位置换算成门口、道路端点、地面印迹、星灯停靠等场景锚点 |
| `src/lib/home/catalog.ts` | 素材目录：`assetId` / `name` / `category` / `colorParts` / 初始位姿 / 边界，区分建筑类、装饰类与系统锚点 |
| `src/components/world/bedLayout.ts` | 花圃布局：按环形/分行算法把知识点植株分配到花圃内的位置 |
| `src/components/world/StaticGarden.tsx` | 静态降级视图：无 WebGL 或场景隐藏时用 DOM/轻量渲染呈现，且渲染**用户自己的装饰** |
| `src/components/space/panels/MemoryPanel.tsx`、`useDialog.ts` | 学习面板、对话、资料、历史等业务浮窗与统一弹窗控制 |

### 三、创造模式编辑器

| 代码 | 内容 |
|---|---|
| `src/components/space/CreativeHotbar.tsx` | 快捷栏：点击槽位直接打开替换素材库；`activeSlot` 按**索引**管理（同素材可占多槽）；空槽点击开库、右键/长按/Enter 进入替换；Esc 取消不改变原槽 |
| `src/components/space/CreativePalette.tsx` | 全量素材库：居中可收起的分类网格，固定搜索与槽位标题，底部应用/取消固定 |
| `src/components/space/LayoutMenu.tsx` | 布局菜单：保存 / 发布 / 回滚 / 放弃未保存改动 / 从模板开始 |
| `src/components/space/DiyWorkbench.tsx`、`src/lib/home/diy-parts.ts` | DIY 工作台：按部位（花瓣 / 花心 / 叶片 / 屋顶 / 墙面 / 门窗…）分区改色，含校验 |
| `src/lib/home/variants.ts` | 素材变体：保存/读取 DIY 结果作为可复用变体 |
| `src/components/space/ZonePanel.tsx`、`src/app/api/garden-zones/route.ts` | 四分区花园：分区切换与相机取景 |
| `src/lib/decor.ts` | 装饰数据层：增删改、移动、隐藏标记、复制、模板应用、撤销/重做历史（含 `move()` 绕过节流直接入栈） |
| `src/lib/home/walk-path.ts` | 行走/道路路径计算 |
| `src/lib/home/terrain.ts` | 地形高度场：49×49 稀疏网格、`terrainHeightAt`、`gridToCap`、笔刷 `applyBrush`、`toSparse/fromSparse` 存取 |
| `src/lib/home/my-default-layout.ts` | **默认布局 = 当前星球**：141 件实例（建筑 / 树 / 花 / 灌木 / 荷花 / 群组）作为代码常量，「恢复默认模板」恢复的就是这套布局 |
| `data/default-layout.json` | 141 件物件布局快照（id / kind / x / z / rot / scale / color / 尺寸 / stage） |
| `data/default-surface.json` | **地表格局快照**：花圃位移（池塘位置 + 21 个道路点 + 四分区/手工路径标记）、地形高度场、水面高度 —— 与上一个文件合起来才是完整的当前世界 |
| `src/lib/home/default-surface.ts` | **默认地表格局常量**：四分区标记（`__fourzones`）、手工路径标记（`__manualPaths`）、池塘可编辑标记（`__pondEditable`）、池塘位置、21 个道路点、地形与水面 |
| `src/app/globals.css` | 移动端与三档视口适配：快捷栏横滑、地形工具栏收起、按钮触摸尺寸、`selbar` 与操作按钮不重叠 |

**交互变化**（对应上面代码）：

- **替换素材**：点槽位 → 打开库 → 点素材 → 立即写入该槽并关闭（不再需要先开「放入第 N 槽」开关）
- **移动对象**：两次点击（点选 → `M` 进移动态 → 指针显示落点预览 → 点地面确认）；拖动降为可选设置
- **方向键**：选中对象且未在输入框/滑杆/弹窗时，`↑↓←→` 移动**对象**，方向按当前相机投影到球面切平面；步长 普通 `R×0.005` / Shift `0.001R` / Alt `0.02R`
- **花圃**：作为独立对象整体移动，土壤 / 围栏 / 木牌 / 植物 / 点击锚点一起走，知识点数据不变
- **地形**：抬高 / 降低 / 平滑 / 恢复 + 半径 / 强度 / 柔边 + 水面；高度限制 `+0.6 / -0.35`；建筑用 9 点取最大值的平整基座
- **撤销**：`Ctrl+Z` / `Ctrl+Shift+Z` 快捷键 + 界面按钮；一次确认只写一条历史
- **新账号默认格局**：`revision === 0`（从未保存过）时套用 `defaultPlanetLayout()`（141 件物件）+ `DEFAULT_SURFACE_BED_MOVES`（地表格局），使新账号与当前星球完全一致；此前用 11 件初始布局且缺少上述标记，会导致默认散布树与布局树并存、`SPOTS` 池塘与布局池塘并存、`SPOTS` 路径与手工路径并存（打架）
- **自动慢转**：创造全程、选中、移动预览、DIY、浮窗期间暂停；切到具体分区视角（池塘/玫瑰/山/种子）时也暂停，默认视角正常慢转

### 四、布局持久化与后端

| 代码 | 内容 |
|---|---|
| `src/app/api/planet-layout/route.ts` | 草稿读写：`GET` 返回布局项 / 花圃位移 / 地形 / 水面 / 版本号，`PUT` 保存 |
| `src/app/api/planet-layout/publish/route.ts`、`revert/route.ts` | 发布与回滚到上一个已发布版本 |
| `src/app/api/planets/[userId]/route.ts` | 他人星球读取（只读拜访） |
| `src/app/api/memories/route.ts`、`memories/[id]/route.ts` | 记忆条目的读写 |
| `src/server/layouts.ts`、`planets.ts`、`memories.ts` | 对应服务端逻辑与权限校验 |
| `src/lib/layout-api.ts` | 前后端布局项转换（`toLayoutItem` / `fromLayoutItem`），稳定 `instanceId` |
| `src/app/visit/page.tsx` | 拜访他人星球页（只读） |

**加载优先级**：服务端布局（`schemaVersion ≥ 2`）为唯一权威；确认从未保存过（`revision === 0`）才使用初始布局；本地 `localStorage` 草稿仅在服务端无数据时兜底，且差异会提示一次性导入而不是静默覆盖。

### 五、数据库迁移

| 迁移 | 内容 |
|---|---|
| `0002` – `0009` | 星球 / 花园 / 植物 / 概念 / 证据 / 会话 / 记忆等表的建立与约束 |
| `0010` | `planet_layout_items.instance_id`：布局项稳定实例 ID |
| `0011` | `planet_layouts.terrain` jsonb：稀疏高度点 |
| `0012` | `planet_layouts.water` real：水面高度 |
| `0013` | 四分区花园 |

全部为 additive，可直接在现有库上执行。

### 六、测试

| 文件 | 覆盖 |
|---|---|
| `tests/unit/home-mode-v3.test.ts` | 初始布局 / `homePoses` 锚点 / 布局项转换 / 变体 / 模板契约 |
| `tests/unit/home-catalog.test.ts`、`home-poses.test.ts` | 素材目录与锚点计算 |
| `tests/unit/surface.test.ts`、`sphere-reach.test.ts`、`geo.test.ts` | 球面几何与可达性 |
| `tests/unit/surface-picking.test.ts` | 球面拾取换算 |
| `tests/unit/layout.test.ts` | 布局存取与版本 |
| `tests/unit/bench-seat.test.ts`、`walk-path.test.ts`、`planet-zoning.test.ts` | 坐姿朝向、路径、四分区 |

共 11 个测试文件、86 个用例。

---

## 验证

```
npm run typecheck   0 error
npx vitest run      86 passed (11 files)
npm run build       通过
```

运行 `npm run dev` 后：`/`、`/space`、`/visit`、`/dev/terrain` 均返回 200，`/space` 正常渲染场景并加载布局。
