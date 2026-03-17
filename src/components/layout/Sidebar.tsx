import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FileText, CheckSquare, FolderKanban, CalendarDays, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/notes', icon: FileText, label: 'Notes' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
]

export function Sidebar() {
  const { signOut } = useAuth()

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] z-40 hidden lg:flex flex-col glass border-r border-white/[0.08]">
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-accent">⌘</span>
          <span className="text-sm font-semibold text-text-primary">Command</span>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-8">
        <button
          onClick={() => void signOut()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors w-full"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
