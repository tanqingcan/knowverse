# 增量维护的班级统计（替代全量物化视图刷新）

## 1. 问题

班级星系要显示「成员数 / 公开星球数 / 最近活跃」。原来的做法是物化视图 `mv_class_stats`，数据一变就要整表 `REFRESH`；
班级多、成员变动频繁时，刷新成本随数据量线性增长，而且刷新期间数据是旧的。

## 2. 做法：触发器增量维护 + 对账兜底

| 变更 | 增量动作 |
|---|---|
| `class_members` INSERT / DELETE | `member_count ± 1`（原子 `UPDATE ... SET x = x + delta`） |
| `sharing_preferences` INSERT / UPDATE / DELETE | 只按 `share_planet` 的**真假变化**给 `shared_planet_count ± 1` |
| `learning_states.last_evidence_at` 变大 | 更新该用户所在班级的 `last_active_at = max(...)` |

增量维护最大的风险是「漏算一次就永久错」。所以同时提供：

- `v_class_stats_drift`：把增量值与真实聚合（`count(*)` / `max(...)`）对比，非空即漂移；
- `fn_reconcile_class_stats()`：按真实聚合修复，返回修复行数，**幂等**（没有漂移时返回 0）。

不变量检查 `E11` 就是查这个视图；随机负载 fuzz 每 8 步也会检查它。

## 3. 验证（`tests/class-stats.test.ts`）

| 用例 | 结果 |
|---|---|
| 加成员 / 开分享 / 写证据后，增量值 = 真实聚合 = `mv_class_stats` | ✅ |
| 3 人并发加入同一班级，成员数不多不少 | ✅ |
| 人为把 `class_stats` 改错 → 对账视图发现 → 修复函数修回，再修一次返回 0 | ✅ |

## 4. 为什么不是「直接不要 mv_class_stats」

物化视图是**读多写少**场景的正确答案；`class_stats` 是**写多读也多**场景的答案。
本项目保留 `mv_class_stats` 做「冷路径的全量快照」（例如答辩前刷新一次给榜单用），
用 `class_stats` 做「热路径的实时值」。两者共存不矛盾，关键是知道各自适用边界。
