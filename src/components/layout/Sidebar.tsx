import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FileText, CheckSquare, FolderKanban, CalendarDays,
  LogOut, PanelLeftClose, PanelLeftOpen, Settings,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const workspaceItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home',     shortcut: '⌘1' },
  { to: '/notes',     icon: FileText,        label: 'Notes',    shortcut: '⌘2' },
  { to: '/tasks',     icon: CheckSquare,     label: 'Tasks',    shortcut: '⌘3' },
]

const planningItems = [
  { to: '/projects',  icon: FolderKanban,    label: 'Projects', shortcut: '⌘4' },
  { to: '/calendar',  icon: CalendarDays,    label: 'Calendar', shortcut: '⌘5' },
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
