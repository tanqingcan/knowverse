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

编辑 `src/lib/models.ts`，键名 = 装饰 kind（`lamp` / `bush` / `tree` / `pot` / `stone` / `fence`）：

```ts
export const MODEL_REGISTRY = {
  lamp: { url: "/assets/models/lamp.glb", scale: 0.6 },
  tree: { url: "/assets/models/tree.glb", scale: 0.5, y: 0 },
};
```

- `scale`：统一缩放；`y`：贴地偏移；`rot`：绕 Y 旋转（弧度）。

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
