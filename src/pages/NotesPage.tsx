import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Pin, Plus, ChevronLeft, Trash2, Bold, Italic, Underline, List, ListOrdered, CheckSquare, Link } from 'lucide-react'
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

  return (
    <>
      {/* Note list */}
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

      {/* Editor — fixed overlay, slides in from right */}
      <AnimatePresence>
        {activeNote !== null && (
          <NoteEditor
            key={activeNote === 'new' ? 'new' : (activeNote as Note).id}
            note={activeNote === 'new' ? null : activeNote}
            onSave={(id, title, content) => upsertMutation.mutate({ id, title, content })}
            onDelete={id => deleteMutation.mutate(id)}
            onBack={() => setActiveNote(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Note Card ───────────────────────────────────────────────────────────────

function NoteCard({ note, onOpen, onTogglePin }: { note: Note; onOpen: () => void; onTogglePin: (n: Note) => void }) {
  const plainContent = stripHtml(note.content ?? '')
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
        {plainContent && <span className="text-xs text-text-tertiary truncate">{plainContent}</span>}
      </div>
    </motion.div>
  )
}

// ─── Note Editor ─────────────────────────────────────────────────────────────

function NoteEditor({ note, onSave, onDelete, onBack }: {
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      UnderlineExt,
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({
        openOnClick: true,
        HTMLAttributes: { class: 'note-link', rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
    ],
    content: note?.content ?? '',
    editorProps: { attributes: { class: 'tiptap-editor focus:outline-none' } },
    onUpdate: ({ editor }) => scheduleSave(titleState.current, editor.getHTML()),
  })

  const triggerSave = useCallback((t: string, html: string) => {
    const isEmpty = html === '<p></p>' || html === ''
    if (!t.trim() && isEmpty) return
    onSave(note?.id, t.trim() || 'Untitled', isEmpty ? '' : html)
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
    if (!note && titleRef.current) titleRef.current.focus()
  }, [note])

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitle(e.target.value)
    autoResize(e.target)
    scheduleSave(e.target.value, editorRef.current?.getHTML() ?? '')
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus('start') }
  }

  const setLink = () => {
    const url = window.prompt('Enter URL')
    if (!url) return
    editor?.chain().focus().setLink({ href: url }).run()
  }

  const noteDate = note
    ? format(parseISO(note.updated_at), "MMMM d, yyyy 'at' h:mm a")
    : format(new Date(), "MMMM d, yyyy 'at' h:mm a")

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 flex flex-col z-40 lg:left-[220px]"
      style={{
        background: 'linear-gradient(180deg, #020203 0%, #050506 100%)',
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'calc(var(--tab-bar-height) + var(--safe-bottom))',
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-white/[0.06] flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-0.5 text-accent text-[15px] font-normal px-2 py-1.5 press rounded-lg">
          <ChevronLeft size={22} strokeWidth={2} />
          <span>Notes</span>
        </button>
        {note && (
          <button onClick={() => onDelete(note.id)} className="p-2 press rounded-lg text-white/30 hover:text-status-error transition-colors">
            <Trash2 size={17} />
          </button>
        )}
      </div>

      {/* Formatting toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-white/[0.06] flex-shrink-0 overflow-x-auto scrollbar-none">
        <ToolbarBtn active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold"><Bold size={15} /></ToolbarBtn>
        <ToolbarBtn active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic"><Italic size={15} /></ToolbarBtn>
        <ToolbarBtn active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline"><Underline size={15} /></ToolbarBtn>
        <div className="w-px h-4 bg-white/10 mx-1 flex-shrink-0" />
        <ToolbarBtn active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list"><List size={15} /></ToolbarBtn>
        <ToolbarBtn active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered size={15} /></ToolbarBtn>
        <ToolbarBtn active={editor?.isActive('taskList')} onClick={() => editor?.chain().focus().toggleTaskList().run()} title="Task list"><CheckSquare size={15} /></ToolbarBtn>
        <div className="w-px h-4 bg-white/10 mx-1 flex-shrink-0" />
        <ToolbarBtn active={editor?.isActive('link')} onClick={setLink} title="Add link"><Link size={15} /></ToolbarBtn>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-10">
        <p className="text-[12px] text-text-tertiary text-center mb-4">{noteDate}</p>

        <textarea
          ref={titleRef}
          value={title}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
          onInput={e => autoResize(e.currentTarget)}
          placeholder="Title"
          rows={1}
          className="w-full bg-transparent border-none outline-none resize-none overflow-hidden text-[22px] font-bold text-text-primary placeholder-white/20 leading-tight mb-3"
          style={{ fontFamily: 'inherit' }}
        />

        <div className="h-px bg-white/[0.06] mb-4" />

        <EditorContent editor={editor} />
      </div>
    </motion.div>
  )
}

function ToolbarBtn({ children, active, onClick, title }: {
  children: React.ReactNode; active?: boolean; onClick: () => void; title: string
}) {
  return (
    <button title={title} onClick={onClick}
      className={`p-2 rounded-lg transition-colors flex-shrink-0 ${active ? 'bg-accent/20 text-accent' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
    >
      {children}
    </button>
  )
}
