# 家园模式 v3 · 续作说明与交付索引（H59）

> 生成时间：2026-11-01 · 分支 `feature/b-visual` · HEAD `8275ebf` · 工作区干净
> 本文件是「下一轮从哪继续」的唯一入口：含环境事实、准确命令、分阶段进度、证据索引与**未完成/未验证清单**。

## 一、当前状态（一句话）

H01–H58 **全部双轮通过**；H59（本文件）与 H60（60 项最终审计）为最后两项。**尚未宣布整体完成**。

## 二、环境事实（换机器/换会话先核对）

| 项 | 值 |
|---|---|
| 仓库 | `C:\Users\Precious\Desktop\数据库大作业\knowverse` |
| 分支 / HEAD | `feature/b-visual` / `8275ebf` |
| 数据/证据脚本目录 | `C:\Users\Precious\Desktop\数据库大作业\.dsh-tools\`（231 个 .py） |
| 数据库 | PostgreSQL 16，`C:\Users\Precious\Desktop\数据库大作业\.pg16\pgsql\bin`，库 `knowverse`，data `.pgdata` |
| 演示账号 | `POST /api/auth/demo` body `{"account":"demo"}`；另有 `fresh`（该账号当前**没有星球**，访问布局返回 404） |
| dev server | `npm run dev`（端口 3000）——**注意：跑过 `npm run build` 后必须删 `.next` 再起 dev**，否则 `/space` 与 API 全 500 |
| 生产验证 | `npm run build` 已通过（41/41 静态页）；生产进程当前**未常驻** |
| 测试 | `npx vitest run --config vitest.unit.config.ts`（7 files / 68 tests） |

## 三、准确续作命令

```powershell
# 0) 进仓库
Set-Location "C:\Users\Precious\Desktop\数据库大作业\knowverse"

# 1) 数据库（已迁移到 0008；新机器/新库才需要）
npm run db:migrate

# 2) 类型 + 单测（任意轮次的安全网）
npm run typecheck
npx vitest run --config vitest.unit.config.ts

# 3) 起 dev（改过 build 之后必须先删 .next）
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run dev        # 后台跑，等 http://127.0.0.1:3000/space 返回 200

# 4) 复跑某条端到端证据（示例）
$env:PYTHONIOENCODING="utf-8"
python "C:\Users\Precious\Desktop\数据库大作业\.dsh-tools\h57-flows.py" tablet   # 只跑平板档
python "C:\Users\Precious\Desktop\数据库大作业\.dsh-tools\h58-audit.py"          # 验收表机器核对（应为「总缺失: 0」）
python "C:\Users\Precious\Desktop\数据库大作业\.dsh-tools\h51-final.py"          # 六类对象 DB 恢复
python "C:\Users\Precious\Desktop\数据库大作业\.dsh-tools\h53-api.py"            # 接口安全 7 类非法参数
```

> 所有 e2e 脚本都用 Playwright Python + `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`（headless 软渲染，FPS 低是正常的，不代表产品帧率）。

## 四、分阶段进度（每阶段都已落 commit）

| 阶段 | 内容 | 状态 | 收口 commit |
|---|---|---|---|
| 一 | H01–H15 全场景对象编辑 | ✅ 双轮通过 | 见 `docs/home-mode-v3/H01..H15.md` |
| 二 | H16–H27 沉浸式底部操作栏 | ✅ 双轮通过 | `4a9bb6f`（H26+H27 收口） |
| 三 | H28–H38 独立 DIY 工作台 | ✅ 双轮通过 | `f5c4304`（H38 四证据收口） |
| 四 | H39–H50 轻量学习窗 | ✅ 双轮通过 | `1007513`（H48+H49+H50 收口） |
| 五 | H51–H60 持久化与整体验收 | 🟡 H51–H58 通过 | `8275ebf`（H58 表核对） |

### 关键提交（近 25 条）

```
8275ebf feat(v3): H58 双轮通过——60 行验收表机器核对(h58-audit.py 解析证据路径并 exists 校验)；修 H02 glob 证据与 H58 错误路径；二次核对缺失=0
dbfbf70 feat(v3): H57 双轮通过——三档 1440x900/768x1024/390x844 各 10 步全流程全部通过(创造/选建筑/移动/复制/DIY/发布/退出/学习窗/刷新还原/无pageerror)
8451d4b feat(v3): H56 双轮通过——新增17条单测(迁移/复制独立性/保存还原/分区校验/变体)；修 saveVariant 不校验颜色；typecheck 0 + build 成功 + 68 tests passed
29e34e4 feat(v3): H55 双轮通过——同设备同画质基线采样+20次操作+静置60s；静置期 geometries/textures 零增长(no_monotonic_leak=true)
391d886 feat(v3): H54 双轮通过——/space、/visit、/dev/garden 三路径无 pageerror/NaN；静态降级成立；纯闲置与创造闲置各 12s PUT=0（无保存循环）
80a0b57 feat(v3): H53 双轮通过——7类非法参数全400、冲突409不覆盖、匿名401、越权404隔离、草稿/发布状态区分；离线保存保草稿+在线重试成功
f1652d8 feat(v3): H52 双轮通过——复制独立 ID+undo/redo准确；新增 layout schema_version(迁移0008) 修「删光建筑被默认常量补回」
161997c feat(v3): H51 双轮通过——六类对象从 DB 恢复(搬走小屋 0.92->1.45/复制 3->4/DIY配色/玫瑰/泥土/围栏)；刷新与独立上下文 26 项签名完全一致；修颜色大小写归一
1007513 feat(v3): H48+H49+H50 双轮通过——星球不重建(probe恒定)+草稿跨开关保留；长SQL横向滚动不撑窗(480不变)；4张截图+星落录屏+面积对照；第四组 H39-H50 收口
04d04ef feat(v3): H46+H47 双轮通过——对比度全部>=4.5(次要文字3.59->5.37,alpha .9,不虚化整颗星球)；修复 useDialog 传面板态致焦点/Tab 陷阱全失效
1a52f7f feat(v3): H43+H44+H45 双轮通过——星落动画(700ms/1星3光点/柔光消散)+可取消+低动效立即开窗+窗口延后展开
5eb0e5f feat(v3): H40 双轮通过——学习窗放大/专注模式(880x620)+关闭复位+手机底部sheet；修复移动端 transform 未重置导致错位
052c4b0 feat(v3): H41+H42 双轮通过——学习窗内容重构(会话历史默认折叠/正文15px/控件全44px/输入框固定窗底/关闭按钮)；H39 回补复审通过
a94805d feat(v3): H39 第一遍——实测 A0(880x800=704000px2/54.32%)，学习窗收成居中浮窗 480x380=25.9% A0；内容重构转 H41/H42
f5c4304 feat(v3): H38 双轮通过——四张证据齐全(玫瑰花瓣叶/房屋顶墙/复制品 #d81b60 vs #00bcd4/保存刷新有序parts一致)；第三组 H28-H38 收口
05e595a feat(v3): H37 双轮通过——手机 DIY 纵向布局 + 全部控件 44px(16->0)；H38 部分证据(玫瑰/房屋 data+vision 双证，复制品与刷新对比待重做)
10a1aab feat(v3): H35+H36 双轮通过——装饰花外观阶段(知识植物不可伪造)；工作台捕获阶段 Esc/Tab 焦点陷阱+三处快捷键守卫(修 deps 缺 diyTarget 的闭包 bug)
2bf813a feat(v3): H34 双轮通过——parts 入 DB(jsonb+迁移0007)+服务端校验部位/颜色；修复 zod 剥离 parts 导致保存丢失与校验失效
8576c91 feat(v3): H32+H33 双轮通过——DIY 素材变体(按kind存/新放置复用不改同类)；复制带 parts、逐实例独立无串色
1c636b1 feat(v3): H30+H31 双轮通过——即时预览/6套预设/自定义/单部位恢复/当前部位显示；应用只改目标、取消不写、一次撤销回滚
16d5c36 feat(v3): H29 双轮通过——拆分花茎/叶片独立材质 + 向日葵花心标记 + 分区收敛为真实部位；H28 回补复审通过(DIY 闭环)
9f23631 feat(v3): H29 部分实现——PartTint 按部位上色 + Cottage 4 分区标记(视觉验证屋顶红/墙面白)；花的心/茎与其它房屋待补
3326a03 feat(v3): H28 第一遍——独立 DIY 工作台(大预览/分区/6套预设/自定义/恢复/应用取消)；parts 已入库，模型分区渲染留给 H29
4a9bb6f feat(v3): H26+H27 双轮通过——退出恢复(topnav/hud 回归、选择清空、无窗口被开) + 编辑 UI 面积实测 桌面5.99%/手机19.99%；第二组 H16-H27 收口
3ebef45 feat(v3): H25 双轮通过——退出未保存三选一(保存并退出/放弃本轮/继续编辑)；脏判定用 decorRef 修 Esc 闭包问题
d1cc5d0 feat(v3): H23+H24 双轮通过——pointer 不穿透/拖拽不误触(两档取证)；手机槽位 48x56 可横滑 + 安全区
8cf7126 feat(v3): H22 双轮通过——选中操作条 6 按钮(移动/旋转/缩放/复制/DIY/删除)+232px 紧凑属性浮层(不重开大侧栏)
a1a5ab9 feat(v3): H21 双轮通过——半透明放置预览(ghost)+连续放置开关+成功反馈消息；单次15->16/连续16->18实测
022c346 feat(v3): H20 双轮通过——槽位放入/替换/清空 + 个人配置持久化(存 kind 不存实例 ID，刷新保持)
d3695e7 feat(v3): H18+H19 双轮通过——1-9 切槽/E 开全量库/Esc 逐层；修复 React onWheel 下滚轮串扰(改原生非 passive 监听)
2e84d55 feat(v3): H16+H17 双轮通过——创造模式隐藏原顶栏/HUD、新增底部居中 9 槽快捷栏(编辑 UI 仅占 5.66%)
242daa3 feat(v3): H15 双轮通过——静态绘本/参观用 homePoses 同份布局(不再画在 SPOTS 固定位)+ home-poses 4 例单测；第一组 H01-H15 收口
51dcfb7 fix(v3): H14 双轮通过——修复保存建筑/群组整单失败(server VALID_KINDS 与 schema 同步)；加载失败保留草稿并 toast 提示
414e6c3 feat(v3): H13 双轮通过——删除后可撤销恢复(修复模板预览文案列出明细)；隐藏未实现如实记录
2b4c329 feat(v3): H12 双轮通过——起手快照+结束提交实现「一次拖动=一步撤销」(实测 1.6s 长拖动一次撤销完全还原)；空变换不占步
6c027f2 fix(v3): H11 双轮通过——用探针定位相机漂移真凶(空闲慢转未在对象拖动期间抑制)，修后拖动 yaw 完全不变、释放后恢复
8c9b881 feat(v3): H11 第一遍+部分第二遍——位置X/Z 数值滑杆；审查发现拖动期间相机仍漂移1.4度(未修)，状态=第二遍待审
eec096d feat(v3): H10 双轮通过——球面几何数值测试(5例:半径恒=PLANET_R/法线朝外/360°方位/lift) + 家具按纬度衰减竖直避免赤道穿插
32f81fe feat(v3): H09 双轮通过——homePoses/doorOf 让门口/小路/地表印迹/星灯停靠随建筑变换；修复地表重绘纹理泄漏(textures 12->20, 修后 delta 0)
afc2a08 fix(v3): H08 双轮通过——修复浏览模式点建筑模型误进编辑器(改按 isBld&&!editing 分流)；复制品共享同一业务入口已实测
```

## 五、证据索引（按类型）

| 类型 | 位置 |
|---|---|
| 60 项总表 | `docs/home-mode-v3-acceptance.md`（机器核对：`.dsh-tools/h58-audit.py` → 缺失 0） |
| 逐项记录 H01–H58 | `docs/home-mode-v3/H01.md` … `H58.md`（58 个） |
| 参考学习报告 | `docs/home-editor-references.md`（three Editor.js / drei TransformControls / drei PivotControls / KolyaVol / minecraft-clone，含许可与未采用理由） |
| 单测 | `tests/unit/*.test.ts`（geo/layout/surface/home-catalog/home-poses/sphere-reach/home-mode-v3 = 68 tests） |
| e2e 与截图 | `.dsh-tools/`（`h*.py`、`h*.png`、`h*.json`；含 `h50-video/*.webm` 星落录屏、`h39-a0.json` A0 对照） |
| 数据库迁移 | `drizzle/0005`~`0008`（建筑 kind 约束、群组、parts jsonb、layout schema_version） |

## 六、未完成 / 未验证 / 已知遗留（**不要当成已完成**）

1. **「隐藏」功能未实现**：H13 要求「删除/隐藏可恢复」，当前只有删除（可撤销），没有独立「隐藏」状态。
2. **静态视图不逐件渲染用户摆放的装饰**：H15 已记录——`StaticGarden` 支持建筑/路灯/长椅/木牌/停靠点，但用户新增的任意装饰在静态视图属「尚不支持的资产」，不逐件绘制。
3. **旅人路径仍用固定 `MEMORY_PATH`**：H09 记录，未随建筑变换重建。
4. **删除建筑后地表印迹/道路回落到 SPOTS 位置**：H09/H13 记录（回链）。
5. **手机软键盘、中文输入法组合态**：H37/H47 记录，桌面 Chromium 无法真实模拟。
6. **「其他账号」权限用例是间接证据**：H53——`fresh` 账号没有星球，只能以「越权 404 + demo 数据未受影响」佐证。
7. **1280×720 下学习窗占本地 A0 的 33.4%**：H39 记录，略高于 1/3；A0 判据以 1440×900 为准（25.9%）。
8. **FPS 指标只有软件 GL 口径**（0–2fps，SwiftShader）；真 GPU headed 约 130fps 为历史观察，本轮未重复采样。
9. **GLB 资产路径**：公共 GLB 未逐一在浏览器验证 404（H54 只统计到 1 个 chassis chunk 的 `ERR_ABORTED`，非模型 404）。
10. **密度滑杆每次拖动都会重算 scatter**（H04 记录为性能风险，未优化）。

## 七、下一轮从这里继续（H60）

```powershell
# 1) 复核底座仍然绿
npm run typecheck
npx vitest run --config vitest.unit.config.ts
python "C:\Users\Precious\Desktop\数据库大作业\.dsh-tools\h58-audit.py"   # 期望：总缺失: 0

# 2) H60 第一遍审计：逐条读 docs/home-mode-v3/H01..H58.md，
#    检查「案例研究 / 第一遍 / 审查缺陷 / 第二遍修订 / 复审」五段是否齐全、第二遍是否实质（有文件+证据差异）
# 3) 补齐审计发现的漏项（只补证据与记录，不改验收门槛）
# 4) H60 第二遍审计：60 项全部双轮通过 → 才可宣布整体完成
```

**停止条件**：仅当 H01–H60 全部「双轮通过」且总表机器核对缺失 0、typecheck/build/68 单测全绿、三档全流程通过时，才宣布完成。**不得**通过删功能、缩规模或降低门槛把失败变通过。
