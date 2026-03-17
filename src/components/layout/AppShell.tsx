import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { PageTransition } from './PageTransition'
import { usePlatform, useKeyboardShortcut } from '@/hooks'

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isDesktop } = usePlatform()

  // Navigation shortcuts — desktop only
  useKeyboardShortcut('1', true, () => navigate('/dashboard'), isDesktop)
  useKeyboardShortcut('2', true, () => navigate('/notes'), isDesktop)
  useKeyboardShortcut('3', true, () => navigate('/tasks'), isDesktop)
  useKeyboardShortcut('4', true, () => navigate('/projects'), isDesktop)
  useKeyboardShortcut('5', true, () => navigate('/calendar'), isDesktop)

  // Cmd+K — command palette (dispatch custom event, CommandPalette listens)
  useKeyboardShortcut('k', true, () => {
    window.dispatchEvent(new CustomEvent('cmd-palette-open'))
  }, isDesktop)

  // Cmd+N — new item (dispatch custom event, active page listens)
  useKeyboardShortcut('n', true, () => {
    window.dispatchEvent(new CustomEvent('cmd-new'))
  }, isDesktop)

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <TabBar />
      <main
        className="ml-0 lg:ml-[var(--sidebar-current-width)] pb-[calc(var(--tab-bar-height)+var(--safe-bottom)+16px)] lg:pb-8 transition-[margin-left] duration-200 ease-out"
      >
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>
    </div>
  )
}
