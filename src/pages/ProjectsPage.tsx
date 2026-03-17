import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { usePlatform } from '@/hooks/usePlatform'
import { PlatformSheet } from '@/components/shared/PlatformSheet'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Project } from '@/types/database'

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

export function ProjectsPage() {
  const { user } = useAuth()
  const { isDesktop } = usePlatform()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const userId = user?.id

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<ProjectForm>({ title: '', description: '', status: 'planning', color: '#5E6AD2' })

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

  const filtered = (projects ?? []).filter(p => statusFilter === 'all' || p.status === statusFilter)

  const filterPills: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'On Hold', value: 'on_hold' },
    { label: 'Completed', value: 'completed' },
  ]

  const inputClass = 'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary'

  return (
    <div className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto">
      <div className="mb-5">
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
        <div className="space-y-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      ) : filtered.length === 0 ? (
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
                  <p className="font-semibold text-sm text-text-primary">{project.title}</p>
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
      )}

      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-[calc(var(--tab-bar-height)+var(--safe-bottom)+16px)] right-5 lg:bottom-8 w-14 h-14 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-colors"
      >
        <Plus size={24} />
      </button>

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
