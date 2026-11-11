-- 0011：修复活跃时间只增不减的漏洞
--
-- 0010 之后，E11 又抓到另一类漂移：撤销（或修正）证据会让 learning_states.last_evidence_at 变小甚至变 NULL，
-- 但 0008/0010 的触发器只在“变大”时更新 class_stats，导致 last_active_at 停留在过去。
-- 修复：只要 last_evidence_at 发生变化（增或减），就对该用户所在班级按真实聚合重算。

CREATE OR REPLACE FUNCTION fn_stats_activity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.last_evidence_at IS NULL THEN RETURN NULL; END IF;
  ELSIF NEW.last_evidence_at IS NOT DISTINCT FROM OLD.last_evidence_at THEN
    RETURN NULL;
  END IF;

  UPDATE class_stats cs
     SET last_active_at = (SELECT max(ls.last_evidence_at)
                             FROM class_members m JOIN learning_states ls ON ls.user_id = m.user_id
                            WHERE m.class_id = cs.class_id),
         updated_at = now()
   WHERE cs.class_id IN (SELECT class_id FROM class_members WHERE user_id = NEW.user_id);

  RETURN NULL;
END $$;

-- 修复历史漂移
SELECT fn_reconcile_class_stats();
