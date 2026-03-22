import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Check, FolderKanban, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { usePlatform } from '@/hooks/usePlatform'
import { PlatformSheet } from '@/components/shared/PlatformSheet'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Project, Task } from '@/types/database'

type StatusFilter = 'all' | 'active' | 'on_hold' | 'completed'

const PRESET_COLORS = ['#5E6AD2', '#34D399', '#FBBF24', '#F87171', '#60A5FA', '#A78BFA', '#F472B6', '#FB923C']

const statusConfig: Record<string, { label: string; className: string }> = {
  planning: { label: 'Planning', className: 'bg-blue-500/20 text-blue-400' },
  active: { label: 'Active', className: 'bg-accent/20 text-accent' },
  on_hold: { label: 'On Hold', className: 'bg-status-warning/20 text-status-warning' },
  completed: { label: 'Completed', className: 'bg-status-success/20 text-status-success' },
}

interface ProjectForm {
  title: string
  description: string
  status: Project['status']
  color: string
}

// ── Desktop project detail panel ──────────────────────────────────────────────

function DesktopProjectDetail({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const userId = user?.id

  const [taskSheetOpen, setTaskSheetOpen] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', priority: '' as Task['priority'] | '', due_date: '' })
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editForm, setEditForm] = useState<ProjectForm>({ title: '', description: '', status: 'planning', color: '#5E6AD2' })

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_projects').select('*').eq('id', projectId).single()
      if (error) throw error
      return data as Project
    },
    enabled: !!projectId,
  })

  const { data: tasks, isLoading: loadingTasks } = useQuery({
    queryKey: ['project-tasks', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_tasks').select('*').eq('project_id', projectId).order('sort_order')
      if (error) throw error
      return (data ?? []) as Task[]
    },
    enabled: !!projectId,
  })

  const createTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('ceo_tasks').insert({
        user_id: userId!,
        project_id: projectId,
        title: taskForm.title,
        priority: taskForm.priority || 'low',
        due_date: taskForm.due_date || null,
        is_completed: false,
        sort_order: 9999,
        tags: [],
        list_name: 'Inbox',
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
      void qc.invalidateQueries({ queryKey: ['tasks', userId] })
      toast.success('Task added')
      setTaskSheetOpen(false)
      setTaskForm({ title: '', priority: '', due_date: '' })
    },
    onError: () => toast.error('Failed to add task'),
  })

  const updateProject = useMutation({
    mutationFn: async (payload: Partial<Project>) => {
      const { error } = await supabase.from('ceo_projects').update(payload).eq('id', projectId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', projectId] })
      void qc.invalidateQueries({ queryKey: ['projects', userId] })
      toast.success('Project updated')
      setEditSheetOpen(false)
    },
    onError: () => toast.error('Failed to update project'),
  })

  const openEditSheet = () => {
    if (!project) return
    setEditForm({ title: project.title, description: project.description ?? '', status: project.status, color: project.color ?? '#5E6AD2' })
    setEditSheetOpen(true)
  }

  const setProjectStatusOptimistic = (status: Project['status']) => {
    // Instant UI update
    qc.setQueryData(['project', projectId], (old: Project | undefined) => old ? { ...old, status } : old)
    qc.setQueryData(['projects', userId], (old: Project[] | undefined) =>
      (old ?? []).map(p => p.id === projectId ? { ...p, status } : p)
    )
    // Persist to DB
    void supabase.from('ceo_projects').update({ status }).eq('id', projectId)
  }

  const toggleTask = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      const { error } = await supabase.from('ceo_tasks').update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: (_data, { completed }) => {
      void qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
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

  if (loadingProject) {
    return <div className="p-6"><SkeletonCard /></div>
  }

  if (!project) return null

  return (
    <div className="px-6 py-6">
      {/* Project header */}
      <div className="mb-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: project.color ?? '#5E6AD2' }} />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-text-primary">{project.title}</h2>
              <button onClick={openEditSheet} className="text-text-tertiary hover:text-text-primary transition-colors"><Pencil size={14} /></button>
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

      {/* Tasks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Tasks</h3>
          <button
            onClick={() => setTaskSheetOpen(true)}
            className="text-accent text-xs flex items-center gap-1 hover:opacity-80"
          >
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
          <button
            onClick={() => createTask.mutate()}
            disabled={!taskForm.title || createTask.isPending}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {createTask.isPending ? 'Adding...' : 'Add Task'}
          </button>
        </div>
      </PlatformSheet>

      <PlatformSheet isOpen={editSheetOpen} onClose={() => setEditSheetOpen(false)} title="Edit Project">
        <div className="space-y-3 pb-4">
          <input type="text" placeholder="Project title" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
          <textarea placeholder="Description (optional)" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inputClass} />
          <div>
            <p className="text-xs text-text-tertiary mb-2">Color</p>
            <div className="flex gap-2">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setEditForm(f => ({ ...f, color: c }))} className={`w-7 h-7 rounded-full transition-all ${editForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0c]' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <button
            onClick={() => updateProject.mutate({ title: editForm.title, description: editForm.description || null, color: editForm.color })}
            disabled={!editForm.title || updateProject.isPending}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {updateProject.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </PlatformSheet>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ProjectsPage() {
  const { user } = useAuth()
  const { isDesktop } = usePlatform()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const userId = user?.id

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<ProjectForm>({ title: '', description: '', status: 'planning', color: '#5E6AD2' })
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_projects').select('*').eq('user_id', userId!).order('sort_order')
      if (error) throw error
      return (data ?? []) as Project[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  })

  const { data: taskCounts } = useQuery({
    queryKey: ['project-task-counts', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_tasks').select('project_id, is_completed').eq('user_id', userId!).not('project_id', 'is', null)
      if (error) throw error
      const counts: Record<string, { total: number; completed: number }> = {}
      for (const t of data ?? []) {
        if (!t.project_id) continue
        if (!counts[t.project_id]) counts[t.project_id] = { total: 0, completed: 0 }
        counts[t.project_id].total++
        if (t.is_completed) counts[t.project_id].completed++
      }
      return counts
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  })

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Project>) => {
      const { error } = await supabase.from('ceo_projects').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', userId] })
      void qc.invalidateQueries({ queryKey: ['kpi-projects', userId] })
      toast.success('Project created')
      setSheetOpen(false)
      setForm({ title: '', description: '', status: 'planning', color: '#5E6AD2' })
    },
    onError: () => toast.error('Failed to create project'),
  })

  const filtered = (projects ?? [])
    .filter(p => statusFilter === 'all' || p.status === statusFilter)
    .sort((a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0))

  const filterPills: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'On Hold', value: 'on_hold' },
    { label: 'Completed', value: 'completed' },
  ]

  const inputClass = 'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary'

  return (
    <div className={isDesktop ? 'flex flex-col h-full' : 'px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto'}>
      {/* Header + filter pills */}
      <div className={`mb-5 ${isDesktop ? 'px-4 pt-[calc(var(--safe-top)+16px)]' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
          {isDesktop && (
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
            >
              <Plus size={16} />
              New Project
            </button>
          )}
        </div>
        <div className="overflow-x-auto flex gap-2 pb-2 scrollbar-none">
          {filterPills.map(p => (
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
        </div>
      </div>

      {isLoading ? (
        <div className={`space-y-3 ${isDesktop ? 'px-4' : ''}`}><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      ) : isDesktop ? (
        // ── Desktop: split panel ──────────────────────────────────────────
        <div className="flex flex-row h-[calc(100vh-180px)] overflow-hidden">
          {/* Left panel: compact project list */}
          <div className="w-[320px] flex-shrink-0 border-r border-white/[0.08] overflow-y-auto px-3 py-4">
            {filtered.length === 0 ? (
              <p className="text-text-tertiary text-sm px-2">No projects.</p>
            ) : (
              filtered.map(project => {
                const counts = taskCounts?.[project.id]
                const progress = counts && counts.total > 0 ? (counts.completed / counts.total) * 100 : 0
                const statusInfo = statusConfig[project.status] ?? statusConfig.planning
                const isSelected = selectedProjectId === project.id

                return (
                  <button
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`w-full text-left px-3 py-3 rounded-xl mb-1 transition-colors border-l-2 ${
                      isSelected
                        ? 'bg-accent/10 border-accent'
                        : 'border-transparent hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color ?? '#5E6AD2' }} />
                        <p className={`font-medium text-sm truncate ${project.status === 'completed' ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>{project.title}</p>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    {counts && counts.total > 0 && (
                      <div className="mt-1.5 ml-4">
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-1 bg-accent rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-text-tertiary mt-0.5">{counts.completed}/{counts.total} tasks</p>
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Right panel: project detail */}
          <div className="flex-1 overflow-y-auto">
            {selectedProjectId ? (
              <DesktopProjectDetail projectId={selectedProjectId} />
            ) : (
              <div className="flex-1 h-full flex flex-col items-center justify-center gap-3 text-text-tertiary">
                <FolderKanban size={40} strokeWidth={1.5} />
                <p className="text-sm">Select a project</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        // ── Mobile: card list ──────────────────────────────────────────────
        filtered.length === 0 ? (
          <p className="text-text-tertiary text-sm">No projects. Tap + to create one.</p>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map(project => {
              const counts = taskCounts?.[project.id]
              const progress = counts && counts.total > 0 ? (counts.completed / counts.total) * 100 : 0
              const statusInfo = statusConfig[project.status] ?? statusConfig.planning

              return (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="card-glass p-5 mb-3 press"
                  style={{ borderLeftColor: project.color ?? '#5E6AD2', borderLeftWidth: '3px' }}
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className={`font-semibold text-sm ${project.status === 'completed' ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>{project.title}</p>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusInfo.className}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  {project.description && (
                    <p className="text-xs text-text-secondary mb-3 line-clamp-2">{project.description}</p>
                  )}
                  {counts && counts.total > 0 && (
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-text-tertiary mb-1">
                        <span>{counts.completed}/{counts.total} tasks</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-1.5 bg-accent rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        )
      )}

      {!isDesktop && (
        <button
          aria-label="New project"
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-[calc(var(--tab-bar-height)+var(--safe-bottom)+16px)] right-5 lg:bottom-8 w-14 h-14 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-colors"
        >
          <Plus size={24} />
        </button>
      )}

      <PlatformSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="New Project">
        <div className="space-y-3 pb-4">
          <input type="text" placeholder="Project title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
          <textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={`${inputClass} resize-none`} rows={3} />
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Project['status'] }))} className={inputClass}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>

          <div>
            <p className="text-xs text-text-secondary mb-2">Color</p>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setForm(f => ({ ...f, color }))}
                  className={`w-7 h-7 rounded-full transition-transform ${form.color === color ? 'scale-125 ring-2 ring-white/50' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={() => createMutation.mutate({ user_id: userId!, title: form.title, description: form.description || null, status: form.status, color: form.color, sort_order: 9999 })}
            disabled={!form.title || createMutation.isPending}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </PlatformSheet>
    </div>
  )
}
