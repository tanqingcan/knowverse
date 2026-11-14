# 候选键清单（自动生成）

> 由 `npm run docs:keys` 从 `pg_index` 生成。`*` 表示部分唯一索引（条件键），只在谓词成立时唯一。
> 函数依赖与范式判断见 `docs/schema/normalization-analysis.md`。

表数：48；带额外唯一键的表：19。

| 表 | 主键 | 其他唯一键（完整） | 条件唯一键 |
|---|---|---|---|
| attempts | (id) | (user_id, submit_key) | — |
| audit_log | (id, at) | — | — |
| auth_sessions | (id) | (token_hash) | — |
| card_publications | (card_version_id, class_id) | — | — |
| card_sources | (card_version_id, message_id) | — | — |
| card_versions | (id) | (card_id, version_no) | — |
| cdc_consumed | (event_id) | — | — |
| cdc_offsets | (slot_name) | — | — |
| class_members | (class_id, user_id) | — | — |
| class_stats | (class_id) | — | — |
| classes | (id) | (join_code) | — |
| concept_aliases | (id) | (concept_id, alias_norm) | — |
| concept_prerequisites | (concept_id, prereq_concept_id) | — | — |
| concept_suggestions | (id) | (message_id, name_norm) | — |
| concepts | (id) | — | (subject_id, owner_user_id, name_norm) *；(subject_id, name_norm) * |
| contributions | (id) | — | — |
| conversations | (id) | (id, user_id) | — |
| evaluations | (id) | (attempt_id) | — |
| gardens | (id) | (planet_id, subject_id) | — |
| goal_concepts | (goal_id, concept_id) | — | — |
| growth_events | (id) | — | — |
| hint_events | (id) | (attempt_id, hint_id) | — |
| knowledge_cards | (id) | — | — |
| learning_evidence | (id) | — | (attempt_id, concept_id, kind) * |
| learning_goals | (id) | — | — |
| learning_intents | (id) | — | (class_id, user_id, concept_id, direction) * |
| learning_states | (user_id, concept_id) | — | — |
| material_chunks | (id) | (version_id, ord) | — |
| material_concepts | (version_id, concept_id) | — | — |
| material_versions | (id) | (material_id, version_no) | — |
| materials | (id) | — | — |
| message_citations | (id) | (message_id, chunk_id) | — |
| message_concepts | (message_id, concept_id) | — | — |
| messages | (id) | (conversation_id, seq) | — |
| model_calls | (id) | — | — |
| notes | (id) | — | — |
| outbox_events | (id) | — | — |
| planets | (id) | (user_id) | — |
| plants | (id) | (garden_id, concept_id) | — |
| sharing_preferences | (class_id, user_id) | — | — |
| study_group_members | (group_id, user_id) | — | — |
| study_groups | (id) | — | — |
| subjects | (id) | — | (owner_user_id, code) *；(code) * |
| task_concepts | (task_id, concept_id) | — | — |
| task_hints | (id) | (task_version_id, ord) | — |
| task_versions | (id) | (task_id, version_no) | — |
| tasks | (id) | — | — |
| users | (id) | (handle) | — |
