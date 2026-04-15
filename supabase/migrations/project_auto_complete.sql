-- supabase/migrations/project_auto_complete.sql
--
-- Auto-complete projects when all their tasks are done, and revert from
-- 'completed' back to 'active' if a task becomes incomplete. Runs as a DB
-- trigger so the rule holds regardless of which client/page toggled the task.
--
-- Rules:
--   * Only runs for tasks that belong to a project (project_id IS NOT NULL).
--   * A project with >0 tasks and all tasks is_completed=true → status='completed'.
--   * If status='completed' but not all tasks are complete → status='active'.
--   * Projects with zero tasks are left alone.
--   * Manual statuses (planning / on_hold) are respected when moving TO
--     completed, but a manual 'completed' that no longer holds is reverted.

-- ─── Function ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ceo_sync_project_status_from_tasks(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     int;
  v_completed int;
  v_status    text;
BEGIN
  IF p_project_id IS NULL THEN RETURN; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_completed)
  INTO   v_total, v_completed
  FROM   ceo_tasks
  WHERE  project_id = p_project_id;

  SELECT status INTO v_status FROM ceo_projects WHERE id = p_project_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_total > 0 AND v_completed = v_total AND v_status <> 'completed' THEN
    UPDATE ceo_projects SET status = 'completed' WHERE id = p_project_id;
  ELSIF v_status = 'completed' AND (v_total = 0 OR v_completed < v_total) THEN
    UPDATE ceo_projects SET status = 'active' WHERE id = p_project_id;
  END IF;
END;
$$;

-- ─── Trigger ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ceo_tasks_project_status_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM ceo_sync_project_status_from_tasks(OLD.project_id);
    RETURN OLD;
  END IF;

  -- INSERT / UPDATE: sync new project, and old project too if project_id moved
  PERFORM ceo_sync_project_status_from_tasks(NEW.project_id);
  IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    PERFORM ceo_sync_project_status_from_tasks(OLD.project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ceo_tasks_project_status ON ceo_tasks;

CREATE TRIGGER trg_ceo_tasks_project_status
AFTER INSERT OR UPDATE OF is_completed, project_id OR DELETE
ON ceo_tasks
FOR EACH ROW
EXECUTE FUNCTION ceo_tasks_project_status_trigger();

-- ─── Retroactive sync ─────────────────────────────────────────────────────────
-- Fix existing projects where all tasks are already done (or where status is
-- stuck at 'completed' despite having open tasks).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM ceo_projects LOOP
    PERFORM ceo_sync_project_status_from_tasks(r.id);
  END LOOP;
END;
$$;
