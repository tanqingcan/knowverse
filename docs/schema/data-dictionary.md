# 数据字典（自动生成）

> 由 `npm run docs:dictionary` 从 `information_schema` / `pg_indexes` 反向生成，**请勿手工编辑**。
> 生成时间：2026-10-27T14:56:25.340Z　表数：45

## 目录

- [attempts](#attempts)
- [audit_log](#audit_log)
- [auth_sessions](#auth_sessions)
- [card_publications](#card_publications)
- [card_sources](#card_sources)
- [card_versions](#card_versions)
- [class_members](#class_members)
- [classes](#classes)
- [concept_aliases](#concept_aliases)
- [concept_prerequisites](#concept_prerequisites)
- [concept_suggestions](#concept_suggestions)
- [concepts](#concepts)
- [contributions](#contributions)
- [conversations](#conversations)
- [evaluations](#evaluations)
- [gardens](#gardens)
- [goal_concepts](#goal_concepts)
- [growth_events](#growth_events)
- [hint_events](#hint_events)
- [knowledge_cards](#knowledge_cards)
- [learning_evidence](#learning_evidence)
- [learning_goals](#learning_goals)
- [learning_intents](#learning_intents)
- [learning_states](#learning_states)
- [material_chunks](#material_chunks)
- [material_concepts](#material_concepts)
- [material_versions](#material_versions)
- [materials](#materials)
- [message_citations](#message_citations)
- [message_concepts](#message_concepts)
- [messages](#messages)
- [model_calls](#model_calls)
- [notes](#notes)
- [outbox_events](#outbox_events)
- [planets](#planets)
- [plants](#plants)
- [sharing_preferences](#sharing_preferences)
- [study_group_members](#study_group_members)
- [study_groups](#study_groups)
- [subjects](#subjects)
- [task_concepts](#task_concepts)
- [task_hints](#task_hints)
- [task_versions](#task_versions)
- [tasks](#tasks)
- [users](#users)

## attempts

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| task_version_id | uuid | 否 |  |
| mode | text | 否 |  |
| conversation_id | uuid | 是 |  |
| answer | text | 是 |  |
| status | text | 否 | `'open'::text` |
| submit_key | text | 是 |  |
| started_at | timestamp with time zone | 否 | `now()` |
| submitted_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(conversation_id) → conversations(id)；(task_version_id) → task_versions(id)；(user_id) → users(id)
- **CHECK**：`attempts_mode_ck`, `attempts_status_ck`
- **索引**：`attempts_pkey`, `attempts_user_submit_key_uq`, `attempts_user_task_idx`

---

## audit_log

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | bigint | 否 |  |
| at | timestamp with time zone | 否 | `now()` |
| actor_user_id | uuid | 是 |  |
| table_name | text | 否 |  |
| op | text | 否 |  |
| row_pk | text | 是 |  |
| old_row | jsonb | 是 |  |
| new_row | jsonb | 是 |  |

- **主键**：`id`, `at`
- **CHECK**：`audit_log_op_ck`
- **索引**：`audit_log_actor_idx`, `audit_log_at_idx`, `audit_log_pkey`, `audit_log_table_idx`

---

## auth_sessions

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| token_hash | text | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |
| expires_at | timestamp with time zone | 否 |  |
| revoked_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(user_id) → users(id)
- **索引**：`auth_sessions_pkey`, `auth_sessions_token_uq`, `auth_sessions_user_idx`

---

## card_publications

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| card_version_id | uuid | 否 |  |
| class_id | uuid | 否 |  |
| published_at | timestamp with time zone | 否 | `now()` |
| withdrawn_at | timestamp with time zone | 是 |  |

- **主键**：`card_version_id`, `class_id`
- **外键**：(card_version_id) → card_versions(id)；(class_id) → classes(id)
- **索引**：`card_publications_pk`

---

## card_sources

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| card_version_id | uuid | 否 |  |
| message_id | uuid | 否 |  |

- **主键**：`card_version_id`, `message_id`
- **外键**：(card_version_id) → card_versions(id)；(message_id) → messages(id)
- **索引**：`card_sources_pk`

---

## card_versions

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| card_id | uuid | 否 |  |
| version_no | integer | 否 |  |
| title | text | 否 |  |
| body | text | 否 |  |
| change_note | text | 否 |  |
| drafted_by | text | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(card_id) → knowledge_cards(id)
- **索引**：`card_versions_no_uq`, `card_versions_pkey`

---

## class_members

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| class_id | uuid | 否 |  |
| user_id | uuid | 否 |  |
| role | text | 否 | `'student'::text` |
| joined_at | timestamp with time zone | 否 | `now()` |

- **主键**：`class_id`, `user_id`
- **外键**：(class_id) → classes(id)；(user_id) → users(id)
- **CHECK**：`class_members_role_ck`
- **索引**：`class_members_pk`, `class_members_user_idx`

---

## classes

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| name | text | 否 |  |
| join_code | text | 否 |  |
| owner_user_id | uuid | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(owner_user_id) → users(id)
- **索引**：`classes_join_code_uq`, `classes_pkey`

---

## concept_aliases

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| concept_id | uuid | 否 |  |
| alias | text | 否 |  |
| alias_norm | text | 否 |  |
| created_by_user_id | uuid | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(concept_id) → concepts(id)；(created_by_user_id) → users(id)
- **索引**：`concept_aliases_norm_idx`, `concept_aliases_pkey`, `concept_aliases_uq`

---

## concept_prerequisites

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| concept_id | uuid | 否 |  |
| prereq_concept_id | uuid | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`concept_id`, `prereq_concept_id`
- **外键**：(concept_id) → concepts(id)；(prereq_concept_id) → concepts(id)
- **CHECK**：`concept_prereq_not_self_ck`
- **索引**：`concept_prereq_rev_idx`, `concept_prerequisites_pk`

---

## concept_suggestions

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| message_id | uuid | 否 |  |
| subject_id | uuid | 是 |  |
| raw_name | text | 否 |  |
| name_norm | text | 否 |  |
| status | text | 否 | `'pending'::text` |
| accepted_concept_id | uuid | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(accepted_concept_id) → concepts(id)；(message_id) → messages(id)；(subject_id) → subjects(id)；(user_id) → users(id)
- **CHECK**：`concept_suggestions_status_ck`
- **索引**：`concept_suggestions_msg_name_uq`, `concept_suggestions_pkey`

---

## concepts

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| subject_id | uuid | 否 |  |
| owner_user_id | uuid | 是 |  |
| name | text | 否 |  |
| name_norm | text | 否 |  |
| summary | text | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |
| archived_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(owner_user_id) → users(id)；(subject_id) → subjects(id)
- **索引**：`concepts_owner_name_uq`, `concepts_pkey`, `concepts_public_name_uq`, `concepts_subject_idx`

---

## contributions

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| group_id | uuid | 否 |  |
| user_id | uuid | 否 |  |
| kind | text | 否 |  |
| content | text | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(group_id, user_id) → study_group_members(group_id, user_id)
- **CHECK**：`contributions_kind_ck`
- **索引**：`contributions_pkey`

---

## conversations

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| title | text | 否 |  |
| subject_id | uuid | 是 |  |
| goal_id | uuid | 是 |  |
| focus_concept_id | uuid | 是 |  |
| origin | text | 否 | `'user'::text` |
| created_at | timestamp with time zone | 否 | `now()` |
| updated_at | timestamp with time zone | 否 | `now()` |
| archived_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(focus_concept_id) → concepts(id)；(goal_id) → learning_goals(id)；(subject_id) → subjects(id)；(user_id) → users(id)
- **唯一约束**：(id, user_id)
- **CHECK**：`conversations_origin_ck`
- **索引**：`conversations_id_user_uq`, `conversations_pkey`, `conversations_title_trgm_idx`, `conversations_user_updated_idx`

---

## evaluations

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| attempt_id | uuid | 否 |  |
| evaluator | text | 否 |  |
| verdict | text | 否 |  |
| score | numeric(5,2) | 是 |  |
| feedback | text | 否 |  |
| rubric | jsonb | 是 |  |
| uncertainty | text | 是 |  |
| model_call_id | uuid | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(attempt_id) → attempts(id)；(model_call_id) → model_calls(id)
- **CHECK**：`evaluations_verdict_ck`
- **索引**：`evaluations_attempt_uq`, `evaluations_pkey`

---

## gardens

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| planet_id | uuid | 否 |  |
| subject_id | uuid | 否 |  |
| name | text | 否 |  |
| sort_order | integer | 否 | `0` |
| created_at | timestamp with time zone | 否 | `now()` |
| archived_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(planet_id) → planets(id)；(subject_id) → subjects(id)
- **索引**：`gardens_pkey`, `gardens_planet_subject_uq`

---

## goal_concepts

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| goal_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |
| route_order | integer | 否 |  |

- **主键**：`goal_id`, `concept_id`
- **外键**：(concept_id) → concepts(id)；(goal_id) → learning_goals(id)
- **索引**：`goal_concepts_concept_idx`, `goal_concepts_pk`

---

## growth_events

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |
| event_type | text | 否 |  |
| from_stage | text | 是 |  |
| to_stage | text | 是 |  |
| evidence_id | uuid | 是 |  |
| reason | text | 否 |  |
| origin | text | 否 | `'user'::text` |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(concept_id) → concepts(id)；(evidence_id) → learning_evidence(id)；(user_id) → users(id)
- **CHECK**：`growth_events_type_ck`
- **索引**：`growth_events_concept_idx`, `growth_events_pkey`, `growth_events_user_created_idx`

---

## hint_events

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| attempt_id | uuid | 否 |  |
| hint_id | uuid | 否 |  |
| shown_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(attempt_id) → attempts(id)；(hint_id) → task_hints(id)
- **索引**：`hint_events_attempt_hint_uq`, `hint_events_pkey`

---

## knowledge_cards

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |
| archived_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(concept_id) → concepts(id)；(user_id) → users(id)
- **索引**：`knowledge_cards_pkey`, `knowledge_cards_user_idx`

---

## learning_evidence

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |
| kind | text | 否 |  |
| attempt_id | uuid | 是 |  |
| message_id | uuid | 是 |  |
| note_id | uuid | 是 |  |
| material_version_id | uuid | 是 |  |
| used_hints | boolean | 否 | `false` |
| ai_assisted | boolean | 否 | `false` |
| detail | text | 否 |  |
| origin | text | 否 | `'user'::text` |
| created_at | timestamp with time zone | 否 | `now()` |
| revoked_at | timestamp with time zone | 是 |  |
| revoke_reason | text | 是 |  |

- **主键**：`id`
- **外键**：(attempt_id) → attempts(id)；(concept_id) → concepts(id)；(material_version_id) → material_versions(id)；(message_id) → messages(id)；(note_id) → notes(id)；(user_id) → users(id)
- **CHECK**：`learning_evidence_kind_ck`, `learning_evidence_revoke_ck`
- **索引**：`learning_evidence_attempt_concept_uq`, `learning_evidence_pkey`, `learning_evidence_user_concept_idx`

---

## learning_goals

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| subject_id | uuid | 否 |  |
| title | text | 否 |  |
| description | text | 是 |  |
| status | text | 否 | `'active'::text` |
| created_at | timestamp with time zone | 否 | `now()` |
| archived_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(subject_id) → subjects(id)；(user_id) → users(id)
- **CHECK**：`learning_goals_status_ck`
- **索引**：`learning_goals_pkey`, `learning_goals_user_idx`

---

## learning_intents

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| class_id | uuid | 否 |  |
| user_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |
| direction | text | 否 |  |
| note | text | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |
| withdrawn_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(concept_id) → concepts(id)；(class_id, user_id) → class_members(class_id, user_id)
- **CHECK**：`learning_intents_direction_ck`
- **索引**：`learning_intents_active_uq`, `learning_intents_match_idx`, `learning_intents_pkey`

---

## learning_states

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| user_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |
| stage | text | 否 |  |
| stage_reason | text | 否 |  |
| last_evidence_at | timestamp with time zone | 是 |  |
| review_due_at | timestamp with time zone | 是 |  |
| updated_at | timestamp with time zone | 否 | `now()` |
| version | integer | 否 | `1` |

- **主键**：`user_id`, `concept_id`
- **外键**：(concept_id) → concepts(id)；(user_id) → users(id)
- **CHECK**：`learning_states_stage_ck`
- **索引**：`learning_states_pk`, `learning_states_review_idx`

---

## material_chunks

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| version_id | uuid | 否 |  |
| ord | integer | 否 |  |
| page_no | integer | 是 |  |
| paragraph_no | integer | 是 |  |
| heading | text | 是 |  |
| content | text | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(version_id) → material_versions(id)
- **索引**：`material_chunks_content_trgm_idx`, `material_chunks_ord_uq`, `material_chunks_pkey`

---

## material_concepts

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| version_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |
| status | text | 否 | `'candidate'::text` |
| hit_count | integer | 否 | `0` |

- **主键**：`version_id`, `concept_id`
- **外键**：(concept_id) → concepts(id)；(version_id) → material_versions(id)
- **CHECK**：`material_concepts_status_ck`
- **索引**：`material_concepts_pk`

---

## material_versions

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| material_id | uuid | 否 |  |
| version_no | integer | 否 |  |
| file_name | text | 否 |  |
| file_type | text | 否 |  |
| mime_type | text | 是 |  |
| byte_size | integer | 否 |  |
| sha256 | text | 否 |  |
| storage_path | text | 是 |  |
| status | text | 否 |  |
| status_detail | text | 是 |  |
| page_count | integer | 是 |  |
| uploaded_by_user_id | uuid | 是 |  |
| uploaded_at | timestamp with time zone | 否 | `now()` |
| processed_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(material_id) → materials(id)；(uploaded_by_user_id) → users(id)
- **CHECK**：`material_versions_status_ck`, `material_versions_type_ck`
- **索引**：`material_versions_no_uq`, `material_versions_pkey`

---

## materials

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| owner_user_id | uuid | 是 |  |
| subject_id | uuid | 否 |  |
| title | text | 否 |  |
| course | text | 否 |  |
| kind | text | 否 | `'slides'::text` |
| created_at | timestamp with time zone | 否 | `now()` |
| archived_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(owner_user_id) → users(id)；(subject_id) → subjects(id)
- **CHECK**：`materials_kind_ck`
- **索引**：`materials_owner_idx`, `materials_pkey`

---

## message_citations

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| message_id | uuid | 否 |  |
| chunk_id | uuid | 否 |  |
| ref_label | text | 否 |  |
| quote | text | 否 |  |
| ord | integer | 否 |  |

- **主键**：`id`
- **外键**：(chunk_id) → material_chunks(id)；(message_id) → messages(id)
- **索引**：`message_citations_chunk_idx`, `message_citations_msg_chunk_uq`, `message_citations_pkey`

---

## message_concepts

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| message_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |
| source | text | 否 |  |
| status | text | 否 |  |
| confidence | real | 是 |  |
| decided_at | timestamp with time zone | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`message_id`, `concept_id`
- **外键**：(concept_id) → concepts(id)；(message_id) → messages(id)
- **CHECK**：`message_concepts_source_ck`, `message_concepts_status_ck`
- **索引**：`message_concepts_concept_idx`, `message_concepts_pk`

---

## messages

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| conversation_id | uuid | 否 |  |
| user_id | uuid | 否 |  |
| seq | integer | 否 |  |
| role | text | 否 |  |
| content | text | 否 |  |
| status | text | 否 | `'complete'::text` |
| mode | text | 是 |  |
| reply_to_id | uuid | 是 |  |
| model_call_id | uuid | 是 |  |
| basis | text | 是 |  |
| error_message | text | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |
| completed_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(conversation_id, user_id) → conversations(id, user_id)；(model_call_id) → model_calls(id)；(reply_to_id) → messages(id)
- **CHECK**：`messages_basis_ck`, `messages_mode_ck`, `messages_role_ck`, `messages_status_ck`
- **索引**：`messages_content_trgm_idx`, `messages_conv_seq_uq`, `messages_pkey`, `messages_reply_idx`, `messages_user_created_idx`

---

## model_calls

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| purpose | text | 否 |  |
| mode | text | 否 |  |
| provider | text | 是 |  |
| model | text | 是 |  |
| status | text | 否 |  |
| started_at | timestamp with time zone | 否 | `now()` |
| finished_at | timestamp with time zone | 是 |  |
| latency_ms | integer | 是 |  |
| prompt_tokens | integer | 是 |  |
| completion_tokens | integer | 是 |  |
| error_code | text | 是 |  |
| error_message | text | 是 |  |
| tool_trace | jsonb | 是 |  |

- **主键**：`id`
- **外键**：(user_id) → users(id)
- **CHECK**：`model_calls_mode_ck`, `model_calls_status_ck`
- **索引**：`model_calls_pkey`, `model_calls_user_idx`

---

## notes

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| concept_id | uuid | 是 |  |
| source_message_id | uuid | 是 |  |
| title | text | 否 |  |
| content | text | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |
| updated_at | timestamp with time zone | 否 | `now()` |
| archived_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(concept_id) → concepts(id)；(source_message_id) → messages(id)；(user_id) → users(id)
- **索引**：`notes_content_trgm_idx`, `notes_pkey`, `notes_user_concept_idx`

---

## outbox_events

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | bigint | 否 |  |
| topic | text | 否 |  |
| aggregate_id | uuid | 否 |  |
| payload | jsonb | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |
| delivered_at | timestamp with time zone | 是 |  |
| attempts | integer | 否 | `0` |

- **主键**：`id`
- **索引**：`outbox_events_pkey`, `outbox_undelivered_idx`

---

## planets

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| user_id | uuid | 否 |  |
| name | text | 否 |  |
| sky_theme | text | 否 | `'indigo'::text` |
| natal_plant_id | uuid | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(natal_plant_id) → plants(id)；(user_id) → users(id)
- **索引**：`planets_pkey`, `planets_user_uq`

---

## plants

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| garden_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |
| species | text | 否 |  |
| color | text | 否 |  |
| nickname | text | 是 |  |
| lon | real | 否 |  |
| lat | real | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |
| archived_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(concept_id) → concepts(id)；(garden_id) → gardens(id)
- **CHECK**：`plants_species_ck`
- **索引**：`plants_concept_idx`, `plants_garden_concept_uq`, `plants_pkey`

---

## sharing_preferences

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| class_id | uuid | 否 |  |
| user_id | uuid | 否 |  |
| share_planet | boolean | 否 | `false` |
| share_stages | boolean | 否 | `false` |
| open_to_partner | boolean | 否 | `false` |
| updated_at | timestamp with time zone | 否 | `now()` |

- **主键**：`class_id`, `user_id`
- **外键**：(class_id, user_id) → class_members(class_id, user_id)
- **索引**：`sharing_preferences_pk`

---

## study_group_members

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| group_id | uuid | 否 |  |
| user_id | uuid | 否 |  |
| joined_at | timestamp with time zone | 否 | `now()` |

- **主键**：`group_id`, `user_id`
- **外键**：(group_id) → study_groups(id)；(user_id) → users(id)
- **索引**：`study_group_members_pk`

---

## study_groups

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| class_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |
| title | text | 否 |  |
| capacity | integer | 否 |  |
| created_by_user_id | uuid | 否 |  |
| status | text | 否 | `'open'::text` |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(class_id) → classes(id)；(concept_id) → concepts(id)；(created_by_user_id) → users(id)
- **CHECK**：`study_groups_capacity_ck`, `study_groups_status_ck`
- **索引**：`study_groups_pkey`

---

## subjects

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| owner_user_id | uuid | 是 |  |
| code | text | 否 |  |
| name | text | 否 |  |
| description | text | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(owner_user_id) → users(id)
- **索引**：`subjects_owner_code_uq`, `subjects_pkey`, `subjects_public_code_uq`

---

## task_concepts

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| task_id | uuid | 否 |  |
| concept_id | uuid | 否 |  |

- **主键**：`task_id`, `concept_id`
- **外键**：(concept_id) → concepts(id)；(task_id) → tasks(id)
- **索引**：`task_concepts_concept_idx`, `task_concepts_pk`

---

## task_hints

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| task_version_id | uuid | 否 |  |
| ord | integer | 否 |  |
| content | text | 否 |  |

- **主键**：`id`
- **外键**：(task_version_id) → task_versions(id)
- **索引**：`task_hints_ord_uq`, `task_hints_pkey`

---

## task_versions

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| task_id | uuid | 否 |  |
| version_no | integer | 否 |  |
| prompt | text | 否 |  |
| is_variant | boolean | 否 | `false` |
| difficulty | integer | 否 | `2` |
| answer_spec | jsonb | 否 |  |
| dataset_key | text | 是 |  |
| source | text | 否 | `'seed'::text` |
| source_chunk_id | uuid | 是 |  |
| model_call_id | uuid | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(model_call_id) → model_calls(id)；(source_chunk_id) → material_chunks(id)；(task_id) → tasks(id)
- **CHECK**：`task_versions_difficulty_ck`, `task_versions_source_ck`
- **索引**：`task_versions_no_uq`, `task_versions_pkey`

---

## tasks

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| subject_id | uuid | 否 |  |
| owner_user_id | uuid | 是 |  |
| kind | text | 否 |  |
| title | text | 否 |  |
| family_key | text | 否 |  |
| created_at | timestamp with time zone | 否 | `now()` |
| archived_at | timestamp with time zone | 是 |  |

- **主键**：`id`
- **外键**：(owner_user_id) → users(id)；(subject_id) → subjects(id)
- **CHECK**：`tasks_kind_ck`
- **索引**：`tasks_pkey`, `tasks_subject_idx`

---

## users

| 列 | 类型 | 可空 | 默认 |
|---|---|---|---|
| id | uuid | 否 | `gen_random_uuid()` |
| handle | text | 否 |  |
| display_name | text | 否 |  |
| password_hash | text | 否 |  |
| is_demo | boolean | 否 | `false` |
| timezone | text | 否 | `'Asia/Taipei'::text` |
| reduced_motion | boolean | 否 | `false` |
| render_mode | text | 否 | `'auto'::text` |
| onboarded_at | timestamp with time zone | 是 |  |
| last_conversation_id | uuid | 是 |  |
| last_plant_id | uuid | 是 |  |
| created_at | timestamp with time zone | 否 | `now()` |

- **主键**：`id`
- **外键**：(last_conversation_id) → conversations(id)；(last_plant_id) → plants(id)
- **CHECK**：`users_handle_ck`, `users_render_mode_ck`
- **索引**：`users_handle_uq`, `users_pkey`

---

