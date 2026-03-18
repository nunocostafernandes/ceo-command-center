import { useState, useEffect } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, FileText, CheckSquare, FolderKanban, CalendarDays,
  LogOut, PanelLeftClose, PanelLeftOpen, Settings, Bell, Loader2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCalendarPrefs } from '@/contexts/CalendarPrefsContext'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import type { GCalCalendar } from '@/hooks/useGoogleCalendar'
import { useMicrosoftCalendar } from '@/hooks/useMicrosoftCalendar'
import type { MSCalendar } from '@/hooks/useMicrosoftCalendar'

const workspaceItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home',      shortcut: '⌘1' },
  { to: '/notes',     icon: FileText,        label: 'Notes',     shortcut: '⌘2' },
  { to: '/tasks',     icon: CheckSquare,     label: 'Tasks',     shortcut: '⌘3' },
  { to: '/reminders', icon: Bell,            label: 'Reminders', shortcut: '⌘4' },
]

const planningItems = [
  { to: '/projects',  icon: FolderKanban,    label: 'Projects',  shortcut: '⌘5' },
  { to: '/calendar',  icon: CalendarDays,    label: 'Calendar',  shortcut: '⌘6' },
]

function NavGroup({
  label,
  items,
  collapsed,
}: {
  label: string
  items: typeof workspaceItems
  collapsed: boolean
}) {
  return (
    <div>
      {!collapsed && (
        <p className="px-3 pt-4 pb-1 text-[10px] font-semibold tracking-widest text-text-tertiary uppercase select-none">
          {label}
        </p>
      )}
      {items.map(({ to, icon: Icon, label: itemLabel, shortcut }) => (
        <NavLink
          key={to}
          to={to}
          title={collapsed ? itemLabel : undefined}
          className={({ isActive }) =>
            `flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              collapsed ? 'justify-center' : 'justify-start gap-3'
            } ${
              isActive
                ? 'bg-accent/15 text-accent'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className="flex-shrink-0" />
              {!collapsed && <span>{itemLabel}</span>}
              {!collapsed && (
                <span className="ml-auto text-[11px] text-text-tertiary">{shortcut}</span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}

function MyCalendarsPanel() {
  const {
    showTasks, setShowTasks,
    showReminders, setShowReminders,
    selectedCalIds, setSelectedCalIds,
    selectedMsCalIds, setSelectedMsCalIds,
  } = useCalendarPrefs()

  const gcal  = useGoogleCalendar()
  const mscal = useMicrosoftCalendar()

  const { data: calendars, isLoading: gcalCalsLoading } = useQuery<GCalCalendar[]>({
    queryKey: ['gcal-calendars', gcal.isConnected],
    queryFn:  () => gcal.fetchCalendars(),
    enabled:  gcal.isConnected,
    staleTime: 1000 * 60 * 60,
  })

  const { data: msCalendars, isLoading: msCalCalsLoading } = useQuery<MSCalendar[]>({
    queryKey: ['ms-calendars', mscal.isConnected],
    queryFn:  () => mscal.fetchCalendars(),
    enabled:  mscal.isConnected,
    staleTime: 1000 * 60 * 60,
  })

  // Initialize selected IDs when calendar lists first load
  useEffect(() => {
    if (calendars && selectedCalIds === null) {
      setSelectedCalIds(new Set(calendars.map(c => c.id)))
    }
  }, [calendars, selectedCalIds, setSelectedCalIds])

  useEffect(() => {
    if (!gcal.isConnected) setSelectedCalIds(null)
  }, [gcal.isConnected, setSelectedCalIds])

  useEffect(() => {
    if (msCalendars && selectedMsCalIds === null) {
      setSelectedMsCalIds(new Set(msCalendars.map(c => c.id)))
    }
  }, [msCalendars, selectedMsCalIds, setSelectedMsCalIds])

  useEffect(() => {
    if (!mscal.isConnected) setSelectedMsCalIds(null)
  }, [mscal.isConnected, setSelectedMsCalIds])

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

  const hasAnyConnected = gcal.isConnected || mscal.isConnected

  return (
    <div className="mx-3 mt-1 mb-2 px-2 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider">My Calendars</p>
        <Link
          to="/settings"
          className="text-[9px] text-text-tertiary hover:text-accent transition-colors"
        >
          Manage →
        </Link>
      </div>

      {/* Tasks toggle */}
      <button
        onClick={() => setShowTasks(v => !v)}
        className="flex items-center gap-1.5 w-full py-0.5 rounded hover:bg-white/[0.04] transition-all text-left"
      >
        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0 transition-opacity" style={{ background: 'rgba(94,106,210,0.8)', opacity: showTasks ? 1 : 0.2 }} />
        <span className={`text-[11px] flex-1 transition-opacity ${showTasks ? 'text-text-secondary' : 'text-text-tertiary/40'}`}>Tasks</span>
      </button>

      {/* Reminders toggle */}
      <button
        onClick={() => setShowReminders(v => !v)}
        className="flex items-center gap-1.5 w-full py-0.5 rounded hover:bg-white/[0.04] transition-all text-left"
      >
        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0 transition-opacity" style={{ background: 'rgba(251,191,36,0.8)', opacity: showReminders ? 1 : 0.2 }} />
        <span className={`text-[11px] flex-1 transition-opacity ${showReminders ? 'text-text-secondary' : 'text-text-tertiary/40'}`}>Reminders</span>
      </button>

      {/* Leave — always on */}
      <div className="flex items-center gap-1.5 py-0.5">
        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: 'rgba(139,92,246,0.7)' }} />
        <span className="text-[11px] text-text-secondary flex-1">Leave</span>
      </div>

      {/* Google calendars */}
      {gcal.isConnected && gcalCalsLoading && (
        <div className="flex items-center gap-1 py-0.5 mt-1">
          <Loader2 size={9} className="animate-spin text-emerald-400" />
          <span className="text-[10px] text-text-tertiary">Loading…</span>
        </div>
      )}
      {gcal.isConnected && (calendars ?? []).map(cal => {
        const isOn = selectedCalIds?.has(cal.id) ?? true
        return (
          <button
            key={cal.id}
            onClick={() => toggleCalendar(cal.id)}
            className="flex items-center gap-1.5 w-full py-0.5 rounded hover:bg-white/[0.04] transition-all text-left"
          >
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0 transition-opacity" style={{ background: cal.backgroundColor, opacity: isOn ? 1 : 0.2 }} />
            <span className={`text-[11px] flex-1 truncate transition-opacity ${isOn ? 'text-text-secondary' : 'text-text-tertiary/40'}`}>{cal.summary}</span>
          </button>
        )
      })}

      {/* Microsoft calendars */}
      {mscal.isConnected && msCalCalsLoading && (
        <div className="flex items-center gap-1 py-0.5 mt-1">
          <Loader2 size={9} className="animate-spin text-sky-400" />
          <span className="text-[10px] text-text-tertiary">Loading…</span>
        </div>
      )}
      {mscal.isConnected && (msCalendars ?? []).map(cal => {
        const isOn = selectedMsCalIds?.has(cal.id) ?? true
        const color = cal.hexColor || '#38bdf8'
        return (
          <button
            key={cal.id}
            onClick={() => toggleMsCalendar(cal.id)}
            className="flex items-center gap-1.5 w-full py-0.5 rounded hover:bg-white/[0.04] transition-all text-left"
          >
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0 transition-opacity" style={{ background: color, opacity: isOn ? 1 : 0.2 }} />
            <span className={`text-[11px] flex-1 truncate transition-opacity ${isOn ? 'text-text-secondary' : 'text-text-tertiary/40'}`}>{cal.name}</span>
          </button>
        )
      })}

      {/* Prompt when nothing connected */}
      {!hasAnyConnected && (
        <Link
          to="/settings"
          className="mt-1 block text-[10px] text-text-tertiary/60 hover:text-accent transition-colors"
        >
          + Connect Google or Outlook
        </Link>
      )}
    </div>
  )
}

export function Sidebar() {
  const { user, signOut } = useAuth()

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  )

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-current-width',
      collapsed ? '60px' : '260px'
    )
  }, [collapsed])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-full z-40 hidden lg:flex flex-col glass border-r border-white/[0.08] transition-[width] duration-200 ease-out overflow-hidden ${
        collapsed ? 'w-[60px]' : 'w-[260px]'
      }`}
    >
      {/* Logo */}
      <div className={`pt-8 pb-6 ${collapsed ? 'flex items-center justify-center px-0' : 'px-5'}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-accent flex-shrink-0">⌘</span>
          {!collapsed && (
            <span className="text-sm font-semibold text-text-primary">Command</span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0 overflow-y-auto">
        <NavGroup label="WORKSPACE" items={workspaceItems} collapsed={collapsed} />
        <NavGroup label="PLANNING"  items={planningItems}  collapsed={collapsed} />
        {!collapsed && <MyCalendarsPanel />}
      </nav>

      {/* Bottom area */}
      <div className="px-3 pb-6 space-y-1">
        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className="flex items-center justify-center w-full px-3 py-2 text-text-tertiary hover:text-text-primary hover:bg-white/5 rounded-xl transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>

        {/* User avatar row */}
        <div
          className={`flex items-center px-3 py-2 rounded-xl ${
            collapsed ? 'justify-center' : 'gap-2.5'
          }`}
        >
          <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-semibold text-accent flex-shrink-0">
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          {!collapsed && (
            <span className="text-xs text-text-secondary truncate max-w-[140px]">
              {user?.email ?? ''}
            </span>
          )}
        </div>

        {/* Settings */}
        <NavLink
          to="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={({ isActive }) =>
            `flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors w-full ${
              collapsed ? 'justify-center' : 'gap-3'
            } ${isActive ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`
          }
        >
          {({ isActive }) => (
            <>
              <Settings size={18} strokeWidth={isActive ? 2.5 : 2} className="flex-shrink-0" />
              {!collapsed && <span>Settings</span>}
            </>
          )}
        </NavLink>

        {/* Sign out */}
        <button
          onClick={() => void signOut()}
          title={collapsed ? 'Sign Out' : undefined}
          className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors w-full ${
            collapsed ? 'justify-center' : 'gap-3'
          }`}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
