# 时间机器：按证据有效期重放任意时刻

成长时间轴不只想知道“现在是什么阶段”，还想回答“10 月 20 日那天这株花是什么状态”。两种做法：

| 方案 | 空间 | 正确性 | 结论 |
|---|---|---|---|
| 每次状态变化写一份快照表 | 每株花 × 每次证据 = O(证据数) 份快照 | 简单，但撤销证据后要回写所有历史快照 | ✘ |
| **按证据有效期重放**（采用） | 0 额外存储 | 撤销只改一行 `revoked_at`，历史自动重算 | ✅ |

## 1. 语义

一条学习证据 `e` 在时刻 `t` 有效，当且仅当：

```
e.created_at <= t  AND  (e.revoked_at IS NULL OR e.revoked_at > t)
```

时刻 `t` 的阶段 = 该时刻有效证据集合按成长规则重算（与 `src/server/growth.ts` 完全一致）：

| 证据 | 阶段 |
|---|---|
| `independent_variant_pass` | 开花 |
| `independent_attempt` | 花苞 |
| `guided_practice` | 生叶 |
| `read` / `asked` / `note` | 嫩芽 |
| 无 | 种子 |

## 2. 数据库函数

```sql
fn_stage_at(p_user uuid, p_concept uuid, p_at timestamptz) RETURNS text
fn_garden_at(p_user uuid, p_at timestamptz)
  RETURNS TABLE(plant_id, concept_name, species, color, garden_name, stage_at, stage_now)
```

- `LANGUAGE plpgsql STABLE`，默认 `SECURITY INVOKER`：底层 RLS 对调用者生效；
- 额外校验 `p_user = app.user_id`（系统连接/测试无上下文时放行），跨用户调用直接 `42501`；
- 走 `learning_evidence (user_id, concept_id, created_at)` 索引，单株花一次索引扫描。

## 3. API

```
GET /api/timeline/asof?at=2026-10-20T12:00:00Z
```

返回该时刻的花园快照：每株花的 `stageAt`（当时）与 `stageNow`（现在）、按阶段的计数、`changedSince`（有多少株与现在不同）。省略 `at` 即当前时刻。

## 4. 不变量

- **as-of(now) 必须等于 `learning_states.stage`**（种子数据全量核对，漂移为 0）；
- 撤销证据只影响撤销之后的时刻，之前的历史仍可回看；
- 时间机器不写任何表，纯读，天然幂等。

## 5. 测试

`tests/asof.test.ts`（5 例）：四个阶段的时间点重放、撤销后的历史回看、花园快照结构、与 `learning_states` 的全量一致、跨用户被拒。

## 6. 为什么这不只是“查询”

它把“状态”从**存储的事实**变成**事件的投影**：`learning_states` 是为了读性能保留的物化结果（受控冗余），
而唯一事实来源是带有效期的证据。因此同一个知识点可以同时回答“现在”“过去”“撤销前”，且三者由同一套规则保证一致。
