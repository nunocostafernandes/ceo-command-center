import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Bell, Check, Plus, CalendarDays, Trash2, Pencil, LogOut, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  format,
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  eachDayOfInterval,
  isSameMonth, isSameDay, isToday,
  parseISO, addMonths, subMonths,
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { usePlatform } from '@/hooks/usePlatform'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import type { GCalEvent } from '@/hooks/useGoogleCalendar'
import { PlatformSheet } from '@/components/shared/PlatformSheet'
import type { Task, Reminder } from '@/types/database'

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Format a local datetime-local input value to ISO string
function localToISO(localStr: string): string {
  if (!localStr) return ''
  // datetime-local gives "2026-03-18T14:30" — add seconds + timezone
  return new Date(localStr).toISOString()
}

// Format ISO or date string to datetime-local input value
function isoToLocal(iso: string | undefined): string {
  if (!iso) return ''
  try { return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") } catch { return '' }
}


// ── Google event form state ────────────────────────────────────────────────

interface GCalForm {
  summary: string
  description: string
  start: string
  end: string
  allDay: boolean
}

const emptyGCalForm = (defaultDate?: Date): GCalForm => {
  const base = defaultDate ? format(defaultDate, "yyyy-MM-dd'T'09:00") : ''
  const baseEnd = defaultDate ? format(defaultDate, "yyyy-MM-dd'T'10:00") : ''
  return { summary: '', description: '', start: base, end: baseEnd, allDay: false }
}

// ── Main page ──────────────────────────────────────────────────────────────

export function CalendarPage() {
  const { user } = useAuth()
  const { isDesktop } = usePlatform()
  const qc = useQueryClient()
  const userId = user?.id
  const gcal = useGoogleCalendar()

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(new Date())

  // Sheet states
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState({ title: '', remind_at: '' })

  const [gcalCreateOpen, setGcalCreateOpen] = useState(false)
  const [gcalEditOpen, setGcalEditOpen] = useState(false)
  const [gcalForm, setGcalForm] = useState<GCalForm>(emptyGCalForm)
  const [editingEvent, setEditingEvent] = useState<GCalEvent | null>(null)
  const [gcalSaving, setGcalSaving] = useState(false)
  const [gcalDeleting, setGcalDeleting] = useState(false)

  // Calendar range
  const monthStart = startOfMonth(currentMonth)
  const monthEnd   = endOfMonth(currentMonth)
  const calStart   = startOfWeek(monthStart)
  const calEnd     = endOfWeek(monthEnd)
  const calDays    = eachDayOfInterval({ start: calStart, end: calEnd })

  const rangeStart = format(calStart, 'yyyy-MM-dd')
  const rangeEnd   = format(calEnd,   'yyyy-MM-dd')

  // ── Supabase queries ──────────────────────────────────────────────────────

  const { data: tasks } = useQuery({
    queryKey: ['calendar-tasks', userId, rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_tasks').select('*').eq('user_id', userId!).gte('due_date', rangeStart).lte('due_date', rangeEnd)
      if (error) throw error
      return (data ?? []) as Task[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const { data: reminders } = useQuery({
    queryKey: ['calendar-reminders', userId, rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_reminders').select('*').eq('user_id', userId!).gte('remind_at', `${rangeStart}T00:00:00`).lte('remind_at', `${rangeEnd}T23:59:59`)
      if (error) throw error
      return (data ?? []) as Reminder[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  // ── Google Calendar query ─────────────────────────────────────────────────

  const gcalQueryKey = ['gcal-events', rangeStart, rangeEnd, gcal.isConnected]
  const { data: gcalEvents, isLoading: gcalLoading, refetch: refetchGcal } = useQuery({
    queryKey: gcalQueryKey,
    queryFn: () => gcal.fetchEvents(`${rangeStart}T00:00:00Z`, `${rangeEnd}T23:59:59Z`),
    enabled: gcal.isConnected,
    staleTime: 1000 * 60 * 5,
  })

  // ── Supabase mutations ────────────────────────────────────────────────────

  const createReminder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('ceo_reminders').insert({
        user_id: userId!, title: reminderForm.title, remind_at: reminderForm.remind_at, is_dismissed: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar-reminders', userId, rangeStart, rangeEnd] })
      void qc.invalidateQueries({ queryKey: ['kpi-reminders', userId] })
      void qc.invalidateQueries({ queryKey: ['upcoming-reminders', userId] })
      toast.success('Reminder added')
      setReminderSheetOpen(false)
      setReminderForm({ title: '', remind_at: '' })
    },
    onError: () => toast.error('Failed to add reminder'),
  })

  const dismissReminder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ceo_reminders').update({ is_dismissed: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar-reminders', userId, rangeStart, rangeEnd] })
      void qc.invalidateQueries({ queryKey: ['kpi-reminders', userId] })
    },
    onError: () => toast.error('Failed to dismiss'),
  })

  // ── Google Calendar handlers ──────────────────────────────────────────────

  const openGcalCreate = () => {
    setGcalForm(emptyGCalForm(selectedDay))
    setGcalCreateOpen(true)
  }

  const openGcalEdit = (event: GCalEvent) => {
    setEditingEvent(event)
    setGcalForm({
      summary: event.summary ?? '',
      description: event.description ?? '',
      start: event.allDay ? (event.start.date ?? '') : isoToLocal(event.start.dateTime),
      end:   event.allDay ? (event.end.date ?? '')   : isoToLocal(event.end.dateTime),
      allDay: !!event.allDay,
    })
    setGcalEditOpen(true)
  }

  const handleGcalCreate = async () => {
    if (!gcalForm.summary.trim()) return
    setGcalSaving(true)
    const start = gcalForm.allDay ? gcalForm.start.slice(0, 10) : localToISO(gcalForm.start)
    const end   = gcalForm.allDay ? gcalForm.end.slice(0, 10)   : localToISO(gcalForm.end)
    const result = await gcal.createEvent(gcalForm.summary, start, end, gcalForm.description || undefined, gcalForm.allDay)
    setGcalSaving(false)
    if (result) {
      toast.success('Event created')
      setGcalCreateOpen(false)
      void refetchGcal()
    } else {
      toast.error('Failed to create event')
    }
  }

  const handleGcalUpdate = async () => {
    if (!editingEvent || !gcalForm.summary.trim()) return
    setGcalSaving(true)
    const start = gcalForm.allDay ? gcalForm.start.slice(0, 10) : localToISO(gcalForm.start)
    const end   = gcalForm.allDay ? gcalForm.end.slice(0, 10)   : localToISO(gcalForm.end)
    const result = await gcal.updateEvent(editingEvent.id, gcalForm.summary, start, end, gcalForm.description || undefined, gcalForm.allDay)
    setGcalSaving(false)
    if (result) {
      toast.success('Event updated')
      setGcalEditOpen(false)
      setEditingEvent(null)
      void refetchGcal()
    } else {
      toast.error('Failed to update event')
    }
  }

  const handleGcalDelete = async () => {
    if (!editingEvent) return
    setGcalDeleting(true)
    const ok = await gcal.deleteEvent(editingEvent.id)
    setGcalDeleting(false)
    if (ok) {
      toast.success('Event deleted')
      setGcalEditOpen(false)
      setEditingEvent(null)
      void refetchGcal()
    } else {
      toast.error('Failed to delete event')
    }
  }

  // ── Data maps ─────────────────────────────────────────────────────────────

  const selectedDayStr = format(selectedDay, 'yyyy-MM-dd')

  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const t of tasks ?? []) {
      if (!t.due_date) continue
      if (!map[t.due_date]) map[t.due_date] = []
      map[t.due_date]!.push(t)
    }
    return map
  }, [tasks])

  const remindersByDay = useMemo(() => {
    const map: Record<string, Reminder[]> = {}
    for (const r of reminders ?? []) {
      const d = r.remind_at.slice(0, 10)
      if (!map[d]) map[d] = []
      map[d]!.push(r)
    }
    return map
  }, [reminders])

  const gcalByDay = useMemo(() => {
    const map: Record<string, GCalEvent[]> = {}
    for (const e of gcalEvents ?? []) {
      const d = (e.start.dateTime ?? e.start.date ?? '').slice(0, 10)
      if (!d) continue
      if (!map[d]) map[d] = []
      map[d]!.push(e)
    }
    return map
  }, [gcalEvents])

  const dayTasks     = tasksByDay[selectedDayStr]     ?? []
  const dayReminders = remindersByDay[selectedDayStr] ?? []
  const dayGcal      = gcalByDay[selectedDayStr]      ?? []

  const getDotsForDay = (day: Date) => {
    const d = format(day, 'yyyy-MM-dd')
    return {
      hasTasks:     !!tasksByDay[d]?.length,
      hasReminders: !!remindersByDay[d]?.length,
      hasGcal:      !!gcalByDay[d]?.length,
    }
  }

  // ── Input style ───────────────────────────────────────────────────────────

  const inputClass = 'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary'

  const openReminderSheet = () => {
    setReminderForm({ title: '', remind_at: format(selectedDay, "yyyy-MM-dd'T'09:00") })
    setReminderSheetOpen(true)
  }

  // ── Calendar grid ─────────────────────────────────────────────────────────

  const calendarGrid = (
    <div className="card-glass p-4">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors press">
          <ChevronLeft size={18} className="text-text-secondary" />
        </button>
        <p className="text-sm font-semibold text-text-primary">{format(currentMonth, 'MMMM yyyy')}</p>
        <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors press">
          <ChevronRight size={18} className="text-text-secondary" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-text-tertiary py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {calDays.map(day => {
          const { hasTasks, hasReminders, hasGcal } = getDotsForDay(day)
          const inMonth  = isSameMonth(day, currentMonth)
          const isSelected = isSameDay(day, selectedDay)
          const isTodayDay = isToday(day)

          return (
            <motion.button
              key={day.toISOString()}
              whileTap={{ scale: 0.9 }}
              onClick={() => setSelectedDay(day)}
              className={`relative flex flex-col items-center py-1 rounded-xl transition-colors ${
                isDesktop ? 'min-h-[80px] justify-start pt-2' : 'min-h-[44px] justify-center'
              } ${isSelected ? 'bg-accent' : isTodayDay ? 'bg-white text-[#020203]' : 'hover:bg-white/5'}`}
            >
              <span className={`text-xs font-medium ${
                isSelected ? 'text-white' : isTodayDay ? 'text-[#020203]' : inMonth ? 'text-text-primary' : 'text-text-tertiary'
              }`}>
                {format(day, 'd')}
              </span>
              {/* Event dots */}
              <div className="flex gap-0.5 mt-0.5 h-1">
                {hasTasks     && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/70' : 'bg-accent'}`} />}
                {hasReminders && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/70' : 'bg-status-warning'}`} />}
                {hasGcal      && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/70' : 'bg-emerald-400'}`} />}
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Google Calendar legend */}
      {gcal.isConnected && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span className="text-[10px] text-text-tertiary">Tasks</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-status-warning" />
            <span className="text-[10px] text-text-tertiary">Reminders</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-text-tertiary">Google Cal</span>
          </div>
        </div>
      )}
    </div>
  )

  // ── Day detail ────────────────────────────────────────────────────────────

  const dayDetailContent = (
    <>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {format(selectedDay, 'EEEE, MMMM d')}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={openReminderSheet} className="text-xs text-text-tertiary hover:text-accent flex items-center gap-1 transition-colors">
            <Bell size={12} />Reminder
          </button>
          {gcal.isConnected && (
            <button onClick={openGcalCreate} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors">
              <CalendarDays size={12} />Event
            </button>
          )}
        </div>
      </div>

      {dayTasks.length === 0 && dayReminders.length === 0 && dayGcal.length === 0 ? (
        <p className="text-text-tertiary text-sm">Nothing scheduled.</p>
      ) : (
        <div className="space-y-2">

          {/* Google Calendar events */}
          {dayGcal.map(event => (
            <div
              key={event.id}
              className="card-glass p-3 flex items-start gap-3 cursor-pointer hover-bg transition-colors"
              onClick={() => openGcalEdit(event)}
            >
              <CalendarDays size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{event.summary}</p>
                <p className="text-[10px] text-text-tertiary">
                  {event.allDay ? 'All day' : (
                    event.start.dateTime
                      ? `${format(parseISO(event.start.dateTime), 'h:mm a')} – ${format(parseISO(event.end.dateTime!), 'h:mm a')}`
                      : ''
                  )}
                </p>
              </div>
              <Pencil size={12} className="text-text-tertiary flex-shrink-0 mt-1 opacity-40" />
            </div>
          ))}

          {/* Reminders */}
          {dayReminders.map(r => (
            <div key={r.id} className={`card-glass p-3 flex items-center gap-3 ${r.is_dismissed ? 'opacity-50' : ''}`}>
              <Bell size={15} className="text-status-warning flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className={`text-sm text-text-primary ${r.is_dismissed ? 'line-through' : ''}`}>{r.title}</p>
                <p className="text-[10px] text-text-tertiary">{format(parseISO(r.remind_at), 'h:mm a')}</p>
              </div>
              {!r.is_dismissed && (
                <button onClick={() => dismissReminder.mutate(r.id)} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
                  <Check size={14} className="text-text-tertiary" />
                </button>
              )}
            </div>
          ))}

          {/* Tasks */}
          {dayTasks.map(task => (
            <div key={task.id} className="card-glass p-3 flex items-center gap-3">
              <Check size={15} className={task.is_completed ? 'text-accent' : 'text-text-tertiary'} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${task.is_completed ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>{task.title}</p>
                {task.priority && <p className="text-[10px] text-text-tertiary capitalize">{task.priority} priority</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )

  // ── Google Calendar connect banner ────────────────────────────────────────

  const gcalBanner = !gcal.isConnected ? (
    <div className="mb-4 card-glass p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <CalendarDays size={18} className="text-emerald-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-text-primary">Connect Google Calendar</p>
          <p className="text-xs text-text-tertiary">See and manage your Google events here</p>
        </div>
      </div>
      <button
        onClick={() => gcal.connect()}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-colors"
      >
        Connect
      </button>
    </div>
  ) : null

  // ── Header buttons ────────────────────────────────────────────────────────

  const headerButtons = (
    <div className="flex items-center gap-2">
      {gcal.isConnected && (
        <button
          onClick={() => { gcal.disconnect(); toast.success('Google Calendar disconnected') }}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-white/5 transition-colors"
          title="Disconnect Google Calendar"
        >
          <LogOut size={15} />
        </button>
      )}
      {gcal.isConnected && gcalLoading && <Loader2 size={14} className="text-emerald-400 animate-spin" />}
      <button
        onClick={openReminderSheet}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
      >
        <Plus size={16} />Add Reminder
      </button>
      <button
        onClick={() => setSelectedDay(new Date())}
        className="text-xs text-accent font-medium px-3 py-1.5 rounded-btn bg-accent/10 hover:bg-accent/20 transition-colors"
      >
        Today
      </button>
    </div>
  )

  // ── Google Calendar event form ─────────────────────────────────────────────

  const gcalFormContent = (isEdit: boolean) => (
    <div className="space-y-3 pb-4">
      <input
        type="text"
        placeholder="Event title"
        value={gcalForm.summary}
        onChange={e => setGcalForm(f => ({ ...f, summary: e.target.value }))}
        className={inputClass}
        autoFocus
      />
      <textarea
        placeholder="Description (optional)"
        value={gcalForm.description}
        onChange={e => setGcalForm(f => ({ ...f, description: e.target.value }))}
        className={`${inputClass} resize-none`}
        rows={2}
      />
      {/* All-day toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <div
          onClick={() => setGcalForm(f => ({ ...f, allDay: !f.allDay }))}
          className={`w-10 h-5 rounded-full transition-colors relative ${gcalForm.allDay ? 'bg-accent' : 'bg-white/15'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${gcalForm.allDay ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
        <span className="text-sm text-text-secondary">All day</span>
      </label>
      {gcalForm.allDay ? (
        <>
          <div>
            <label className="text-xs text-text-tertiary block mb-1">Start date</label>
            <input type="date" value={gcalForm.start.slice(0, 10)} onChange={e => setGcalForm(f => ({ ...f, start: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-text-tertiary block mb-1">End date</label>
            <input type="date" value={gcalForm.end.slice(0, 10)} onChange={e => setGcalForm(f => ({ ...f, end: e.target.value }))} className={inputClass} />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="text-xs text-text-tertiary block mb-1">Start</label>
            <input type="datetime-local" value={gcalForm.start} onChange={e => setGcalForm(f => ({ ...f, start: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-text-tertiary block mb-1">End</label>
            <input type="datetime-local" value={gcalForm.end} onChange={e => setGcalForm(f => ({ ...f, end: e.target.value }))} className={inputClass} />
          </div>
        </>
      )}
      <button
        onClick={isEdit ? handleGcalUpdate : handleGcalCreate}
        disabled={!gcalForm.summary.trim() || gcalSaving}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {gcalSaving && <Loader2 size={15} className="animate-spin" />}
        {isEdit ? 'Save Changes' : 'Create Event'}
      </button>
      {isEdit && (
        <button
          onClick={handleGcalDelete}
          disabled={gcalDeleting}
          className="w-full bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {gcalDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          Delete Event
        </button>
      )}
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {isDesktop ? (
        <div className="flex flex-row gap-0 h-full overflow-hidden pt-[calc(var(--safe-top)+16px)]">
          {/* Left: calendar grid */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-2xl font-bold text-text-primary">Calendar</h1>
              {headerButtons}
            </div>
            {gcalBanner}
            {calendarGrid}
          </div>

          {/* Right: day detail */}
          <div className="w-[300px] flex-shrink-0 border-l border-white/[0.08] overflow-y-auto px-4 py-4">
            <div className="pt-[calc(var(--safe-top)+16px)]">
              {dayDetailContent}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto scroll-contain">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-2xl font-bold text-text-primary">Calendar</h1>
            {headerButtons}
          </div>
          {gcalBanner}
          <div className="mb-5">{calendarGrid}</div>
          <div className="mb-4">{dayDetailContent}</div>
        </div>
      )}

      {/* Reminder sheet */}
      <PlatformSheet isOpen={reminderSheetOpen} onClose={() => setReminderSheetOpen(false)} title="Add Reminder">
        <div className="space-y-3 pb-4">
          <input type="text" placeholder="Reminder title" value={reminderForm.title} onChange={e => setReminderForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
          <input type="datetime-local" value={reminderForm.remind_at} onChange={e => setReminderForm(f => ({ ...f, remind_at: e.target.value }))} className={inputClass} />
          <button
            onClick={() => createReminder.mutate()}
            disabled={!reminderForm.title || !reminderForm.remind_at || createReminder.isPending}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {createReminder.isPending ? 'Adding...' : 'Add Reminder'}
          </button>
        </div>
      </PlatformSheet>

      {/* Google Calendar create sheet */}
      <PlatformSheet isOpen={gcalCreateOpen} onClose={() => setGcalCreateOpen(false)} title="New Google Event">
        {gcalFormContent(false)}
      </PlatformSheet>

      {/* Google Calendar edit sheet */}
      <PlatformSheet isOpen={gcalEditOpen} onClose={() => { setGcalEditOpen(false); setEditingEvent(null) }} title="Edit Event">
        {gcalFormContent(true)}
      </PlatformSheet>
    </>
  )
}
