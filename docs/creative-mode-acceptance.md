# 创造模式与完整星球 · 验收跟踪（G1–G12）

> 目标：把「只有正面球冠布景」扩展为可全周探索的完整球体，并新增「创造模式」让用户亲手布置初始星球（围栏/土壤/道路/植物/建筑），确认后保存到数据库。建模与空间体验最高优先级。
> 状态标记：⬜ 未开始 · 🟡 进行中 · 🟢 通过（证据齐全）· ⛔ 阻塞（精确原因）· ⚠️ 未验证（需 image-capable/真机）。

## 基线（2026-10-31 21:31）

- 分支 `feature/b-visual`，HEAD `e1e339b`，工作区干净；无 `AGENTS.md`。
- 站点 3000 端口在线（生产模式 `next start`），PostgreSQL 5432 在线。

## 验收表

| # | 状态 | 版本/commit | 复现步骤 | 证据路径 |
|---|---|---|---|---|
| G1 选材与玫瑰 | 🟡 进行中 | 入口+素材栏+玫瑰放置+五阶段选择器；**vision_understand 近景确认：花瓣多层叠放/自然翻卷/茎叶完整/无穿模**；缩略图未做 | Round 2-4 | `rose-closeup.png` + vision |
| G2 实时编辑 | 🟡 进行中 | 比例/宽长/旋转/阶段控件已实现；撤销/重做按钮+快照栈（**单步撤销实测通过，多步栈有 bug 待修**）；触摸未做 | Round 2/3 | `.dsh-tools/test-undo.py` |
| G3 球面地板 | 🟡 进行中 | SphereSurface 实现+放置成功；**vision 确认泥土边缘沿球面弯曲、无悬空穿模**；背面/极点/接缝未逐一验 | Round 2-4 | `cm-place-multi.png` + vision |
| G4 数据库闭环 | 🟢 通过 | 2 玫瑰(scale 1/1.6)+泥土(w1.2 l0.9 rot30)+围栏+道路 → PUT rev3 → 同上下文/重登/新浏览器上下文均恢复 5 件且参数一致；清 localStorage 后从服务端恢复 | 见 Round 3 | `.dsh-tools/test-g4.py`、`test-g4-paths.py` |
| G5 异常/权限/并发 | 🟡 进行中 | 旧 revision→409 冲突实测；缺保存失败重试/跨账号越权/参观只读证据 | 见 Round 3 | `.dsh-tools/test-g5.py` 输出 |
| G6 模板与兼容 | 🟡 进行中 | 默认模板「从模板开始」（预览确认+可撤销）+「放弃修改」恢复服务器布局已实现并实测；旧 localStorage 导入/恢复已发布版本未做 | Round 5 | `.dsh-tools/test-template.py` |
| G7 完整球体 | 🟡 进行中 | 全周环绕/复位/慢转已实现；**vision 确认背面有连续草地+建筑/树/石、无破洞接缝倒置**；极点/接缝未逐一验 | Round 4 | `sphere-back.png` + vision |
| G8 模型扩展 | 🟡 进行中 | B1 五类修复 + 3 建筑已做 | 见 docs/progress-sphere.md | 待补本轮证据 |
| G9 容量 | 🟡 进行中 | 布局单测 28 例 + 0/1/10/30/50/100 | tests/unit/layout.test.ts | 待补本轮证据 |
| G10 天空与 UI | 🟡 进行中 | 天空星点分层 + 居中浮窗 + 毛玻璃 | 前序会话 | 待补本轮证据 |
| G11 性能与回归 | ⬜ 未开始 | 已有 draw 391 实测，需按本节重测 | — | — |
| G12 构建与交付 | ⬜ 未开始 | — | — | — |

## 每轮记录

### Round 5 · 初始模板（G6 起步，提交 `b0058b0`）

- `DEFAULT_TEMPLATE`（6 件：2 玫瑰 bloom/bud、泥土、道路、围栏、路灯）在 `src/lib/decor.ts`，团队可维护。
- 属性栏加「从模板开始」（confirm 后写入本地草稿，重新生成 id，可撤销）与「放弃修改」（confirm 后重新 GET 服务器布局覆盖草稿）。
- 实测（`test-template.py`）：从模板开始后草稿变为 6 件模板素材；放弃修改后恢复服务器布局；无 pageerror。
- vision 确认（`template-applied.png`）：玫瑰/泥土/道路/围栏/路灯布局自然、无穿模悬空、画面柔和。

**未完成**：旧 localStorage 一次性导入预览、恢复上一已发布版本（需 published 快照）、首次进入的二选一流程。

### Round 4 · 撤销/重做修复 + 视觉工具接入（2026-10-31）

- **撤销/重做修复**：历史从 SpaceApp 的 ref 栈移入 `useDecor`（与 list 同源，`commit` 记录前态、`setAll` 不记录），实测 2 次放置 → 2 次撤销（8→7→6）→ 2 次重做均准确（`test-undo.py`）。提交 `2d1155c`。
- **vision_understand 工具接入**（外部视觉模型，可 Read 本地截图）：
  - `cm-base-desktop.png`：确认星球/温室/书屋/花圃/夜空存在。
  - `cm-place-multi.png`：素材栏分类清晰、玫瑰渲染、泥土边缘沿球面弯曲、栅栏/道路、无悬空穿模。
  - `rose-closeup.png`：玫瑰花瓣多层叠放、自然翻卷、茎叶完整、花托无穿出、无闪烁。
- 视觉证据首次可「看」，G1/G3 从「未验证」提升为「vision 确认（部分）」。
- `sphere-back.png`（旋转约 180°）：vision 确认背面有**连续草地**、建筑/树/石，**无破洞、接缝、倒置或穿帮** → G7 背面通过（极点/接缝仍未逐一验）。

### Round 3 · 数据库持久化闭环（G4/G5 起步，提交 `edaf65e`）

**Schema**：`planet_layouts(id, planet_id, revision, status(draft/published), published_revision, updated_at)` + `planet_layout_items(id, layout_id, kind, x, z, rot, scale, width, length, color, stage, sort_order)`；迁移 `0003_complete_bishop` 已应用（47 表）。

**API**：`GET/PUT /api/planet-layout`、`POST /api/planet-layout/publish`（`authed` + zod）；服务端校验 kind 白名单/数量≤300/数值有限性；`saveDraft` 事务内 `FOR UPDATE` + baseRevision 乐观并发（不匹配 → 409）。

**前端**：创造模式属性栏底部加「保存到服务器 / 发布」+ revision/状态显示；页面加载时 `GET` 服务端布局并 `setAll` 覆盖本地草稿；localStorage 只作本地草稿。

**实测（Playwright，dev server）**
- 放置玫瑰+泥土 → 保存 → 服务器 `revision:1, status:draft, items[rose,soil]`；**清空 localStorage 后刷新 → 从服务器恢复**（`.dsh-tools/test-g4.py`）。
- PUT baseRevision=当前 → `revision:2`；再 PUT 同一旧 baseRevision → **409 conflict**；POST publish → `status:published, publishedRevision:2`；最终 GET 读回 items（`.dsh-tools/test-g5.py`）。
- `tsc --noEmit` exit 0。

**G4 完整证据（补测 `test-g4-paths.py`）**：PUT 5 件（2 玫瑰 scale 1/1.6、泥土 w1.2/l0.9/rot30、围栏、道路 w0.8/l1.4/rot45）→ revision 3；**同上下文 / 退出重登 / 全新浏览器上下文**三条路径 GET 均返回 5 件且参数（kind/x/z/scale/width/length/rot）完全一致；清空 localStorage 后从服务端恢复。→ G4 通过。

**未验证/风险**：保存失败重试、跨账号越权、参观只读 published 未做；视觉仍无图像输入。

### Round 2 · 创造模式前端（2026-10-31）

**已实现（已提交，commit 见 git log）**
- 独立入口：花园工具栏「创造」按钮（不埋在设置页）。
- 素材栏 `CreativePalette`：7 分类（花卉/树木/建筑/围栏/地板/道路/灯具）+ 搜索 + 选中反馈 + 可收起。
- 点选素材 → 进入放置预览（横幅「正在放置 X——点击球面确定，Esc 取消」）→ 点击球面放置（`onPointerUp` + 球面放置层 radius 3.12）。
- 装饰玫瑰 `DecorRose`（复用 Flower3D rose）+ 数据模型新增 `rose/soil/road`，`DecorPlacement` 加 `width/length/stage`。
- 球面贴地 `Surface3D.SphereSurface`：网格顶点按 `capFrame` 投影到球面（土壤/道路随球面弯曲）。
- 放置后自动选中 + 属性面板：比例滑杆 0.5–2.0（体积类）/ 宽长滑杆（surface 类）+ 删除；选中高亮。

**已实测**
- typecheck 通过、单测 34/34。
- Playwright 实测：点「创造」→ 素材栏出现（7 组）；选「玫瑰」→ 横幅出现；点球面 → localStorage 出现 `{kind:'rose',x:0,z:0.35}`；依次放置 玫瑰/泥土/道路/木栅栏 → 4 条记录无 pageerror（`cm-place-multi.png`）。

**未验证/未完成**
- 比例滑杆的运行时更新路径（typecheck 通过，但 Playwright 滑杆操纵测试 flaky，未稳定复现）→ 待补。
- 撤销/重做、吸附/碰撞提示、触摸操作、ESC 取消、素材缩略图/预览图 → 未做。
- 球面地板视觉（是否悬空/穿模/闪烁）→ 无图像输入，未目测。
- 数据库持久化（G4）→ 未开始（当前仍 localStorage）。

### Round 1 · 审查与设计（2026-10-31）

**现状核查（实测）**
- 站点 /space 生产模式运行、demo 登录 200；截图 `cm-base-desktop.png`（1440×900）、`cm-base-mobile.png`（390×844）。
- 装饰入口：埋在 `SettingsPanel.tsx` 的「星球装饰」段（设置长页深处）。
- 装饰数据：`src/lib/decor.ts` 的 `DecorPlacement {id,kind,x,z,rot,scale,color?}`，**仅 localStorage**（KEY `kv-decor`），无 DB。
- 现有 11 种 kind（路灯/灌木/树/花盆/石堆/栅栏/长椅/向日葵/郁金香/雏菊/石头）；**无玫瑰、无土壤/地板、无道路、无建筑类**（建筑是固定 SPOTS）。
- 交互：3D 拖拽已有（`GardenWorld` 的 `onDecorMove`+`pointToCap` 球面拾取）；但设置页里只有按钮式 ←→↑↓/↺↻/＋－/颜色（非实时滑杆、无变换手柄）。
- 无撤销/重做；无区域/表面概念（全是点状物件）；负荷上限 50。

**交互痛点**
1. 无「创造模式」独立入口（埋在设置长页）。
2. 缩放/旋转靠按钮步进，非实时可视化。
3. 无表面类（土壤/道路）且大平面无法贴球面（会悬空/穿入）。
4. 无玫瑰；无撤销重做；不跨设备。

**创造模式状态机（草案）**
- 状态：`browse`(花园浏览) ↔ `edit`(创造模式)。
- `edit` 内子态：`idle`(选中/浏览) → `place-preview`(选中素材+球面放置预览，含有效/无效提示) → `transform`(移动/旋转/缩放，滑杆+数值+手柄)。
- 数据：编辑改动写入**草稿**（内存 + 本地暂存），`PUT 保存草稿` / `POST 发布` 才进 DB；`discard` 放弃并还原最后已发布布局。
- 撤销/重做：草稿操作栈（place/move/rotate/scale/remove 各算一次）。
- 编辑期间不触碰学习状态/知识点/成长证据；离开编辑时若草稿未保存 → 提示。
- 三类对象：系统固定物件（SPOTS/建筑，受约束不遮挡入口）、用户装饰（可编辑）、知识点植物（只读展示，创造模式不改其证据）。

**下一步（Round 2 实现顺序）**
1. 创造模式入口（花园 HUD 一个明确按钮）+ 可收起素材栏（分类/搜索/缩略图）。
2. 装饰玫瑰（复用 Flower3D 的 rose 几何 + 素材栏玫瑰项）。
3. 球面贴地 surface（土壤/道路，顶点按球面投影）+ 实时缩放滑杆。
4. 撤销/重做。
