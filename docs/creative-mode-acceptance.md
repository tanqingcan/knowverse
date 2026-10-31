# 创造模式与完整星球 · 验收跟踪（G1–G12）

> 目标：把「只有正面球冠布景」扩展为可全周探索的完整球体，并新增「创造模式」让用户亲手布置初始星球（围栏/土壤/道路/植物/建筑），确认后保存到数据库。建模与空间体验最高优先级。
> 状态标记：⬜ 未开始 · 🟡 进行中 · 🟢 通过（证据齐全）· ⛔ 阻塞（精确原因）· ⚠️ 未验证（需 image-capable/真机）。

## 基线（2026-10-31 21:31）

- 分支 `feature/b-visual`，HEAD `e1e339b`，工作区干净；无 `AGENTS.md`。
- 站点 3000 端口在线（生产模式 `next start`），PostgreSQL 5432 在线。

## 验收表

| # | 状态 | 版本/commit | 复现步骤 | 证据路径 |
|---|---|---|---|---|
| G1 选材与玫瑰 | 🟡 进行中 | 入口+素材栏(7分类+搜索+5 花形缩略图)+玫瑰放置+五阶段；**五阶段截图齐全（seed/sprout/leaf/bud/bloom）+ vision 确认：开花多层花瓣/深玫瑰红到粉渐变/茎叶完整/无穿模闪烁；花苞像未开放花蕾带花萼**；缺入口录屏 | Round 2-11 | `rose-{seed,sprout,leaf,bud,bloom}.png` + vision |
| G2 实时编辑 | 🟡 进行中 | **比例滑杆 min0.5/max2.0/step0.05 实测**（10 次 ArrowRight → 1.0→1.5）；**一次拖动=一次撤销**（400ms 合并，一次撤销回 1.0）；多步撤销/重做 8→7→6；手机 touch 放置；缺「手机端滑杆拖动」逐帧记录 | Round 2/3/14/16 | `test-g2-slider.py`、`test-g2-dragundo.py`、`test-undo.py`、`test-touch.py` |
| G3 球面地板 | 🟡 进行中 | SphereSurface 实现；**自动检查 20000+ 顶点半径=PLANET_R+lift 且有限**；vision：正面泥土沿球面弯曲、**极点附近地表连续无破洞/泥土贴地无悬空/无倒置**；侧面视角 vision 判读歧义待复核 | Round 2-9 | `tests/unit/surface.test.ts`、`g3-front.png`、`g3-pole.png` |
| G4 数据库闭环 | 🟢 通过 | 2 玫瑰(scale 1/1.6)+泥土(w1.2 l0.9 rot30)+围栏+道路 → PUT rev3 → 同上下文/重登/新浏览器上下文均恢复 5 件且参数一致；清 localStorage 后从服务端恢复 | 见 Round 3 | `.dsh-tools/test-g4.py`、`test-g4-paths.py` |
| G5 异常/权限/并发 | 🟢 通过 | 旧 revision→409；**保存失败保留草稿（7 件不减）+ 重试成功（revision 5）**；跨账号隔离（xingye 布局空 vs demo 已发布）；参观只读已发布（vision 确认只读无编辑）；写接口均按 session user.id 作用域 | Round 3/6/7 | `test-g5.py`、`test-visit.py`、`test-save-fail.py`、`visit-demo.png` |
| G6 模板与兼容 | 🟢 通过 | 默认模板 +「从模板开始」+「放弃修改」；旧版导入（备份+差异提示+选择）；**首次二选一（ahe 新账号实测弹出并套模板 6 件）**；**恢复已发布版本（published_items 快照，3 件草稿→revert 回 2 件已发布）**；**布局保存不改学习数据（plants/gardens/natal 前后一致）** | Round 5/10/15 | `test-template.py`、`test-import.py`、`test-first.py`、`test-revert.py`、`test-learning-unchanged.py` |
| G7 完整球体 | 🟡 进行中 | 全周环绕/复位；**四方位截图（0/90/180/270°）vision 均确认连续地表+景物+无破洞接缝**；空闲慢转：按下暂停（28.8→0.76）、释放 3 秒恢复、编辑/低动效不转 | Round 4/8/11 | `dir-{0,90,180,270}.png`、`test-rotate.py` |
| G8 模型扩展 | 🟡 进行中 | B1 五类修复 + 3 建筑（前序会话）；**vision 确认温室屋顶完整/小木屋/池塘+木桥均贴球无穿模、风格协调**；玫瑰五阶段近景；**资产清单见 `public/assets/CREDITS.md`（9 件 CC-BY/CC0 含三角面/来源）**；「修改前后图」依赖前序会话存档、本轮未重制 | Round 11/14 | `b6-desktop.png`、`equator-pond.png`、`public/assets/CREDITS.md` |
| G9 容量 | 🟡 进行中 | 布局单测 28 例（0/1/10/30/50/100 × 1/3/7/12 圃）；**浏览器压力（/dev/garden?n=N&g=3 隔离数据）：N=1/10/30/50/100 实际渲染数=预期、g=3、坐标有限、tri 413k→617k**；搜索定位沿用 B4 已验证实现 | Round 13 | `tests/unit/layout.test.ts`、`test-g9.py` |
| G10 天空与 UI | 🟡 进行中 | 深色星空（vision）；390/768/1440 无横向溢出；创造模式 Esc 逐级退出；设置弹窗键盘路径（焦点进入/Tab×6 窗内/Esc 归还/滚动锁）；**专注浮窗：宽 880 居中、`backdrop-filter: blur(18px) saturate(1.08)` 实测 + vision 确认背后星球模糊可见、内容可读无溢出** | Round 5/8/13/16 | `test-g10*.py`、`g10-focus-blur.png` |
| G11 性能与回归 | 🟡 进行中 | 本机（headless Chromium + **SwiftShader 软件渲染，无 GPU**）60s×30 采样：draw 297、tri 453k、**FPS 1–2**；10 次进/出编辑+缩放后 geometries 158、textures 12 **恒定不累积**；GPU 60fps / 软件 ≥12fps 目标本环境**未达标（软件渲染）**，按规则标未验证 | Round 9/10 | `test-g11.py` |
| G12 构建与交付 | 🟢 通过 | typecheck 0 / **build 41/41（含新增 revert 路由）** / 单测 36/36；/space、/visit 无 pageerror；B6 四组截图（vision 确认静态降级 2D 绘本）；B8 界面章 §9 创造模式 | Round 6/12/15 | `b6-*.png`、`docs/b8-ui-chapter.md` §9 |

## 每轮记录

### Round 8 · Esc 退出 + 空闲慢转 + 768 平板（G7/G10，提交 `e8e13dd`/`2823e06`）

- 创造模式 Esc 逐级退出：取消放置（`.cp-placing` 1→0）→ 收起素材栏（1→0）；实测 `test-g10.py`。
- 768×1024：无横向溢出（`scrollWidth > clientWidth` = false），vision 确认「创造」按钮可见可点、星球正常。
- 空闲慢转（`Rig`）：garden + 非低动效 + 无 `paused` + 非按下时，`drag.yaw += dt*0.03`；指针按下记录 `pressing` 暂停，释放 3 秒后恢复。
- 像素差分实测（`test-rotate.py`）：空闲 4.5 秒 **diff=28.8**（在转）；按住 4 秒 **diff=0.76**（停了，残差为呼吸/高光微动）。
- `paused = creativeOpen || panel != null || introPlaying`，编辑与浮窗期间不自转。

### Round 9 · 低动效不自转 + 极点视角（G7/G3）

- 低动效：`reduced_motion="reduce"` 上下文下空闲 4.5 秒像素差分 **0.495**（vs 正常 28.8）→ **不自转**（`test-reduced.py`）。
- 极点：镜头抬到极点附近（`g3-pole.png`），vision 确认**地表连续无破洞/缝隙/黑洞**、泥土块**紧贴地面无悬空穿透**、无倒置漂浮 → G3 极点通过。

### Round 10 · 性能采样（G11）

- `PerfProbe` 常开，写 `window.__gardenPerf = {fps, calls, triangles, geometries, textures, programs}`。
- 设备/参数：Windows + headless Chromium + `--use-gl=angle --use-angle=swiftshader`（**软件渲染，无 GPU**），1440×900，demo 数据。
- 60 秒静置 × 30 采样（每 2s）：**FPS 1.1（1–2）、draw 297（284–308）、tri 453k（449k–456k）**。
- 10 次进入/退出编辑 + 滚轮缩放：geometries **158→158**、textures **12→12**，**无单调累积**；无 pageerror。
- 结论：资源回归通过；**GPU 60fps / 软件 ≥12fps 的目标在本软件渲染环境不达标**，按「无法测的设备标未验证」处理，不美化。

**未验证**：接缝（世界旋转 360° 一周的接缝）未单独测；侧面视角仍为 vision 判读歧义。

### Round 14 · 模型多角度（G8）

- `equator-view.py` 把镜头下压到赤道附近：vision 确认**圆形小池塘 + 木桥跨越其上、周围有花草、物件与球面贴合无悬空穿模**；同视角可见亭状小建筑与围栏。
- `b6-desktop.png`：vision 确认**温室（透明玻璃+内部植物）、小木屋（棕色屋顶/圆窗）、草丛茂盛、屋顶完整、无悬空穿模、风格协调**。
- 资产清单：`public/assets/CREDITS.md` 已列 9 件外部素材（作者/许可/三角面/来源），程序化建筑为原创。

### Round 16 · 滑杆/撤销合并 + 浮窗毛玻璃（G2/G10）

- **比例滑杆范围实测**（`test-g2-slider.py`）：`min=0.5 / max=2 / step=0.05`，10 次 ArrowRight → scale 1.0→1.5；满足「至少覆盖 0.5～2.0」。
- **一次拖动=一次撤销**（`test-g2-dragundo.py`）：`update` 在 400ms 内合并历史，10 连按后**一次撤销直接回到 1.0**。
- **专注浮窗毛玻璃**（`g10-blur.py`）：`main.focus` 计算样式 `backdrop-filter: blur(18px) saturate(1.08)`、`background: rgba(255,247,232,0.86)`、宽 880 居中；vision 确认「浮窗水平居中、背后是被模糊处理的星球画面、内容可读、无横向溢出」。

### Round 15 · G6 收口（恢复已发布 + 首次二选一）

- **迁移 `0004_fancy_changeling`**：`planet_layouts.published_items jsonb`（发布时固化快照）。
- `publishLayout` 发布时写快照；新增 `POST /api/planet-layout/revert` 用快照替换草稿（revision+1）。
- 实测（`test-revert.py`）：发布 2 件（rev6）→ 改 3 件草稿（rev7）→ revert → 回到 2 件 `[rose, soil]`（rev8, draft, hasPublished true）。
- 首次二选一（`test-first.py`）：ahe 新账号（revision 0、草稿空）打开创造 → 提示「保持默认 / 从模板开始创造」→ 点模板后草稿变 6 件模板素材。
- 学习数据不被布局影响（`test-learning-unchanged.py`）：布局保存前后 `/api/space` 的 plants 7 / gardens 2 / natal id 完全一致。

### Round 14 · 手机触摸（G2）

- 移动端上下文（390×844、`has_touch`、`is_mobile`）：**tap** 工具栏「创造」→素材栏出现；**tap**「玫瑰」→放置横幅出现；**tap** 球面 → localStorage 新增该玫瑰（`kind:'rose', x:0, z:0.348`），无 pageerror。触摸放置链路走通（渲染用同一 `onPointerUp`）。

### Round 13 · 容量压力（G9）

- `/dev/garden?n=N&g=3` 是**隔离压力数据**（不碰真实账号）；页面暴露 `window.__devPlants = {n, g, allFinite}`。
- 实测：N=1/10/30/50/100 → 渲染植物数分别为 1/10/30/50/100、花园数 3、`allFinite=true`；triangles 从 413k 单调升到 617k（符合数据量）。N=0 时该页回退默认 7 株（0 株由 `layout.test.ts` 单测覆盖）。
- 搜索/定位沿用 B4 已验证实现（点击花朵/列表打开对应 plantId 档案）。

### Round 13 · 键盘可达性（G10）

- `test-g10-keys.py`：打开设置弹窗 → **焦点自动进入窗内**；连按 Tab×6 **焦点始终在窗内**（`useDialog` 焦点陷阱）；按 Esc → 弹窗关闭、**焦点归还「设置」按钮**、`body.overflow` 恢复（滚动锁释放）；无 pageerror。
- 浮窗背景：`.focus` 使用 `backdrop-filter: blur(18px) saturate(1.08)`，并有 `@supports not` 回退为不透明纸面（CSS 层已实现）。

### Round 12 · B6 四组截图 + B8 章节（G12 通过）

- `docs/screenshots/b6-{desktop,mobile,static,lowmotion}.png`：桌面 1440×900、手机 390×844、**静态降级（--disable-webgl，canvas=0 → StaticGarden 2D 绘本）**、低动效（reduced_motion）。
- vision 确认静态降级画面为 2D 绘本风格星球/花园（有花圃植物、正常界面，非空白/报错）。
- `docs/b8-ui-chapter.md` 新增 §9「创造模式」：入口/素材栏/放置与编辑/球面贴地/数据库持久化/模板兼容/参观只读/完整球体/视觉证据索引。
- 加上 Round 6 的 tsc 0 / build 40/40 / 单测 36/36 / 无 pageerror → **G12 通过**。

### Round 11 · 玫瑰五阶段 + 四方位图（G1/G7）

- `rose-stages.py` 放大后依次切换五阶段截图 `rose-{seed,sprout,leaf,bud,bloom}.png`。
- vision（bloom）：多层花瓣、深玫瑰红→粉渐变、茎叶完整、无闪烁/花托穿出、**「像孤独小星球上的珍贵玫瑰」**；（bud）：未开放花蕾造型、有花萼/叶片包裹、茎完整、无穿模。
- `four-dir.py` 水平拖动依次取 0/90/180/270° 四张：vision 判定 90° 与 270° 均为**连续地表 + 建筑/树/花圃景物 + 无破洞接缝倒置**；配合 Round 4 的背面图，四方位齐。

### Round 10 · 旧版本地草稿导入（G6）

- 加载时若服务端已有布局且 `kv-decor` 与服务器不同：先把旧草稿写入 `kv-decor-backup`，再以服务器布局为准渲染，并弹出一次性提示（本地 N 件 / 服务器 M 件，导入本地 / 保持服务器）——**不静默覆盖**。
- 实测（`test-import.py`）：写入 1 件旧版路灯草稿 → 刷新 → 提示「检测到本地旧版草稿 1 件（已备份），服务器布局 7 件」；`kv-decor-backup` 存在；点「导入本地」后草稿变为该路灯；无 pageerror。

### Round 7 · 保存失败重试 + G3 自动检查（2026-10-31）

- `tests/unit/surface.test.ts`（新增，2 例）：对 `SphereSurface` 生成网格的全部顶点（4 组中心 × 3 尺寸 × 5 角度 × 15×15 采样，>20000 点）断言 `|半径-(PLANET_R+lift)| < 2e-3` 且有限；2.4×2.4 最大面积四角仍贴球。36/36 通过。**这是比目视更硬的 G3 证据。**
- 侧面视角截图 `g3-side.png`：vision 判读「泥土平面悬空」，与正面判读（「沿球面弯曲」）矛盾；结合数值检查判断为**边缘透视缩短导致的视觉误判**，但极点/接缝仍需更低视角复核。

### Round 7 · 保存失败重试（G5 收口，2026-10-31）

- `test-save-fail.py` 用 Playwright `page.route` 把 `PUT /api/planet-layout` 模拟成 500：点保存 → 提示「保存失败：模拟服务器故障」，**本地草稿仍 7 件（未丢）**；解除拦截后重试 → 「已保存到服务器（revision 5）」。
- G5 四项（409 冲突 / 失败保留+重试 / 跨账号隔离 / 参观只读）全部有实测证据 → 标记通过。
- 环境修复：`npm run build` 会用生产产物覆盖 `.next`，导致 dev server 客户端 chunk 失效（创造按钮不出）；已删除 `.next` 并重启 dev server 恢复正常。

### Round 6 · 参观只读 + 跨账号隔离（G5，提交 `0e61599`）

- `server/planets.ts` 的 `publicPlanet` 增加 `decor`：仅当对方**已发布**（status=published）且 share_planet 打开时返回布局 items。
- `/visit` 页把 `decor` 传给 GardenWorld（`readOnly`），只读渲染对方已发布装饰。
- 实测（`test-visit.py`）：demo 发布（revision 4）→ xingye 登录 GET `/api/planets/<demoId>` → **decor 6 件**（rose/rose/soil/fence/road/rose）；xingye 自己的 `/api/planet-layout` 为 revision 0、items []（**账号隔离**）。
- vision 确认 `visit-demo.png`：玫瑰/泥土/道路/围栏可见、明确标注只读、无编辑按钮。

**G12 构建**：`npm run build` → `✓ Compiled successfully in 6.7s` + `✓ Generating static pages (40/40)`，exit 0；`tsc --noEmit` 0；`vitest` 34/34；`/space` 与 `/visit` 实测均无 pageerror。

**未验证**：保存失败重试（模拟断网）、恢复已发布快照；B6 四组截图/B8 界面章未更新。

### Round 5 · 初始模板（G6 起步，提交 `b0058b0`）

- `DEFAULT_TEMPLATE`（6 件：2 玫瑰 bloom/bud、泥土、道路、围栏、路灯）在 `src/lib/decor.ts`，团队可维护。
- 属性栏加「从模板开始」（confirm 后写入本地草稿，重新生成 id，可撤销）与「放弃修改」（confirm 后重新 GET 服务器布局覆盖草稿）。
- 实测（`test-template.py`）：从模板开始后草稿变为 6 件模板素材；放弃修改后恢复服务器布局；无 pageerror。
- vision 确认（`template-applied.png`）：玫瑰/泥土/道路/围栏/路灯布局自然、无穿模悬空、画面柔和。

**同轮补充**
- G1 缩略图：素材栏花卉类渲染真实花形 SVG（rose/flower/flower2/flower3/pot，共 5 个），其余为色点；实测 DOM `svg thumbs: 5`，vision 确认缩略图存在（`2c586bb`）。
- G10 手机：390×844 创造模式可打开素材栏、无横向溢出（`document.scrollWidth > clientWidth` = false），vision 确认素材栏不遮挡星球、文字按钮清晰（`cm-mobile-creative.png`）。

**未完成**：旧 localStorage 一次性导入预览、恢复上一已发布版本（需 published 快照）、首次进入的二选一流程；768/低动效/Esc-Tab 未验。

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
