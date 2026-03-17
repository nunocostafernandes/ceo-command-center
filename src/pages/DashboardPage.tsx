import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, isToday, parseISO } from 'date-fns'
import { CheckSquare, FileText, FolderKanban, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Task, Reminder, Note, Project } from '@/types/database'

function stripHtml(html: string): string {
  if (!html) return ''
  if (!html.includes('<')) return html
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return doc.body.textContent ?? ''
  } catch {
    return html.replace(/<[^>]*>/g, '')
  }
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
      {children}
    </h2>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const userId = user?.id
  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? 'there'

  const { data: openTasksCount, isLoading: loadingTasks } = useQuery({
    queryKey: ['kpi-tasks', userId],
    queryFn: async () => {
      const { count } = await supabase.from('ceo_tasks').select('*', { count: 'exact', head: true }).eq('user_id', userId!).eq('is_completed', false)
      return count ?? 0
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const { data: notesCount, isLoading: loadingNotes } = useQuery({
    queryKey: ['kpi-notes', userId],
    queryFn: async () => {
      const { count } = await supabase.from('ceo_notes').select('*', { count: 'exact', head: true }).eq('user_id', userId!)
      return count ?? 0
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const { data: activeProjectsCount, isLoading: loadingProjects } = useQuery({
    queryKey: ['kpi-projects', userId],
    queryFn: async () => {
      const { count } = await supabase.from('ceo_projects').select('*', { count: 'exact', head: true }).eq('user_id', userId!).eq('status', 'active')
      return count ?? 0
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const { data: remindersCount, isLoading: loadingReminders } = useQuery({
    queryKey: ['kpi-reminders', userId],
    queryFn: async () => {
      const { count } = await supabase.from('ceo_reminders').select('*', { count: 'exact', head: true }).eq('user_id', userId!).eq('is_dismissed', false)
      return count ?? 0
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const { data: todayTasks, isLoading: loadingTodayTasks } = useQuery({
    queryKey: ['today-tasks', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_tasks').select('*').eq('user_id', userId!).eq('due_date', todayStr).eq('is_completed', false).order('sort_order')
      if (error) throw error
      return (data ?? []) as Task[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const { data: upcomingReminders, isLoading: loadingUpcoming } = useQuery({
    queryKey: ['upcoming-reminders', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_reminders').select('*').eq('user_id', userId!).eq('is_dismissed', false).order('remind_at').limit(3)
      if (error) throw error
      return (data ?? []) as Reminder[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const { data: recentNotes, isLoading: loadingRecentNotes } = useQuery({
    queryKey: ['recent-notes', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_notes').select('*').eq('user_id', userId!).order('updated_at', { ascending: false }).limit(3)
      if (error) throw error
      return (data ?? []) as Note[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const { data: activeProjects, isLoading: loadingActiveProjects } = useQuery({
    queryKey: ['active-projects', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_projects').select('*').eq('user_id', userId!).eq('status', 'active').order('sort_order').limit(4)
      if (error) throw error
      return (data ?? []) as Project[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('ceo_tasks').update({ is_completed: true, completed_at: new Date().toISOString() }).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['today-tasks', userId] })
      void qc.invalidateQueries({ queryKey: ['kpi-tasks', userId] })
    },
    onError: () => toast.error('Failed to complete task'),
  })

  const kpis = [
    { label: 'Open Tasks', value: openTasksCount, icon: CheckSquare, loading: loadingTasks },
    { label: 'Notes', value: notesCount, icon: FileText, loading: loadingNotes },
    { label: 'Active Projects', value: activeProjectsCount, icon: FolderKanban, loading: loadingProjects },
    { label: 'Reminders', value: remindersCount, icon: Bell, loading: loadingReminders },
  ]

  return (
    <div className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-text-secondary text-sm">{getGreeting()},</p>
        <h1 className="text-2xl font-bold text-text-primary">{firstName}</h1>
        <p className="text-text-tertiary text-xs mt-0.5">{format(new Date(), 'EEEE, MMMM d')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {kpis.map(({ label, value, icon: Icon, loading }) => (
          <div key={label} className="card-glass p-4">
            <Icon size={18} className="text-accent mb-2" />
            {loading ? (
              <div className="skeleton h-8 w-12 mb-1" />
            ) : (
              <p className="text-3xl font-bold text-text-primary">{value}</p>
            )}
            <p className="text-text-secondary text-sm">{label}</p>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <SectionHeader>Today's Tasks</SectionHeader>
        {loadingTodayTasks ? (
          <SkeletonCard />
        ) : todayTasks && todayTasks.length > 0 ? (
          <div className="space-y-2">
            {todayTasks.map(task => (
              <div key={task.id} className="card-glass p-3 flex items-center gap-3 press" onClick={() => completeTask.mutate(task.id)}>
                <div className="w-5 h-5 rounded-full border-2 border-accent flex-shrink-0" />
                <span className="text-sm text-text-primary flex-1">{task.title}</span>
                {task.priority && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    task.priority === 'urgent' ? 'bg-priority-urgent/20 text-priority-urgent' :
                    task.priority === 'high' ? 'bg-priority-high/20 text-priority-high' :
                    task.priority === 'medium' ? 'bg-priority-medium/20 text-priority-medium' :
                    'bg-white/5 text-text-tertiary'
                  }`}>{task.priority}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-tertiary text-sm">No tasks due today.</p>
        )}
      </div>

      <div className="mb-6">
        <SectionHeader>Upcoming Reminders</SectionHeader>
        {loadingUpcoming ? (
          <SkeletonCard />
        ) : upcomingReminders && upcomingReminders.length > 0 ? (
          <div className="space-y-2">
            {upcomingReminders.map(r => (
              <div key={r.id} className="card-glass p-3 flex items-center gap-3">
                <Bell size={16} className="text-status-warning flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{r.title}</p>
                  <p className="text-xs text-text-secondary">
                    {isToday(parseISO(r.remind_at)) ? 'Today' : format(parseISO(r.remind_at), 'MMM d')} · {format(parseISO(r.remind_at), 'h:mm a')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-tertiary text-sm">No upcoming reminders.</p>
        )}
      </div>

      <div className="mb-6">
        <SectionHeader>Recent Notes</SectionHeader>
        {loadingRecentNotes ? (
          <div className="space-y-2"><SkeletonCard /><SkeletonCard /></div>
        ) : recentNotes && recentNotes.length > 0 ? (
          <div className="space-y-2">
            {recentNotes.map(note => (
              <div key={note.id} className="card-glass p-4">
                <p className="text-sm font-semibold text-text-primary mb-1">{note.title}</p>
                {note.content && (
                  <p className="text-xs text-text-secondary line-clamp-2">{stripHtml(note.content)}</p>
                )}
                <p className="text-[10px] text-text-tertiary mt-2">{format(parseISO(note.updated_at), 'MMM d, yyyy')}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-tertiary text-sm">No notes yet.</p>
        )}
      </div>

      <div className="mb-6">
        <SectionHeader>Active Projects</SectionHeader>
        {loadingActiveProjects ? (
          <SkeletonCard />
        ) : activeProjects && activeProjects.length > 0 ? (
          <div className="space-y-2">
            {activeProjects.map(project => (
              <div
                key={project.id}
                className="card-glass p-4"
                style={{ borderLeftColor: project.color ?? '#5E6AD2', borderLeftWidth: '3px' }}
              >
                <p className="text-sm font-semibold text-text-primary">{project.title}</p>
                <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-1.5 bg-accent rounded-full" style={{ width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-tertiary text-sm">No active projects.</p>
        )}
      </div>
    </div>
  )
}
