import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FileText, CheckSquare, FolderKanban, CalendarDays } from 'lucide-react'
import { motion } from 'framer-motion'

const tabs = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/notes', icon: FileText, label: 'Notes' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
]

export function TabBar() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden glass border-t border-white/[0.08] flex items-start justify-around px-2"
      style={{ height: 'calc(var(--tab-bar-height) + var(--safe-bottom))', paddingBottom: 'var(--safe-bottom)' }}
    >
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          aria-label={label}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 pt-3 px-3 flex-1 ${isActive ? 'text-accent' : 'text-text-secondary'}`
          }
        >
          {({ isActive }) => (
            <motion.div
              className="flex flex-col items-center gap-1"
              whileTap={{ scale: 0.9 }}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </motion.div>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
