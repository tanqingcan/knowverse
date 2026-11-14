-- 0010：修复增量统计的“加入班级前已有活跃记录”漏洞
--
-- 0008 里成员加入只增加了 member_count，没有回填该用户已存在的 learning_states.last_evidence_at，
-- 导致 class_stats.last_active_at 与真实聚合不一致（被不变量 E11 抓到）。
-- 修复：成员增删后，按真实聚合重算该班级的 last_active_at（成员数量级很小，代价可忽略）。

CREATE OR REPLACE FUNCTION fn_stats_member_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_class uuid;
  v_delta int;
BEGIN
  IF TG_OP = 'INSERT' THEN v_class := NEW.class_id; v_delta := 1;
  ELSE v_class := OLD.class_id; v_delta := -1; END IF;

  INSERT INTO class_stats (class_id, member_count, updated_at) VALUES (v_class, greatest(v_delta, 0), now())
  ON CONFLICT (class_id) DO UPDATE
    SET member_count = class_stats.member_count + v_delta, updated_at = now();

  -- 成员变化后重算最近活跃：新成员可能带着历史证据进来，退出的成员也可能正是最活跃的那个
  UPDATE class_stats cs
     SET last_active_at = (SELECT max(ls.last_evidence_at)
                             FROM class_members m JOIN learning_states ls ON ls.user_id = m.user_id
                            WHERE m.class_id = cs.class_id),
         updated_at = now()
   WHERE cs.class_id = v_class;

  RETURN NULL;
END $$;

-- 修复历史漂移
SELECT fn_reconcile_class_stats();
