# 外部素材接入说明（GLB）

> 目标：把下载好的低模素材（花 / 树 / 椅 / 旅人 / 装饰）接进 3D 场景；没有素材时继续用程序化模型，不改变现有画面。
> 当前注册表在 `src/lib/models.ts`，**默认空**。

## 1. 下载

在本机运行（沙箱内出网被禁）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/fetch-assets.ps1 -Open
```

按 `docs/visual-references.md` 的清单挑：优先 **Quaternius / Kenney**（CC0、低模）；小王子风格优先「手绘 / 水彩」类（Dreamscape、Mac Hand Painted）。
文件放到 `public/assets/models/`。

## 2. 登记

编辑 `src/lib/models.ts`，键名 = 装饰 kind（`lamp` / `bush` / `tree` / `pot` / `stone` / `fence` / `chair` / `flower` / `flower2` / `flower3` / `rock`）：

```ts
export const MODEL_REGISTRY = {
  tree:  { url: "/assets/models/tree-a.glb",  height: 0.55 },
  fence: { url: "/assets/models/fence.glb",   height: 0.55, fit: "max" },
};
```

- `height`：目标尺寸（场景单位）；加载时按包围盒**自动缩放并贴地**。
- `fit`：`"height"`（默认，按高度）或 `"max"`（按最大边长，适合栅栏/石头这类长条或扁平的模型）。
- `rot`：绕 Y 旋转（弧度）；`rx`：绕 X 旋转（Z-up 的 Blender 模型用 `-Math.PI/2`）。
- 已下载并登记：`tree` / `chair`(长椅) / `flower` / `flower2` / `flower3` / `lamp` / `fence` / `rock`（来源与许可见 `public/assets/CREDITS.md`）。

## 3. 行为

- 有登记 → 先显示程序化模型，GLB 加载好后替换（`Suspense`）。
- 404 / 解析失败 → 保持程序化模型（`ModelBoundary` 回退），**不会崩场景**。

## 4. 复杂度检查

- 用 Blender 或 `gltf-transform` 减面、烘焙顶点色，再导出 GLB（Draco 可选）。
- 预算：花 ≤800 面、树 ≤2000、椅 ≤500、旅人 ≤2500、单星球装饰总量 ≤50000 面。
- 记录到 `public/assets/CREDITS.md`：名称 / 作者 / 来源 URL / 许可 / 修改。

## 5. 许可

- 只用 **CC0** 或明确允许商用的包；CC-BY 必须署名。
- **不要**使用《小王子》原作插画、官方或粉丝 3D 模型（见 `visual-references.md` 的版权提醒）。
