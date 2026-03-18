-- supabase/migrations/tasks_v2.sql

-- 1. New columns on ceo_tasks
ALTER TABLE ceo_tasks
  ADD COLUMN IF NOT EXISTS due_time   text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags       text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS series_id  uuid    DEFAULT NULL;

-- 2. New series table
CREATE TABLE IF NOT EXISTS ceo_task_series (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recurrence_type     text        NOT NULL
                                  CHECK (recurrence_type IN ('daily','weekly','monthly','yearly')),
  recurrence_interval int         NOT NULL DEFAULT 1
                                  CHECK (recurrence_interval >= 1),
  base_title          text        NOT NULL,
  base_priority       text        DEFAULT NULL
                                  CHECK (base_priority IS NULL
                                    OR base_priority IN ('urgent','high','medium','low')),
  base_list_name      text        NOT NULL DEFAULT 'Inbox',
  base_description    text        DEFAULT NULL,
  base_due_time       text        DEFAULT NULL,
  base_tags           text[]      NOT NULL DEFAULT '{}',
  start_date          date        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 3. RLS on series table
ALTER TABLE ceo_task_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner access" ON ceo_task_series;
CREATE POLICY "owner access" ON ceo_task_series
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. FK: series_id → ceo_task_series
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_task_series'
  ) THEN
    ALTER TABLE ceo_tasks
      ADD CONSTRAINT fk_task_series
      FOREIGN KEY (series_id) REFERENCES ceo_task_series(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Partial unique index — prevents duplicate occurrences per (series, date)
--    Must be partial (WHERE series_id IS NOT NULL) so that ON CONFLICT works correctly.
--    Postgres treats NULLs as distinct in standard UNIQUE constraints, which would
--    allow duplicate non-recurring tasks with the same due_date — that's fine.
CREATE UNIQUE INDEX IF NOT EXISTS uq_series_due_date
  ON ceo_tasks(series_id, due_date)
  WHERE series_id IS NOT NULL;

-- 6. Index for rolling maintenance query (WHERE series_id = $1)
CREATE INDEX IF NOT EXISTS idx_tasks_series_id
  ON ceo_tasks(series_id)
  WHERE series_id IS NOT NULL;
