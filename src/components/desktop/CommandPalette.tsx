import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, FileText, CheckSquare, FolderKanban, CalendarDays,
  Plus, Search, ArrowRight
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { usePlatform } from '@/hooks'
import { useAuth } from '@/contexts/AuthContext'
import type { Note, Task } from '@/types/database'

interface Command {
  id: string
  label: string
  shortcut?: string
  icon: React.ReactNode
  action: () => void
  category: 'navigate' | 'action' | 'recent'
}

export function CommandPalette() {
  const { isDesktop } = usePlatform()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Listen for the custom event dispatched by AppShell on Cmd+K
  useEffect(() => {
    const handler = () => {
      if (!isDesktop) return
      setIsOpen(true)
      setQuery('')
      setSelectedIndex(0)
    }
    window.addEventListener('cmd-palette-open', handler)
    return () => window.removeEventListener('cmd-palette-open', handler)
  }, [isDesktop])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  // Navigation commands
  const navCommands: Command[] = [
    { id: 'nav-dashboard', label: 'Go to Dashboard', shortcut: '⌘1', icon: <LayoutDashboard size={16} />, action: () => { navigate('/dashboard'); close() }, category: 'navigate' },
    { id: 'nav-notes', label: 'Go to Notes', shortcut: '⌘2', icon: <FileText size={16} />, action: () => { navigate('/notes'); close() }, category: 'navigate' },
    { id: 'nav-tasks', label: 'Go to Tasks', shortcut: '⌘3', icon: <CheckSquare size={16} />, action: () => { navigate('/tasks'); close() }, category: 'navigate' },
    { id: 'nav-projects', label: 'Go to Projects', shortcut: '⌘4', icon: <FolderKanban size={16} />, action: () => { navigate('/projects'); close() }, category: 'navigate' },
    { id: 'nav-calendar', label: 'Go to Calendar', shortcut: '⌘5', icon: <CalendarDays size={16} />, action: () => { navigate('/calendar'); close() }, category: 'navigate' },
  ]

  // Action commands
  const actionCommands: Command[] = [
    { id: 'new-note', label: 'New Note', shortcut: '⌘N', icon: <Plus size={16} />, action: () => { navigate('/notes'); window.dispatchEvent(new CustomEvent('cmd-new')); close() }, category: 'action' },
    { id: 'new-task', label: 'New Task', icon: <Plus size={16} />, action: () => { navigate('/tasks'); window.dispatchEvent(new CustomEvent('cmd-new')); close() }, category: 'action' },
    { id: 'new-project', label: 'New Project', icon: <Plus size={16} />, action: () => { navigate('/projects'); window.dispatchEvent(new CustomEvent('cmd-new')); close() }, category: 'action' },
  ]

  // Recent notes from React Query cache
  const userId = user?.id
  const cachedNotes = (qc.getQueryData(['notes', userId]) as Note[] | undefined) ?? []
  const noteCommands: Command[] = cachedNotes.slice(0, 5).map(note => ({
    id: `note-${note.id}`,
    label: note.title || 'Untitled',
    icon: <FileText size={16} className="text-text-tertiary" />,
    action: () => { navigate('/notes'); close() },
    category: 'recent' as const,
  }))

  // Recent tasks from React Query cache
  const cachedTasks = (qc.getQueryData(['tasks', userId]) as Task[] | undefined) ?? []
  const taskCommands: Command[] = cachedTasks
    .filter(t => !t.is_completed)
    .slice(0, 5)
    .map(task => ({
      id: `task-${task.id}`,
      label: task.title,
      icon: <CheckSquare size={16} className="text-text-tertiary" />,
      action: () => { navigate('/tasks'); close() },
      category: 'recent' as const,
    }))

  // All commands
  const allCommands = [...navCommands, ...actionCommands, ...noteCommands, ...taskCommands]

  // Filter by query
  const filtered = query.trim()
    ? allCommands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : allCommands

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        filtered[selectedIndex]?.action()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, filtered, selectedIndex, close])

  // Reset selected index when query changes
  useEffect(() => { setSelectedIndex(0) }, [query])

  if (!isDesktop) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
          />
          {/* Panel */}
          <motion.div
            className="fixed top-[20%] left-1/2 z-[201] w-[600px] max-w-[calc(100vw-32px)] bg-[#0f0f12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.97, x: '-50%', y: '-10px' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '0px' }}
            exit={{ opacity: 0, scale: 0.97, x: '-50%', y: '-10px' }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8">
              <Search size={17} className="text-text-tertiary flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent text-text-primary placeholder-text-tertiary text-sm focus:outline-none"
              />
              <kbd className="text-[10px] text-text-tertiary bg-white/8 px-1.5 py-0.5 rounded-md font-mono">ESC</kbd>
            </div>

            {/* Results */}
            <div className="max-h-[360px] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <p className="text-text-tertiary text-sm text-center py-8">No results</p>
              ) : (
                filtered.map((cmd, i) => (
                  <button
                    key={cmd.id}
                    onClick={cmd.action}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === selectedIndex ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-white/5'
                    }`}
                  >
                    <span className={i === selectedIndex ? 'text-accent' : 'text-text-tertiary'}>
                      {cmd.icon}
                    </span>
                    <span className="flex-1 text-sm font-medium">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="text-[10px] text-text-tertiary bg-white/8 px-1.5 py-0.5 rounded-md font-mono">
                        {cmd.shortcut}
                      </kbd>
                    )}
                    {cmd.category === 'navigate' && (
                      <ArrowRight size={13} className="text-text-tertiary" />
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
