import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Bell, Check, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  addMonths,
  subMonths,
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { usePlatform } from '@/hooks/usePlatform'
import { PlatformSheet } from '@/components/shared/PlatformSheet'
import type { Task, Reminder } from '@/types/database'

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function CalendarPage() {
  const { user } = useAuth()
  const { isDesktop } = usePlatform()
  const qc = useQueryClient()
  const userId = user?.id

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState({ title: '', remind_at: '' })

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd })

  const rangeStart = format(calStart, 'yyyy-MM-dd')
  const rangeEnd = format(calEnd, 'yyyy-MM-dd')

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

  const createReminder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('ceo_reminders').insert({
        user_id: userId!,
        title: reminderForm.title,
        remind_at: reminderForm.remind_at,
        is_dismissed: false,
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
    mutationFn: async (reminderId: string) => {
      const { error } = await supabase.from('ceo_reminders').update({ is_dismissed: true }).eq('id', reminderId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar-reminders', userId, rangeStart, rangeEnd] })
      void qc.invalidateQueries({ queryKey: ['kpi-reminders', userId] })
    },
    onError: () => toast.error('Failed to dismiss'),
  })

  const selectedDayStr = format(selectedDay, 'yyyy-MM-dd')
  const dayTasks = (tasks ?? []).filter(t => t.due_date === selectedDayStr)
  const dayReminders = (reminders ?? []).filter(r => r.remind_at.startsWith(selectedDayStr))

  const getDotsForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd')
    const hasTasks = (tasks ?? []).some(t => t.due_date === dayStr)
    const hasReminders = (reminders ?? []).some(r => r.remind_at.startsWith(dayStr))
    return { hasTasks, hasReminders }
  }

  const inputClass = 'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary'

  return (
    <div className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-text-primary">Calendar</h1>
        <div className="flex items-center gap-2">
          {isDesktop && (
            <button
              onClick={() => {
                const dateStr = format(selectedDay, "yyyy-MM-dd'T'HH:mm")
                setReminderForm({ title: '', remind_at: dateStr })
                setReminderSheetOpen(true)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
            >
              <Plus size={16} />
              Add Reminder
            </button>
          )}
          <button
            onClick={() => setSelectedDay(new Date())}
            className="text-xs text-accent font-medium px-3 py-1.5 rounded-btn bg-accent/10 hover:bg-accent/20 transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      <div className="card-glass p-4 mb-5">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors press"
          >
            <ChevronLeft size={18} className="text-text-secondary" />
          </button>
          <p className="text-sm font-semibold text-text-primary">{format(currentMonth, 'MMMM yyyy')}</p>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors press"
          >
            <ChevronRight size={18} className="text-text-secondary" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-text-tertiary py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {calDays.map(day => {
            const { hasTasks, hasReminders } = getDotsForDay(day)
            const inMonth = isSameMonth(day, currentMonth)
            const isSelected = isSameDay(day, selectedDay)
            const isTodayDay = isToday(day)

            return (
              <motion.button
                key={day.toISOString()}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSelectedDay(day)}
                className={`relative flex flex-col items-center py-1 rounded-xl transition-colors ${
                  isSelected ? 'bg-accent' : isTodayDay ? 'bg-white text-[#020203]' : 'hover:bg-white/5'
                }`}
              >
                <span className={`text-xs font-medium ${
                  isSelected ? 'text-white' : isTodayDay ? 'text-[#020203]' : inMonth ? 'text-text-primary' : 'text-text-tertiary'
                }`}>
                  {format(day, 'd')}
                </span>
                <div className="flex gap-0.5 mt-0.5 h-1">
                  {hasTasks && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/70' : 'bg-accent'}`} />}
                  {hasReminders && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/70' : 'bg-status-warning'}`} />}
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {format(selectedDay, 'EEEE, MMMM d')}
          </h2>
          <button
            onClick={() => {
              const dateStr = format(selectedDay, "yyyy-MM-dd'T'HH:mm")
              setReminderForm({ title: '', remind_at: dateStr })
              setReminderSheetOpen(true)
            }}
            className="text-xs text-accent flex items-center gap-1 hover:opacity-80"
          >
            <Plus size={14} />Add Reminder
          </button>
        </div>

        {dayTasks.length === 0 && dayReminders.length === 0 ? (
          <p className="text-text-tertiary text-sm">Nothing scheduled.</p>
        ) : (
          <div className="space-y-2">
            {dayReminders.map(r => (
              <div key={r.id} className={`card-glass p-3 flex items-center gap-3 ${r.is_dismissed ? 'opacity-50' : ''}`}>
                <Bell size={16} className="text-status-warning flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-text-primary ${r.is_dismissed ? 'line-through' : ''}`}>{r.title}</p>
                  <p className="text-[10px] text-text-tertiary">{format(parseISO(r.remind_at), 'h:mm a')}</p>
                </div>
                {!r.is_dismissed && (
                  <button
                    onClick={() => dismissReminder.mutate(r.id)}
                    className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <Check size={14} className="text-text-tertiary" />
                  </button>
                )}
              </div>
            ))}
            {dayTasks.map(task => (
              <div key={task.id} className="card-glass p-3 flex items-center gap-3">
                <Check size={16} className={task.is_completed ? 'text-accent' : 'text-text-tertiary'} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${task.is_completed ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>{task.title}</p>
                  {task.priority && (
                    <p className="text-[10px] text-text-tertiary capitalize">{task.priority} priority</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PlatformSheet isOpen={reminderSheetOpen} onClose={() => setReminderSheetOpen(false)} title="Add Reminder">
        <div className="space-y-3 pb-4">
          <input type="text" placeholder="Reminder title" value={reminderForm.title} onChange={e => setReminderForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
          <input
            type="datetime-local"
            value={reminderForm.remind_at}
            onChange={e => setReminderForm(f => ({ ...f, remind_at: e.target.value }))}
            className={inputClass}
          />
          <button
            onClick={() => createReminder.mutate()}
            disabled={!reminderForm.title || !reminderForm.remind_at || createReminder.isPending}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {createReminder.isPending ? 'Adding...' : 'Add Reminder'}
          </button>
        </div>
      </PlatformSheet>
    </div>
  )
}
