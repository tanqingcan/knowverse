# 可访问性清单（焦点 / 对比度 / 键盘路径）

> 对应 B7「焦点态、对比度、键盘路径清单」。对比度按 WCAG 2.1 相对亮度公式计算：正文 AA 要求 **4.5:1**，大字与 UI 组件/焦点指示 **3:1**。

## 1. 对比度

| 前景 | 背景 | 比值 | 结论 |
|---|---|---|---|
| `--ink` #3f3657 | `--paper` #fff7e8 | 10.51 | ✅ AAA |
| `--ink-2` #5d5474 | `--paper` | 6.61 | ✅ AA |
| `--ink-3` #6f6789（原 #847b97 = 3.75） | `--paper` | 4.96 | ✅ AA（已修） |
| `--ink-3` #6f6789 | `--paper-card` #fffcf5 | 5.14 | ✅ AA |
| `--rose-ink` #a14f63 | `--paper` | 5.17 | ✅ AA |
| `--sage-ink` #4f6b47 | `--paper` | 5.59 | ✅ AA |
| `--gold-ink` #86621f | `--paper` | 5.22 | ✅ AA |
| `--mist-ink` #5a4d8c | `--paper` | 6.86 | ✅ AA |
| `--cream` #fff7e8 | `--dusk` #756b99 | 4.57 | ✅ AA |
| `--cream` | `--ink` #3f3657 | 10.51 | ✅ AAA |
| `--focus` #f5dfa0（原 `--honey` #ddb56d = 2.52） | `--dusk` | 3.69 | ✅ 3:1（已修） |
| `--focus` | `--ink` | 8.50 | ✅ |
| #a07a2c（`.paper` 内焦点） | `--paper` | 3.71 | ✅ 3:1 |

## 2. 焦点态

- 全局：`:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }`
  - 深色背景（导航 / 天空）用浅金 `#f5dfa0`（3.69:1）；
  - 纸张面板内用 `#a07a2c`（3.71:1）。
- 不使用 `outline: none`；`button / input / select` 都继承 `:focus-visible`。
- 键盘顺序：顶部导航 → 今日建议 → 场景工具栏 → 花圃列表 → 右侧面板。

## 3. 键盘路径（主流程）

1. **`/` 开场**：Tab →「跳过开场」→「进入 / 登录」。
2. **`/welcome`**：Tab 依次为 学习目标输入 → 提取 → 知识点确认 → 本命花 / 颜色 / 名字 → 星球名 → 保存。
3. **`/space`**：顶部导航 Tab；花圃列表支持 Tab / Enter / Esc；面板内按钮均可 Tab。
4. **3D 场景物体**：底部工具栏与普通导航提供等价入口，键盘路径不依赖 3D 拾取。

## 4. 其他

- `prefers-reduced-motion`：关闭入场 / 镜头 / 花瓣展开 / 光点（已在 `SpaceApp`、`GardenWorld` 处理）。
- 装饰操作（设置 → 星球装饰）每个按钮都有 `aria-label`。
- 已知限制：屏幕阅读器未实测；3D 画布没有 `aria` 语义，功能通过 DOM 按钮提供等价入口。
