# B8 · 界面章草稿（真实实现 + 实测数据）

> Owner：B。用于替换/补充 `report-draft.md` §3.6。图号与报告模板**待与 D 对齐**；文中数字均来自本仓库实测（`/dev/garden?perf=1`、`docs/progress-sphere.md`、`.dsh-tools` 截图），非估算。

## 1 视觉方向

温柔、手工绘本、低模微缩世界的统一风格：造型圆润、哑光材质、有材质层次与小细节；一眼可见是一个**可环绕探索的完整星球**，而非只有正面布景的球冠。

**色板（`src/components/world/geo.ts` 的 `C`，实为唯一权威）**

| 角色 | 色值 |
|---|---|
| 暮紫 dusk | `#756B99` · 雾蓝 fog `#9CAFC5` · 浅桃 peach `#F2C9B6` · 奶油白 cream `#FFF7E8` |
| 草绿 grass | `#A8BC91` · 深草 `#7E9A6E` · 亮草 `#C4D3A8` |
| 玫瑰 rose | `#E4A1AA` · 蜂蜜金 honey `#DDB56D` |
| 木 wood | `#B5835C` · 深木 `#8C5F40` · 浅木 `#D4A87C` |
| 屋顶 roof | `#C98478` · 深顶 `#A8665E` · 石材 `#B9B2C9` · 墨色 ink `#3F3657` |

## 2 星球与可探索空间（第一轮交付）

- 几何：`SphereGeometry(3, 160, 120)` + 俯视平面 UV + 1024² 手绘地表（`terrain.ts`）；表面连续、可转到背面/侧面，无空洞与镜像接缝。
- 相机：全周水平环绕（去掉原 ±0.6 rad 限制）；俯仰 `TILT_MIN −0.34 ~ TILT_MAX 0.62`（赤道↔北极）；缩放 0.75–2.2（最大可见整颗星球）。
- 手势：鼠标/触摸拖拽环绕、滚轮/双指捏合缩放、键盘 ←/→ ↑/↓ +/− R 复位；右下角「⟲ 视角」按钮；平滑阻尼；选择花、拖装饰、拖镜头互不冲突；移动端防误触（拖拽 ≥6px 才算）。
- 空闲自转：3 秒无操作后缓慢自转，按下立即暂停、放开 3 秒恢复；低动效禁用。
- 球面布局：花圃/道路/建筑沿表面法线定位（`surfaceFrame` + `OnCap`）；布局只由花圃与植物顺序决定，与数据库旧 lon/lat 无关。

## 3 场景资产（第三轮交付）

程序化原创 + 少量 CC 素材（许可见 `public/assets/CREDITS.md`）：

- **功能入口**：星灯书屋（对话）、资料温室（资料，木框玻璃 + 窗棂）、观星台（背面，共学）、回忆小径（历史）。
- **本会话新增 3 个探索节点**：种子小棚（斜顶 + 双层种子罐架）、花园拱门（半圆拱 + 攀援小花）、小池塘 + 木桥（不透明浅水 + 跨水桥）。
- **氛围**：长椅 + 旅人坐姿、路灯、木牌、云海、远处共学星球、草丛与野花（`InstancedMesh` 一次绘制）。

## 4 植物与花圃（第二轮交付）

- 4 品种 × 5 阶段（种子→嫩芽→生叶→花苞→开花），花瓣/叶片程序化曲面 + 顶点色渐变；阶段由学习证据计算，外观变化不改变学习记录。
- 花圃：木质边框 + 隆起土壤 + 苔藓；单圃环位容量 27–31 株，超出计入 `overflow` 并在界面提示（不产生 NaN / 重叠）；第 8 个花圃起黄金角螺旋外扩。
- 花圃弹层：搜索（知识点/昵称）、每圃株数、空态、溢出提示、**「定位」按钮（点标题把镜头转到该圃）**。
- 布局纯函数单测：`tests/unit/layout.test.ts`（0/1/10/30/50/100 株 × 1/3/7/12 圃，去重/稳定/间距/范围，34 例全过）。

## 5 天空与氛围（第四轮交付）

- 4 主题：暮色（默认）/ 星夜 / 晨雾 / 极光（CSS 变量驱动 + `Sky.tsx`）。
- 星夜：星点三层分档（20/14/6 颗，1px–2.6px，平铺尺寸错开）+ 紫/青/粉极淡星云（`mix-blend-mode: screen`）；只有近层做 9s 呼吸；低动效下静态（实测逐像素相同）。

## 6 界面与交互（第五轮交付）

- 专注浮窗 `.focus`：水平居中、宽 `min(880px, 100vw−48px)`、内容内部滚动；背景为**真实当前星球画面的毛玻璃**（`backdrop-filter: blur(18px)`，对 WebGL canvas 生效），`@supports not` 退回不透明纸面。
- 对话框语义：Esc 关闭、焦点进出与归还、Tab 约束、滚动锁、`role="dialog" aria-modal`；植物档案侧卡用轻量 Esc（不锁 Tab）。
- 移动端：底部抽屉 `height: min(72dvh, calc(100dvh − 132px − safe-area))`（键盘安全区）；实测 390×844 无横向溢出（`scrollWidth == innerWidth`）。
- **低动效降级**：`.reduced-motion` 下关闭全部 `backdrop-filter`（退回 `var(--paper)`），并停止星点动画与空闲自转。
- 降级路径：无 WebGL → `StaticGarden`（SVG 2D，同一套布局）；低动效；空数据。

## 7 性能（实测，非估算）

| 场景（`/dev/garden?perf=1`，SwiftShader） | draw | 三角面 |
|---|---|---|
| n=10（7 株 + 全部建筑 + 池塘木桥，reduced） | **487** | 413,578 |
| n=100 / 3 圃（跨株实例化 + 叶片/静态部件合并后） | **848** | — |

- 瓶颈是 draw call（每株 9–10 个 mesh）；已做：花瓣合并、叶片合并、土丘/茎/叶合并、拾取圆柱/接触阴影 `InstancedMesh`，100 株从 1,320 → 848（−36%）。
- 未测（不在报告标通过）：真实 GPU 帧时间、60 秒内存稳定、真机触屏、backdrop-filter 低端机成本。

## 8 待与 D 对齐

- 图号（如「图 3.6-1 星球全景」「图 3.6-2 花圃弹层」）与排版模板；
- 截图素材：`.dsh-tools/`（`b16-*`、`b3-pond-n10.png`、`space-pond.png`、`locate-after.png` 等）与 `docs/screenshots/ui/` 由团队筛选入正式图。

## 9 创造模式（本轮真实实现，2026-10-31）

**入口与状态**：花园工具栏「创造」按钮独立入口（不埋在设置长页）；状态 `browse ↔ edit`，编辑期不触碰学习状态/知识点/证据；未保存改动只在本地草稿（localStorage 缓存 + 服务端权威）。

**素材栏 `CreativePalette`**：7 分类（花卉/树木/建筑/围栏/地板/道路/灯具）+ 搜索 + 选中反馈 + **花形缩略图**（rose/flower/flower2/flower3/pot 用 `FlowerSvg`）；可收起；手机 390×844 不遮挡星球、无横向溢出。

**放置与编辑**：点素材进入放置预览（横幅 + Esc 取消）→ 点球面放置（半径 3.12 放置层，`onPointerUp`）；对象有稳定 id/kind/球面位置/朝向/尺寸/颜色/阶段；放置后自动选中，属性面板提供**比例滑杆 0.5–2.0**（体积类）、**宽/长/旋转**（surface 类）、玫瑰**五阶段**选择、删除；**撤销/重做**（快照历史在 `useDecor`，多步实测通过）。

**球面贴地**：`SphereSurface` 把 width×length 网格的**每个顶点**按 `capFrame` 投影到球面（+0.02 微高），非切线平面；`tests/unit/surface.test.ts` 断言 20000+ 顶点半径=PLANET_R+lift 且有限，2.4×2.4 四角仍贴球。

**数据库持久化**：`planet_layouts(planet_id, revision, status, published_revision)` + `planet_layout_items`；`GET/PUT /api/planet-layout`、`POST /api/planet-layout/publish`；服务端校验 kind/数值/数量，事务 + revision 乐观并发（旧 revision→409）；保存返回 revision，刷新/重登/跨浏览器上下文可还原；重置清空 localStorage 后仍从服务端恢复。

**模板与兼容**：`DEFAULT_TEMPLATE` +「从模板开始」（确认、可撤销）+「放弃修改」（恢复服务器布局）；旧版本地草稿检测→备份 `kv-decor-backup` + 差异提示（本地 N 件/服务器 M 件）→ 导入或保持，不静默覆盖。

**参观只读**：`/api/planets/[userId]` 返回对方**已发布**布局的 `decor`；`/visit` 只读渲染，无编辑入口。

**完整球体**：四方位（0/90/180/270°）连续地表 + 景物；空闲慢转（按下暂停/释放 3 秒恢复/编辑浮窗/低动效不自转）。

**视觉证据**（本仓库实测）：`docs/creative-mode-acceptance.md` 附 G1–G12 表与截图索引（`rose-{seed,sprout,leaf,bud,bloom}.png`、`dir-{0,90,180,270}.png`、`visit-demo.png`、`g3-pole.png`、`b6-{desktop,mobile,static,lowmotion}.png` 等）。
