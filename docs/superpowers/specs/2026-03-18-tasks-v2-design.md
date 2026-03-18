# Tasks v2 — Design Spec
**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Extend the existing Tasks feature with due time, recurring task series, free-form tags, and calendar display of timed tasks. The goal is to give the CEO and team a complete task scheduling system within the existing Command Center.

---

## 1. Database Changes

### 1.1 New columns on `ceo_tasks`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `due_time` | `text` | `null` | `"HH:MM"` 24h format. Only meaningful when `due_date` is set. |
| `tags` | `text[]` | `'{}'` | Free-form user-defined tags. Same pattern as `ceo_notes`. |
| `series_id` | `uuid` | `null` | FK to `ceo_task_series.id`. Null for non-recurring tasks. |

**Note on `due_date` type:** `ceo_tasks.due_date` is `text` stored as `"YYYY-MM-DD"`. ISO format means `MAX()` gives correct lexicographic ordering. Series occurrences always have a non-null `due_date` (generation produces one per occurrence). Non-recurring tasks may have `due_date = null`, which is excluded from `MAX()` — acceptable since `MAX()` is only called in the context of a specific `series_id`.

Migration: non-breaking — all new columns are nullable or have defaults.

```sql
ALTER TABLE ceo_tasks ADD COLUMN due_time   text    DEFAULT NULL;
ALTER TABLE ceo_tasks ADD COLUMN tags       text[]  NOT NULL DEFAULT '{}';
ALTER TABLE ceo_tasks ADD COLUMN series_id  uuid    DEFAULT NULL;
```

### 1.2 New table: `ceo_task_series`

```sql
CREATE TABLE ceo_task_series (
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
  base_tags           text[]      NOT NULL DEFAULT '{}',
  start_date          date        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
  -- No updated_at: series editing is out of scope for v2
);

ALTER TABLE ceo_task_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner access" ON ceo_task_series
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 1.3 FK constraint

```sql
ALTER TABLE ceo_tasks
  ADD CONSTRAINT fk_task_series
  FOREIGN KEY (series_id) REFERENCES ceo_task_series(id) ON DELETE CASCADE;
```

### 1.4 Indexes

```sql
-- Query: WHERE series_id = $1, MAX(due_date)
CREATE INDEX idx_tasks_series_id ON ceo_tasks(series_id) WHERE series_id IS NOT NULL;

-- Duplicate-prevention index for ON CONFLICT in generation function.
-- Must be PARTIAL (WHERE series_id IS NOT NULL) because Postgres treats NULL as distinct
-- from NULL in standard UNIQUE constraints — two rows with series_id=NULL and the same
-- due_date would not conflict, which is correct for non-recurring tasks.
-- ON CONFLICT clause requires a matching partial unique index.
CREATE UNIQUE INDEX uq_series_due_date ON ceo_tasks(series_id, due_date)
  WHERE series_id IS NOT NULL;

-- GIN index on tags deferred — single-user, dataset < 10k rows.
-- Add if filter latency becomes measurable:
-- CREATE INDEX idx_tasks_tags ON ceo_tasks USING GIN(tags);
```

---

## 2. Recurring Task Logic

### 2.1 Creating a series

When the user enables "Repeat" in the task form and saves:

1. Insert a `ceo_task_series` row.
2. Call `generateOccurrences(series, fromDate, toDate)` where:
   - `fromDate = MAX(parseISO(series.start_date), today)` — never generates occurrences in the past
   - `toDate = addDays(today, 365)`
3. All inserts use `INSERT INTO ceo_tasks (...) ... ON CONFLICT ON CONSTRAINT uq_series_due_date DO NOTHING`.
4. `due_time`, `tags`, `priority`, `list_name`, `description` are copied from the series `base_*` fields.

**Type conversion:** `ceo_task_series.start_date` is Postgres `date` — when returned by Supabase JS it arrives as a `"YYYY-MM-DD"` string. `generateOccurrences` works with JS `Date` objects internally and outputs each `due_date` as `format(date, 'yyyy-MM-dd')` (date-fns) for insert into `ceo_tasks.due_date` (`text`).

**Generation formula (date-fns):**
- `daily` every N: `addDays(fromDate, i × N)` for i = 0, 1, 2, … while `due_date ≤ toDate`
- `weekly` every N: `addDays(fromDate, i × N × 7)`
- `monthly` every N: `addMonths(fromDate, i × N)`
- `yearly` every N: `addYears(fromDate, i × N)`

### 2.2 Rolling 365-day maintenance

On every app load, inside `AppShell` after auth resolves, `maintainRecurringSeries(userId, supabase)` runs silently in the background:

1. Fetch all `ceo_task_series` for the current user.
2. For each series, query `MAX(due_date)` from `ceo_tasks WHERE series_id = $1`.
3. If `MAX(due_date) < format(addDays(today, 365), 'yyyy-MM-dd')`:
   - `fromDate = addDays(parseISO(maxDueDate), 1)`
   - `toDate = addDays(today, 365)`
   - Call `generateOccurrences(series, fromDate, toDate)`
4. All inserts use `ON CONFLICT ... DO NOTHING` — safe for concurrent tabs (web app, multiple instances possible).

**Intentional behaviour:** If the user hasn't opened the app for 30 days, all 30 missing occurrences are generated in one pass on next load. This is correct and expected.

### 2.3 Deleting recurring tasks

When the user taps Delete on a task with a non-null `series_id`, a two-option bottom sheet appears:

- **"Delete this occurrence"** — deletes only this `ceo_tasks` row.
- **"Delete entire series"** — deletes the `ceo_task_series` row, which cascades to all linked `ceo_tasks` rows. Confirmation copy: *"This will delete all occurrences of this recurring task, including any you've edited individually."*

Non-recurring tasks show the existing single-step delete confirmation unchanged.

### 2.4 Editing recurring tasks

- Editing affects **only this occurrence** — updates the individual `ceo_tasks` row.
- `series_id` is **retained** (not nulled). The `(series_id, due_date)` pair for this row still exists, so subsequent maintenance passes will skip it via `ON CONFLICT DO NOTHING`.
- **Users cannot change the `due_date` of a recurring occurrence.** The date field is read-only in the edit form when `series_id` is non-null. This prevents the maintenance function from regenerating the original date. If the user needs a task on a different date, they should create a separate task.

---

## 3. Task Form UI

The create and edit sheet gains the following fields, in order:

1. **Title** *(existing)*
2. **Priority** *(existing)*
3. **List** *(existing)*
4. **Due Date** *(existing — date picker). Read-only when editing a recurring task.*
5. **Due Time** *(new)* — time input (`HH:MM`), visible only when `due_date` is set. Optional. Clears to `""` if `due_date` is cleared.
6. **Description** *(existing)*
7. **Assigned to** *(existing)*
8. **Tags** *(new)* — chip input. Type and press Enter or comma to add a tag. On form open, fetch `SELECT DISTINCT unnest(tags) AS tag FROM ceo_tasks WHERE user_id = $1 ORDER BY tag LIMIT 100` for autocomplete. Each tag renders as a removable pill. Label: "Tags".
9. **Repeat** *(new — create form only, hidden on edit form)* — toggle switch. When enabled, reveals: "Repeat every `[N]` `[days / weeks / months / years]`". Defaults to "every 1 week".

### Form state interface

```typescript
interface TaskForm {
  title: string
  priority: Task['priority']
  due_date: string
  due_time: string                                       // "" = no time
  list_name: string
  description: string
  assigned_to: string
  tags: string[]
  is_recurring: boolean                                  // create form only
  recurrence_type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  recurrence_interval: number                            // >= 1
}
```

---

## 4. TasksPage UI

### 4.1 Tags filter

A horizontally scrollable pill row appears below the existing status + priority filters.

- **Visibility:** Shown only when the current user has at least one task with a non-empty `tags` array (global check, not per-view). Checked via the existing tasks query result.
- Shows all unique tags across all the user's tasks, sorted alphabetically (derived client-side from the tasks query result — no extra query needed).
- Clicking a tag adds it to the active filter set. Multiple active tags use **AND logic** — a task must have all selected tags to appear. Tasks with `tags = '{}'` are always excluded when any tag filter is active.
- Active tags render with accent background + `×` to clear individually.
- "Clear all" link appears at the right end when any tag filter is active.

### 4.2 Recurring indicator

Tasks with a non-null `series_id` show a `Repeat2` icon (lucide-react, size 12) next to the title in both the kanban card and the list view. No other visual difference.

### 4.3 Delete behaviour

On the edit sheet, the existing Delete button:
- `series_id` is null → existing single-step confirmation
- `series_id` is set → two-option bottom sheet per Section 2.3

---

## 5. Calendar Integration

Tasks with a non-empty `due_time` show the time prepended in their calendar bar label:

```
"14:30 · Task title"
```

Bar colour, click behaviour (→ `/tasks?task=<id>`), and row/date positioning are unchanged. The monthly grid remains date-based — no time-based vertical positioning.

In `CalendarPage.tsx`, the `weeksData` useMemo that builds task `EventBar` objects adds:
```typescript
label: task.due_time ? `${task.due_time} · ${task.title}` : task.title
```

---

## 6. TypeScript Type Updates

```typescript
// src/types/database.ts

export interface Task {
  id: string
  user_id: string
  title: string
  priority: 'urgent' | 'high' | 'medium' | 'low' | null
  due_date: string | null        // "YYYY-MM-DD" text
  due_time: string | null        // "HH:MM" or null
  description: string | null
  is_completed: boolean
  completed_at: string | null
  list_name: string
  project_id: string | null
  milestone_id: string | null
  assigned_to: string | null
  tags: string[]                 // always an array, default []
  series_id: string | null       // uuid string or null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TaskSeries {
  id: string
  user_id: string
  recurrence_type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  recurrence_interval: number                            // >= 1
  base_title: string
  base_priority: 'urgent' | 'high' | 'medium' | 'low' | null
  base_list_name: string
  base_description: string | null
  base_tags: string[]
  start_date: string                                     // "YYYY-MM-DD"
  created_at: string
  // No updated_at — series editing is out of scope for v2
}
```

---

## 7. Files to Create / Modify

| File | Change |
|------|--------|
| `supabase/migrations/tasks_v2.sql` | Add columns to `ceo_tasks`; create `ceo_task_series` with CHECK constraints; FK; partial unique index; series_id index |
| `src/types/database.ts` | Update `Task` interface; add `TaskSeries` interface |
| `src/lib/recurrence.ts` | New file — `generateOccurrences(series, fromDate, toDate)`, `maintainRecurringSeries(userId, supabase)` |
| `src/components/layout/AppShell.tsx` | Call `maintainRecurringSeries()` after auth resolves |
| `src/pages/TasksPage.tsx` | Add `due_time`, `tags`, `repeat` fields to create form; add `due_time`/`tags` to edit form; read-only `due_date` on recurring edit; tags filter row; delete-series sheet; `Repeat2` recurring indicator |
| `src/pages/CalendarPage.tsx` | Prepend `due_time` to task bar label in `weeksData` useMemo |

---

## 8. Out of Scope (v2)

- Edit entire series (only edit this occurrence is supported)
- Weekly recurrence with specific day-of-week picker (e.g. "every Monday and Wednesday")
- End date / max occurrences for a series
- Push notifications or in-app alerts for due times
- Changing the `due_date` of an individual recurring occurrence
