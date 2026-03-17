import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Check, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, isToday, isPast, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomSheet } from '@/components/shared/BottomSheet'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Task } from '@/types/database'

type PriorityFilter = 'all' | 'urgent' | 'high' | 'medium' | 'low'
type StatusFilter = 'all' | 'active' | 'completed'

interface TaskForm {
  title: string
  priority: Task['priority']
  due_date: string
  list_name: string
  description: string
  assigned_to: string
}

const emptyForm: TaskForm = { title: '', priority: null, due_date: '', list_name: 'Inbox', description: '', assigned_to: '' }

export function TasksPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const userId = user?.id

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [inlineInputs, setInlineInputs] = useState<Record<string, string>>({})
  const [form, setForm] = useState<TaskForm>(emptyForm)
  const [editForm, setEditForm] = useState<TaskForm>(emptyForm)

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_tasks').select('*').eq('user_id', userId!).order('sort_order')
      if (error) throw error
      return (data ?? []) as Task[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  })

  const completeMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from('ceo_tasks').update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, completed }) => {
      await qc.cancelQueries({ queryKey: ['tasks', userId] })
      const prev = qc.getQueryData<Task[]>(['tasks', userId])
      qc.setQueryData<Task[]>(['tasks', userId], old =>
        (old ?? []).map(t => t.id === id ? { ...t, is_completed: completed } : t)
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks', userId], ctx.prev)
      toast.error('Failed to update task')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', userId] })
      void qc.invalidateQueries({ queryKey: ['kpi-tasks', userId] })
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Task>) => {
      const { error } = await supabase.from('ceo_tasks').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', userId] })
      void qc.invalidateQueries({ queryKey: ['kpi-tasks', userId] })
      toast.success('Task created')
      setCreateSheetOpen(false)
      setForm(emptyForm)
    },
    onError: () => toast.error('Failed to create task'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Task> }) => {
      const { error } = await supabase.from('ceo_tasks').update(payload).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', userId] })
      void qc.invalidateQueries({ queryKey: ['kpi-tasks', userId] })
      toast.success('Task updated')
      setEditSheetOpen(false)
      setEditingTask(null)
    },
    onError: () => toast.error('Failed to update task'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ceo_tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', userId] })
      void qc.invalidateQueries({ queryKey: ['kpi-tasks', userId] })
      setEditSheetOpen(false)
      setEditingTask(null)
    },
    onError: () => toast.error('Failed to delete task'),
  })

  const createInline = useMutation({
    mutationFn: async ({ title, listName }: { title: string; listName: string }) => {
      const { error } = await supabase.from('ceo_tasks').insert({ user_id: userId!, title, list_name: listName, is_completed: false, sort_order: 9999 })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', userId] }),
  })

  const openEdit = (task: Task) => {
    setEditingTask(task)
    setEditForm({
      title: task.title,
      priority: task.priority,
      due_date: task.due_date ?? '',
      list_name: task.list_name ?? 'Inbox',
      description: task.description ?? '',
      assigned_to: task.assigned_to ?? '',
    })
    setEditSheetOpen(true)
  }

  const handleUpdate = () => {
    if (!editingTask) return
    updateMutation.mutate({
      id: editingTask.id,
      payload: {
        title: editForm.title,
        description: editForm.description || null,
        priority: editForm.priority,
        due_date: editForm.due_date || null,
        list_name: editForm.list_name || 'Inbox',
        assigned_to: editForm.assigned_to || null,
        updated_at: new Date().toISOString(),
      },
    })
  }

  const filtered = (tasks ?? []).filter(t => {
    if (statusFilter === 'active' && t.is_completed) return false
    if (statusFilter === 'completed' && !t.is_completed) return false
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    return true
  })

  const grouped: Record<string, Task[]> = {}
  filtered.forEach(t => {
    const list = t.list_name ?? 'Inbox'
    if (!grouped[list]) grouped[list] = []
    grouped[list].push(t)
  })

  const inputClass = 'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary'

  const statusPills: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Completed', value: 'completed' },
  ]

  const priorityPills: { label: string; value: PriorityFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Urgent', value: 'urgent' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' },
  ]

  return (
    <div className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-text-primary mb-4">Tasks</h1>

        <div className="overflow-x-auto flex gap-2 pb-2 scrollbar-none">
          {statusPills.map(p => (
            <button
              key={p.value}
              onClick={() => setStatusFilter(p.value)}
              className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-btn transition-colors ${
                statusFilter === p.value ? 'bg-accent text-white' : 'bg-white/5 text-text-secondary hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="w-px bg-white/10 flex-shrink-0 mx-1" />
          {priorityPills.map(p => (
            <button
              key={p.value}
              onClick={() => setPriorityFilter(p.value)}
              className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-btn transition-colors ${
                priorityFilter === p.value ? 'bg-accent text-white' : 'bg-white/5 text-text-secondary hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>
      ) : (
        Object.entries(grouped).length === 0 ? (
          <p className="text-text-tertiary text-sm">No tasks. Tap + to add one.</p>
        ) : (
          Object.entries(grouped).map(([listName, listTasks]) => (
            <div key={listName} className="mb-6">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">{listName}</h2>
              <AnimatePresence mode="popLayout">
                {listTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={(id, completed) => completeMutation.mutate({ id, completed })}
                    onDelete={id => deleteMutation.mutate(id)}
                    onEdit={() => openEdit(task)}
                  />
                ))}
              </AnimatePresence>
              <div className="mt-2">
                {inlineInputs[listName] !== undefined ? (
                  <form
                    onSubmit={e => {
                      e.preventDefault()
                      const val = inlineInputs[listName]?.trim()
                      if (val) {
                        createInline.mutate({ title: val, listName })
                        setInlineInputs(prev => { const next = { ...prev }; delete next[listName]; return next })
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      autoFocus
                      type="text"
                      placeholder="Task title..."
                      value={inlineInputs[listName] ?? ''}
                      onChange={e => setInlineInputs(prev => ({ ...prev, [listName]: e.target.value }))}
                      onBlur={() => setInlineInputs(prev => { const next = { ...prev }; delete next[listName]; return next })}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary"
                    />
                    <button type="submit" className="bg-accent text-white rounded-xl px-3 py-2 text-sm">Add</button>
                  </form>
                ) : (
                  <button
                    onClick={() => setInlineInputs(prev => ({ ...prev, [listName]: '' }))}
                    className="flex items-center gap-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors py-1"
                  >
                    <Plus size={14} />
                    Add task
                  </button>
                )}
              </div>
            </div>
          ))
        )
      )}

      {/* FAB */}
      <button
        onClick={() => setCreateSheetOpen(true)}
        className="fixed bottom-[calc(var(--tab-bar-height)+var(--safe-bottom)+16px)] right-5 lg:bottom-8 w-14 h-14 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-colors"
      >
        <Plus size={24} />
      </button>

      {/* Create sheet */}
      <BottomSheet isOpen={createSheetOpen} onClose={() => setCreateSheetOpen(false)} title="New Task">
        <div className="space-y-3 pb-4">
          <input type="text" placeholder="Task title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
          <textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={`${inputClass} resize-none`} rows={3} />
          <input type="text" placeholder="List (e.g. Inbox)" value={form.list_name} onChange={e => setForm(f => ({ ...f, list_name: e.target.value }))} className={inputClass} />
          <select value={form.priority ?? ''} onChange={e => setForm(f => ({ ...f, priority: (e.target.value || null) as Task['priority'] }))} className={inputClass}>
            <option value="">Priority (none)</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inputClass} />
          <input type="text" placeholder="Assign to (optional)" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className={inputClass} />
          <button
            onClick={() => createMutation.mutate({ user_id: userId!, title: form.title, description: form.description || null, priority: form.priority, due_date: form.due_date || null, list_name: form.list_name || 'Inbox', is_completed: false, sort_order: 9999, project_id: null, milestone_id: null, assigned_to: form.assigned_to || null })}
            disabled={!form.title || createMutation.isPending}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </BottomSheet>

      {/* Edit sheet */}
      <BottomSheet isOpen={editSheetOpen} onClose={() => { setEditSheetOpen(false); setEditingTask(null) }} title="Edit Task">
        <div className="space-y-3 pb-4">
          <input type="text" placeholder="Task title" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
          <textarea placeholder="Description (optional)" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className={`${inputClass} resize-none`} rows={3} />
          <input type="text" placeholder="List (e.g. Inbox)" value={editForm.list_name} onChange={e => setEditForm(f => ({ ...f, list_name: e.target.value }))} className={inputClass} />
          <select value={editForm.priority ?? ''} onChange={e => setEditForm(f => ({ ...f, priority: (e.target.value || null) as Task['priority'] }))} className={inputClass}>
            <option value="">Priority (none)</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input type="date" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} className={inputClass} />
          <input type="text" placeholder="Assign to (optional)" value={editForm.assigned_to} onChange={e => setEditForm(f => ({ ...f, assigned_to: e.target.value }))} className={inputClass} />
          <button
            onClick={handleUpdate}
            disabled={!editForm.title || updateMutation.isPending}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={() => editingTask && deleteMutation.mutate(editingTask.id)}
            disabled={deleteMutation.isPending}
            className="w-full bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Trash2 size={15} />
            Delete Task
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

interface TaskItemProps {
  task: Task
  onToggle: (id: string, completed: boolean) => void
  onDelete: (id: string) => void
  onEdit: () => void
}

function TaskItem({ task, onToggle, onDelete, onEdit }: TaskItemProps) {
  const isOverdue = task.due_date && !task.is_completed && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
  const isDueToday = task.due_date && isToday(parseISO(task.due_date))

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -80 }}
      transition={{ duration: 0.2 }}
      className="relative mb-2 overflow-hidden rounded-[16px]"
    >
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.4, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80 || info.velocity.x < -400) onDelete(task.id)
        }}
        className="flex items-center gap-3 p-3 card-glass relative z-10"
      >
        <button
          onClick={e => { e.stopPropagation(); onToggle(task.id, !task.is_completed) }}
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${task.is_completed ? 'bg-accent border-accent' : 'border-white/30'}`}
        >
          {task.is_completed && <Check size={10} strokeWidth={3} className="text-white" />}
        </button>

        {/* Tap body to edit */}
        <button className="flex-1 min-w-0 text-left" onClick={onEdit}>
          <p className={`text-sm ${task.is_completed ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.due_date && (
              <p className={`text-xs ${isOverdue ? 'text-status-error' : isDueToday ? 'text-status-warning' : 'text-text-tertiary'}`}>
                {isToday(parseISO(task.due_date)) ? 'Today' : format(parseISO(task.due_date), 'MMM d')}
              </p>
            )}
            {task.assigned_to && (
              <p className="text-xs text-text-tertiary">→ {task.assigned_to}</p>
            )}
          </div>
        </button>

        {task.priority && (
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[task.priority] ?? 'bg-white/20'}`} />
        )}
      </motion.div>
      <div className="absolute inset-0 bg-status-error flex items-center justify-end pr-4 z-0">
        <span className="text-white text-xs font-semibold">Delete</span>
      </div>
    </motion.div>
  )
}

const priorityColors: Record<string, string> = {
  urgent: 'bg-priority-urgent',
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low',
}
