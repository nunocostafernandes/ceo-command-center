import { useState, useRef, useEffect, useCallback, useMemo, Component } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, Pin, Plus, ChevronLeft, Trash2, FileText,
  Bold, Italic, Underline, List, ListOrdered, CheckSquare, Link,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import LinkExt from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { usePlatform } from '@/hooks/usePlatform'
import { haptics } from '@/lib/haptics'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Note } from '@/types/database'
import type { ReactNode } from 'react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  if (!html) return ''
  if (!html.includes('<')) return html
  try {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  } catch {
    return html.replace(/<[^>]*>/g, '')
  }
}

// Tiptap-native HTML only contains <p>, <strong>, <em>, <u>, <ul>, <ol>, <li>,
// <a>, task-list nodes. Any other HTML (from pasted content or old notes) will
// crash ProseMirror's schema validator — strip it to safe plain text first.
function safeContent(raw: string | null): string {
  if (!raw) return ''
  if (!raw.includes('<')) return raw
  const isLegacy =
    raw.includes('style=') ||
    raw.includes('<div') ||
    raw.includes('<span') ||
    raw.includes('<br') ||
    raw.includes('&nbsp;') ||
    raw.includes('<table') ||
    raw.includes('<script')
  return isLegacy ? stripHtml(raw) : raw
}

// ─── Error boundary ───────────────────────────────────────────────────────────

interface EBState { error: boolean }
class EditorErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, EBState> {
  state: EBState = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  componentDidCatch(err: unknown) { console.error('[EditorErrorBoundary]', err) }
  render() { return this.state.error ? this.props.fallback : this.props.children }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function NotesPage() {
  const { user } = useAuth()
  const { isDesktop } = usePlatform()
  const qc = useQueryClient()
  const userId = user?.id
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [activeNote, setActiveNote] = useState<Note | null | 'new'>(null)

  // Debounce: only update `search` (used for filtering) 300ms after typing stops
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ceo_notes').select('*').eq('user_id', userId!)
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
        const { error } = await supabase.from('ceo_notes')
          .update({ title, content: content || null, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('ceo_notes')
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

  // ── Stable callbacks ──────────────────────────────────────────────────────
  // These MUST be stable (same reference across renders). If they are inline
  // arrow functions, every NotesPage re-render gives NoteEditorContent a new
  // `onSave` reference → triggerSave recreates → useEffect([triggerSave])
  // cleanup fires → immediate save → query invalidates → re-render →
  // infinite loop → eventual Tiptap crash → black screen.
  const upsertRef = useRef(upsertMutation.mutate)
  upsertRef.current = upsertMutation.mutate
  const deleteRef = useRef(deleteMutation.mutate)
  deleteRef.current = deleteMutation.mutate

  const handleSave = useCallback((id: string | undefined, title: string, content: string) => {
    upsertRef.current({ id, title, content })
  }, []) // stable forever — reads mutate fn from ref

  const handleDelete = useCallback((id: string) => {
    deleteRef.current(id)
  }, []) // stable forever

  const handleBack = useCallback(() => setActiveNote(null), [])

  const filtered = (notes ?? []).filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    stripHtml(n.content ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const pinned = filtered.filter(n => n.is_pinned)
  const all = filtered.filter(n => !n.is_pinned)

  const activeNoteObj = activeNote === 'new' ? null : activeNote

  // ── Desktop two-panel layout ────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div className="flex h-[calc(100vh-0px)] overflow-hidden">
        {/* Left panel — note list */}
        <div className="w-[300px] flex-shrink-0 border-r border-white/[0.08] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-5 pb-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-bold text-text-primary">Notes</h1>
              <button
                onClick={() => setActiveNote('new')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/15 text-accent text-xs font-medium hover:bg-accent/25 transition-colors"
              >
                <Plus size={14} />
                New
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="bg-white/5 rounded-xl pl-8 pr-3 py-2 text-xs w-full focus:outline-none border border-white/[0.07] focus:border-accent/50 text-text-primary placeholder-text-tertiary transition-colors"
              />
            </div>
          </div>

          {/* Note list — scrollable */}
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            {isLoading ? (
              <div className="space-y-2 mt-2"><SkeletonCard /><SkeletonCard /></div>
            ) : (
              <>
                {pinned.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-widest mb-1.5 px-1">Pinned</p>
                    <AnimatePresence mode="popLayout">
                      {pinned.map(note => (
                        <DesktopNoteRow
                          key={note.id}
                          note={note}
                          isSelected={activeNote !== 'new' && activeNote !== null && (activeNote as Note).id === note.id}
                          onOpen={() => setActiveNote(note)}
                          onTogglePin={n => togglePin.mutate({ id: n.id, pinned: n.is_pinned })}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
                <div>
                  {(pinned.length > 0 || all.length > 0) && (
                    <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-widest mb-1.5 px-1">
                      {pinned.length > 0 ? 'All Notes' : 'Notes'}
                    </p>
                  )}
                  {all.length === 0 && pinned.length === 0 ? (
                    <p className="text-text-tertiary text-xs mt-6 text-center">No notes yet.</p>
                  ) : (
                    <AnimatePresence mode="popLayout">
                      {all.map(note => (
                        <DesktopNoteRow
                          key={note.id}
                          note={note}
                          isSelected={activeNote !== 'new' && activeNote !== null && (activeNote as Note).id === note.id}
                          onOpen={() => setActiveNote(note)}
                          onTogglePin={n => togglePin.mutate({ id: n.id, pinned: n.is_pinned })}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right panel — editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeNote === null ? (
            // Empty state
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-tertiary">
              <FileText size={40} strokeWidth={1.5} />
              <p className="text-sm">Select a note or create one</p>
            </div>
          ) : (
            // Inline editor — NO portal, NO slide animation on desktop
            <div className="flex-1 flex flex-col overflow-hidden">
              <EditorErrorBoundary
                fallback={
                  <PlainTextFallback
                    note={activeNoteObj}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onBack={handleBack}
                  />
                }
              >
                <NoteEditorContent
                  note={activeNoteObj}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onBack={handleBack}
                />
              </EditorErrorBoundary>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Mobile layout (unchanged) ────────────────────────────────────────────────
  return (
    <>
      {/* ── Note list ── */}
      <div className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto scroll-contain">
        <div className="mb-5">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-text-primary">Notes</h1>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
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
                    <NoteCard key={note.id} note={note}
                      onOpen={() => setActiveNote(note)}
                      onTogglePin={n => togglePin.mutate({ id: n.id, pinned: n.is_pinned })}
                      onDelete={id => deleteMutation.mutate(id)}
                      isMobile={!isDesktop}
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
                    <NoteCard key={note.id} note={note}
                      onOpen={() => setActiveNote(note)}
                      onTogglePin={n => togglePin.mutate({ id: n.id, pinned: n.is_pinned })}
                      onDelete={id => deleteMutation.mutate(id)}
                      isMobile={!isDesktop}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </>
        )}

        <button
          aria-label="New note"
          onClick={() => { haptics.medium(); setActiveNote('new') }}
          className="fixed bottom-[calc(var(--tab-bar-height)+var(--safe-bottom)+16px)] right-5 w-14 h-14 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-colors"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* ── Editor portal ─────────────────────────────────────────────────────
           AnimatePresence lives INSIDE the portal so it co-locates with its
           motion children. position:fixed on the motion.div is rendered directly
           on document.body, bypassing PageTransition's CSS transform ancestor
           which would otherwise break fixed positioning.
      ── */}
      {createPortal(
        <AnimatePresence>
          {activeNote !== null && (
            <motion.div
              key={activeNote === 'new' ? '__new__' : (activeNote as Note).id}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                background: 'linear-gradient(180deg,#020203 0%,#050506 100%)',
                paddingTop: 'var(--safe-top)',
                paddingBottom: 'calc(var(--tab-bar-height) + var(--safe-bottom))',
              }}
            >
              <EditorErrorBoundary
                fallback={
                  <PlainTextFallback
                    note={activeNoteObj}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onBack={handleBack}
                  />
                }
              >
                <NoteEditorContent
                  note={activeNoteObj}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onBack={handleBack}
                />
              </EditorErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({ note, onOpen, onTogglePin, onDelete, isMobile }: {
  note: Note
  onOpen: () => void
  onTogglePin: (n: Note) => void
  onDelete?: (id: string) => void
  isMobile?: boolean
}) {
  const plain = useMemo(() => stripHtml(note.content ?? ''), [note.content])

  if (!isMobile) {
    // Desktop version — no swipe gestures
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="card-glass p-4 mb-2 press cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen() }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm text-text-primary leading-snug truncate">{note.title || 'Untitled'}</p>
          <button className="flex-shrink-0 p-2 -mt-1 -mr-1.5" onClick={e => { e.stopPropagation(); onTogglePin(note) }}>
            <Pin size={13} className={note.is_pinned ? 'text-accent fill-accent' : 'text-white/20'} />
          </button>
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-[11px] text-text-tertiary flex-shrink-0">{format(parseISO(note.updated_at), 'MMM d')}</span>
          {plain && <span className="text-xs text-text-tertiary truncate">{plain}</span>}
        </div>
      </motion.div>
    )
  }

  // Mobile — swipe gestures
  return (
    <div className="relative mb-2 overflow-hidden rounded-2xl">
      {/* Left background (delete — revealed on swipe left) */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 bg-status-error/80 rounded-2xl" style={{ left: '40%' }}>
        <Trash2 size={18} className="text-white" />
      </div>
      {/* Right background (pin — revealed on swipe right) */}
      <div className="absolute inset-y-0 left-0 flex items-center justify-start pl-4 rounded-2xl" style={{ right: '40%', background: '#5E6AD2' }}>
        <Pin size={18} className="text-white" />
      </div>
      {/* Card */}
      <motion.div
        layout
        drag="x"
        dragConstraints={{ left: -120, right: 120 }}
        dragElastic={0.3}
        onDragEnd={(_e, info) => {
          if (info.offset.x < -80 || info.velocity.x < -500) {
            onDelete?.(note.id)
          } else if (info.offset.x > 80 || info.velocity.x > 500) {
            onTogglePin(note)
          }
        }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="card-glass p-4 press cursor-pointer relative z-10"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen() }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm text-text-primary leading-snug truncate">{note.title || 'Untitled'}</p>
          <button className="flex-shrink-0 p-2 -mt-1 -mr-1.5" onClick={e => { e.stopPropagation(); onTogglePin(note) }}>
            <Pin size={13} className={note.is_pinned ? 'text-accent fill-accent' : 'text-white/20'} />
          </button>
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-[11px] text-text-tertiary flex-shrink-0">{format(parseISO(note.updated_at), 'MMM d')}</span>
          {plain && <span className="text-xs text-text-tertiary truncate">{plain}</span>}
        </div>
      </motion.div>
    </div>
  )
}

// ─── Shared editor chrome ─────────────────────────────────────────────────────

interface EditorChromeProps {
  note: Note | null
  onBack: () => void
  onDelete: (id: string) => void
  children: ReactNode
  toolbar?: ReactNode
}

function EditorChrome({ note, onBack, onDelete, children, toolbar }: EditorChromeProps) {
  const { isDesktop } = usePlatform()
  const noteDate = note
    ? format(parseISO(note.updated_at), "MMMM d, yyyy 'at' h:mm a")
    : format(new Date(), "MMMM d, yyyy 'at' h:mm a")
  return (
    <>
      <div className="flex items-center justify-between px-2 py-2 border-b border-white/[0.06] flex-shrink-0">
        {!isDesktop && (
          <button onClick={onBack} className="flex items-center gap-0.5 text-accent text-[15px] font-normal px-2 py-1.5 press rounded-lg">
            <ChevronLeft size={22} strokeWidth={2} />
            <span style={{ fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}>Notes</span>
          </button>
        )}
        {isDesktop && <div />}
        {note && (
          <button onClick={() => onDelete(note.id)} className="p-2 press rounded-lg" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <Trash2 size={17} />
          </button>
        )}
      </div>
      {toolbar}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-10">
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: 16 }}>{noteDate}</p>
        {children}
      </div>
    </>
  )
}

// ─── Rich-text editor (Tiptap) ────────────────────────────────────────────────

function NoteEditorContent({ note, onSave, onDelete, onBack }: {
  note: Note | null
  onSave: (id: string | undefined, title: string, content: string) => void
  onDelete: (id: string) => void
  onBack: () => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always-current refs — let triggerSave read the latest values without
  // being listed as effect dependencies (which would cause the effect to
  // re-run and fire spurious mid-lifecycle saves).
  const titleValRef = useRef(title)
  titleValRef.current = title
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const noteIdRef = useRef(note?.id)
  noteIdRef.current = note?.id

  // triggerSave has [] deps — it's stable forever. It reads live values from
  // refs, so it always uses the current title, noteId, and onSave callback.
  // Only save if the note was actually changed — prevents bumping updated_at
  // (and reordering the list) when opening and closing without editing.
  const isDirtyRef = useRef(false)

  const triggerSave = useCallback((t: string, html: string) => {
    if (!isDirtyRef.current) return
    const empty = html === '<p></p>' || html === ''
    if (!t.trim() && empty) return
    onSaveRef.current(noteIdRef.current, t.trim() || 'Untitled', empty ? '' : html)
  }, [])

  const scheduleSave = useCallback((t: string, html: string) => {
    isDirtyRef.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => triggerSave(t, html), 800)
  }, [triggerSave])

  // Stable ref so Tiptap's onUpdate callback (captured once at editor creation)
  // always calls the latest scheduleSave without needing to recreate the editor.
  const scheduleSaveRef = useRef(scheduleSave)
  scheduleSaveRef.current = scheduleSave

  const initialContent = safeContent(note?.content ?? null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      UnderlineExt,
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'note-link', rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: initialContent,
    editorProps: { attributes: { class: 'tiptap-editor focus:outline-none' } },
    // Delegate through ref so this always calls the latest scheduleSave even
    // though Tiptap captures this callback only once on editor creation.
    onUpdate: ({ editor }) => scheduleSaveRef.current(titleValRef.current, editor.getHTML()),
  })

  const editorRef = useRef(editor)
  editorRef.current = editor

  // Save on TRUE unmount only. triggerSave is stable ([] deps), so this
  // effect never re-runs mid-lifecycle — no spurious saves, no re-render loop.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const e = editorRef.current
      if (e) triggerSave(titleValRef.current, e.getHTML())
    }
  }, [triggerSave]) // triggerSave stable → effectively []

  useEffect(() => {
    if (!note) textareaRef.current?.focus()
  }, [note])

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const setLink = () => {
    const url = window.prompt('Enter URL')
    if (!url) return
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const toolbar = (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-white/[0.06] flex-shrink-0 overflow-x-auto scrollbar-none">
      <Btn active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} label="Bold"><Bold size={15} /></Btn>
      <Btn active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} label="Italic"><Italic size={15} /></Btn>
      <Btn active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} label="Underline"><Underline size={15} /></Btn>
      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 4px', flexShrink: 0 }} />
      <Btn active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} label="Bullet"><List size={15} /></Btn>
      <Btn active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} label="Numbered"><ListOrdered size={15} /></Btn>
      <Btn active={editor?.isActive('taskList')} onClick={() => editor?.chain().focus().toggleTaskList().run()} label="Tasks"><CheckSquare size={15} /></Btn>
      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 4px', flexShrink: 0 }} />
      <Btn active={editor?.isActive('link')} onClick={setLink} label="Link"><Link size={15} /></Btn>
    </div>
  )

  return (
    <EditorChrome note={note} onBack={onBack} onDelete={onDelete} toolbar={toolbar}>
      <textarea
        ref={textareaRef}
        value={title}
        onChange={e => {
          setTitle(e.target.value)
          autoResize(e.target)
          scheduleSave(e.target.value, editorRef.current?.getHTML() ?? '')
        }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus('start') } }}
        onInput={e => autoResize(e.currentTarget)}
        placeholder="Title"
        rows={1}
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          resize: 'none', overflow: 'hidden', fontSize: 22, fontWeight: 700,
          color: 'rgba(255,255,255,0.92)', fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
          lineHeight: 1.3, marginBottom: 12,
        }}
      />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 16 }} />
      <EditorContent editor={editor} />
    </EditorChrome>
  )
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────

function PlainTextFallback({ note, onSave, onDelete, onBack }: {
  note: Note | null
  onSave: (id: string | undefined, title: string, content: string) => void
  onDelete: (id: string) => void
  onBack: () => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(stripHtml(note?.content ?? ''))
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always-current refs — same pattern as NoteEditorContent
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const noteIdRef = useRef(note?.id)
  noteIdRef.current = note?.id
  const titleValRef = useRef(title)
  titleValRef.current = title
  const bodyValRef = useRef(body)
  bodyValRef.current = body

  const isDirtyRef = useRef(false)

  const save = useCallback((t: string, b: string) => {
    if (!isDirtyRef.current) return
    if (!t.trim() && !b.trim()) return
    onSaveRef.current(noteIdRef.current, t.trim() || 'Untitled', b)
  }, [])

  const schedule = useCallback((t: string, b: string) => {
    isDirtyRef.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(t, b), 800)
  }, [save])

  // Save on TRUE unmount only — save is stable ([] deps) so this never
  // fires mid-lifecycle.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      save(titleValRef.current, bodyValRef.current)
    }
  }, [save])

  return (
    <EditorChrome note={note} onBack={onBack} onDelete={onDelete}>
      <textarea
        value={title}
        onChange={e => { setTitle(e.target.value); schedule(e.target.value, body) }}
        placeholder="Title"
        rows={1}
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          resize: 'none', fontSize: 22, fontWeight: 700,
          color: 'rgba(255,255,255,0.92)', fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
          lineHeight: 1.3, marginBottom: 12,
        }}
      />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 16 }} />
      <textarea
        value={body}
        onChange={e => { setBody(e.target.value); schedule(title, e.target.value) }}
        placeholder="Start writing…"
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          resize: 'none', fontSize: 16, color: 'rgba(255,255,255,0.55)',
          fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
          lineHeight: 1.75, minHeight: 200,
        }}
      />
    </EditorChrome>
  )
}

// ─── Desktop Note Row ─────────────────────────────────────────────────────────

function DesktopNoteRow({ note, isSelected, onOpen, onTogglePin }: {
  note: Note
  isSelected: boolean
  onOpen: () => void
  onTogglePin: (n: Note) => void
}) {
  const plain = stripHtml(note.content ?? '')
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      onClick={onOpen}
      className={`px-3 py-2.5 rounded-xl mb-1 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-accent/12 border border-accent/20'
          : 'hover:bg-white/5 border border-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-sm font-medium text-text-primary truncate leading-snug">
          {note.title || 'Untitled'}
        </p>
        <button
          onClick={e => { e.stopPropagation(); onTogglePin(note) }}
          className="flex-shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
        >
          <Pin size={11} className={note.is_pinned ? 'text-accent fill-accent' : 'text-white/20'} />
        </button>
      </div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-[10px] text-text-tertiary flex-shrink-0">
          {format(parseISO(note.updated_at), 'MMM d')}
        </span>
        {plain && <span className="text-[11px] text-text-tertiary truncate">{plain}</span>}
      </div>
    </motion.div>
  )
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function Btn({ children, active, onClick, label }: {
  children: ReactNode; active?: boolean; onClick: () => void; label: string
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      style={{
        padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: active ? 'rgba(94,106,210,0.2)' : 'transparent',
        color: active ? '#5E6AD2' : 'rgba(255,255,255,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}
