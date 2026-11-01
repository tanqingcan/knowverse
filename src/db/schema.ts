/**
 * 知屿 KNOWVERSE —— 关系模式（Drizzle ORM 定义，migration 由 drizzle-kit 生成）
 *
 * 约定：
 *  - 主键默认 uuid（gen_random_uuid()），时间统一 timestamptz（UTC 存储，按用户时区展示/筛选）。
 *  - 枚举使用 text + CHECK，便于在报告中解释、迁移时无需 ALTER TYPE。
 *  - 多对多一律使用关联表；不使用逗号拼接 ID；核心业务关系不塞进 JSON。
 *  - jsonb 只用于“不参与关系查询的配置或日志”：判题规格、评分维度明细、模型调用轨迹、outbox 载荷。
 *  - 删除策略：用户可见的业务数据使用 archived_at 归档；被引用的共享数据（课程资料版本、片段、题目版本、知识点）
 *    不物理删除，外键使用 RESTRICT 保护引用；个人从属数据（会话、消息、证据、状态…）随账户 CASCADE 删除，
 *    个人数据内部的相互引用使用 NO ACTION（语句结束时检查），保证整账户删除可以一次完成。
 */
import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, timestamp, integer, boolean, jsonb, numeric, bigint, real,
  primaryKey, foreignKey, unique, index, uniqueIndex, check, type AnyPgColumn,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").defaultNow().notNull();
const id = () => uuid("id").primaryKey().defaultRandom();

/* ───────────────────────────── 1. 身份与会话 ───────────────────────────── */

export const users = pgTable("users", {
  id: id(),
  handle: text("handle").notNull(),                      // 登录名（小写规范化）
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),          // scrypt$salt$hash
  isDemo: boolean("is_demo").notNull().default(false),    // 预置演示账号（界面明确标注）
  timezone: text("timezone").notNull().default("Asia/Taipei"),
  reducedMotion: boolean("reduced_motion").notNull().default(false),
  renderMode: text("render_mode").notNull().default("auto"),
  onboardedAt: ts("onboarded_at"),
  lastConversationId: uuid("last_conversation_id"),      // 上次上下文（软引用，见 migration 中的 FK ON DELETE SET NULL）
  lastPlantId: uuid("last_plant_id"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("users_handle_uq").on(t.handle),
  check("users_render_mode_ck", sql`${t.renderMode} in ('auto','3d','2d')`),
  check("users_handle_ck", sql`${t.handle} ~ '^[a-z0-9_.-]{3,32}$'`),
]);

export const authSessions = pgTable("auth_sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),               // 只存 SHA-256，不存明文 token
  createdAt: createdAt(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
}, (t) => [
  uniqueIndex("auth_sessions_token_uq").on(t.tokenHash),
  index("auth_sessions_user_idx").on(t.userId),
]);

/* ───────────────────────────── 2. 学科与知识点 ───────────────────────────── */

export const subjects = pgTable("subjects", {
  id: id(),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "restrict" }), // NULL = 公共课程目录
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: createdAt(),
}, (t) => [
  // 公共学科 code 全局唯一；个人学科在本人范围内唯一
  uniqueIndex("subjects_public_code_uq").on(t.code).where(sql`${t.ownerUserId} is null`),
  uniqueIndex("subjects_owner_code_uq").on(t.ownerUserId, t.code).where(sql`${t.ownerUserId} is not null`),
]);

export const concepts = pgTable("concepts", {
  id: id(),
  subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "restrict" }),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "restrict" }), // NULL = 课程公共知识点
  name: text("name").notNull(),
  nameNorm: text("name_norm").notNull(),                 // 规范化名称：小写、去空白与标点
  summary: text("summary"),
  createdAt: createdAt(),
  archivedAt: ts("archived_at"),
}, (t) => [
  uniqueIndex("concepts_public_name_uq").on(t.subjectId, t.nameNorm).where(sql`${t.ownerUserId} is null`),
  uniqueIndex("concepts_owner_name_uq").on(t.subjectId, t.ownerUserId, t.nameNorm).where(sql`${t.ownerUserId} is not null`),
  index("concepts_subject_idx").on(t.subjectId),
]);

/** 同义词/别名：在学科语境下把“左外连接”“LEFT OUTER JOIN”等映射到同一知识点 */
export const conceptAliases = pgTable("concept_aliases", {
  id: id(),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  aliasNorm: text("alias_norm").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("concept_aliases_uq").on(t.conceptId, t.aliasNorm),
  index("concept_aliases_norm_idx").on(t.aliasNorm),
]);

/** 先修关系（自反多对多），递归 CTE 查询闭包并检测循环 */
export const conceptPrerequisites = pgTable("concept_prerequisites", {
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
  prereqConceptId: uuid("prereq_concept_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ name: "concept_prerequisites_pk", columns: [t.conceptId, t.prereqConceptId] }),
  check("concept_prereq_not_self_ck", sql`${t.conceptId} <> ${t.prereqConceptId}`),
  index("concept_prereq_rev_idx").on(t.prereqConceptId),
]);

/* ───────────────────────────── 3. 星球世界 ───────────────────────────── */

export const planets = pgTable("planets", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  skyTheme: text("sky_theme").notNull().default("indigo"),
  natalPlantId: uuid("natal_plant_id"),                  // 本命花：FK 在 migration 中以 DEFERRABLE 方式添加（与 plants 互相引用）
  createdAt: createdAt(),
}, (t) => [uniqueIndex("planets_user_uq").on(t.userId)]);   // 用户 1:1 星球

export const gardens = pgTable("gardens", {
  id: id(),
  planetId: uuid("planet_id").notNull().references(() => planets.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  archivedAt: ts("archived_at"),
}, (t) => [uniqueIndex("gardens_planet_subject_uq").on(t.planetId, t.subjectId)]);

/** 植物 = 知识点在某个花圃中的“外观实例”。外观（花种、花色、位置）与知识点本身分离 */
export const plants = pgTable("plants", {
  id: id(),
  gardenId: uuid("garden_id").notNull().references(() => gardens.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
  species: text("species").notNull(),
  color: text("color").notNull(),
  nickname: text("nickname"),
  lon: real("lon").notNull(),                            // 星球表面经度（度）
  lat: real("lat").notNull(),                            // 纬度（度）
  createdAt: createdAt(),
  archivedAt: ts("archived_at"),
}, (t) => [
  uniqueIndex("plants_garden_concept_uq").on(t.gardenId, t.conceptId),
  index("plants_concept_idx").on(t.conceptId),
  check("plants_species_ck", sql`${t.species} in ('rose','iris','sunflower','lily')`),
]);

/* ───────────────────────────── 4. 学习目标与探索路线 ───────────────────────────── */

export const learningGoals = pgTable("learning_goals", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  archivedAt: ts("archived_at"),
}, (t) => [
  index("learning_goals_user_idx").on(t.userId, t.status),
  check("learning_goals_status_ck", sql`${t.status} in ('active','done','archived')`),
]);

export const goalConcepts = pgTable("goal_concepts", {
  goalId: uuid("goal_id").notNull().references(() => learningGoals.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
  routeOrder: integer("route_order").notNull(),           // 探索路线中的顺序
}, (t) => [
  primaryKey({ name: "goal_concepts_pk", columns: [t.goalId, t.conceptId] }),
  index("goal_concepts_concept_idx").on(t.conceptId),
]);

/* ───────────────────────────── 5. 对话与历史问答 ───────────────────────────── */

export const conversations = pgTable("conversations", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  goalId: uuid("goal_id").references(() => learningGoals.id, { onDelete: "set null" }),
  focusConceptId: uuid("focus_concept_id").references(() => concepts.id, { onDelete: "set null" }),
  origin: text("origin").notNull().default("user"),      // user | seed（预置演示历史，界面标注）
  createdAt: createdAt(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
  archivedAt: ts("archived_at"),
}, (t) => [
  // 供 messages 的复合外键引用，保证 messages.user_id 与所属会话一致（受控冗余）
  unique("conversations_id_user_uq").on(t.id, t.userId),
  index("conversations_user_updated_idx").on(t.userId, t.updatedAt),
  index("conversations_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
  check("conversations_origin_ck", sql`${t.origin} in ('user','seed')`),
]);

/** 模型调用元数据（一次智能体运行）。tool_trace 为日志性 jsonb */
export const modelCalls = pgTable("model_calls", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),                    // chat | create_practice | evaluate | draft_card
  mode: text("mode").notNull(),                          // live | demo
  provider: text("provider"),
  model: text("model"),
  status: text("status").notNull(),                      // ok | error | timeout | invalid_output
  startedAt: ts("started_at").defaultNow().notNull(),
  finishedAt: ts("finished_at"),
  latencyMs: integer("latency_ms"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  toolTrace: jsonb("tool_trace"),
}, (t) => [
  index("model_calls_user_idx").on(t.userId, t.startedAt),
  check("model_calls_mode_ck", sql`${t.mode} in ('live','demo')`),
  check("model_calls_status_ck", sql`${t.status} in ('running','ok','error','timeout','invalid_output')`),
]);

export const messages = pgTable("messages", {
  id: id(),
  conversationId: uuid("conversation_id").notNull(),
  userId: uuid("user_id").notNull(),                     // 冗余：= conversations.user_id，由复合外键保证一致
  seq: integer("seq").notNull(),                         // 会话内顺序
  role: text("role").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("complete"),  // pending | complete | failed
  mode: text("mode"),                                    // assistant 消息：live | demo
  replyToId: uuid("reply_to_id").references((): AnyPgColumn => messages.id, { onDelete: "no action" }),
  modelCallId: uuid("model_call_id").references(() => modelCalls.id, { onDelete: "set null" }),
  basis: text("basis"),                                  // assistant：materials | general | mixed | insufficient
  errorMessage: text("error_message"),
  createdAt: createdAt(),
  completedAt: ts("completed_at"),
}, (t) => [
  foreignKey({ name: "messages_conversation_user_fk", columns: [t.conversationId, t.userId], foreignColumns: [conversations.id, conversations.userId] }).onDelete("cascade"),
  uniqueIndex("messages_conv_seq_uq").on(t.conversationId, t.seq),
  index("messages_user_created_idx").on(t.userId, t.createdAt),
  index("messages_reply_idx").on(t.replyToId),
  index("messages_content_trgm_idx").using("gin", t.content.op("gin_trgm_ops")),
  check("messages_role_ck", sql`${t.role} in ('user','assistant')`),
  check("messages_status_ck", sql`${t.status} in ('pending','complete','failed')`),
  check("messages_mode_ck", sql`${t.mode} is null or ${t.mode} in ('live','demo')`),
  check("messages_basis_ck", sql`${t.basis} is null or ${t.basis} in ('materials','general','mixed','insufficient')`),
]);

/** 消息—知识点（多对多），区分 AI 候选与用户确认 */
export const messageConcepts = pgTable("message_concepts", {
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
  source: text("source").notNull(),                      // ai | user | context
  status: text("status").notNull(),                      // candidate | confirmed | rejected
  confidence: real("confidence"),
  decidedAt: ts("decided_at"),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ name: "message_concepts_pk", columns: [t.messageId, t.conceptId] }),
  index("message_concepts_concept_idx").on(t.conceptId, t.status),
  check("message_concepts_source_ck", sql`${t.source} in ('ai','user','context')`),
  check("message_concepts_status_ck", sql`${t.status} in ('candidate','confirmed','rejected')`),
]);

/** AI 提出、但尚无对应知识点的新概念候选——AI 只能提议，由用户决定是否建立 */
export const conceptSuggestions = pgTable("concept_suggestions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  rawName: text("raw_name").notNull(),
  nameNorm: text("name_norm").notNull(),
  status: text("status").notNull().default("pending"),   // pending | accepted | dismissed
  acceptedConceptId: uuid("accepted_concept_id").references(() => concepts.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("concept_suggestions_msg_name_uq").on(t.messageId, t.nameNorm),
  check("concept_suggestions_status_ck", sql`${t.status} in ('pending','accepted','dismissed')`),
]);

/* ───────────────────────────── 6. 教学资料与 RAG ───────────────────────────── */

export const materials = pgTable("materials", {
  id: id(),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "restrict" }), // NULL = 课程公共资料
  subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  course: text("course").notNull(),
  kind: text("kind").notNull().default("slides"),
  createdAt: createdAt(),
  archivedAt: ts("archived_at"),
}, (t) => [
  index("materials_owner_idx").on(t.ownerUserId),
  check("materials_kind_ck", sql`${t.kind} in ('slides','notes','exercises','textbook','other')`),
]);

export const materialVersions = pgTable("material_versions", {
  id: id(),
  materialId: uuid("material_id").notNull().references(() => materials.id, { onDelete: "restrict" }),
  versionNo: integer("version_no").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),                 // txt | md | pdf | pptx | other
  mimeType: text("mime_type"),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  storagePath: text("storage_path"),
  status: text("status").notNull(),                      // processing | ready | needs_ocr | unsupported | failed
  statusDetail: text("status_detail"),
  pageCount: integer("page_count"),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  uploadedAt: ts("uploaded_at").defaultNow().notNull(),
  processedAt: ts("processed_at"),
}, (t) => [
  uniqueIndex("material_versions_no_uq").on(t.materialId, t.versionNo),
  check("material_versions_type_ck", sql`${t.fileType} in ('txt','md','pdf','pptx','other')`),
  check("material_versions_status_ck", sql`${t.status} in ('processing','ready','needs_ocr','unsupported','failed')`),
]);

export const materialChunks = pgTable("material_chunks", {
  id: id(),
  versionId: uuid("version_id").notNull().references(() => materialVersions.id, { onDelete: "restrict" }),
  ord: integer("ord").notNull(),
  pageNo: integer("page_no"),                            // PDF 页码 / PPTX 页号
  paragraphNo: integer("paragraph_no"),                  // TXT/MD 段落号
  heading: text("heading"),
  content: text("content").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("material_chunks_ord_uq").on(t.versionId, t.ord),
  index("material_chunks_content_trgm_idx").using("gin", t.content.op("gin_trgm_ops")),
]);

/** 资料版本—知识点：提取后的候选概念，需要用户确认 */
export const materialConcepts = pgTable("material_concepts", {
  versionId: uuid("version_id").notNull().references(() => materialVersions.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("candidate"),
  hitCount: integer("hit_count").notNull().default(0),
}, (t) => [
  primaryKey({ name: "material_concepts_pk", columns: [t.versionId, t.conceptId] }),
  check("material_concepts_status_ck", sql`${t.status} in ('candidate','confirmed','rejected')`),
]);

/** 回答引用：绑定到具体资料片段（片段属于不可变的资料版本） */
export const messageCitations = pgTable("message_citations", {
  id: id(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  chunkId: uuid("chunk_id").notNull().references(() => materialChunks.id, { onDelete: "restrict" }),
  refLabel: text("ref_label").notNull(),                 // 回答中的标记，如 [资料1]
  quote: text("quote").notNull(),                        // 引用时的片段摘录（快照）
  ord: integer("ord").notNull(),
}, (t) => [
  uniqueIndex("message_citations_msg_chunk_uq").on(t.messageId, t.chunkId),
  index("message_citations_chunk_idx").on(t.chunkId),
]);

/* ───────────────────────────── 7. 练习、作答与评价 ───────────────────────────── */

export const tasks = pgTable("tasks", {
  id: id(),
  subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "restrict" }),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "restrict" }), // NULL = 公共题库
  kind: text("kind").notNull(),                          // sql | choice | numeric | open
  title: text("title").notNull(),
  familyKey: text("family_key").notNull(),               // 同一题族（原题与变式）
  createdAt: createdAt(),
  archivedAt: ts("archived_at"),
}, (t) => [
  check("tasks_kind_ck", sql`${t.kind} in ('sql','choice','numeric','open')`),
  index("tasks_subject_idx").on(t.subjectId),
]);

export const taskConcepts = pgTable("task_concepts", {
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
}, (t) => [
  primaryKey({ name: "task_concepts_pk", columns: [t.taskId, t.conceptId] }),
  index("task_concepts_concept_idx").on(t.conceptId),
]);

/** 题目版本固定不变：作答引用版本，题目修改产生新版本 */
export const taskVersions = pgTable("task_versions", {
  id: id(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "restrict" }),
  versionNo: integer("version_no").notNull(),
  prompt: text("prompt").notNull(),
  isVariant: boolean("is_variant").notNull().default(false), // 独立变式（用于“开花”判定）
  difficulty: integer("difficulty").notNull().default(2),
  answerSpec: jsonb("answer_spec").notNull(),            // 判题规格（参考 SQL / 选项 / 数值容差 / 公开评分维度）
  datasetKey: text("dataset_key"),                       // SQL 题：受限数据集版本，如 shop_v1
  source: text("source").notNull().default("seed"),      // seed | ai_generated | teacher
  sourceChunkId: uuid("source_chunk_id").references(() => materialChunks.id, { onDelete: "set null" }),
  modelCallId: uuid("model_call_id").references(() => modelCalls.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("task_versions_no_uq").on(t.taskId, t.versionNo),
  check("task_versions_source_ck", sql`${t.source} in ('seed','ai_generated','teacher')`),
  check("task_versions_difficulty_ck", sql`${t.difficulty} between 1 and 5`),
]);

export const taskHints = pgTable("task_hints", {
  id: id(),
  taskVersionId: uuid("task_version_id").notNull().references(() => taskVersions.id, { onDelete: "restrict" }),
  ord: integer("ord").notNull(),
  content: text("content").notNull(),
}, (t) => [uniqueIndex("task_hints_ord_uq").on(t.taskVersionId, t.ord)]);

export const attempts = pgTable("attempts", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskVersionId: uuid("task_version_id").notNull().references(() => taskVersions.id, { onDelete: "restrict" }),
  mode: text("mode").notNull(),                          // guided（可用提示）| independent | diagnostic
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  answer: text("answer"),
  status: text("status").notNull().default("open"),      // open | evaluated | error
  submitKey: text("submit_key"),                         // 幂等键：重复提交只结算一次
  startedAt: ts("started_at").defaultNow().notNull(),
  submittedAt: ts("submitted_at"),
}, (t) => [
  uniqueIndex("attempts_user_submit_key_uq").on(t.userId, t.submitKey),
  index("attempts_user_task_idx").on(t.userId, t.taskVersionId),
  check("attempts_mode_ck", sql`${t.mode} in ('guided','independent','diagnostic')`),
  check("attempts_status_ck", sql`${t.status} in ('open','evaluated','error')`),
]);

export const hintEvents = pgTable("hint_events", {
  id: id(),
  attemptId: uuid("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
  hintId: uuid("hint_id").notNull().references(() => taskHints.id, { onDelete: "restrict" }),
  shownAt: ts("shown_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("hint_events_attempt_hint_uq").on(t.attemptId, t.hintId)]);

export const evaluations = pgTable("evaluations", {
  id: id(),
  attemptId: uuid("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
  evaluator: text("evaluator").notNull(),                // rule_sql | rule_choice | rule_numeric | rubric_llm | rubric_demo
  verdict: text("verdict").notNull(),                    // correct | partial | incorrect | ungraded
  score: numeric("score", { precision: 5, scale: 2 }),
  feedback: text("feedback").notNull(),
  rubric: jsonb("rubric"),                               // 公开评价维度及各维度结论
  uncertainty: text("uncertainty"),
  modelCallId: uuid("model_call_id").references(() => modelCalls.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("evaluations_attempt_uq").on(t.attemptId),
  check("evaluations_verdict_ck", sql`${t.verdict} in ('correct','partial','incorrect','ungraded')`),
]);

/* ───────────────────────────── 8. 证据、状态与成长 ───────────────────────────── */

export const notes = pgTable("notes", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").references(() => concepts.id, { onDelete: "set null" }),
  sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
  archivedAt: ts("archived_at"),
}, (t) => [
  index("notes_user_concept_idx").on(t.userId, t.conceptId),
  index("notes_content_trgm_idx").using("gin", t.content.op("gin_trgm_ops")),
]);

/**
 * 长期记忆（B4 记忆面板）：AI 从对话中提炼、用户可确认/修正的“事实 / 偏好 / 事件”。
 * 修正不删除：原记录 status 置为 corrected，新内容作为新 active 记录写入并指向原记录（corrects_id），
 * 修正历史因此完整保留；删除为软删除（status → deleted）。
 * source_message_id / source_conversation_id 用于定位到产生这条记忆的原对话消息。
 */
export const memories = pgTable("memories", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),                           // fact | preference | event
  content: text("content").notNull(),
  conceptId: uuid("concept_id").references(() => concepts.id, { onDelete: "set null" }),
  sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
  sourceConversationId: uuid("source_conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),     // active | deleted | corrected
  correctsId: uuid("corrects_id").references((): AnyPgColumn => memories.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
}, (t) => [
  index("memories_user_status_idx").on(t.userId, t.status),
  index("memories_source_msg_idx").on(t.sourceMessageId),
  index("memories_concept_idx").on(t.conceptId),
  check("memories_kind_ck", sql`${t.kind} in ('fact','preference','event')`),
  check("memories_status_ck", sql`${t.status} in ('active','deleted','corrected')`),
]);

/**
 * 学习证据：成长的唯一依据。kind 明确区分
 *   self_report（用户自述理解） / read / asked / note（学习记录）
 *   guided_practice（AI 或提示辅助完成） / independent_attempt / independent_variant_pass（独立作答证据）
 *   team_work（团队或作品完成情况）
 * 修正证据不删除：写入 revoked_at 与 revoke_reason，状态重新计算并留下成长事件。
 */
export const learningEvidence = pgTable("learning_evidence", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(),
  attemptId: uuid("attempt_id").references(() => attempts.id, { onDelete: "no action" }),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
  noteId: uuid("note_id").references(() => notes.id, { onDelete: "set null" }),
  materialVersionId: uuid("material_version_id").references(() => materialVersions.id, { onDelete: "set null" }),
  usedHints: boolean("used_hints").notNull().default(false),
  aiAssisted: boolean("ai_assisted").notNull().default(false),
  detail: text("detail").notNull(),                      // 人类可读的说明
  origin: text("origin").notNull().default("user"),      // user | seed
  createdAt: createdAt(),
  revokedAt: ts("revoked_at"),
  revokeReason: text("revoke_reason"),
}, (t) => [
  index("learning_evidence_user_concept_idx").on(t.userId, t.conceptId, t.createdAt),
  uniqueIndex("learning_evidence_attempt_concept_uq").on(t.attemptId, t.conceptId, t.kind).where(sql`${t.attemptId} is not null`),
  check("learning_evidence_kind_ck", sql`${t.kind} in ('self_report','read','asked','note','guided_practice','independent_attempt','independent_variant_pass','team_work')`),
  check("learning_evidence_revoke_ck", sql`(${t.revokedAt} is null) = (${t.revokeReason} is null)`),
]);

/** 当前状态（受控冗余汇总）：可由有效证据重新计算；每次变化写 growth_events */
export const learningStates = pgTable("learning_states", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
  stage: text("stage").notNull(),                        // seed | sprout | leaf | bud | bloom
  stageReason: text("stage_reason").notNull(),
  lastEvidenceAt: ts("last_evidence_at"),
  reviewDueAt: ts("review_due_at"),                      // 温和的待复习提示时间（不会让花枯萎）
  updatedAt: ts("updated_at").defaultNow().notNull(),
  version: integer("version").notNull().default(1),      // 乐观并发版本号
}, (t) => [
  primaryKey({ name: "learning_states_pk", columns: [t.userId, t.conceptId] }),
  index("learning_states_review_idx").on(t.userId, t.reviewDueAt),
  check("learning_states_stage_ck", sql`${t.stage} in ('seed','sprout','leaf','bud','bloom')`),
]);

/** 成长事件：状态变化历史 + 花园可见事件（种下、选为本命花、证据修正）。时间轴与回放只读取这里 */
export const growthEvents = pgTable("growth_events", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  fromStage: text("from_stage"),
  toStage: text("to_stage"),
  evidenceId: uuid("evidence_id").references(() => learningEvidence.id, { onDelete: "no action" }),
  reason: text("reason").notNull(),
  origin: text("origin").notNull().default("user"),      // user | seed
  createdAt: createdAt(),
}, (t) => [
  index("growth_events_user_created_idx").on(t.userId, t.createdAt),
  index("growth_events_concept_idx").on(t.userId, t.conceptId, t.createdAt),
  check("growth_events_type_ck", sql`${t.eventType} in ('planted','natal_chosen','evidence_added','stage_changed','evidence_revoked','appearance_changed')`),
]);

/* ───────────────────────────── 9. 增强：学习卡、班级与协作 ───────────────────────────── */

export const knowledgeCards = pgTable("knowledge_cards", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  archivedAt: ts("archived_at"),
}, (t) => [index("knowledge_cards_user_idx").on(t.userId)]);

export const cardVersions = pgTable("card_versions", {
  id: id(),
  cardId: uuid("card_id").notNull().references(() => knowledgeCards.id, { onDelete: "cascade" }),
  versionNo: integer("version_no").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  changeNote: text("change_note").notNull(),
  draftedBy: text("drafted_by").notNull(),               // user | ai_draft（AI 草稿，用户确认后保存）
  createdAt: createdAt(),
}, (t) => [uniqueIndex("card_versions_no_uq").on(t.cardId, t.versionNo)]);

/** 学习卡来源消息（卡片版本—消息 多对多），卡片可以带回原问答 */
export const cardSources = pgTable("card_sources", {
  cardVersionId: uuid("card_version_id").notNull().references(() => cardVersions.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "no action" }),
}, (t) => [primaryKey({ name: "card_sources_pk", columns: [t.cardVersionId, t.messageId] })]);

export const classes = pgTable("classes", {
  id: id(),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("classes_join_code_uq").on(t.joinCode)]);

export const classMembers = pgTable("class_members", {
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("student"),
  joinedAt: ts("joined_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ name: "class_members_pk", columns: [t.classId, t.userId] }),
  index("class_members_user_idx").on(t.userId),
  check("class_members_role_ck", sql`${t.role} in ('teacher','student')`),
]);

/** 分享偏好（默认全部不公开） */
export const sharingPreferences = pgTable("sharing_preferences", {
  classId: uuid("class_id").notNull(),
  userId: uuid("user_id").notNull(),
  sharePlanet: boolean("share_planet").notNull().default(false),
  shareStages: boolean("share_stages").notNull().default(false),
  openToPartner: boolean("open_to_partner").notNull().default(false),
  updatedAt: ts("updated_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ name: "sharing_preferences_pk", columns: [t.classId, t.userId] }),
  foreignKey({ name: "sharing_preferences_member_fk", columns: [t.classId, t.userId], foreignColumns: [classMembers.classId, classMembers.userId] }).onDelete("cascade"),
]);

export const cardPublications = pgTable("card_publications", {
  cardVersionId: uuid("card_version_id").notNull().references(() => cardVersions.id, { onDelete: "restrict" }),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  publishedAt: ts("published_at").defaultNow().notNull(),
  withdrawnAt: ts("withdrawn_at"),
}, (t) => [primaryKey({ name: "card_publications_pk", columns: [t.cardVersionId, t.classId] })]);

/** 公开学习意愿：想获得帮助 / 可以提供帮助（按知识点） */
export const learningIntents = pgTable("learning_intents", {
  id: id(),
  classId: uuid("class_id").notNull(),
  userId: uuid("user_id").notNull(),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
  direction: text("direction").notNull(),                // seek | offer
  note: text("note"),
  createdAt: createdAt(),
  withdrawnAt: ts("withdrawn_at"),
}, (t) => [
  foreignKey({ name: "learning_intents_member_fk", columns: [t.classId, t.userId], foreignColumns: [classMembers.classId, classMembers.userId] }).onDelete("cascade"),
  uniqueIndex("learning_intents_active_uq").on(t.classId, t.userId, t.conceptId, t.direction).where(sql`${t.withdrawnAt} is null`),
  index("learning_intents_match_idx").on(t.classId, t.conceptId, t.direction),
  check("learning_intents_direction_ck", sql`${t.direction} in ('seek','offer')`),
]);

export const studyGroups = pgTable("study_groups", {
  id: id(),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  capacity: integer("capacity").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("open"),
  createdAt: createdAt(),
}, (t) => [
  check("study_groups_capacity_ck", sql`${t.capacity} between 2 and 6`),
  check("study_groups_status_ck", sql`${t.status} in ('open','closed')`),
]);

export const studyGroupMembers = pgTable("study_group_members", {
  groupId: uuid("group_id").notNull().references(() => studyGroups.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: ts("joined_at").defaultNow().notNull(),
}, (t) => [primaryKey({ name: "study_group_members_pk", columns: [t.groupId, t.userId] })]);

export const contributions = pgTable("contributions", {
  id: id(),
  groupId: uuid("group_id").notNull(),
  userId: uuid("user_id").notNull(),
  kind: text("kind").notNull(),                          // explanation | question | review
  content: text("content").notNull(),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ name: "contributions_member_fk", columns: [t.groupId, t.userId], foreignColumns: [studyGroupMembers.groupId, studyGroupMembers.userId] }).onDelete("cascade"),
  check("contributions_kind_ck", sql`${t.kind} in ('explanation','question','review')`),
]);

/** 事务性 outbox：业务事务内写入，事务外投递 */
export const outboxEvents = pgTable("outbox_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  topic: text("topic").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: createdAt(),
  deliveredAt: ts("delivered_at"),
  attempts: integer("attempts").notNull().default(0),
}, (t) => [index("outbox_undelivered_idx").on(t.id).where(sql`${t.deliveredAt} is null`)]);

/* ───────────────────────── 创造模式：星球布局持久化 ───────────────────────── */

/**
 * 星球布局（创造模式）：每个星球一份「工作布局」，revision 每次保存 +1（乐观并发用 baseRevision 校验）。
 * status: draft | published；publishedRevision 记录最近一次发布的 revision。
 * 只存可重建参数（kind/位置/姿态/尺寸/颜色/阶段/排序），不存 Three.js 对象或逐帧网格。
 */
export const planetLayouts = pgTable("planet_layouts", {
  /** H52：布局数据版本——1=迁移前（无建筑实例），2=v3 全场景布局（含初始建筑实例）。
   *  加载时据此决定「是否需要用默认常量补建筑」，避免用户删光建筑后被模板补回。 */
  schemaVersion: integer("schema_version").notNull().default(1),
  id: id(),
  planetId: uuid("planet_id").notNull().references(() => planets.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(1),
  status: text("status").notNull().default("draft"),
  publishedRevision: integer("published_revision"),
  /** 最近一次发布的布局快照（可「恢复上一已发布版本」，且参观只读用） */
  publishedItems: jsonb("published_items"),
  /** V4-R22：花圃（知识花圃）布局位移——键为 gardenId，值为 {x,z,rot}；与装饰 items 分开存 */
  bedMoves: jsonb("bed_moves"),
  /** V4-R30：地形稀疏高度场 [{i,j,h}]（49×49 网格，只存非零格点）；null=平地 */
  terrain: jsonb("terrain"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("planet_layouts_planet_uq").on(t.planetId),
  check("planet_layouts_status_ck", sql`${t.status} in ('draft','published')`),
  check("planet_layouts_revision_ck", sql`${t.revision} >= 1`),
]);

export const planetLayoutItems = pgTable("planet_layout_items", {
  id: id(),
  layoutId: uuid("layout_id").notNull().references(() => planetLayouts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  /** V4-H51：客户端实例 ID（跨会话稳定；旧数据为 null → 加载时重建） */
  instanceId: text("instance_id"),
  x: real("x").notNull(),
  z: real("z").notNull(),
  rot: real("rot").notNull().default(0),
  scale: real("scale").notNull().default(1),
  width: real("width"),
  length: real("length"),
  color: text("color"),
  stage: text("stage"),
  /** H34：DIY 分区颜色（按部位名存 #rrggbb）；旧数据为 null → 使用模型默认色 */
  parts: jsonb("parts"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  index("planet_layout_items_layout_idx").on(t.layoutId, t.sortOrder),
  check("planet_layout_items_kind_ck", sql`${t.kind} in ('lamp','bush','tree','pot','stone','fence','chair','flower','flower2','flower3','rock','rose','soil','road','cottage','greenhouse','observatory','seedshed','arch','pond','sign','grassGroup','wildflowerGroup')`),
]);
