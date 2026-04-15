import { motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useRef, type ReactNode } from 'react'
import { usePlatform } from '@/hooks/usePlatform'

// Fixed tab order matches TabBar — used to pick slide direction on mobile
const TAB_ORDER = ['/dashboard', '/notes', '/tasks', '/projects', '/calendar']

function indexOfRoute(pathname: string): number {
  const match = TAB_ORDER.findIndex(t => pathname.startsWith(t))
  return match === -1 ? -1 : match
}

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { isDesktop } = usePlatform()
  const prevIndex = useRef<number>(indexOfRoute(location.pathname))
  const currentIndex = indexOfRoute(location.pathname)

  // Determine slide direction: +1 = slide in from right, -1 = slide in from left
  // If either route isn't in the tab list (detail page, settings), fall back to vertical fade
  let direction: 1 | -1 | 0 = 0
  if (!isDesktop && prevIndex.current !== -1 && currentIndex !== -1 && prevIndex.current !== currentIndex) {
    direction = currentIndex > prevIndex.current ? 1 : -1
  }
  prevIndex.current = currentIndex

  const variants = isDesktop
    ? {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit:    { opacity: 0, y: -4 },
      }
    : direction === 0
    ? {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit:    { opacity: 0, y: -4 },
      }
    : {
        initial: { opacity: 0, x: direction * 40 },
        animate: { opacity: 1, x: 0 },
        exit:    { opacity: 0, x: direction * -40 },
      }

  return (
    <motion.div
      key={location.pathname}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: isDesktop ? 0.2 : 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-dvh"
    >
      {children}
    </motion.div>
  )
}
