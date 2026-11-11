# 行级安全（RLS）演示脚本

用于答辩现场或自测：证明“权限是数据库在管，不是应用在管”。

前置：`npm run db:migrate`（会创建 `kv_app` 角色并授权），`.env` 中配置了 `APP_DATABASE_URL`。

## 1. 看策略挂在哪些表上

```sql
-- 以所有者连接：knowverse
SELECT c.relname AS table_name,
       count(p.polname) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
GROUP BY 1
ORDER BY 1;
```

预期：17 张表，每张 1 条策略。

## 2. 以应用角色连接，什么上下文都不给

```bash
psql "postgres://kv_app:kv_app_dev@localhost:5432/knowverse"
```

```sql
SELECT count(*) FROM messages;        -- 0
SELECT count(*) FROM conversations;   -- 0
SELECT count(*) FROM materials;       -- >0（公共课程资料）
```

## 3. 指定当前用户后，只看到自己的行

```sql
BEGIN;
SELECT set_config('app.user_id', (SELECT id::text FROM users WHERE handle = 'demo'), true);
SELECT count(*) FROM messages;                                   -- demo 自己的消息数
SELECT count(*) FROM messages WHERE user_id <> current_setting('app.user_id')::uuid;  -- 0
ROLLBACK;
```

## 4. 越权写入会被数据库拒绝

```sql
BEGIN;
SELECT set_config('app.user_id', (SELECT id::text FROM users WHERE handle = 'demo'), true);
INSERT INTO messages (conversation_id, user_id, seq, role, content, status)
VALUES (
  (SELECT id FROM conversations WHERE user_id = current_setting('app.user_id')::uuid LIMIT 1),
  (SELECT id FROM users WHERE handle = 'xingye'),
  999999, 'user', '越权写入', 'complete'
);
-- ERROR: new row violates row-level security policy for table "messages"  (SQLSTATE 42501)
ROLLBACK;
```

## 5. 越权更新影响 0 行（不报错，静默过滤）

```sql
BEGIN;
SELECT set_config('app.user_id', (SELECT id::text FROM users WHERE handle = 'demo'), true);
UPDATE messages SET content = '被篡改' WHERE user_id = (SELECT id FROM users WHERE handle = 'xingye');
-- UPDATE 0
ROLLBACK;
```

## 6. 对照：所有者连接不受策略限制

```bash
psql "postgres://postgres:postgres@localhost:5432/knowverse" -c "SELECT count(*) FROM messages;"
```

预期：全部消息数（迁移与脚本因此可以正常造数）。

## 7. 自动化验证

```bash
npm test -- tests/security.test.ts
```

覆盖 8 个用例：角色属性、无上下文 0 行、只能看自己的、换用户看到不同数据、越权写入 42501、越权更新 0 行、公共资料与他人私有资料、所有者对照。
