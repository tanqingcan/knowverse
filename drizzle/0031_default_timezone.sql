ALTER TABLE users ALTER COLUMN timezone SET DEFAULT 'Asia/Shanghai';
--> statement-breakpoint
-- 统一旧版默认值（两者在本项目覆盖的日期均为 UTC+8）。
UPDATE users SET timezone = 'Asia/Shanghai' WHERE timezone = 'Asia/Taipei';
