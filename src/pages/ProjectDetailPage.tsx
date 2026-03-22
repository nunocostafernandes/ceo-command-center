import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PlatformSheet } from '@/components/shared/PlatformSheet'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Project, Task } from '@/types/database'

const statusConfig: Record<string, { label: string; className: string }> = {
  planning: { label: 'Planning', className: 'bg-blue-500/20 text-blue-400' },
  active: { label: 'Active', className: 'bg-accent/20 text-accent' },
  on_hold: { label: 'On Hold', className: 'bg-status-warning/20 text-status-warning' },
  completed: { label: 'Completed', className: 'bg-status-success/20 text-status-success' },
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()
  const userId = user?.id

  const [taskSheetOpen, setTaskSheetOpen] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', priority: '' as Task['priority'] | '', due_date: '' })

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_projects').select('*').eq('id', id!).single()
      if (error) throw error
      return data as Project
    },
    enabled: !!id,
  })

  const { data: tasks, isLoading: loadingTasks } = useQuery({
    queryKey: ['project-tasks', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_tasks').select('*').eq('project_id', id!).order('sort_order')
      if (error) throw error
      return (data ?? []) as Task[]
    },
    enabled: !!id,
  })

  const createTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('ceo_tasks').insert({ user_id: userId!, project_id: id!, title: taskForm.title, priority: taskForm.priority || 'low', due_date: taskForm.due_date || null, is_completed: false, sort_order: 9999, tags: [], list_name: 'Inbox' })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project-tasks', id] })
      void qc.invalidateQueries({ queryKey: ['tasks', userId] })
      toast.success('Task added')
      setTaskSheetOpen(false)
      setTaskForm({ title: '', priority: '', due_date: '' })
    },
    onError: () => toast.error('Failed to add task'),
  })

  const setProjectStatusOptimistic = (status: Project['status']) => {
    qc.setQueryData(['project', id], (old: Project | undefined) => old ? { ...old, status } : old)
    qc.setQueryData(['projects', userId], (old: Project[] | undefined) =>
      (old ?? []).map(p => p.id === id ? { ...p, status } : p)
    )
    void supabase.from('ceo_projects').update({ status }).eq('id', id!)
  }

  const toggleTask = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      const { error } = await supabase.from('ceo_tasks').update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: (_data, { completed }) => {
      void qc.invalidateQueries({ queryKey: ['project-tasks', id] })
      const currentTasks = tasks ?? []
      const willBeCompleted = currentTasks.filter(t => t.is_completed).length + (completed ? 1 : -1)
      if (completed && willBeCompleted === currentTasks.length && project?.status !== 'completed') {
        setProjectStatusOptimistic('completed')
        toast.success('All tasks done — project marked complete')
      } else if (!completed && project?.status === 'completed') {
        setProjectStatusOptimistic('active')
      }
    },
    onError: () => toast.error('Failed to update task'),
  })

  const completedTasks = (tasks ?? []).filter(t => t.is_completed).length
  const totalTasks = (tasks ?? []).length
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
  const statusInfo = project ? (statusConfig[project.status] ?? statusConfig.planning) : null
  const inputClass = 'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary'

  return (
    <div className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-5 press"
      >
        <ArrowLeft size={18} />
        <span className="text-sm">Projects</span>
      </button>

      {loadingProject ? (
        <SkeletonCard />
      ) : project ? (
        <div className="mb-6">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: project.color ?? '#5E6AD2' }} />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-text-primary">{project.title}</h1>
                <select
                  value={project.status}
                  onChange={e => setProjectStatusOptimistic(e.target.value as Project['status'])}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border-none outline-none cursor-pointer ${statusInfo?.className ?? ''}`}
                  style={{ WebkitAppearance: 'none', backgroundImage: 'none', paddingRight: 8 }}
                >
                  {Object.entries(statusConfig).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              {project.description && (
                <p className="text-sm text-text-secondary mt-1">{project.description}</p>
              )}
            </div>
          </div>

          {totalTasks > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-text-tertiary mb-1">
                <span>{completedTasks}/{totalTasks} tasks completed</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-1.5 bg-accent rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Tasks</h2>
          <button onClick={() => setTaskSheetOpen(true)} className="text-accent text-xs flex items-center gap-1 hover:opacity-80">
            <Plus size={14} /> Add Task
          </button>
        </div>
        {loadingTasks ? (
          <SkeletonCard />
        ) : tasks && tasks.length > 0 ? (
          <div className="space-y-2">
            {[...tasks].sort((a, b) => (a.is_completed ? 1 : 0) - (b.is_completed ? 1 : 0)).map(task => (
              <div key={task.id} className="card-glass p-3 flex items-center gap-3">
                <button
                  onClick={() => toggleTask.mutate({ taskId: task.id, completed: !task.is_completed })}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${task.is_completed ? 'bg-accent border-accent' : 'border-white/30'}`}
                >
                  {task.is_completed && <Check size={10} strokeWidth={3} className="text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${task.is_completed ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>{task.title}</p>
                  {task.due_date && (
                    <p className="text-[10px] text-text-tertiary">{format(parseISO(task.due_date), 'MMM d')}</p>
                  )}
                </div>
                {task.priority && (
                  <span className="text-[10px] text-text-tertiary">{task.priority}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-tertiary text-sm">No tasks linked to this project.</p>
        )}
      </div>

      <PlatformSheet isOpen={taskSheetOpen} onClose={() => setTaskSheetOpen(false)} title="Add Task to Project">
        <div className="space-y-3 pb-4">
          <input type="text" placeholder="Task title" value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
          <select value={taskForm.priority ?? ''} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value as Task['priority'] | '' }))} className={inputClass}>
            <option value="">Priority (none)</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input type="date" value={taskForm.due_date} onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))} className={inputClass} />
          <button onClick={() => createTask.mutate()} disabled={!taskForm.title || createTask.isPending} className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60">
            {createTask.isPending ? 'Adding...' : 'Add Task'}
          </button>
        </div>
      </PlatformSheet>
    </div>
  )
}
