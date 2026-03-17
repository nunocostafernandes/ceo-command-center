import { useState, useEffect, useRef, useCallback } from 'react'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void
  threshold?: number // px to pull before triggering (default 60)
  enabled?: boolean  // disable on desktop
}

export function usePullToRefresh({
  onRefresh,
  threshold = 60,
  enabled = true,
}: UsePullToRefreshOptions) {
  const [isPulling, setIsPulling] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startYRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || isRefreshing) return
    const el = containerRef.current
    if (el && el.scrollTop === 0) {
      startYRef.current = e.touches[0].clientY
    }
  }, [enabled, isRefreshing])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || startYRef.current === null || isRefreshing) return
    const delta = e.touches[0].clientY - startYRef.current
    if (delta > 0) {
      setIsPulling(true)
      setPullDistance(Math.min(delta, threshold * 1.5))
    }
  }, [enabled, isRefreshing, threshold])

  const handleTouchEnd = useCallback(async () => {
    if (!enabled || !isPulling) return
    if (pullDistance >= threshold) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    }
    setIsPulling(false)
    setPullDistance(0)
    startYRef.current = null
  }, [enabled, isPulling, pullDistance, threshold, onRefresh])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !enabled) return
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: true })
    el.addEventListener('touchend', handleTouchEnd)
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, enabled])

  return { containerRef, isPulling, isRefreshing, pullDistance }
}
