import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, isToday, parseISO, formatDistanceToNow } from 'date-fns'
import { CheckSquare, FileText, FolderKanban, Bell, ExternalLink, RefreshCw, Newspaper } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { usePlatform } from '@/hooks/usePlatform'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Task, Reminder, Note, Project } from '@/types/database'

// ── News ──────────────────────────────────────────────────────────────────────

type NewsRegion = 'Middle East' | 'Europe' | 'USA'

interface NewsItem {
  title: string
  link: string
  pubDate: string
  description: string
  region: NewsRegion
}

const FEEDS: { url: string; region: NewsRegion }[] = [
  { url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', region: 'Middle East' },
  { url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml',      region: 'Europe' },
  { url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', region: 'USA' },
]

async function fetchFeed(url: string, region: NewsRegion): Promise<NewsItem[]> {
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=8`
  const res = await fetch(apiUrl)
  if (!res.ok) return []
  const json = await res.json() as { items?: Array<{ title: string; link: string; pubDate: string; description: string }> }
  return (json.items ?? []).map(item => ({
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    description: item.description?.replace(/<[^>]*>/g, '').slice(0, 140) ?? '',
    region,
  }))
}

async function fetchAllNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f.url, f.region)))
  const all: NewsItem[] = []
  results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value) })
  return all.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
}

const REGION_COLORS: Record<NewsRegion, string> = {
  'Middle East': 'bg-amber-500/15 text-amber-400',
  'Europe':      'bg-blue-500/15 text-blue-400',
  'USA':         'bg-red-500/15 text-red-400',
}

function NewsSection() {
  const [regionFilter, setRegionFilter] = useState<NewsRegion | 'All'>('All')

  const { data: news, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['world-news'],
    queryFn: fetchAllNews,
    staleTime: 1000 * 60 * 30, // 30 min
    retry: 1,
  })

  const filtered = (news ?? []).filter(n => regionFilter === 'All' || n.region === regionFilter)
  const pills: (NewsRegion | 'All')[] = ['All', 'Middle East', 'Europe', 'USA']

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Newspaper size={14} className="text-text-tertiary" />
          <h2 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest">World News</h2>
          {dataUpdatedAt > 0 && (
            <span className="text-[10px] text-text-tertiary opacity-50">
              {formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })}
            </span>
          )}
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="p-1 rounded-lg hover:bg-white/5 text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Region pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none pb-1">
        {pills.map(p => (
          <button
            key={p}
            onClick={() => setRegionFilter(p)}
            className={`flex-shrink-0 text-[11px] font-medium px-3 py-1 rounded-full transition-colors ${
              regionFilter === p ? 'bg-accent text-white' : 'bg-white/5 text-text-secondary hover:bg-white/10'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : isError || !news?.length ? (
        <p className="text-text-tertiary text-sm">Couldn't load news. Check your connection.</p>
      ) : filtered.length === 0 ? (
        <p className="text-text-tertiary text-sm">No articles for this region.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.slice(0, 12).map((item, i) => (
            <a
              key={`${item.link}-${i}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="card-glass p-4 flex flex-col gap-2 hover-lift hover-bg group cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${REGION_COLORS[item.region]}`}>
                  {item.region}
                </span>
                <ExternalLink size={12} className="text-text-tertiary opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0 mt-0.5" />
              </div>
              <p className="text-sm font-semibold text-text-primary leading-snug line-clamp-3">
                {item.title}
              </p>
              {item.description && (
                <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              )}
              <p className="text-[10px] text-text-tertiary mt-auto">
                {formatDistanceToNow(new Date(item.pubDate), { addSuffix: true })}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

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

export function DashboardPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { isDesktop } = usePlatform()
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
    { label: 'Open Tasks', value: openTasksCount, icon: CheckSquare, loading: loadingTasks, route: '/tasks' },
    { label: 'Notes', value: notesCount, icon: FileText, loading: loadingNotes, route: '/notes' },
    { label: 'Active Projects', value: activeProjectsCount, icon: FolderKanban, loading: loadingProjects, route: '/projects' },
    { label: 'Reminders', value: remindersCount, icon: Bell, loading: loadingReminders, route: '/calendar' },
  ]

  const columnStyle = isDesktop ? { maxHeight: 'calc(100vh - 220px)' } : {}

  // Pull-to-refresh: const { containerRef, isRefreshing } = usePullToRefresh({ onRefresh: refetch, enabled: !isDesktop })
  // Wrap main div with ref={containerRef}
  return (
    <div className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl lg:max-w-none mx-auto scroll-contain">
      <div className="mb-6">
        <p className="text-text-secondary text-sm">{getGreeting()},</p>
        <h1 className="text-2xl font-bold text-text-primary">{firstName}</h1>
        <p className="text-text-tertiary text-xs mt-0.5">{format(new Date(), 'EEEE, MMMM d')}</p>
      </div>

      {/* KPI Cards — 2 cols on mobile, 4 cols on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map(({ label, value, icon: Icon, loading, route }) => (
          <div
            key={label}
            className="card-glass p-4 hover-lift hover-bg cursor-pointer"
            onClick={() => navigate(route)}
          >
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

      {/* Below KPIs — stacked on mobile, 3-col grid on desktop */}
      <div className={isDesktop ? 'grid grid-cols-3 gap-6 mt-6' : 'space-y-6 mt-6'}>

        {/* Col 1: Today's Tasks */}
        <div
          className={isDesktop ? 'flex flex-col overflow-y-auto' : ''}
          style={columnStyle}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest">Today's Tasks</h2>
            {isDesktop && (
              <Link to="/tasks" className="text-xs text-accent hover:text-accent/80 transition-colors">
                View all →
              </Link>
            )}
          </div>
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

        {/* Col 2: Recent Notes + Upcoming Reminders */}
        <div
          className={isDesktop ? 'flex flex-col gap-6 overflow-y-auto' : 'space-y-6'}
          style={columnStyle}
        >
          {/* Recent Notes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest">Recent Notes</h2>
              {isDesktop && (
                <Link to="/notes" className="text-xs text-accent hover:text-accent/80 transition-colors">
                  View all →
                </Link>
              )}
            </div>
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

          {/* Upcoming Reminders */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest">Upcoming Reminders</h2>
              {isDesktop && (
                <Link to="/calendar" className="text-xs text-accent hover:text-accent/80 transition-colors">
                  View all →
                </Link>
              )}
            </div>
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
        </div>

        {/* Col 3: Active Projects */}
        <div
          className={isDesktop ? 'flex flex-col overflow-y-auto' : ''}
          style={columnStyle}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest">Active Projects</h2>
            {isDesktop && (
              <Link to="/projects" className="text-xs text-accent hover:text-accent/80 transition-colors">
                View all →
              </Link>
            )}
          </div>
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

      {/* News — full-width section below the 3-col grid */}
      <div className="mt-8 border-t border-white/[0.06] pt-6">
        <NewsSection />
      </div>

    </div>
  )
}
