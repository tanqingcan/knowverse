# 我的星球布局 · 导出与恢复说明

## 这是什么

`my-planet-layout-v94.json` 是**我的星球实际搭好的布局**（141 件）的完整备份，
从 `planet_layout_items`（revision 94, status=draft）导出，2026-11-01。

同一份数据同时被写进代码：`src/lib/home/my-default-layout.ts` 的 `MY_PLANET_LAYOUT`，
并被 `src/lib/decor.ts` 的 `DEFAULT_TEMPLATE` 引用 ——
所以创造模式里的「从模板开始 / 恢复默认模板」现在恢复的是**我的星球**，不再是早期的 6 件示例。

## 数据在哪里、是否安全

| 位置 | 内容 | 是否权威 |
|---|---|---|
| 业务库 `planet_layouts`（status=draft, revision 94） | 141 项，唯一权威数据 | ✅ **是** |
| `planet_layouts.terrain` / `.water` | 地形高度场 / 水面（当前均为空） | ✅ |
| 浏览器 `localStorage["kv-decor"]` | 本地草稿缓存 | ⚠️ 仅备份，加载时服务端优先（schemaVersion=2） |
| **本文件同目录的 JSON** | 141 项快照 | 📦 离线备份 |
| `src/lib/home/my-default-layout.ts` | 同 141 项，编译进前端 | 🔁 「恢复默认模板」的内容 |

## 什么情况下会覆盖布局

| 操作 | 影响 | 是否可恢复 |
|---|---|---|
| 「保存」/「发布」 | 写入 DB（revision +1） | 发布后可用「恢复上一已发布版本」 |
| 「恢复默认模板」 | 用 `DEFAULT_TEMPLATE`（现在是**我的 141 件**）整体替换草稿 | ✅ 可撤销；且内容就是我的星球 |
| 「放弃未保存的改动」 | 从服务端重新加载 | ✅ 恢复为 DB 里的版本 |
| 换浏览器 / 清缓存 | 从服务端加载 | ✅ 恢复为 DB 里的版本 |
| **清空业务库 / 重 seed** | ❌ 真丢 | 只有本文档目录的 JSON 备份可救 |

## 如何重新导出（改了布局之后）

```powershell
# 在仓库根目录
cd "C:\Users\Precious\Desktop\数据库大作业"
python .dsh-tools\export-my-layout.py
```

脚本会：
1. 从 `planet_layout_items`（status=draft）读全部项；
2. 写 `.dsh-tools/my-planet-layout-v94.json` 与 `docs/home-mode-v4/my-planet-layout-v94.json`；
3. 重新生成 `src/lib/home/my-default-layout.ts`（`MY_PLANET_LAYOUT`）。

改完跑一次 `npm run typecheck`，dev 会自动热更新。

## 如何从 JSON 恢复到数据库（万一被清空）

```powershell
# 1) 先确认当前 revision（避免覆盖别人刚存的）
& ".\.pg16\pgsql\bin\psql.exe" -U postgres -d knowverse -c "SELECT revision,status FROM planet_layouts;"

# 2) 用 psql 从 JSON 逐项插回（示例：只适用于「draft 为空」的情况）
#    jsonb_array_elements 展开 → 插入 planet_layout_items
```

更稳的做法是**先在页面上点「保存」产生一次 revision**，再用 `docs/home-mode-v4/my-planet-layout-v94.json`
里的 `items` 逐项比对；不要直接 `DELETE`/`TRUNCATE` 业务表。

## 备注

- 导出脚本用 `psql -t -A` 拿紧凑 JSON，避免 Windows 控制台中文编码问题（`invalid byte sequence`）。
- 141 项的 kind 分布：`tree×64 / flower3×21 / bush×18 / rose×13 / lotus×6 / flower2×4 / cottage×3 / greenhouse×2 / rock×2`，
  其余 `arch / chair / lamp / observatory / pond / sign / grassGroup / wildflowerGroup` 各 1。
