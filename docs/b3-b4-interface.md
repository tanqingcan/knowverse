# B3 / B4 对接现状与接口需求（2026-10-31 实测）

> Owner：B（前端）。本文只陈述**当前真实状态**（按代码与数据库实测），并给出需要 A / C 提供的接口需求，**不宣称已完成、不伪造后端**。

## 一、B3 班级星系（共学）—— 已真实实现，非 mock

**实测结论**：共学星系前后端均已落地，服务端强制「只显示对方明确公开的内容」。**live 验证**（demo 登录后 `GET /api/classes`）返回 200：`{ok:true, data:[{name:"数据库系统概论 · 关系 A", joinCode:"KV2026", members:3, sharePlanet:true, ...}]}` —— 真实数据、非 mock。

- 后端 `src/server/classes.ts`：`galaxy()` 只返回 `share_planet / share_stages / open_to_partner` 已开启成员的内容；伙伴匹配只读公开意愿；共学小组名额由数据库触发器在事务内锁行计数保证不超员。
- 前端 `src/components/space/panels/GalaxyPanel.tsx` 已接到真实接口（无 mock 数据）。
- 已存在的 API（15 条，均已实现）：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET/POST | `/api/classes` | 我的星系 / 创建 |
| POST | `/api/classes/join` | 邀请码加入 |
| GET | `/api/classes/[id]` | 星系（只返回公开内容） |
| PATCH | `/api/classes/[id]/sharing` | 分享偏好（星球/阶段/伙伴） |
| GET/POST | `/api/classes/[id]/intents` | 公开学习意愿 |
| DELETE | `/api/intents/[id]` | 撤回意愿 |
| GET | `/api/classes/[id]/partners` | 互补伙伴匹配 |
| GET/POST | `/api/classes/[id]/groups` | 共学小组 |
| POST | `/api/groups/[id]/join` | 申请加入（并发安全） |
| POST | `/api/groups/[id]/contributions` | 团队贡献（=团队证据） |
| GET | `/api/classes/[id]/cards` | 班级公开学习卡 |

- 相关表：`classes / class_members / sharing_preferences / learning_intents / study_groups / study_group_members / contributions / card_publications / outbox_events`。

## 二、B3 只读参观（/visit）—— 仍是本地 mock

- `src/app/visit/page.tsx` 内 `PLANTS` / `DECOR` 是**硬编码假数据**，注释明确「现在是本地 mock；等 A 的 `/api/planets/[id]/decor` 就绪后换成真实数据」。
- **无** `/api/planets/*` 公开只读接口（现有 `/api/plants` 只读当前用户自己的）。

### 需要 A 提供的接口（B3 参观落地的前提）

1. `GET /api/planets/[id]`（或 `/api/planets/[userId]`）：公开只读星球 —— 返回 `{ planetName, natalPlant, gardens[], plants[] }`，**只含对方 `share_planet` / `share_stages` 打开的内容**；未公开则 404 或空。
2. `GET /api/planets/[id]/decor`：该星球的装饰实例 `{ id, kind, x, z, rot, scale, color }[]`（对齐 `src/lib/decor.ts` 的 `DecorPlacement` 与 `public/assets/models` 登记项）。
3. 语义要求：**只读**、不返回对话/练习内容；跨用户读取必须复用 `sharing_preferences` 权限判断。

## 三、B4 记忆面板 —— 未实现（后端与前端都没有）

- 数据库 44 张表中**无** `memories` / `agent_memory` 类表；`src/app/api` **无** 记忆相关路由；组件层无记忆面板。
- `src/server/agent/` 有 `chat-agent / demo / llm / prompts / tools / trace`，但**没有**持久化的「用户长期记忆」概念。

### 需要 C5 提供的接口（B4 落地的前提）

1. 记忆条目字段（需 C 冻结）：
   - `id, kind（fact/preference/event）, content, conceptId?, sourceMessageId?, sourceConversationId?, createdAt, updatedAt, status（active/deleted/corrected）`。
2. API：
   - `GET /api/memories`：当前用户记忆列表（含来源跳转信息：`sourceMessageId → 消息定位`、`sourceConversationId`）。
   - `DELETE /api/memories/[id]`：删除 / 遗忘。
   - `PATCH /api/memories/[id]`：修正内容（保留修正历史）。
3. 前端 B4 目标：记忆列表 + 删除/修正 + **来源跳转**（点击定位到原对话消息）+ 引用位置展示；接口未就绪时保留「可验证的界面状态 + 契约清单」，**不伪造后端完成**。

## 四、2D 降级 / 键盘路径（B3 相关，已具备）

- `StaticGarden.tsx` 提供无 WebGL 的 2D 降级（`/visit` 已接线，共学入口有 `role="button" tabIndex=0` 键盘可达）。
- 星系面板在 `.focus` 浮窗内，Esc/焦点归还/Tab 约束走 `useDialog`（已实现）。

## 五、结论与下一步

1. **B3 星系 = 已真实完成**（A2 后端 + B 前端）；**B3 参观 = mock**，等 A 提供 `/api/planets/[id]`(+decor) 只读接口即可替换 `visit/page.tsx` 的硬编码数据。
2. **B4 记忆 = 完全未实现**，等 C5 冻结记忆字段与 API 契约后接入。
3. 本文为接口需求基线，交 A / C 评审后按契约实现，不做不可逆迁移。
