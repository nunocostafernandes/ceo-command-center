import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Pin, Plus, ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Note } from '@/types/database'

export function NotesPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const userId = user?.id

  const [search, setSearch] = useState('')
  const [activeNote, setActiveNote] = useState<Note | null | 'new'>(null)

  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ceo_notes')
        .select('*')
        .eq('user_id', userId!)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Note[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  })

  const upsertMutation = useMutation({
    mutationFn: async ({ id, title, content }: { id?: string; title: string; content: string }) => {
      if (id) {
        const { error } = await supabase
          .from('ceo_notes')
          .update({ title, content: content || null, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('ceo_notes')
          .insert({ user_id: userId!, title, content: content || null, is_pinned: false })
        if (error) throw error
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notes', userId] })
      void qc.invalidateQueries({ queryKey: ['kpi-notes', userId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ceo_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notes', userId] })
      void qc.invalidateQueries({ queryKey: ['kpi-notes', userId] })
      setActiveNote(null)
      toast.success('Note deleted')
    },
    onError: () => toast.error('Failed to delete note'),
  })

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from('ceo_notes').update({ is_pinned: !pinned }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notes', userId] }),
  })

  const filtered = (notes ?? []).filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    (n.content ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const pinned = filtered.filter(n => n.is_pinned)
  const all = filtered.filter(n => !n.is_pinned)

  return (
    <div className="relative overflow-hidden h-full">
      <AnimatePresence mode="wait">
        {activeNote !== null ? (
          <NoteEditor
            key="editor"
            note={activeNote === 'new' ? null : activeNote}
            userId={userId!}
            onSave={(id, title, content) => upsertMutation.mutate({ id, title, content })}
            onDelete={id => deleteMutation.mutate(id)}
            onBack={() => setActiveNote(null)}
          />
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-2xl font-bold text-text-primary">Notes</h1>
            </div>

            <div className="relative mb-5">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search notes..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-white/5 rounded-xl pl-9 pr-4 py-2.5 text-sm w-full focus:outline-none border border-white/[0.08] focus:border-accent text-text-primary placeholder-text-tertiary"
              />
            </div>

            {isLoading ? (
              <div className="space-y-2"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
            ) : (
              <>
                {pinned.length > 0 && (
                  <div className="mb-5">
                    <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Pinned</h2>
                    <AnimatePresence mode="popLayout">
                      {pinned.map(note => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          onOpen={() => setActiveNote(note)}
                          onTogglePin={n => togglePin.mutate({ id: n.id, pinned: n.is_pinned })}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
                <div>
                  <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">All Notes</h2>
                  {all.length === 0 && pinned.length === 0 ? (
                    <p className="text-text-tertiary text-sm">No notes yet. Tap + to create one.</p>
                  ) : (
                    <AnimatePresence mode="popLayout">
                      {all.map(note => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          onOpen={() => setActiveNote(note)}
                          onTogglePin={n => togglePin.mutate({ id: n.id, pinned: n.is_pinned })}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </>
            )}

            <button
              onClick={() => setActiveNote('new')}
              className="fixed bottom-[calc(var(--tab-bar-height)+var(--safe-bottom)+16px)] right-5 lg:bottom-8 w-14 h-14 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-colors"
            >
              <Plus size={24} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Note Card ───────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: Note
  onOpen: () => void
  onTogglePin: (note: Note) => void
}

function NoteCard({ note, onOpen, onTogglePin }: NoteCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="card-glass p-4 mb-2 press cursor-pointer"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm text-text-primary leading-snug">{note.title || 'Untitled'}</p>
        <button
          className="flex-shrink-0 p-1 -mt-0.5"
          onClick={e => { e.stopPropagation(); onTogglePin(note) }}
        >
          <Pin size={14} className={note.is_pinned ? 'text-accent fill-accent' : 'text-text-tertiary'} />
        </button>
      </div>
      {note.content && (
        <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed">{note.content}</p>
      )}
      <p className="text-[10px] text-text-tertiary mt-2">{format(parseISO(note.updated_at), 'MMM d, yyyy')}</p>
    </motion.div>
  )
}

// ─── Note Editor ─────────────────────────────────────────────────────────────

interface NoteEditorProps {
  note: Note | null
  userId: string
  onSave: (id: string | undefined, title: string, content: string) => void
  onDelete: (id: string) => void
  onBack: () => void
}

function NoteEditor({ note, onSave, onDelete, onBack }: NoteEditorProps) {
  const titleRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedRef = useRef({ title: note?.title ?? '', content: note?.content ?? '' })
  const noteIdRef = useRef<string | undefined>(note?.id)

  // Seed initial content
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.textContent = note?.title ?? ''
    }
    if (bodyRef.current) {
      bodyRef.current.textContent = note?.content ?? ''
    }
    // Focus title on new note
    if (!note && titleRef.current) {
      titleRef.current.focus()
    } else if (note && bodyRef.current) {
      // Put cursor at end of body for existing notes
      const range = document.createRange()
      const sel = window.getSelection()
      range.selectNodeContents(bodyRef.current)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerSave = useCallback(() => {
    const title = titleRef.current?.textContent?.trim() ?? ''
    const content = bodyRef.current?.textContent?.trim() ?? ''
    if (!title && !content) return
    savedRef.current = { title, content }
    onSave(noteIdRef.current, title || 'Untitled', content)
  }, [onSave])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(triggerSave, 800)
  }, [triggerSave])

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      triggerSave()
    }
  }, [triggerSave])

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      bodyRef.current?.focus()
    }
  }

  return (
    <motion.div
      key="editor"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col h-full pt-[calc(var(--safe-top)+0px)] pb-[calc(var(--tab-bar-height)+var(--safe-bottom))]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-accent text-sm font-medium press"
        >
          <ArrowLeft size={18} />
          Notes
        </button>
        {note && (
          <button
            onClick={() => onDelete(note.id)}
            className="text-status-error p-1 press"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Editable area */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        <div
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          onInput={scheduleSave}
          onKeyDown={handleTitleKeyDown}
          data-placeholder="Title"
          className="text-2xl font-bold text-text-primary outline-none mb-3 leading-tight empty:before:content-[attr(data-placeholder)] empty:before:text-text-tertiary/50 break-words"
        />
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          onInput={scheduleSave}
          data-placeholder="Start writing..."
          className="text-base text-text-secondary outline-none leading-relaxed min-h-[200px] empty:before:content-[attr(data-placeholder)] empty:before:text-text-tertiary/40 break-words whitespace-pre-wrap"
        />
      </div>
    </motion.div>
  )
}
