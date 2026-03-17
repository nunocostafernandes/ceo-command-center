import { useState, useRef, useEffect, useCallback, Component } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, Pin, Plus, ChevronLeft, Trash2,
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
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Note } from '@/types/database'
import type { ReactNode } from 'react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  if (!html) return ''
  if (!html.includes('<')) return html
  try {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  } catch {
    return html.replace(/<[^>]*>/g, '')
  }
}

// Tiptap never emits inline styles, <div>, <span>, <br> as line breaks, or
// HTML entities like &nbsp;. Any of those signals legacy/pasted content that
// will crash ProseMirror's schema validator → strip to safe plain text.
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

// ─── Error boundary (catches Tiptap / ProseMirror schema errors) ─────────────

interface EBState { error: boolean }
class EditorErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, EBState> {
  state: EBState = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? this.props.fallback : this.props.children }
}

// ─── Main page ────────────────────────────────────────────────────────────────

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

  const filtered = (notes ?? []).filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    stripHtml(n.content ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const pinned = filtered.filter(n => n.is_pinned)
  const all = filtered.filter(n => !n.is_pinned)

  const activeNoteObj = activeNote === 'new' ? null : activeNote

  return (
    <>
      {/* ── Note list ── */}
      <div className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto">
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
                    <NoteCard key={note.id} note={note}
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
                    <NoteCard key={note.id} note={note}
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
      </div>

      {/* ── Editor portal — AnimatePresence lives INSIDE the portal so it
           co-locates with its motion children. This prevents the
           AnimatePresence → portal mismatch that caused blank screens. ── */}
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
                left: 0,
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
                    onSave={(id, title, content) => upsertMutation.mutate({ id, title, content })}
                    onDelete={id => deleteMutation.mutate(id)}
                    onBack={() => setActiveNote(null)}
                  />
                }
              >
                <NoteEditorContent
                  note={activeNoteObj}
                  onSave={(id, title, content) => upsertMutation.mutate({ id, title, content })}
                  onDelete={id => deleteMutation.mutate(id)}
                  onBack={() => setActiveNote(null)}
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

function NoteCard({ note, onOpen, onTogglePin }: {
  note: Note; onOpen: () => void; onTogglePin: (n: Note) => void
}) {
  const plain = stripHtml(note.content ?? '')
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      className="card-glass p-4 mb-2 press cursor-pointer"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm text-text-primary leading-snug truncate">{note.title || 'Untitled'}</p>
        <button className="flex-shrink-0 p-1 -mt-0.5 -mr-1" onClick={e => { e.stopPropagation(); onTogglePin(note) }}>
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

// ─── Shared editor chrome (top bar + toolbar) ─────────────────────────────────

interface EditorChromeProps {
  note: Note | null
  onBack: () => void
  onDelete: (id: string) => void
  children: ReactNode
  toolbar?: ReactNode
}

function EditorChrome({ note, onBack, onDelete, children, toolbar }: EditorChromeProps) {
  const noteDate = note
    ? format(parseISO(note.updated_at), "MMMM d, yyyy 'at' h:mm a")
    : format(new Date(), "MMMM d, yyyy 'at' h:mm a")
  return (
    <>
      <div className="flex items-center justify-between px-2 py-2 border-b border-white/[0.06] flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-0.5 text-accent text-[15px] font-normal px-2 py-1.5 press rounded-lg">
          <ChevronLeft size={22} strokeWidth={2} />
          <span style={{ fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}>Notes</span>
        </button>
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
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleState = useRef(title)
  titleState.current = title

  const initialContent = safeContent(note?.content ?? null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      UnderlineExt,
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({
        openOnClick: false, // prevent accidental navigation while editing
        HTMLAttributes: { class: 'note-link', rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: initialContent,
    editorProps: { attributes: { class: 'tiptap-editor focus:outline-none' } },
    onUpdate: ({ editor }) => scheduleSave(titleState.current, editor.getHTML()),
  })

  const triggerSave = useCallback((t: string, html: string) => {
    const empty = html === '<p></p>' || html === ''
    if (!t.trim() && empty) return
    onSave(note?.id, t.trim() || 'Untitled', empty ? '' : html)
  }, [note?.id, onSave])

  const scheduleSave = useCallback((t: string, html: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => triggerSave(t, html), 800)
  }, [triggerSave])

  const editorRef = useRef(editor)
  editorRef.current = editor

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const e = editorRef.current
      if (e) triggerSave(titleState.current, e.getHTML())
    }
  }, [triggerSave])

  useEffect(() => {
    if (!note) titleRef.current?.focus()
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
        ref={titleRef}
        value={title}
        onChange={e => { setTitle(e.target.value); autoResize(e.target); scheduleSave(e.target.value, editorRef.current?.getHTML() ?? '') }}
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

// ─── Plain-text fallback (shown if Tiptap crashes on bad content) ─────────────

function PlainTextFallback({ note, onSave, onDelete, onBack }: {
  note: Note | null
  onSave: (id: string | undefined, title: string, content: string) => void
  onDelete: (id: string) => void
  onBack: () => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(stripHtml(note?.content ?? ''))
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback((t: string, b: string) => {
    if (!t.trim() && !b.trim()) return
    onSave(note?.id, t.trim() || 'Untitled', b)
  }, [note?.id, onSave])

  const schedule = (t: string, b: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(t, b), 800)
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      save(title, body)
    }
  }, [save, title, body])

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
