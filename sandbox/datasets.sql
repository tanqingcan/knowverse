-- SQL 练习受限数据集（固定版本，不含任何业务数据）
-- 每个数据集一个 schema，版本号写在 schema 名中；题目通过 task_versions.dataset_key 引用。
DROP SCHEMA IF EXISTS school_v1 CASCADE;
CREATE SCHEMA school_v1;
CREATE TABLE school_v1.students (sid int PRIMARY KEY, name text NOT NULL, major text NOT NULL);
CREATE TABLE school_v1.courses  (cid int PRIMARY KEY, title text NOT NULL, credit int NOT NULL);
CREATE TABLE school_v1.enrollments (
  sid int REFERENCES school_v1.students(sid),
  cid int REFERENCES school_v1.courses(cid),
  term text NOT NULL,
  score int,
  PRIMARY KEY (sid, cid, term)
);
INSERT INTO school_v1.students VALUES
 (1,'林晓','计算机'),(2,'陈默','计算机'),(3,'王一','数学'),(4,'赵星','数学'),(5,'周禾','物理'),(6,'吴桐','计算机');
INSERT INTO school_v1.courses VALUES (101,'数据库系统概论',3),(102,'概率统计',3),(103,'数据结构',4);
INSERT INTO school_v1.enrollments VALUES
 (1,101,'2026秋',88),(1,103,'2026春',92),(2,101,'2026秋',75),(2,102,'2026秋',81),
 (3,102,'2026秋',95),(3,101,'2026春',67),(4,103,'2026春',70),(6,101,'2026春',58);
