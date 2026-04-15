import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, CheckSquare, FolderKanban, CalendarDays } from 'lucide-react'
import { motion } from 'framer-motion'

const tabs = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/notes', icon: FileText, label: 'Notes' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
]

function tapHaptic() {
  // iOS PWA haptic via navigator.vibrate — graceful no-op elsewhere
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(8) } catch { /* noop */ }
  }
}

export function TabBar() {
  const location = useLocation()
  const activeIndex = tabs.findIndex(t => location.pathname.startsWith(t.to))

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden glass border-t border-white/[0.08]"
      style={{ height: 'calc(var(--tab-bar-height) + var(--safe-bottom))', paddingBottom: 'var(--safe-bottom)' }}
      aria-label="Primary navigation"
    >
      <div className="relative flex items-stretch justify-around h-full px-1">
        {/* Animated active-tab pill */}
        {activeIndex !== -1 && (
          <motion.div
            className="absolute top-1.5 bottom-1.5 rounded-2xl bg-white/[0.06] border border-white/[0.04]"
            initial={false}
            animate={{
              left: `calc(${activeIndex} * (100% / ${tabs.length}) + 6px)`,
              width: `calc((100% / ${tabs.length}) - 12px)`,
            }}
            transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.7 }}
          />
        )}
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            onClick={tapHaptic}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[44px] transition-colors ${isActive ? 'text-accent' : 'text-text-secondary'}`
            }
          >
            {({ isActive }) => (
              <motion.div
                className="flex flex-col items-center gap-0.5"
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'opacity-100' : 'opacity-80'}`}>{label}</span>
              </motion.div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
