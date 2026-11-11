# API 契约：班级星系（多球宇宙数据源）

- **路径**：`GET /api/classes/:id/galaxy`（与 `GET /api/classes/:id` 返回同一份数据）
- **鉴权**：需要登录；调用者必须是该班级成员，否则 `403 forbidden`
- **数据来源**：数据库函数 `fn_class_galaxy(p_user, p_class)`（`SECURITY DEFINER`，成员校验与分享规则都在库里）
- **分享规则**：
  - 只返回「本人」与「`sharing_preferences.share_planet = true` 的成员」；
  - `plants` 与 `stageSummary` 只在本人或 `share_stages = true` 时返回，否则为 `null`；
  - 未分享的成员不出现，人数体现在 `hiddenCount`。

## 响应

```jsonc
{
  "ok": true,
  "data": {
    "class": { "id": "uuid", "name": "数据库系统概论 1 班", "joinCode": "KV2026" },
    "memberCount": 3,
    "hiddenCount": 1,
    "planets": [
      {
        "userId": "uuid",
        "displayName": "小屿",
        "isMe": true,
        "planetName": "小屿星",
        "natalSpecies": "rose",
        "natalColor": "rose",
        "plantCount": 7,
        "lastActiveAt": "2026-10-25T12:00:00.000Z",
        "stageSummary": { "seed": 2, "sprout": 3, "leaf": 1, "bloom": 1 },
        "plants": [
          { "userId": "uuid", "conceptName": "左外连接", "species": "rose", "color": "rose", "stage": "bloom", "lon": 0, "lat": 0 }
        ]
      },
      {
        "userId": "uuid",
        "displayName": "星河",
        "isMe": false,
        "planetName": "星河星",
        "natalSpecies": "iris",
        "natalColor": "mist",
        "plantCount": 4,
        "lastActiveAt": "2026-10-24T09:30:00.000Z",
        "stageSummary": null,
        "plants": null
      }
    ]
  }
}
```

## 前端用法（B3）

- 每颗星球渲染 `planets[i]`；`plantCount` 用于星球体积/花圃密度；
- `stageSummary` 用于星球表面的“花圃颜色分布”，为 `null` 时只显示星球轮廓与名字；
- `hiddenCount > 0` 时显示「还有 N 位同学没有分享星球」；
- 点击星球进入只读星球视图：用 `plants` 渲染花圃，不提供编辑入口。

## 边界

- 班级成员变动后无需刷新物化视图即可看到最新成员（函数实时查询）；
- `mv_class_stats` 只用于榜单类聚合，刷新命令：`npx tsx scripts/refresh-stats.ts`。
