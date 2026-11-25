# 候选键与唯一性约束清单（自动生成）

> 数据库强制候选键：完整、有效、所有键列 NOT NULL 的唯一索引，剔除含更小唯一列组的超键。INCLUDE 列不参与键。可空 UNIQUE 和部分/表达式唯一性单列，不作为全局候选键。业务函数依赖仍需人工核对。

表数：57（排除分区子表与视图）。

|表|主键|强制候选键|可空 UNIQUE|条件/表达式唯一性|非最小超键|
|---|---|---|---|---|---|
|attempts|(id)|(id)|(user_id, submit_key)|—|—|
|audit_log|(id, at)|(id, at)|—|—|—|
|auth_sessions|(id)|(id)；(token_hash)|—|—|—|
|card_publications|(card_version_id, class_id)|(card_version_id, class_id)|—|—|—|
|card_sources|(card_version_id, message_id)|(card_version_id, message_id)|—|—|—|
|card_versions|(id)|(id)；(card_id, version_no)|—|—|—|
|cdc_consumed|(event_id)|(event_id)|—|—|—|
|cdc_offsets|(slot_name)|(slot_name)|—|—|—|
|class_members|(class_id, user_id)|(class_id, user_id)|—|—|—|
|class_stats|(class_id)|(class_id)|—|—|—|
|classes|(id)|(id)；(join_code)|—|—|—|
|concept_aliases|(id)|(id)；(concept_id, alias_norm)|—|—|—|
|concept_prerequisites|(concept_id, prereq_concept_id)|(concept_id, prereq_concept_id)|—|—|—|
|concept_suggestions|(id)|(id)；(message_id, name_norm)|—|—|—|
|concepts|(id)|(id)|—|(subject_id, name_norm)；(subject_id, owner_user_id, name_norm)|—|
|contributions|(id)|(id)|—|—|—|
|conversation_summaries|(conversation_id)|(conversation_id)|—|—|—|
|conversations|(id)|(id)|—|—|(id, user_id)|
|evaluations|(id)|(id)；(attempt_id)|—|—|—|
|garden_knowledge_places|(user_id, concept_id, place)|(user_id, concept_id, place)|—|—|—|
|gardens|(id)|(id)；(planet_id, subject_id)|—|—|—|
|goal_concepts|(goal_id, concept_id)|(goal_id, concept_id)|—|—|—|
|growth_events|(id)|(id)|—|—|—|
|hint_events|(id)|(id)；(attempt_id, hint_id)|—|—|—|
|knowledge_cards|(id)|(id)|—|—|—|
|learning_evidence|(id)|(id)|—|(attempt_id, concept_id, kind)|—|
|learning_goals|(id)|(id)|—|—|—|
|learning_intents|(id)|(id)|—|(class_id, user_id, concept_id, direction)|—|
|learning_states|(user_id, concept_id)|(user_id, concept_id)|—|—|—|
|material_chunk_concepts|(chunk_id, concept_id)|(chunk_id, concept_id)|—|—|—|
|material_chunk_embeddings|(chunk_id, model_key)|(chunk_id, model_key)|—|—|—|
|material_chunks|(id)|(id)；(version_id, ord)|—|—|—|
|material_concepts|(version_id, concept_id)|(version_id, concept_id)|—|—|—|
|material_versions|(id)|(id)；(material_id, version_no)|—|—|—|
|materials|(id)|(id)|—|—|—|
|memories|(id)|(id)|—|(user_id, kind, content_norm)|—|
|memory_controls|(user_id)|(user_id)|—|—|—|
|message_citations|(id)|(id)；(message_id, chunk_id)|—|—|—|
|message_concepts|(message_id, concept_id)|(message_id, concept_id)|—|—|—|
|message_terms|(term, message_id)|(term, message_id)|—|—|—|
|messages|(id)|(id)；(conversation_id, seq)|—|—|—|
|model_calls|(id)|(id)|—|—|—|
|notes|(id)|(id)|—|—|—|
|outbox_events|(id)|(id)|—|—|—|
|planet_layout_items|(id)|(id)|—|—|—|
|planet_layouts|(id)|(id)；(planet_id)|—|—|—|
|planets|(id)|(id)；(user_id)|—|—|—|
|plants|(id)|(id)；(garden_id, concept_id)|—|—|—|
|sharing_preferences|(class_id, user_id)|(class_id, user_id)|—|—|—|
|study_group_members|(group_id, user_id)|(group_id, user_id)|—|—|—|
|study_groups|(id)|(id)|—|—|—|
|subjects|(id)|(id)|—|(code)；(owner_user_id, code)|—|
|task_concepts|(task_id, concept_id)|(task_id, concept_id)|—|—|—|
|task_hints|(id)|(id)；(task_version_id, ord)|—|—|—|
|task_versions|(id)|(id)；(task_id, version_no)|—|—|—|
|tasks|(id)|(id)|—|—|—|
|users|(id)|(id)；(handle)|—|—|—|
