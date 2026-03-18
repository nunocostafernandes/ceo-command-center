import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Plus, Check, Trash2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO, isPast, isToday, isTomorrow, isFuture } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PlatformSheet } from '@/components/shared/PlatformSheet'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Reminder } from '@/types/database'

const inputClass = 'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary'

function timeLabel(r: Reminder): string {
  try {
    const dt = parseISO(r.remind_at)
    if (isToday(dt))    return `Today · ${format(dt, 'h:mm a')}`
    if (isTomorrow(dt)) return `Tomorrow · ${format(dt, 'h:mm a')}`
    return format(dt, 'EEE, MMM d · h:mm a')
  } catch { return r.remind_at }
}

export function RemindersPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const userId = user?.id

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen,   setEditOpen]   = useState(false)
  const [selected,   setSelected]   = useState<Reminder | null>(null)
  const [form, setForm] = useState({ title: '', remind_at: '' })
  const [editForm, setEditForm] = useState({ title: '', remind_at: '' })

  const { data: reminders, isLoading } = useQuery({
    queryKey: ['all-reminders', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ceo_reminders').select('*').eq('user_id', userId!).order('remind_at')
      if (error) throw error
      return (data ?? []) as Reminder[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['all-reminders', userId] })
    void qc.invalidateQueries({ queryKey: ['kpi-reminders', userId] })
    void qc.invalidateQueries({ queryKey: ['upcoming-reminders', userId] })
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('ceo_reminders').insert({
        user_id: userId!, title: form.title, remind_at: form.remind_at, is_dismissed: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Reminder added')
      setCreateOpen(false)
      setForm({ title: '', remind_at: '' })
    },
    onError: () => toast.error('Failed to add reminder'),
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return
      const { error } = await supabase.from('ceo_reminders')
        .update({ title: editForm.title, remind_at: editForm.remind_at }).eq('id', selected.id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Reminder updated')
      setEditOpen(false)
      setSelected(null)
    },
    onError: () => toast.error('Failed to update'),
  })

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ceo_reminders').update({ is_dismissed: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Marked as done') },
    onError: () => toast.error('Failed to dismiss'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ceo_reminders').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setEditOpen(false); setSelected(null) },
    onError: () => toast.error('Failed to delete'),
  })

  const openEdit = (r: Reminder) => {
    setSelected(r)
    setEditForm({
      title: r.title,
      remind_at: format(parseISO(r.remind_at), "yyyy-MM-dd'T'HH:mm"),
    })
    setEditOpen(true)
  }

  const openCreate = () => {
    const now = new Date()
    now.setMinutes(0, 0, 0)
    now.setHours(now.getHours() + 1)
    setForm({ title: '', remind_at: format(now, "yyyy-MM-dd'T'HH:mm") })
    setCreateOpen(true)
  }

  const active   = (reminders ?? []).filter(r => !r.is_dismissed)
  const overdue  = active.filter(r => { try { return isPast(parseISO(r.remind_at)) && !isToday(parseISO(r.remind_at)) } catch { return false } })
  const today    = active.filter(r => { try { return isToday(parseISO(r.remind_at)) } catch { return false } })
  const upcoming = active.filter(r => { try { return isFuture(parseISO(r.remind_at)) && !isToday(parseISO(r.remind_at)) } catch { return false } })
  const done     = (reminders ?? []).filter(r => r.is_dismissed)

  const ReminderRow = ({ r }: { r: Reminder }) => (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={`card-glass p-3 flex items-center gap-3 cursor-pointer hover-bg transition-colors ${r.is_dismissed ? 'opacity-40' : ''}`}
      onClick={() => openEdit(r)}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${r.is_dismissed ? 'bg-white/5' : 'bg-status-warning/15'}`}>
        {r.is_dismissed
          ? <Check size={14} className="text-text-tertiary" />
          : <Bell size={14} className="text-status-warning" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${r.is_dismissed ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>{r.title}</p>
        <p className="text-[11px] text-text-tertiary mt-0.5 flex items-center gap-1">
          <Clock size={10} className="flex-shrink-0" />
          {timeLabel(r)}
        </p>
      </div>
      {!r.is_dismissed && (
        <button
          onClick={e => { e.stopPropagation(); dismissMutation.mutate(r.id) }}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          title="Mark as done"
        >
          <Check size={14} className="text-text-tertiary hover:text-accent" />
        </button>
      )}
    </motion.div>
  )

  const Section = ({ title, items }: { title: string; items: Reminder[] }) => {
    if (!items.length) return null
    return (
      <div className="mb-5">
        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-1">{title}</p>
        <div className="space-y-2">
          <AnimatePresence>
            {items.map(r => <ReminderRow key={r.id} r={r} />)}
          </AnimatePresence>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="px-4 pt-[calc(var(--safe-top)+24px)] pb-8 max-w-xl mx-auto lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Reminders</h1>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
          >
            <Plus size={16} />Add
          </button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} />)}
          </div>
        )}

        {!isLoading && !reminders?.length && (
          <div className="text-center py-16">
            <Bell size={32} className="text-text-tertiary mx-auto mb-3 opacity-30" />
            <p className="text-text-tertiary text-sm">No reminders yet</p>
            <button onClick={openCreate} className="mt-3 text-accent text-sm hover:underline">Add your first reminder</button>
          </div>
        )}

        {!isLoading && (
          <>
            <Section title="Overdue" items={overdue} />
            <Section title="Today" items={today} />
            <Section title="Upcoming" items={upcoming} />
            <Section title="Done" items={done} />
          </>
        )}
      </div>

      {/* Create sheet */}
      <PlatformSheet isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add Reminder">
        <div className="space-y-3 pb-4">
          <input
            type="text"
            placeholder="Reminder title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className={inputClass}
            autoFocus
          />
          <input
            type="datetime-local"
            value={form.remind_at}
            onChange={e => setForm(f => ({ ...f, remind_at: e.target.value }))}
            className={inputClass}
          />
          <button
            onClick={() => createMutation.mutate()}
            disabled={!form.title.trim() || !form.remind_at || createMutation.isPending}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {createMutation.isPending ? 'Adding…' : 'Add Reminder'}
          </button>
        </div>
      </PlatformSheet>

      {/* Edit sheet */}
      <PlatformSheet isOpen={editOpen} onClose={() => { setEditOpen(false); setSelected(null) }} title="Edit Reminder">
        <div className="space-y-3 pb-4">
          <input
            type="text"
            placeholder="Reminder title"
            value={editForm.title}
            onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
            className={inputClass}
            autoFocus
          />
          <input
            type="datetime-local"
            value={editForm.remind_at}
            onChange={e => setEditForm(f => ({ ...f, remind_at: e.target.value }))}
            className={inputClass}
          />
          <button
            onClick={() => updateMutation.mutate()}
            disabled={!editForm.title.trim() || !editForm.remind_at || updateMutation.isPending}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
          {selected && !selected.is_dismissed && (
            <button
              onClick={() => dismissMutation.mutate(selected.id)}
              disabled={dismissMutation.isPending}
              className="w-full bg-white/5 hover:bg-white/10 text-text-secondary rounded-btn py-3 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Check size={15} />Mark as Done
            </button>
          )}
          <button
            onClick={() => selected && deleteMutation.mutate(selected.id)}
            disabled={deleteMutation.isPending}
            className="w-full bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-btn py-3 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 size={15} />Delete
          </button>
        </div>
      </PlatformSheet>
    </>
  )
}
