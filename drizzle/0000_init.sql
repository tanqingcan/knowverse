-- 由 drizzle-kit generate 根据 src/db/schema.ts 生成；仅在文件开头手工加入 pg_trgm 扩展（GIN 三元组索引依赖它）。
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_version_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"conversation_id" uuid,
	"answer" text,
	"status" text DEFAULT 'open' NOT NULL,
	"submit_key" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "attempts_mode_ck" CHECK ("attempts"."mode" in ('guided','independent','diagnostic')),
	CONSTRAINT "attempts_status_ck" CHECK ("attempts"."status" in ('open','evaluated','error'))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "card_publications" (
	"card_version_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "card_publications_pk" PRIMARY KEY("card_version_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "card_sources" (
	"card_version_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	CONSTRAINT "card_sources_pk" PRIMARY KEY("card_version_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "card_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"change_note" text NOT NULL,
	"drafted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_members" (
	"class_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_members_pk" PRIMARY KEY("class_id","user_id"),
	CONSTRAINT "class_members_role_ck" CHECK ("class_members"."role" in ('teacher','student'))
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"join_code" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"alias_norm" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_prerequisites" (
	"concept_id" uuid NOT NULL,
	"prereq_concept_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_prerequisites_pk" PRIMARY KEY("concept_id","prereq_concept_id"),
	CONSTRAINT "concept_prereq_not_self_ck" CHECK ("concept_prerequisites"."concept_id" <> "concept_prerequisites"."prereq_concept_id")
);
--> statement-breakpoint
CREATE TABLE "concept_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"subject_id" uuid,
	"raw_name" text NOT NULL,
	"name_norm" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"accepted_concept_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_suggestions_status_ck" CHECK ("concept_suggestions"."status" in ('pending','accepted','dismissed'))
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_kind_ck" CHECK ("contributions"."kind" in ('explanation','question','review'))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject_id" uuid,
	"goal_id" uuid,
	"focus_concept_id" uuid,
	"origin" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "conversations_id_user_uq" UNIQUE("id","user_id"),
	CONSTRAINT "conversations_origin_ck" CHECK ("conversations"."origin" in ('user','seed'))
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"evaluator" text NOT NULL,
	"verdict" text NOT NULL,
	"score" numeric(5, 2),
	"feedback" text NOT NULL,
	"rubric" jsonb,
	"uncertainty" text,
	"model_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_verdict_ck" CHECK ("evaluations"."verdict" in ('correct','partial','incorrect','ungraded'))
);
--> statement-breakpoint
CREATE TABLE "gardens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planet_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "goal_concepts" (
	"goal_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"route_order" integer NOT NULL,
	CONSTRAINT "goal_concepts_pk" PRIMARY KEY("goal_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "growth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_stage" text,
	"to_stage" text,
	"evidence_id" uuid,
	"reason" text NOT NULL,
	"origin" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_events_type_ck" CHECK ("growth_events"."event_type" in ('planted','natal_chosen','evidence_added','stage_changed','evidence_revoked','appearance_changed'))
);
--> statement-breakpoint
CREATE TABLE "hint_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"hint_id" uuid NOT NULL,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "learning_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"attempt_id" uuid,
	"message_id" uuid,
	"note_id" uuid,
	"material_version_id" uuid,
	"used_hints" boolean DEFAULT false NOT NULL,
	"ai_assisted" boolean DEFAULT false NOT NULL,
	"detail" text NOT NULL,
	"origin" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	CONSTRAINT "learning_evidence_kind_ck" CHECK ("learning_evidence"."kind" in ('self_report','read','asked','note','guided_practice','independent_attempt','independent_variant_pass','team_work')),
	CONSTRAINT "learning_evidence_revoke_ck" CHECK (("learning_evidence"."revoked_at" is null) = ("learning_evidence"."revoke_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "learning_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "learning_goals_status_ck" CHECK ("learning_goals"."status" in ('active','done','archived'))
);
--> statement-breakpoint
CREATE TABLE "learning_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "learning_intents_direction_ck" CHECK ("learning_intents"."direction" in ('seek','offer'))
);
--> statement-breakpoint
CREATE TABLE "learning_states" (
	"user_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"stage_reason" text NOT NULL,
	"last_evidence_at" timestamp with time zone,
	"review_due_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "learning_states_pk" PRIMARY KEY("user_id","concept_id"),
	CONSTRAINT "learning_states_stage_ck" CHECK ("learning_states"."stage" in ('seed','sprout','leaf','bud','bloom'))
);
--> statement-breakpoint
CREATE TABLE "material_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"page_no" integer,
	"paragraph_no" integer,
	"heading" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_concepts" (
	"version_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "material_concepts_pk" PRIMARY KEY("version_id","concept_id"),
	CONSTRAINT "material_concepts_status_ck" CHECK ("material_concepts"."status" in ('candidate','confirmed','rejected'))
);
--> statement-breakpoint
CREATE TABLE "material_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"mime_type" text,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_path" text,
	"status" text NOT NULL,
	"status_detail" text,
	"page_count" integer,
	"uploaded_by_user_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "material_versions_type_ck" CHECK ("material_versions"."file_type" in ('txt','md','pdf','pptx','other')),
	CONSTRAINT "material_versions_status_ck" CHECK ("material_versions"."status" in ('processing','ready','needs_ocr','unsupported','failed'))
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"course" text NOT NULL,
	"kind" text DEFAULT 'slides' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "materials_kind_ck" CHECK ("materials"."kind" in ('slides','notes','exercises','textbook','other'))
);
--> statement-breakpoint
CREATE TABLE "message_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"ref_label" text NOT NULL,
	"quote" text NOT NULL,
	"ord" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_concepts" (
	"message_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"confidence" real,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_concepts_pk" PRIMARY KEY("message_id","concept_id"),
	CONSTRAINT "message_concepts_source_ck" CHECK ("message_concepts"."source" in ('ai','user','context')),
	CONSTRAINT "message_concepts_status_ck" CHECK ("message_concepts"."status" in ('candidate','confirmed','rejected'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"mode" text,
	"reply_to_id" uuid,
	"model_call_id" uuid,
	"basis" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "messages_role_ck" CHECK ("messages"."role" in ('user','assistant')),
	CONSTRAINT "messages_status_ck" CHECK ("messages"."status" in ('pending','complete','failed')),
	CONSTRAINT "messages_mode_ck" CHECK ("messages"."mode" is null or "messages"."mode" in ('live','demo')),
	CONSTRAINT "messages_basis_ck" CHECK ("messages"."basis" is null or "messages"."basis" in ('materials','general','mixed','insufficient'))
);
--> statement-breakpoint
CREATE TABLE "model_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"mode" text NOT NULL,
	"provider" text,
	"model" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"latency_ms" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"error_code" text,
	"error_message" text,
	"tool_trace" jsonb,
	CONSTRAINT "model_calls_mode_ck" CHECK ("model_calls"."mode" in ('live','demo')),
	CONSTRAINT "model_calls_status_ck" CHECK ("model_calls"."status" in ('running','ok','error','timeout','invalid_output'))
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"concept_id" uuid,
	"source_message_id" uuid,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"topic" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sky_theme" text DEFAULT 'indigo' NOT NULL,
	"natal_plant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garden_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"species" text NOT NULL,
	"color" text NOT NULL,
	"nickname" text,
	"lon" real NOT NULL,
	"lat" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "plants_species_ck" CHECK ("plants"."species" in ('rose','iris','sunflower','lily'))
);
--> statement-breakpoint
CREATE TABLE "sharing_preferences" (
	"class_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"share_planet" boolean DEFAULT false NOT NULL,
	"share_stages" boolean DEFAULT false NOT NULL,
	"open_to_partner" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sharing_preferences_pk" PRIMARY KEY("class_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "study_group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_group_members_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "study_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"title" text NOT NULL,
	"capacity" integer NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_groups_capacity_ck" CHECK ("study_groups"."capacity" between 2 and 6),
	CONSTRAINT "study_groups_status_ck" CHECK ("study_groups"."status" in ('open','closed'))
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_concepts" (
	"task_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	CONSTRAINT "task_concepts_pk" PRIMARY KEY("task_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "task_hints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_version_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"prompt" text NOT NULL,
	"is_variant" boolean DEFAULT false NOT NULL,
	"difficulty" integer DEFAULT 2 NOT NULL,
	"answer_spec" jsonb NOT NULL,
	"dataset_key" text,
	"source" text DEFAULT 'seed' NOT NULL,
	"source_chunk_id" uuid,
	"model_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_versions_source_ck" CHECK ("task_versions"."source" in ('seed','ai_generated','teacher')),
	CONSTRAINT "task_versions_difficulty_ck" CHECK ("task_versions"."difficulty" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"family_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "tasks_kind_ck" CHECK ("tasks"."kind" in ('sql','choice','numeric','open'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'Asia/Taipei' NOT NULL,
	"reduced_motion" boolean DEFAULT false NOT NULL,
	"render_mode" text DEFAULT 'auto' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"last_conversation_id" uuid,
	"last_plant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_render_mode_ck" CHECK ("users"."render_mode" in ('auto','3d','2d')),
	CONSTRAINT "users_handle_ck" CHECK ("users"."handle" ~ '^[a-z0-9_.-]{3,32}$')
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_task_version_id_task_versions_id_fk" FOREIGN KEY ("task_version_id") REFERENCES "public"."task_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_publications" ADD CONSTRAINT "card_publications_card_version_id_card_versions_id_fk" FOREIGN KEY ("card_version_id") REFERENCES "public"."card_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_publications" ADD CONSTRAINT "card_publications_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_sources" ADD CONSTRAINT "card_sources_card_version_id_card_versions_id_fk" FOREIGN KEY ("card_version_id") REFERENCES "public"."card_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_sources" ADD CONSTRAINT "card_sources_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_versions" ADD CONSTRAINT "card_versions_card_id_knowledge_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_aliases" ADD CONSTRAINT "concept_aliases_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_aliases" ADD CONSTRAINT "concept_aliases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_prerequisites" ADD CONSTRAINT "concept_prerequisites_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_prerequisites" ADD CONSTRAINT "concept_prerequisites_prereq_concept_id_concepts_id_fk" FOREIGN KEY ("prereq_concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_suggestions" ADD CONSTRAINT "concept_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_suggestions" ADD CONSTRAINT "concept_suggestions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_suggestions" ADD CONSTRAINT "concept_suggestions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_suggestions" ADD CONSTRAINT "concept_suggestions_accepted_concept_id_concepts_id_fk" FOREIGN KEY ("accepted_concept_id") REFERENCES "public"."concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_member_fk" FOREIGN KEY ("group_id","user_id") REFERENCES "public"."study_group_members"("group_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_goal_id_learning_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."learning_goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_focus_concept_id_concepts_id_fk" FOREIGN KEY ("focus_concept_id") REFERENCES "public"."concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gardens" ADD CONSTRAINT "gardens_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gardens" ADD CONSTRAINT "gardens_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_concepts" ADD CONSTRAINT "goal_concepts_goal_id_learning_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."learning_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_concepts" ADD CONSTRAINT "goal_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_events" ADD CONSTRAINT "growth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_events" ADD CONSTRAINT "growth_events_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_events" ADD CONSTRAINT "growth_events_evidence_id_learning_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."learning_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hint_events" ADD CONSTRAINT "hint_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hint_events" ADD CONSTRAINT "hint_events_hint_id_task_hints_id_fk" FOREIGN KEY ("hint_id") REFERENCES "public"."task_hints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_material_version_id_material_versions_id_fk" FOREIGN KEY ("material_version_id") REFERENCES "public"."material_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_goals" ADD CONSTRAINT "learning_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_goals" ADD CONSTRAINT "learning_goals_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_intents" ADD CONSTRAINT "learning_intents_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_intents" ADD CONSTRAINT "learning_intents_member_fk" FOREIGN KEY ("class_id","user_id") REFERENCES "public"."class_members"("class_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_states" ADD CONSTRAINT "learning_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_states" ADD CONSTRAINT "learning_states_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_version_id_material_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."material_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_concepts" ADD CONSTRAINT "material_concepts_version_id_material_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."material_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_concepts" ADD CONSTRAINT "material_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_chunk_id_material_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."material_chunks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_concepts" ADD CONSTRAINT "message_concepts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_concepts" ADD CONSTRAINT "message_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_user_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planets" ADD CONSTRAINT "planets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_garden_id_gardens_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."gardens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_preferences" ADD CONSTRAINT "sharing_preferences_member_fk" FOREIGN KEY ("class_id","user_id") REFERENCES "public"."class_members"("class_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_concepts" ADD CONSTRAINT "task_concepts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_concepts" ADD CONSTRAINT "task_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_hints" ADD CONSTRAINT "task_hints_task_version_id_task_versions_id_fk" FOREIGN KEY ("task_version_id") REFERENCES "public"."task_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_source_chunk_id_material_chunks_id_fk" FOREIGN KEY ("source_chunk_id") REFERENCES "public"."material_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_user_submit_key_uq" ON "attempts" USING btree ("user_id","submit_key");--> statement-breakpoint
CREATE INDEX "attempts_user_task_idx" ON "attempts" USING btree ("user_id","task_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_uq" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_versions_no_uq" ON "card_versions" USING btree ("card_id","version_no");--> statement-breakpoint
CREATE INDEX "class_members_user_idx" ON "class_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_join_code_uq" ON "classes" USING btree ("join_code");--> statement-breakpoint
CREATE UNIQUE INDEX "concept_aliases_uq" ON "concept_aliases" USING btree ("concept_id","alias_norm");--> statement-breakpoint
CREATE INDEX "concept_aliases_norm_idx" ON "concept_aliases" USING btree ("alias_norm");--> statement-breakpoint
CREATE INDEX "concept_prereq_rev_idx" ON "concept_prerequisites" USING btree ("prereq_concept_id");--> statement-breakpoint
CREATE UNIQUE INDEX "concept_suggestions_msg_name_uq" ON "concept_suggestions" USING btree ("message_id","name_norm");--> statement-breakpoint
CREATE UNIQUE INDEX "concepts_public_name_uq" ON "concepts" USING btree ("subject_id","name_norm") WHERE "concepts"."owner_user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "concepts_owner_name_uq" ON "concepts" USING btree ("subject_id","owner_user_id","name_norm") WHERE "concepts"."owner_user_id" is not null;--> statement-breakpoint
CREATE INDEX "concepts_subject_idx" ON "concepts" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "conversations_user_updated_idx" ON "conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_title_trgm_idx" ON "conversations" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "evaluations_attempt_uq" ON "evaluations" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gardens_planet_subject_uq" ON "gardens" USING btree ("planet_id","subject_id");--> statement-breakpoint
CREATE INDEX "goal_concepts_concept_idx" ON "goal_concepts" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "growth_events_user_created_idx" ON "growth_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "growth_events_concept_idx" ON "growth_events" USING btree ("user_id","concept_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hint_events_attempt_hint_uq" ON "hint_events" USING btree ("attempt_id","hint_id");--> statement-breakpoint
CREATE INDEX "knowledge_cards_user_idx" ON "knowledge_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "learning_evidence_user_concept_idx" ON "learning_evidence" USING btree ("user_id","concept_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_evidence_attempt_concept_uq" ON "learning_evidence" USING btree ("attempt_id","concept_id","kind") WHERE "learning_evidence"."attempt_id" is not null;--> statement-breakpoint
CREATE INDEX "learning_goals_user_idx" ON "learning_goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_intents_active_uq" ON "learning_intents" USING btree ("class_id","user_id","concept_id","direction") WHERE "learning_intents"."withdrawn_at" is null;--> statement-breakpoint
CREATE INDEX "learning_intents_match_idx" ON "learning_intents" USING btree ("class_id","concept_id","direction");--> statement-breakpoint
CREATE INDEX "learning_states_review_idx" ON "learning_states" USING btree ("user_id","review_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "material_chunks_ord_uq" ON "material_chunks" USING btree ("version_id","ord");--> statement-breakpoint
CREATE INDEX "material_chunks_content_trgm_idx" ON "material_chunks" USING gin ("content" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "material_versions_no_uq" ON "material_versions" USING btree ("material_id","version_no");--> statement-breakpoint
CREATE INDEX "materials_owner_idx" ON "materials" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_citations_msg_chunk_uq" ON "message_citations" USING btree ("message_id","chunk_id");--> statement-breakpoint
CREATE INDEX "message_citations_chunk_idx" ON "message_citations" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "message_concepts_concept_idx" ON "message_concepts" USING btree ("concept_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conv_seq_uq" ON "messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "messages_user_created_idx" ON "messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_reply_idx" ON "messages" USING btree ("reply_to_id");--> statement-breakpoint
CREATE INDEX "messages_content_trgm_idx" ON "messages" USING gin ("content" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "model_calls_user_idx" ON "model_calls" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "notes_user_concept_idx" ON "notes" USING btree ("user_id","concept_id");--> statement-breakpoint
CREATE INDEX "notes_content_trgm_idx" ON "notes" USING gin ("content" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "outbox_undelivered_idx" ON "outbox_events" USING btree ("id") WHERE "outbox_events"."delivered_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "planets_user_uq" ON "planets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plants_garden_concept_uq" ON "plants" USING btree ("garden_id","concept_id");--> statement-breakpoint
CREATE INDEX "plants_concept_idx" ON "plants" USING btree ("concept_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_public_code_uq" ON "subjects" USING btree ("code") WHERE "subjects"."owner_user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_owner_code_uq" ON "subjects" USING btree ("owner_user_id","code") WHERE "subjects"."owner_user_id" is not null;--> statement-breakpoint
CREATE INDEX "task_concepts_concept_idx" ON "task_concepts" USING btree ("concept_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_hints_ord_uq" ON "task_hints" USING btree ("task_version_id","ord");--> statement-breakpoint
CREATE UNIQUE INDEX "task_versions_no_uq" ON "task_versions" USING btree ("task_id","version_no");--> statement-breakpoint
CREATE INDEX "tasks_subject_idx" ON "tasks" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_uq" ON "users" USING btree ("handle");