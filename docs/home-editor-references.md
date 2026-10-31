# 家园模式 v3 · 编辑器参考研究（H01–H60 共用）

> 环境说明（2026-11-01 实测）：`web_fetch` 工具因安全策略拒绝非公网 IP（本机走代理，github.com 解析为 198.18.0.175），**但 PowerShell `Invoke-WebRequest` 可正常访问 GitHub**（HTTPS 200）。以下均为**已下载并阅读的真实源码**，保存在 `.dsh-tools/refs/`，版本与 commit 见各条。

## A. three.js 官方编辑器 `Editor.js`（已读源码）

- **仓库/版本**：`mrdoob/three.js` @ `dev` 分支，文件 `editor/js/Editor.js`（18,198 B），抓取日期 2026-11-01。
- **许可**：MIT（three.js 项目；已核对本机 `node_modules/three/LICENSE`）。
- **已读位置与结论**：
  - `import { History as _History } from './History.js'`（L5）；`this.signals = { objectSelected, objectAdded, objectFocused, sceneGraphChanged, transformModeChanged, snapChanged, spaceChanged, historyChanged, ... }`（L20–88）——**编辑器用 Signal 事件总线解耦** 选择/场景图/变换模式/历史。
  - `this.history = new _History(this)`（L105）；`history.execute(cmd, optionalName)`（L830）、`history.undo()`（L836）、`history.redo()`（L842）、`history.toJSON()/fromJSON()`（L769/L814）、`history.clear()`（L698）——**命令模式 + 可序列化历史**。
  - 场景变更统一走 `signals.objectAdded / sceneGraphChanged`，UI 只订阅信号。
- **本项目适配**：布局对象 ≤300，采用「**快照式历史**」替代命令对象（更简单可审计，已有 `useDecor` history 栈可直接扩展）；**历史可序列化**这点采纳（H13/H14 回滚版本、H51 恢复）。选择/属性/持久化通过 React state + 已有 props 传递，不引入 Signal 库。
- **未采用**：不整库搬 `History.js`（其命令对象依赖编辑器内部 Editor 实例）；不引入 `signals` 依赖。

## B. drei `TransformControls.tsx`（已读源码）

- **仓库/版本**：`pmndrs/drei` @ `master`，`src/core/TransformControls.tsx`（5,678 B），抓取日期 2026-11-01。
- **许可**：MIT（drei 项目）。
- **已读位置与结论**：
  - 包 `three-stdlib` 的 `TransformControlsImpl`，用 `React.useMemo(() => new TransformControlsImpl(camera, domElement))` 建实例（L73–76）。
  - **相机暂停的关键写法**（L88–93）：
    ```ts
    controls.addEventListener('dragging-changed', (event) => (defaultControls.enabled = !event.value))
    ```
    即变换开始时把默认相机控制器 `enabled=false`，结束时恢复——正是 H11「变换期间相机暂停」的干净实现。
  - `attach(object)` / `detach()` 在 `useLayoutEffect` 里随选中对象切换（L78–85）。
  - `onMouseDown / onMouseUp / onObjectChange / onChange` 四个独立回调（L35–39、L108–140），**对应「按下记快照、释放提交一次历史」的时机**。
  - `makeDefault` 把自己的 controls 写进 R3F store（L143–149）。
- **本项目适配**：**采用 `dragging-changed → 相机 enabled=false` 模式**改现有 Rig（H11/H02）；采用 `onMouseDown 快照 + onMouseUp 提交` 的一步历史模型（H12），替代当前 400ms 合并的近似做法；不引入 drei。

## C. drei `PivotControls`（已读源码 + 官方文档）

- **仓库/版本**：`pmndrs/drei` @ `master`，`src/web/pivotControls/index.tsx`（10,687 B）、`context.ts`、`docs/gizmos/pivot-controls.mdx`（3,074 B），抓取日期 2026-11-01。子组件：`AxisArrow / AxisRotator / PlaneSlider / ScalingSphere`。
- **许可**：MIT。
- **已读位置与结论**：
  - 变换数学用一组矩阵栈：`mL0/mW0`（起点的局部/世界）、`mP/mPInv`（pivot 变换）、`mW/mL/mG`（当前世界/局部）、`mL0Inv/mdL`（增量）——见 L13–21。
  - `PivotContext`（`context.ts`）：`onDragStart(props) / onDrag(mdW) / onDragEnd()`、`translation`、`translationLimits/rotationLimits/scaleLimits`、`scale`、`fixed`、`anchor`、`axisColors`。
  - Props：`anchor: [x,y,z]`（BBAnchor 式局部锚点，-1/0/+1）、`matrix`（起始矩阵）、`autoTransform`（拖动时自动应用局部变换）、`activeAxes`（逐轴开关）、`fixed`（屏幕像素恒定大小）。
  - 文档明确：`[tab]` 可在拖动中对齐整数；`onDrag(l, deltaL, w, deltaW)` 同时给局部与世界矩阵。
- **本项目适配**：球面上「局部锚点 + 局部矩阵」的思路用于 H10/H28：本项目用 `capFrame` 给出的 **切平面基（法线 + 两条切线）** 作为局部系，拖动产生的平面位移再 `pointToCap` 投影回球面并重算法线；限定范围用 `translationLimits/scaleLimits` 的等价参数（width/length 0.05–4、scale 0.2–5，已有服务端校验）。
- **未采用**：不引入矩阵手柄 Gizmo（与球面移动语义冲突、且需新增 drei 依赖）；不做屏幕像素恒定的 fixed 手柄（绘本风格下用底部操作条 + 数值精调更一致）。

## D. `KolyaVol/threejs-editor`（Next.js 编辑器，已读 README + package.json）

- **仓库/版本**：`KolyaVol/threejs-editor` @ `master`，`README.md`（6,374 B）、`package.json`（731 B），抓取日期 2026-11-01。**License: MIT**（README 末尾）。
- **技术栈**：Next 16 + R3F 9 + drei 10 + `@reduxjs/toolkit` + `react-redux` + Tailwind 4 + three 0.182。
- **已读结论**（README 功能清单 + 快捷键表）：
  - Transform 手柄 / 场景树 / 属性面板 / 材质库（20+ 预设）/ GLTF 导入 / 灯光。
  - **Undo/Redo 50 层**；快捷键：`Ctrl+Z` 撤销、`Ctrl+Shift+Z` 重做、`Del/Backspace` 删除、`Ctrl+E` 导出；右键上下文菜单。
  - 用 Redux 管理编辑器状态（package.json 依赖证实）。
- **本项目适配**：借鉴「**对象选择 → 属性面板 → 复制**」与**快捷键表**（H06 Ctrl+D 复制、H12 撤销/重做、H22 删除）；**不引入 Redux**——本项目已有 React state + 服务端 API，Redux 会增加一层且与 R3F 9 的 useThree 状态重复。
- **未采用**：不搬其导出 React 组件、材质库、深色主题（与本项目温柔绘本风冲突）。

## E. `fernforge-arcade/minecraft-clone`（浏览器 Minecraft 示例，已读 package.json）

- **仓库/版本**：`fernforge-arcade/minecraft-clone` @ `main`，`package.json`（385 B），抓取日期 2026-11-01。
- **许可**：package.json **未声明 license 字段**（未确认为 MIT/CC0）；**不复制其代码或素材**，只借鉴交互模式。
- **已读结论**：纯浏览器（`type: module` + `http-server`，`three ^0.160`，devDeps 含 `puppeteer`），无构建步骤——说明其是单页脚本式实现。
- **本项目适配**：只借鉴「**1–9 与滚轮切快捷槽、E 打开全量物品库、槽位与物品库分离**」这一交互分层（H18/H19）；键位冲突处理按本项目 H18 明确规则（输入框聚焦不拦截）。
- **未采用**：不运行其脚本、不复制素材/美术、不引入 puppeteer。

## 结论与对应关系

| 参考 | 已读证据 | 服务任务 |
|---|---|---|
| three.js Editor.js（MIT） | `.dsh-tools/refs/three-Editor.js` L5/L20-88/L105/L698/L814/L830-842 | H12 历史、H13 回滚、H14 序列化、H51 恢复 |
| drei TransformControls（MIT） | `.dsh-tools/refs/drei-TransformControls.tsx` L78-93/L108-149 | H02 选中变换、H11 相机暂停、H12 一步历史 |
| drei PivotControls（MIT） | `.dsh-tools/refs/drei-pivot-index.tsx` L13-21/L35-120 + `context.ts` + `drei-pivot-docs.mdx` | H10 局部锚点/球面投影、H28 预览手柄、H07 缩放限定 |
| KolyaVol/threejs-editor（MIT） | `.dsh-tools/refs/kolya-README.md`、`kolya-package.json` | H05 选中操作条、H06 复制、H22 快捷键/删除 |
| minecraft-clone（无 license 声明） | `.dsh-tools/refs/mc-package.json` | H18/H19 槽位与物品库分离（仅交互模式） |

**研究例外**：无（五个参考均已读到真实文件/源码；minecraft-clone 仅 package.json 可读、且无许可声明，故不复制其代码，仅借鉴交互模式并在验收表标注）。
