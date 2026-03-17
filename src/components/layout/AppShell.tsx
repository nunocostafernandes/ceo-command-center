import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { PageTransition } from './PageTransition'

export function AppShell() {
  const location = useLocation()

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <TabBar />
      <main
        className="ml-0 lg:ml-[220px] pb-[calc(var(--tab-bar-height)+var(--safe-bottom)+16px)] lg:pb-8"
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
