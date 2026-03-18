import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Bell, Check, Plus, CalendarDays, Trash2, Pencil, LogOut, Loader2, Palmtree, Mail } from 'lucide-react'

const LEAVE_PROXY = 'https://ledtmryhckvgdkkqqteh.supabase.co/functions/v1/leave-calendar-proxy'

interface LeaveEvent {
  id: string
  summary: string
  description: string | null
  location: string | null
  start: string
  end: string
  allDay: boolean
}
import { toast } from 'sonner'
import {
  format,
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  eachDayOfInterval,
  isSameMonth, isSameDay, isToday,
  parseISO, addMonths, subMonths, subDays,
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { usePlatform } from '@/hooks/usePlatform'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import type { GCalEvent, GCalCalendar } from '@/hooks/useGoogleCalendar'
import { useMicrosoftCalendar } from '@/hooks/useMicrosoftCalendar'
import type { MSCalEvent, MSCalendar } from '@/hooks/useMicrosoftCalendar'
import { PlatformSheet } from '@/components/shared/PlatformSheet'
import type { Task, Reminder } from '@/types/database'

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Calendar bar rendering constants
const BAR_H = 18  // px height per bar row
const DAY_H = 40  // px for date number + dots row

function localToISO(localStr: string): string {
  if (!localStr) return ''
  return new Date(localStr).toISOString()
}

function isoToLocal(iso: string | undefined): string {
  if (!iso) return ''
  try { return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") } catch { return '' }
}

interface GCalForm {
  summary: string
  description: string
  start: string
  end: string
  allDay: boolean
  calendarId: string
}

// Single event bar spanning one or more columns within a week row
type EventBarType = 'leave' | 'gcal' | 'mscal' | 'task' | 'reminder'
interface EventBar {
  id: string
  label: string
  colStart: number    // 0–6
  colSpan: number
  row: number         // vertical slot (0 = topmost)
  isEventStart: boolean
  isEventEnd: boolean
  color: string       // bar background color (rgba/hex)
  textColor: string   // label text color
  type: EventBarType
  gcalEvent?: GCalEvent
  msCalEvent?: MSCalEvent
  taskItem?: Task
  reminderItem?: Reminder
}

const emptyGCalForm = (defaultDate?: Date, calendarId = 'primary'): GCalForm => {
  const base    = defaultDate ? format(defaultDate, "yyyy-MM-dd'T'09:00") : ''
  const baseEnd = defaultDate ? format(defaultDate, "yyyy-MM-dd'T'10:00") : ''
  return { summary: '', description: '', start: base, end: baseEnd, allDay: false, calendarId }
}

export function CalendarPage() {
  const { user } = useAuth()
  const { isDesktop } = usePlatform()
  const qc = useQueryClient()
  const userId = user?.id
  const gcal  = useGoogleCalendar()
  const mscal = useMicrosoftCalendar()

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay]   = useState(new Date())
  const dayDetailRef = useRef<HTMLDivElement>(null)

  const selectDay = (day: Date, scrollToDetail = false) => {
    setSelectedDay(day)
    if (scrollToDetail) {
      setTimeout(() => {
        dayDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }

  // Which calendar IDs are toggled on — null means "not yet initialized"
  const [selectedCalIds, setSelectedCalIds] = useState<Set<string> | null>(null)

  // Sheet states
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState({ title: '', remind_at: '' })

  const [gcalCreateOpen, setGcalCreateOpen] = useState(false)
  const [gcalEditOpen, setGcalEditOpen]     = useState(false)
  const [gcalForm, setGcalForm]             = useState<GCalForm>(emptyGCalForm)
  const [editingEvent, setEditingEvent]     = useState<GCalEvent | null>(null)
  const [gcalSaving, setGcalSaving]         = useState(false)
  const [gcalDeleting, setGcalDeleting]     = useState(false)

  // Microsoft Calendar state
  const [selectedMsCalIds, setSelectedMsCalIds] = useState<Set<string> | null>(null)
  const [msCalCreateOpen, setMsCalCreateOpen]   = useState(false)
  const [msCalEditOpen, setMsCalEditOpen]       = useState(false)
  const [msCalForm, setMsCalForm]               = useState<GCalForm>(emptyGCalForm)
  const [editingMsEvent, setEditingMsEvent]     = useState<MSCalEvent | null>(null)
  const [msCalSaving, setMsCalSaving]           = useState(false)
  const [msCalDeleting, setMsCalDeleting]       = useState(false)

  // Calendar range
  const monthStart = startOfMonth(currentMonth)
  const monthEnd   = endOfMonth(currentMonth)
  const calStart   = startOfWeek(monthStart)
  const calEnd     = endOfWeek(monthEnd)
  const calDays    = eachDayOfInterval({ start: calStart, end: calEnd })

  const rangeStart = format(calStart, 'yyyy-MM-dd')
  const rangeEnd   = format(calEnd,   'yyyy-MM-dd')

  // ── Fetch calendar list ───────────────────────────────────────────────────

  const { data: calendars } = useQuery<GCalCalendar[]>({
    queryKey: ['gcal-calendars', gcal.isConnected],
    queryFn:  () => gcal.fetchCalendars(),
    enabled:  gcal.isConnected,
    staleTime: 1000 * 60 * 60,
  })

  // Initialize selectedCalIds to all calendars on first load
  useEffect(() => {
    if (calendars && selectedCalIds === null) {
      setSelectedCalIds(new Set(calendars.map(c => c.id)))
    }
  }, [calendars, selectedCalIds])

  // When disconnected, reset selection
  useEffect(() => {
    if (!gcal.isConnected) setSelectedCalIds(null)
  }, [gcal.isConnected])

  const activeCalIds = useMemo(() => {
    if (!selectedCalIds) return ['primary']
    return Array.from(selectedCalIds)
  }, [selectedCalIds])

  // Calendar lookup by ID
  const calMap = useMemo(() => {
    const m: Record<string, GCalCalendar> = {}
    for (const c of calendars ?? []) m[c.id] = c
    return m
  }, [calendars])

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

  const gcalQueryKey = ['gcal-events', rangeStart, rangeEnd, activeCalIds.join(',')]
  const { data: gcalEvents, isLoading: gcalLoading, refetch: refetchGcal } = useQuery({
    queryKey: gcalQueryKey,
    queryFn:  () => gcal.fetchEvents(`${rangeStart}T00:00:00Z`, `${rangeEnd}T23:59:59Z`, activeCalIds),
    enabled:  gcal.isConnected && activeCalIds.length > 0,
    staleTime: 1000 * 60 * 5,
  })

  // ── Microsoft Calendar queries ────────────────────────────────────────────

  const { data: msCalendars } = useQuery<MSCalendar[]>({
    queryKey: ['ms-calendars', mscal.isConnected],
    queryFn:  () => mscal.fetchCalendars(),
    enabled:  mscal.isConnected,
    staleTime: 1000 * 60 * 60,
  })

  useEffect(() => {
    if (msCalendars && selectedMsCalIds === null) {
      setSelectedMsCalIds(new Set(msCalendars.map(c => c.id)))
    }
  }, [msCalendars, selectedMsCalIds])

  useEffect(() => {
    if (!mscal.isConnected) setSelectedMsCalIds(null)
  }, [mscal.isConnected])

  const activeMsCalIds = useMemo(() => {
    if (!selectedMsCalIds || selectedMsCalIds.size === 0) return []
    return Array.from(selectedMsCalIds)
  }, [selectedMsCalIds])

  const msCalMap = useMemo(() => {
    const m: Record<string, MSCalendar> = {}
    for (const c of msCalendars ?? []) m[c.id] = c
    return m
  }, [msCalendars])

  const { data: msCalEvents, isLoading: msCalLoading, refetch: refetchMsCal } = useQuery({
    queryKey: ['ms-cal-events', rangeStart, rangeEnd, activeMsCalIds.join(',')],
    queryFn:  () => mscal.fetchEvents(`${rangeStart}T00:00:00Z`, `${rangeEnd}T23:59:59Z`, activeMsCalIds),
    enabled:  mscal.isConnected && activeMsCalIds.length > 0,
    staleTime: 1000 * 60 * 5,
  })

  // ── Leave calendar (public, no login required) ─────────────────────────────

  const { data: leaveData } = useQuery({
    queryKey: ['leave-calendar'],
    queryFn:  async () => {
      const res = await fetch(LEAVE_PROXY)
      if (!res.ok) return { events: [] as LeaveEvent[] }
      return res.json() as Promise<{ events: LeaveEvent[] }>
    },
    staleTime: 1000 * 60 * 30,
  })
  // Deduplicate by event ID — ICS feeds sometimes contain the same VEVENT twice
  const leaveEvents = useMemo(() => {
    const seen = new Set<string>()
    return (leaveData?.events ?? []).filter(e => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })
  }, [leaveData])

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

  const primaryCalId = useMemo(() =>
    calendars?.find(c => c.primary)?.id ?? 'primary',
    [calendars]
  )

  const openGcalCreate = () => {
    setGcalForm(emptyGCalForm(selectedDay, primaryCalId))
    setGcalCreateOpen(true)
  }

  const openGcalEdit = (event: GCalEvent) => {
    setEditingEvent(event)
    setGcalForm({
      summary:     event.summary ?? '',
      description: event.description ?? '',
      start:       event.allDay ? (event.start.date ?? '') : isoToLocal(event.start.dateTime),
      end:         event.allDay ? (event.end.date ?? '')   : isoToLocal(event.end.dateTime),
      allDay:      !!event.allDay,
      calendarId:  event.calendarId ?? primaryCalId,
    })
    setGcalEditOpen(true)
  }

  const handleGcalCreate = async () => {
    if (!gcalForm.summary.trim()) return
    setGcalSaving(true)
    const start = gcalForm.allDay ? gcalForm.start.slice(0, 10) : localToISO(gcalForm.start)
    const end   = gcalForm.allDay ? gcalForm.end.slice(0, 10)   : localToISO(gcalForm.end)
    const result = await gcal.createEvent(gcalForm.summary, start, end, gcalForm.description || undefined, gcalForm.allDay, gcalForm.calendarId)
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
    const result = await gcal.updateEvent(editingEvent.id, gcalForm.summary, start, end, gcalForm.description || undefined, gcalForm.allDay, gcalForm.calendarId)
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
    const ok = await gcal.deleteEvent(editingEvent.id, editingEvent.calendarId ?? primaryCalId)
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

  // Toggle a Google calendar on/off
  const toggleCalendar = (calId: string) => {
    setSelectedCalIds(prev => {
      const next = new Set(prev ?? [])
      if (next.has(calId)) {
        if (next.size === 1) return prev
        next.delete(calId)
      } else {
        next.add(calId)
      }
      return next
    })
  }

  // ── Microsoft Calendar handlers ────────────────────────────────────────────

  const toggleMsCalendar = (calId: string) => {
    setSelectedMsCalIds(prev => {
      const next = new Set(prev ?? [])
      if (next.has(calId)) {
        if (next.size === 1) return prev
        next.delete(calId)
      } else {
        next.add(calId)
      }
      return next
    })
  }

  const openMsCalCreate = () => {
    setMsCalForm(emptyGCalForm(selectedDay))
    setMsCalCreateOpen(true)
  }

  const openMsCalEdit = (event: MSCalEvent) => {
    setEditingMsEvent(event)
    setMsCalForm({
      summary:     event.subject ?? '',
      description: event.bodyPreview ?? '',
      start:       event.isAllDay ? event.start.dateTime.slice(0, 10) : format(parseISO(event.start.dateTime), "yyyy-MM-dd'T'HH:mm"),
      end:         event.isAllDay ? event.end.dateTime.slice(0, 10)   : format(parseISO(event.end.dateTime),   "yyyy-MM-dd'T'HH:mm"),
      allDay:      event.isAllDay,
      calendarId:  event.calendarId ?? '',
    })
    setMsCalEditOpen(true)
  }

  const handleMsCalCreate = async () => {
    if (!msCalForm.summary.trim()) return
    setMsCalSaving(true)
    const start = msCalForm.allDay ? msCalForm.start.slice(0, 10) : localToISO(msCalForm.start)
    const end   = msCalForm.allDay ? msCalForm.end.slice(0, 10)   : localToISO(msCalForm.end)
    const result = await mscal.createEvent(msCalForm.summary, start, end, msCalForm.description || undefined, msCalForm.allDay, msCalForm.calendarId || undefined)
    setMsCalSaving(false)
    if (result) {
      toast.success('Event created')
      setMsCalCreateOpen(false)
      void refetchMsCal()
    } else {
      toast.error('Failed to create event')
    }
  }

  const handleMsCalUpdate = async () => {
    if (!editingMsEvent || !msCalForm.summary.trim()) return
    setMsCalSaving(true)
    const start = msCalForm.allDay ? msCalForm.start.slice(0, 10) : localToISO(msCalForm.start)
    const end   = msCalForm.allDay ? msCalForm.end.slice(0, 10)   : localToISO(msCalForm.end)
    const result = await mscal.updateEvent(editingMsEvent.id, msCalForm.summary, start, end, msCalForm.description || undefined, msCalForm.allDay)
    setMsCalSaving(false)
    if (result) {
      toast.success('Event updated')
      setMsCalEditOpen(false)
      setEditingMsEvent(null)
      void refetchMsCal()
    } else {
      toast.error('Failed to update event')
    }
  }

  const handleMsCalDelete = async () => {
    if (!editingMsEvent) return
    setMsCalDeleting(true)
    const ok = await mscal.deleteEvent(editingMsEvent.id)
    setMsCalDeleting(false)
    if (ok) {
      toast.success('Event deleted')
      setMsCalEditOpen(false)
      setEditingMsEvent(null)
      void refetchMsCal()
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

  const mscalByDay = useMemo(() => {
    const map: Record<string, MSCalEvent[]> = {}
    for (const e of msCalEvents ?? []) {
      const d = e.start.dateTime.slice(0, 10)
      if (!d) continue
      if (!map[d]) map[d] = []
      map[d]!.push(e)
    }
    return map
  }, [msCalEvents])

  // leaveByDay: used for the day detail panel
  const leaveByDay = useMemo(() => {
    const map: Record<string, LeaveEvent[]> = {}
    for (const e of leaveEvents) {
      const startDate = e.start.slice(0, 10)
      const endDate   = e.end.slice(0, 10)
      if (startDate !== endDate) {
        const cur = new Date(startDate)
        const end = new Date(endDate)
        while (cur <= end) {
          const d = format(cur, 'yyyy-MM-dd')
          if (!map[d]) map[d] = []
          if (!map[d]!.find(ev => ev.id === e.id)) map[d]!.push(e)
          cur.setDate(cur.getDate() + 1)
        }
      } else {
        if (!map[startDate]) map[startDate] = []
        map[startDate]!.push(e)
      }
    }
    return map
  }, [leaveEvents])

  const dayTasks     = tasksByDay[selectedDayStr]     ?? []
  const dayReminders = remindersByDay[selectedDayStr] ?? []
  const dayGcal      = gcalByDay[selectedDayStr]      ?? []
  const dayMsCal     = mscalByDay[selectedDayStr]     ?? []
  const dayLeave     = leaveByDay[selectedDayStr]     ?? []

  // ── Week-based event bars (Apple Calendar architecture) ───────────────────
  // Each leave event is ONE bar spanning its full column range per week.
  // Bars are rendered at the week level (not inside day cells) so alignment
  // is guaranteed to be pixel-perfect across all columns.

  const weeksData = useMemo(() => {
    const weekArrays: Date[][] = []
    for (let i = 0; i < calDays.length; i += 7) {
      weekArrays.push(calDays.slice(i, i + 7))
    }

    return weekArrays.map(weekDays => {
      const weekStartStr = format(weekDays[0]!, 'yyyy-MM-dd')
      const weekEndStr   = format(weekDays[6]!, 'yyyy-MM-dd')

      const candidates: Omit<EventBar, 'row'>[] = []

      // helper: push a bar candidate if it overlaps this week
      const push = (
        id: string, label: string,
        eventStart: string, eventEnd: string,
        color: string, textColor: string, type: EventBarType,
        extras: Partial<Omit<EventBar, 'id'|'label'|'colStart'|'colSpan'|'row'|'isEventStart'|'isEventEnd'|'color'|'textColor'|'type'>> = {},
      ) => {
        if (eventStart > weekEndStr || eventEnd < weekStartStr) return
        const clampedStart = eventStart < weekStartStr ? weekStartStr : eventStart
        const clampedEnd   = eventEnd   > weekEndStr   ? weekEndStr   : eventEnd
        const colStart = weekDays.findIndex(d => format(d, 'yyyy-MM-dd') === clampedStart)
        const colEnd   = weekDays.findIndex(d => format(d, 'yyyy-MM-dd') === clampedEnd)
        if (colStart === -1 || colEnd === -1) return
        candidates.push({
          id, label, colStart, colSpan: colEnd - colStart + 1,
          isEventStart: eventStart >= weekStartStr,
          isEventEnd:   eventEnd   <= weekEndStr,
          color, textColor, type, ...extras,
        })
      }

      // ── Tasks ─────────────────────────────────────────────────────────────
      for (const t of tasks ?? []) {
        if (!t.due_date) continue
        push(t.id, t.title, t.due_date, t.due_date,
          'rgba(94, 106, 210, 0.30)', '#a5b4fc', 'task', { taskItem: t })
      }

      // ── Reminders ─────────────────────────────────────────────────────────
      for (const r of reminders ?? []) {
        const d = r.remind_at.slice(0, 10)
        push(r.id, r.title, d, d,
          'rgba(251, 191, 36, 0.25)', '#fbbf24', 'reminder', { reminderItem: r })
      }

      // ── Leave events ──────────────────────────────────────────────────────
      for (const e of leaveEvents) {
        push(e.id, e.summary,
          e.start.slice(0, 10), e.end.slice(0, 10),
          'rgba(109, 40, 217, 0.35)', 'rgba(196, 181, 253, 0.9)', 'leave')
      }

      // ── Google Calendar events ────────────────────────────────────────────
      for (const e of gcalEvents ?? []) {
        let eventStart: string, eventEnd: string
        if (e.allDay && e.start.date) {
          eventStart = e.start.date
          // Google all-day end is exclusive — subtract 1 day for inclusive end
          eventEnd = format(subDays(parseISO(e.end.date!), 1), 'yyyy-MM-dd')
        } else {
          const d = (e.start.dateTime ?? '').slice(0, 10)
          if (!d) continue
          eventStart = d; eventEnd = d
        }
        const calColor = e.calendarId ? (calMap[e.calendarId]?.backgroundColor ?? '#34d399') : '#34d399'
        push(e.id, e.summary ?? '(No title)', eventStart, eventEnd,
          `${calColor}33`, calColor, 'gcal', { gcalEvent: e })
      }

      // ── Microsoft Calendar events ─────────────────────────────────────────
      for (const e of msCalEvents ?? []) {
        let eventStart: string, eventEnd: string
        if (e.isAllDay) {
          eventStart = e.start.dateTime.slice(0, 10)
          // MS all-day end is exclusive — subtract 1 day for inclusive end
          eventEnd = format(subDays(parseISO(e.end.dateTime.slice(0, 10)), 1), 'yyyy-MM-dd')
        } else {
          eventStart = e.start.dateTime.slice(0, 10)
          eventEnd = e.start.dateTime.slice(0, 10)
        }
        const calColor = e.calendarId ? (msCalMap[e.calendarId]?.hexColor || '#38bdf8') : '#38bdf8'
        push(e.id, e.subject ?? '(No title)', eventStart, eventEnd,
          `${calColor}33`, calColor, 'mscal', { msCalEvent: e })
      }

      // Sort: earlier start first, longer span first
      candidates.sort((a, b) => a.colStart - b.colStart || b.colSpan - a.colSpan)

      // Greedy row assignment — find the first row with no column overlap
      const bars: EventBar[] = []
      for (const c of candidates) {
        let row = 0
        while (bars.some(b =>
          b.row === row &&
          b.colStart < c.colStart + c.colSpan &&
          b.colStart + b.colSpan > c.colStart
        )) row++
        bars.push({ ...c, row })
      }

      return { weekDays, bars }
    })
  }, [calDays, tasks, reminders, leaveEvents, gcalEvents, msCalEvents, calMap, msCalMap])

  // ── Input style ───────────────────────────────────────────────────────────

  const inputClass = 'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary'

  const openReminderSheet = () => {
    setReminderForm({ title: '', remind_at: format(selectedDay, "yyyy-MM-dd'T'09:00") })
    setReminderSheetOpen(true)
  }

  // ── Calendar picker ───────────────────────────────────────────────────────

  const hasAnyCalendars = (gcal.isConnected && calendars && calendars.length > 0) ||
                          (mscal.isConnected && msCalendars && msCalendars.length > 0)

  const calendarPicker = hasAnyCalendars ? (
    <div className="mb-4 card-glass p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Calendars</p>
        <div className="flex items-center gap-2">
          {gcalLoading  && <Loader2 size={12} className="text-emerald-400 animate-spin" />}
          {msCalLoading && <Loader2 size={12} className="text-sky-400 animate-spin" />}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Google calendars */}
        {(calendars ?? []).map(cal => {
          const isOn = selectedCalIds?.has(cal.id) ?? true
          return (
            <button
              key={`g-${cal.id}`}
              onClick={() => toggleCalendar(cal.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${isOn ? 'opacity-100' : 'opacity-35'}`}
              style={{
                background: isOn ? `${cal.backgroundColor}22` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isOn ? cal.backgroundColor + '66' : 'rgba(255,255,255,0.08)'}`,
                color: isOn ? cal.backgroundColor : 'rgba(255,255,255,0.4)',
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cal.backgroundColor }} />
              {cal.summary}
            </button>
          )
        })}
        {/* Microsoft calendars */}
        {(msCalendars ?? []).map(cal => {
          const isOn = selectedMsCalIds?.has(cal.id) ?? true
          const color = cal.hexColor || '#38bdf8'
          return (
            <button
              key={`ms-${cal.id}`}
              onClick={() => toggleMsCalendar(cal.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${isOn ? 'opacity-100' : 'opacity-35'}`}
              style={{
                background: isOn ? `${color}22` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isOn ? color + '66' : 'rgba(255,255,255,0.08)'}`,
                color: isOn ? color : 'rgba(255,255,255,0.4)',
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              {cal.name}
            </button>
          )
        })}
      </div>
    </div>
  ) : null

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
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-text-tertiary py-1">{d}</div>
        ))}
      </div>

      {/* Week rows — Apple Calendar architecture */}
      <div className="flex flex-col">
        {weeksData.map(({ weekDays, bars }, wi) => {
          // Week row grows to fit ALL bars — no overflow, always fully visible
          const maxBarRow = bars.length > 0 ? Math.max(...bars.map(b => b.row)) : -1
          const totalBarRows = maxBarRow + 1

          // Desktop: date row + all bar rows + small bottom padding
          // Mobile: fixed compact height (dots only)
          const cellH = isDesktop
            ? DAY_H + totalBarRows * BAR_H + 4
            : 48

          return (
            <div key={wi} className="relative" style={{ height: `${cellH}px` }}>

              {/* ── Day cell row ── */}
              <div className="absolute inset-0 grid grid-cols-7">
                {weekDays.map(day => {
                  const d          = format(day, 'yyyy-MM-dd')
                  const inMonth    = isSameMonth(day, currentMonth)
                  const isSelected = isSameDay(day, selectedDay)
                  const isTodayDay = isToday(day)

                  return (
                    <motion.div
                      key={day.toISOString()}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => selectDay(day, true)}
                      className={`relative flex flex-col items-center pt-1.5 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.04] ${
                        isSelected ? 'bg-white/[0.07]' : ''
                      }`}
                      style={{ height: `${DAY_H}px` }}
                    >
                      {/* Date number — Apple-style circle */}
                      <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold flex-shrink-0 ${
                        isSelected  ? 'bg-accent text-white'
                        : isTodayDay ? 'bg-white text-[#020203]'
                        : inMonth    ? 'text-text-primary'
                        :              'text-text-tertiary'
                      }`}>
                        {format(day, 'd')}
                      </span>

                      {/* Indicator dots — mobile only (desktop shows titled bars for everything) */}
                      {!isDesktop && (
                        <div className="flex gap-0.5 mt-0.5 h-1">
                          {!!tasksByDay[d]?.length     && <div className="w-1 h-1 rounded-full bg-accent" />}
                          {!!remindersByDay[d]?.length && <div className="w-1 h-1 rounded-full bg-status-warning" />}
                          {!!gcalByDay[d]?.length      && <div className="w-1 h-1 rounded-full bg-emerald-400" />}
                          {!!mscalByDay[d]?.length     && <div className="w-1 h-1 rounded-full bg-sky-400" />}
                          {!!leaveByDay[d]?.length     && <div className="w-1 h-1 rounded-full bg-violet-400" />}
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>

              {/* ── Event bars overlay (desktop only) ── */}
              {/* Bars are absolute-positioned at the WEEK level, not inside cells.
                  This guarantees perfect horizontal alignment across all columns. */}
              {isDesktop && bars.map(bar => {
                const barTop     = DAY_H + bar.row * BAR_H
                const leftPct    = (bar.colStart / 7) * 100
                const widthPct   = (bar.colSpan  / 7) * 100
                const leftInset  = bar.isEventStart ? 3 : 0
                const rightInset = bar.isEventEnd   ? 3 : 0
                const isClickable = bar.type !== 'leave'

                const borderRadius = bar.isEventStart && bar.isEventEnd ? '6px'
                  : bar.isEventStart ? '6px 0 0 6px'
                  : bar.isEventEnd   ? '0 6px 6px 0'
                  : '0'

                return (
                  <div
                    key={`${bar.id}-${wi}-${bar.colStart}`}
                    className={`absolute overflow-hidden transition-opacity ${isClickable ? 'cursor-pointer hover:opacity-80' : 'pointer-events-none'}`}
                    style={{
                      top:    `${barTop}px`,
                      height: `${BAR_H - 2}px`,
                      left:   `calc(${leftPct}% + ${leftInset}px)`,
                      width:  `calc(${widthPct}% - ${leftInset + rightInset}px)`,
                      background: bar.color,
                      borderRadius,
                      zIndex: 1,
                    }}
                    onClick={isClickable ? (e) => {
                      e.stopPropagation()
                      if (bar.type === 'gcal' && bar.gcalEvent) openGcalEdit(bar.gcalEvent)
                      else if (bar.type === 'mscal' && bar.msCalEvent) openMsCalEdit(bar.msCalEvent)
                      else selectDay(weekDays[bar.colStart]!, true)
                    } : undefined}
                  >
                    <span
                      className="absolute inset-0 flex items-center px-1.5 text-[9px] font-semibold leading-none truncate whitespace-nowrap"
                      style={{ color: bar.textColor, opacity: bar.isEventStart ? 1 : 0.6, fontStyle: bar.isEventStart ? 'normal' : 'italic' }}
                    >
                      {bar.label}
                    </span>
                  </div>
                )
              })}


            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06] flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-[5px] rounded-sm" style={{ background: 'rgba(94,106,210,0.45)' }} />
          <span className="text-[10px] text-text-tertiary">Tasks</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-[5px] rounded-sm" style={{ background: 'rgba(251,191,36,0.40)' }} />
          <span className="text-[10px] text-text-tertiary">Reminders</span>
        </div>
        {gcal.isConnected && (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-[5px] rounded-sm bg-emerald-400/60" />
            <span className="text-[10px] text-text-tertiary">Google Cal</span>
          </div>
        )}
        {mscal.isConnected && (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-[5px] rounded-sm bg-sky-400/60" />
            <span className="text-[10px] text-text-tertiary">Outlook</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-[5px] rounded-sm bg-violet-400/70" />
          <span className="text-[10px] text-text-tertiary">Leave</span>
        </div>
      </div>
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
              <CalendarDays size={12} />GCal
            </button>
          )}
          {mscal.isConnected && (
            <button onClick={openMsCalCreate} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors">
              <Mail size={12} />Outlook
            </button>
          )}
        </div>
      </div>

      {dayTasks.length === 0 && dayReminders.length === 0 && dayGcal.length === 0 && dayMsCal.length === 0 && dayLeave.length === 0 ? (
        <p className="text-text-tertiary text-sm">Nothing scheduled.</p>
      ) : (
        <div className="space-y-2">

          {/* Leave calendar events */}
          {dayLeave.map(event => {
            const s = event.start.slice(0, 10)
            const e = event.end.slice(0, 10)
            const dateRange = s === e
              ? (() => { try { return format(parseISO(s), 'MMM d, yyyy') } catch { return s } })()
              : (() => {
                  try {
                    const sameYear = s.slice(0, 4) === e.slice(0, 4)
                    return `${format(parseISO(s), 'MMM d')} – ${format(parseISO(e), sameYear ? 'MMM d, yyyy' : 'MMM d, yyyy')}`
                  } catch { return `${s} – ${e}` }
                })()
            return (
              <div key={event.id} className="card-glass p-3 flex items-start gap-3 overflow-hidden" style={{ borderLeft: '3px solid #a78bfa' }}>
                <Palmtree size={15} className="text-violet-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate">{event.summary}</p>
                  <p className="text-[10px] text-violet-400/80 mt-0.5">{dateRange}</p>
                  {event.description && (
                    <p className="text-[10px] text-text-tertiary mt-0.5 truncate">{event.description}</p>
                  )}
                </div>
              </div>
            )
          })}

          {/* Google Calendar events */}
          {dayGcal.map(event => {
            const calColor = event.calendarId ? (calMap[event.calendarId]?.backgroundColor ?? '#34d399') : '#34d399'
            const calName  = event.calendarId ? (calMap[event.calendarId]?.summary ?? '') : ''
            return (
              <div
                key={event.id}
                className="card-glass p-3 flex items-start gap-3 cursor-pointer hover-bg transition-colors overflow-hidden"
                onClick={() => openGcalEdit(event)}
                style={{ borderLeft: `3px solid ${calColor}` }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{event.summary}</p>
                  <p className="text-[10px] text-text-tertiary">
                    {event.allDay ? 'All day' : (
                      event.start.dateTime
                        ? `${format(parseISO(event.start.dateTime), 'h:mm a')} – ${format(parseISO(event.end.dateTime!), 'h:mm a')}`
                        : ''
                    )}
                    {calName ? ` · ${calName}` : ''}
                  </p>
                </div>
                <Pencil size={12} className="text-text-tertiary flex-shrink-0 mt-1 opacity-40" />
              </div>
            )
          })}

          {/* Outlook / Microsoft Calendar events */}
          {dayMsCal.map(event => {
            const calColor = event.calendarId ? (msCalMap[event.calendarId]?.hexColor || '#38bdf8') : '#38bdf8'
            const calName  = event.calendarId ? (msCalMap[event.calendarId]?.name ?? '') : ''
            return (
              <div
                key={event.id}
                className="card-glass p-3 flex items-start gap-3 cursor-pointer hover-bg transition-colors overflow-hidden"
                onClick={() => openMsCalEdit(event)}
                style={{ borderLeft: `3px solid ${calColor}` }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{event.subject}</p>
                  <p className="text-[10px] text-text-tertiary">
                    {event.isAllDay ? 'All day' : (
                      event.start.dateTime
                        ? `${format(parseISO(event.start.dateTime), 'h:mm a')} – ${format(parseISO(event.end.dateTime), 'h:mm a')}`
                        : ''
                    )}
                    {calName ? ` · ${calName}` : ''}
                  </p>
                </div>
                <Pencil size={12} className="text-text-tertiary flex-shrink-0 mt-1 opacity-40" />
              </div>
            )
          })}

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

  // ── Connect banners (compact) ──────────────────────────────────────────────

  const connectBanner = (!gcal.isConnected || !mscal.isConnected) ? (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      {!gcal.isConnected && (
        <button
          onClick={() => gcal.connect()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-emerald-500/25 text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors"
        >
          <CalendarDays size={12} />
          Connect Google Calendar
        </button>
      )}
      {!mscal.isConnected && (
        <button
          onClick={() => mscal.connect()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-sky-500/25 text-xs text-sky-400 hover:bg-sky-500/10 transition-colors"
        >
          <Mail size={12} />
          Connect Outlook
        </button>
      )}
    </div>
  ) : null

  // ── Header buttons ────────────────────────────────────────────────────────

  const headerButtons = (
    <div className="flex items-center gap-2">
      {mscal.isConnected && (
        <button
          onClick={() => { void mscal.disconnect(); toast.success('Outlook disconnected') }}
          className="p-1.5 rounded-lg text-sky-400/60 hover:text-sky-400 hover:bg-white/5 transition-colors"
          title="Disconnect Outlook"
        >
          <Mail size={15} />
        </button>
      )}
      {gcal.isConnected && (
        <button
          onClick={() => { gcal.disconnect(); toast.success('Google Calendar disconnected') }}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-white/5 transition-colors"
          title="Disconnect Google Calendar"
        >
          <LogOut size={15} />
        </button>
      )}
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

      {/* Calendar selector */}
      {calendars && calendars.length > 1 && (
        <div>
          <label className="text-xs text-text-tertiary block mb-1">Calendar</label>
          <select
            value={gcalForm.calendarId}
            onChange={e => setGcalForm(f => ({ ...f, calendarId: e.target.value }))}
            className={inputClass}
          >
            {calendars
              .filter(c => c.accessRole === 'owner' || c.accessRole === 'writer')
              .map(c => (
                <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (primary)' : ''}</option>
              ))}
          </select>
        </div>
      )}

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
            {connectBanner}
            {calendarPicker}
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
          {connectBanner}
          {calendarPicker}
          <div className="mb-5">{calendarGrid}</div>
          <div className="mb-4" ref={dayDetailRef}>{dayDetailContent}</div>
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
      <PlatformSheet isOpen={gcalEditOpen} onClose={() => { setGcalEditOpen(false); setEditingEvent(null) }} title="Edit Google Event">
        {gcalFormContent(true)}
      </PlatformSheet>

      {/* Microsoft Calendar create sheet */}
      <PlatformSheet isOpen={msCalCreateOpen} onClose={() => setMsCalCreateOpen(false)} title="New Outlook Event">
        <div className="space-y-3 pb-4">
          <input type="text" placeholder="Event title" value={msCalForm.summary} onChange={e => setMsCalForm(f => ({ ...f, summary: e.target.value }))} className={inputClass} autoFocus />
          <textarea placeholder="Description (optional)" value={msCalForm.description} onChange={e => setMsCalForm(f => ({ ...f, description: e.target.value }))} className={`${inputClass} resize-none`} rows={2} />
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => setMsCalForm(f => ({ ...f, allDay: !f.allDay }))} className={`w-10 h-5 rounded-full transition-colors relative ${msCalForm.allDay ? 'bg-accent' : 'bg-white/15'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${msCalForm.allDay ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-text-secondary">All day</span>
          </label>
          {msCalForm.allDay ? (
            <>
              <div><label className="text-xs text-text-tertiary block mb-1">Start date</label><input type="date" value={msCalForm.start.slice(0, 10)} onChange={e => setMsCalForm(f => ({ ...f, start: e.target.value }))} className={inputClass} /></div>
              <div><label className="text-xs text-text-tertiary block mb-1">End date</label><input type="date" value={msCalForm.end.slice(0, 10)} onChange={e => setMsCalForm(f => ({ ...f, end: e.target.value }))} className={inputClass} /></div>
            </>
          ) : (
            <>
              <div><label className="text-xs text-text-tertiary block mb-1">Start</label><input type="datetime-local" value={msCalForm.start} onChange={e => setMsCalForm(f => ({ ...f, start: e.target.value }))} className={inputClass} /></div>
              <div><label className="text-xs text-text-tertiary block mb-1">End</label><input type="datetime-local" value={msCalForm.end} onChange={e => setMsCalForm(f => ({ ...f, end: e.target.value }))} className={inputClass} /></div>
            </>
          )}
          <button onClick={handleMsCalCreate} disabled={!msCalForm.summary.trim() || msCalSaving} className="w-full bg-sky-600 hover:bg-sky-500 text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {msCalSaving && <Loader2 size={15} className="animate-spin" />}
            Create Event
          </button>
        </div>
      </PlatformSheet>

      {/* Microsoft Calendar edit sheet */}
      <PlatformSheet isOpen={msCalEditOpen} onClose={() => { setMsCalEditOpen(false); setEditingMsEvent(null) }} title="Edit Outlook Event">
        <div className="space-y-3 pb-4">
          <input type="text" placeholder="Event title" value={msCalForm.summary} onChange={e => setMsCalForm(f => ({ ...f, summary: e.target.value }))} className={inputClass} autoFocus />
          <textarea placeholder="Description (optional)" value={msCalForm.description} onChange={e => setMsCalForm(f => ({ ...f, description: e.target.value }))} className={`${inputClass} resize-none`} rows={2} />
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => setMsCalForm(f => ({ ...f, allDay: !f.allDay }))} className={`w-10 h-5 rounded-full transition-colors relative ${msCalForm.allDay ? 'bg-accent' : 'bg-white/15'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${msCalForm.allDay ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-text-secondary">All day</span>
          </label>
          {msCalForm.allDay ? (
            <>
              <div><label className="text-xs text-text-tertiary block mb-1">Start date</label><input type="date" value={msCalForm.start.slice(0, 10)} onChange={e => setMsCalForm(f => ({ ...f, start: e.target.value }))} className={inputClass} /></div>
              <div><label className="text-xs text-text-tertiary block mb-1">End date</label><input type="date" value={msCalForm.end.slice(0, 10)} onChange={e => setMsCalForm(f => ({ ...f, end: e.target.value }))} className={inputClass} /></div>
            </>
          ) : (
            <>
              <div><label className="text-xs text-text-tertiary block mb-1">Start</label><input type="datetime-local" value={msCalForm.start} onChange={e => setMsCalForm(f => ({ ...f, start: e.target.value }))} className={inputClass} /></div>
              <div><label className="text-xs text-text-tertiary block mb-1">End</label><input type="datetime-local" value={msCalForm.end} onChange={e => setMsCalForm(f => ({ ...f, end: e.target.value }))} className={inputClass} /></div>
            </>
          )}
          <button onClick={handleMsCalUpdate} disabled={!msCalForm.summary.trim() || msCalSaving} className="w-full bg-sky-600 hover:bg-sky-500 text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {msCalSaving && <Loader2 size={15} className="animate-spin" />}
            Save Changes
          </button>
          <button onClick={handleMsCalDelete} disabled={msCalDeleting} className="w-full bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {msCalDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Delete Event
          </button>
        </div>
      </PlatformSheet>
    </>
  )
}
