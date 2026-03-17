import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Pin, Plus, ChevronLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Note } from '@/types/database'

// Strip HTML tags from legacy content stored as HTML in the DB
function stripHtml(html: string): string {
  if (!html) return ''
  if (!html.includes('<')) return html
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return doc.body.textContent ?? ''
  } catch {
    return html.replace(/<[^>]*>/g, '')
  }
}

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
    stripHtml(n.content ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const pinned = filtered.filter(n => n.is_pinned)
  const all = filtered.filter(n => !n.is_pinned)

  return (
    <div className="relative overflow-hidden" style={{ height: '100%' }}>
      <AnimatePresence mode="wait">
        {activeNote !== null ? (
          <NoteEditor
            key="editor"
            note={activeNote === 'new' ? null : activeNote}
            onSave={(id, title, content) => upsertMutation.mutate({ id, title, content })}
            onDelete={id => deleteMutation.mutate(id)}
            onBack={() => setActiveNote(null)}
          />
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto"
          >
            <div className="mb-5">
              <h1 className="text-2xl font-bold text-text-primary mb-4">Notes</h1>
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search notes..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-white/5 rounded-xl pl-9 pr-4 py-2.5 text-sm w-full focus:outline-none border border-white/[0.07] focus:border-accent/50 text-text-primary placeholder-text-tertiary transition-colors"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
            ) : (
              <>
                {pinned.length > 0 && (
                  <div className="mb-5">
                    <h2 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest mb-2">Pinned</h2>
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
                  {(pinned.length > 0 || all.length > 0) && (
                    <h2 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest mb-2">
                      {pinned.length > 0 ? 'All Notes' : 'Notes'}
                    </h2>
                  )}
                  {all.length === 0 && pinned.length === 0 ? (
                    <p className="text-text-tertiary text-sm mt-8 text-center">No notes yet.</p>
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
  const plainContent = stripHtml(note.content ?? '')
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      className="card-glass p-4 mb-2 press cursor-pointer active:scale-[0.98]"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm text-text-primary leading-snug truncate">{note.title || 'Untitled'}</p>
        <button
          className="flex-shrink-0 p-1 -mt-0.5 -mr-1"
          onClick={e => { e.stopPropagation(); onTogglePin(note) }}
        >
          <Pin size={13} className={note.is_pinned ? 'text-accent fill-accent' : 'text-white/20'} />
        </button>
      </div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-[11px] text-text-tertiary flex-shrink-0">{format(parseISO(note.updated_at), 'MMM d')}</span>
        {plainContent && (
          <span className="text-xs text-text-tertiary truncate">{plainContent}</span>
        )}
      </div>
    </motion.div>
  )
}

// ─── Note Editor ─────────────────────────────────────────────────────────────

interface NoteEditorProps {
  note: Note | null
  onSave: (id: string | undefined, title: string, content: string) => void
  onDelete: (id: string) => void
  onBack: () => void
}

function NoteEditor({ note, onSave, onDelete, onBack }: NoteEditorProps) {
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const initialTitle = note?.title ?? ''
  const initialContent = stripHtml(note?.content ?? '')

  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)

  // Auto-resize textarea heights
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    autoResize(titleRef.current)
    autoResize(bodyRef.current)
    // Focus appropriately
    if (!note) {
      titleRef.current?.focus()
    } else {
      // Place cursor at end of body
      const el = bodyRef.current
      if (el) {
        el.focus()
        el.selectionStart = el.selectionEnd = el.value.length
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerSave = useCallback((currentTitle: string, currentContent: string) => {
    const t = currentTitle.trim()
    const c = currentContent.trim()
    if (!t && !c) return
    onSave(note?.id, t || 'Untitled', c)
  }, [note?.id, onSave])

  const scheduleSave = useCallback((t: string, c: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => triggerSave(t, c), 800)
  }, [triggerSave])

  // Save on unmount
  const titleRef2 = useRef(title)
  const contentRef2 = useRef(content)
  titleRef2.current = title
  contentRef2.current = content

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      triggerSave(titleRef2.current, contentRef2.current)
    }
  }, [triggerSave])

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitle(e.target.value)
    autoResize(e.target)
    scheduleSave(e.target.value, contentRef2.current)
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    autoResize(e.target)
    scheduleSave(titleRef2.current, e.target.value)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      bodyRef.current?.focus()
    }
  }

  const noteDate = note
    ? format(parseISO(note.updated_at), "MMMM d, yyyy 'at' h:mm a")
    : format(new Date(), "MMMM d, yyyy 'at' h:mm a")

  return (
    <motion.div
      key="editor"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col"
      style={{
        height: '100%',
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'calc(var(--tab-bar-height) + var(--safe-bottom))',
      }}
    >
      {/* Top bar — matches Apple Notes header */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-white/[0.06]">
        <button
          onClick={onBack}
          className="flex items-center gap-0.5 text-accent text-[15px] font-normal px-2 py-1.5 press rounded-lg"
        >
          <ChevronLeft size={22} strokeWidth={2} />
          <span>Notes</span>
        </button>

        <div className="flex items-center gap-1">
          {note && (
            <button
              onClick={() => onDelete(note.id)}
              className="p-2 press rounded-lg text-white/40 hover:text-status-error transition-colors"
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable writing area */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-10">
        {/* Date stamp like Apple Notes */}
        <p className="text-[12px] text-text-tertiary text-center mb-4">{noteDate}</p>

        {/* Title */}
        <textarea
          ref={titleRef}
          value={title}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
          placeholder="Title"
          rows={1}
          className="w-full bg-transparent border-none outline-none resize-none overflow-hidden text-[22px] font-bold text-text-primary placeholder-white/20 leading-tight mb-3"
          style={{ fontFamily: 'inherit' }}
        />

        {/* Divider */}
        <div className="h-px bg-white/[0.06] mb-4" />

        {/* Body */}
        <textarea
          ref={bodyRef}
          value={content}
          onChange={handleContentChange}
          placeholder="Start writing..."
          rows={1}
          className="w-full bg-transparent border-none outline-none resize-none overflow-hidden text-[16px] text-text-secondary placeholder-white/15 leading-[1.75]"
          style={{ fontFamily: 'inherit', minHeight: '200px' }}
        />
      </div>
    </motion.div>
  )
}
