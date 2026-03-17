import { useEffect, useCallback } from 'react'

/**
 * Register a keyboard shortcut.
 * @param key - The key to listen for (e.g. '1', 'k', 'n')
 * @param meta - If true, requires Cmd (Mac) or Ctrl (Win/Linux)
 * @param callback - Function to call when shortcut fires
 * @param enabled - Optional: only register when true (default: true)
 */
export function useKeyboardShortcut(
  key: string,
  meta: boolean,
  callback: () => void,
  enabled = true
) {
  const stableCallback = useCallback(callback, [callback])

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Don't fire if user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      if (isEditing && key !== 's' && key !== 'k') return // allow Cmd+S and Cmd+K everywhere

      if (meta && (e.metaKey || e.ctrlKey) && e.key === key) {
        e.preventDefault()
        stableCallback()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, meta, stableCallback, enabled])
}
