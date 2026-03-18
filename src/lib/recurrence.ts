// src/lib/recurrence.ts
import { addDays, addMonths, addYears, format, parseISO, isAfter, isBefore } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TaskSeries } from '@/types/database'

// ── generateOccurrences ──────────────────────────────────────────────────────
// Returns an array of ceo_tasks insert payloads for every occurrence of `series`
// between fromDate (inclusive) and toDate (inclusive).
// Uses a while loop that advances by one interval per step — no fixed cap needed.

interface OccurrencePayload {
  user_id: string
  series_id: string
  title: string
  priority: TaskSeries['base_priority']
  due_date: string       // "YYYY-MM-DD"
  due_time: string | null
  list_name: string
  description: string | null
  tags: string[]
  is_completed: boolean
  sort_order: number
}

export function generateOccurrences(
  series: TaskSeries,
  fromDate: Date,
  toDate: Date,
): OccurrencePayload[] {
  if (series.recurrence_interval <= 0) return []   // guard: zero/negative interval → infinite loop
  const start = parseISO(series.start_date)
  const occurrences: OccurrencePayload[] = []
  let i = 0

  while (true) {
    const date: Date = (() => {
      switch (series.recurrence_type) {
        case 'daily':   return addDays(start,   i * series.recurrence_interval)
        case 'weekly':  return addDays(start,   i * series.recurrence_interval * 7)
        case 'monthly': return addMonths(start, i * series.recurrence_interval)
        case 'yearly':  return addYears(start,  i * series.recurrence_interval)
      }
    })()

    if (isAfter(date, toDate)) break    // past the window — stop

    if (!isBefore(date, fromDate)) {    // within the window — include
      occurrences.push({
        user_id:      series.user_id,
        series_id:    series.id,
        title:        series.base_title,
        priority:     series.base_priority,
        due_date:     format(date, 'yyyy-MM-dd'),
        due_time:     series.base_due_time,
        list_name:    series.base_list_name,
        description:  series.base_description,
        tags:         series.base_tags,
        is_completed: false,
        sort_order:   9999,    // placed at end of list by default
      })
    }

    i++
  }

  return occurrences
}

// ── insertOccurrences ────────────────────────────────────────────────────────
// Inserts occurrences in batches of 100.
// ignoreDuplicates: true means ON CONFLICT DO NOTHING — idempotent and safe
// across concurrent tabs. The partial unique index uq_series_due_date
// (series_id, due_date) WHERE series_id IS NOT NULL handles conflict detection.
//
// supabase is the module-level singleton from '@/lib/supabase'.

export async function insertOccurrences(
  supabase: SupabaseClient,
  occurrences: OccurrencePayload[],
): Promise<void> {
  if (!occurrences.length) return
  const BATCH = 100
  for (let i = 0; i < occurrences.length; i += BATCH) {
    const batch = occurrences.slice(i, i + BATCH)
    const { error } = await supabase
      .from('ceo_tasks')
      .upsert(batch, { onConflict: 'series_id,due_date', ignoreDuplicates: true })
    if (error) console.error('[recurrence] insert error:', error.message)
  }
}

// ── maintainRecurringSeries ──────────────────────────────────────────────────
// Called on every app load after auth. Fills gaps in all series up to today+365.
// Runs silently — no loading state shown to user.
// Safe for concurrent calls (insertOccurrences is idempotent).

export async function maintainRecurringSeries(
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const today = new Date()
  const toDate = addDays(today, 365)
  const windowEnd = format(toDate, 'yyyy-MM-dd')

  // 1. Fetch all series for this user
  const { data: seriesList, error: seriesError } = await supabase
    .from('ceo_task_series')
    .select('*')
    .eq('user_id', userId)

  if (seriesError || !seriesList?.length) return

  // 2. For each series, find the latest generated occurrence
  for (const series of seriesList as TaskSeries[]) {
    const { data: maxRow } = await supabase
      .from('ceo_tasks')
      .select('due_date')
      .eq('series_id', series.id)
      .order('due_date', { ascending: false })
      .limit(1)
      .maybeSingle()              // maybeSingle() returns null (not throws) when no rows exist

    const maxDueDate = maxRow?.due_date as string | undefined | null

    // 3. If coverage is less than 365 days ahead, generate the gap
    // String comparison is safe here — both are always "YYYY-MM-DD" ISO strings
    if (!maxDueDate || maxDueDate < windowEnd) {
      const fromDate = maxDueDate
        ? addDays(parseISO(maxDueDate), 1)
        : new Date(Math.max(parseISO(series.start_date).getTime(), today.getTime()))

      const newOccurrences = generateOccurrences(series, fromDate, toDate)
      await insertOccurrences(supabase, newOccurrences)
    }
  }
}
