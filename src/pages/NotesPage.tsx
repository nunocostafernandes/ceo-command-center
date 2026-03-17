import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Pin, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomSheet } from '@/components/shared/BottomSheet'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import type { Note } from '@/types/database'

interface NoteForm {
  title: string
  content: string
  tags: string
}

export function NotesPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const userId = user?.id

  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [form, setForm] = useState<NoteForm>({ title: '', content: '', tags: '' })

  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ceo_notes').select('*').eq('user_id', userId!).order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Note[]
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  })

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Note>) => {
      const { error } = await supabase.from('ceo_notes').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notes', userId] })
      void qc.invalidateQueries({ queryKey: ['kpi-notes', userId] })
      toast.success('Note saved')
      setSheetOpen(false)
    },
    onError: () => toast.error('Failed to save note'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Note> }) => {
      const { error } = await supabase.from('ceo_notes').update(payload).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notes', userId] })
      toast.success('Note updated')
      setSheetOpen(false)
    },
    onError: () => toast.error('Failed to update note'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ceo_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notes', userId] })
      void qc.invalidateQueries({ queryKey: ['kpi-notes', userId] })
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

  const openCreate = () => {
    setEditingNote(null)
    setForm({ title: '', content: '', tags: '' })
    setSheetOpen(true)
  }

  const openEdit = (note: Note) => {
    setEditingNote(note)
    setForm({ title: note.title, content: note.content ?? '', tags: (note.tags ?? []).join(', ') })
    setSheetOpen(true)
  }

  const handleSave = () => {
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
    if (editingNote) {
      updateMutation.mutate({ id: editingNote.id, payload: { title: form.title, content: form.content || null, tags: tags.length ? tags : null, updated_at: new Date().toISOString() } })
    } else {
      createMutation.mutate({ user_id: userId!, title: form.title, content: form.content || null, tags: tags.length ? tags : null, is_pinned: false })
    }
  }

  const filtered = (notes ?? []).filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    (n.content ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const pinned = filtered.filter(n => n.is_pinned)
  const all = filtered.filter(n => !n.is_pinned)

  const inputClass = 'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary'

  return (
    <div className="px-4 pt-[calc(var(--safe-top)+16px)] pb-4 max-w-2xl mx-auto">
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
          className="bg-white/5 rounded-xl pl-9 pr-4 py-2.5 text-sm w-full focus:outline-none focus:border-accent border border-white/[0.08] text-text-primary placeholder-text-tertiary"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
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
                    onEdit={openEdit}
                    onDelete={id => deleteMutation.mutate(id)}
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
                    onEdit={openEdit}
                    onDelete={id => deleteMutation.mutate(id)}
                    onTogglePin={n => togglePin.mutate({ id: n.id, pinned: n.is_pinned })}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        </>
      )}

      <button
        onClick={openCreate}
        className="fixed bottom-[calc(var(--tab-bar-height)+var(--safe-bottom)+16px)] right-5 lg:bottom-8 w-14 h-14 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-colors"
      >
        <Plus size={24} />
      </button>

      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title={editingNote ? 'Edit Note' : 'New Note'}>
        <div className="space-y-3 pb-4">
          <input
            type="text"
            placeholder="Title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className={inputClass}
          />
          <textarea
            placeholder="Content..."
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            className={`${inputClass} min-h-[120px] resize-none`}
            rows={5}
          />
          <input
            type="text"
            placeholder="Tags (comma separated)"
            value={form.tags}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            className={inputClass}
          />
          <button
            onClick={handleSave}
            disabled={!form.title || createMutation.isPending || updateMutation.isPending}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

interface NoteCardProps {
  note: Note
  onEdit: (note: Note) => void
  onDelete: (id: string) => void
  onTogglePin: (note: Note) => void
}

function NoteCard({ note, onEdit, onDelete, onTogglePin }: NoteCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -80 }}
      transition={{ duration: 0.2 }}
      className="relative mb-2 overflow-hidden rounded-[16px]"
    >
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.4, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80 || info.velocity.x < -400) {
            onDelete(note.id)
          }
        }}
        className="card-glass p-4 press relative z-10"
        onClick={() => onEdit(note)}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm text-text-primary">{note.title}</p>
          <button
            className="flex-shrink-0 p-1"
            onClick={e => { e.stopPropagation(); onTogglePin(note) }}
          >
            <Pin size={14} className={note.is_pinned ? 'text-accent fill-accent' : 'text-text-tertiary'} />
          </button>
        </div>
        {note.content && (
          <p className="text-xs text-text-secondary mt-1 line-clamp-2">{note.content}</p>
        )}
        {note.tags && note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {note.tags.map(tag => (
              <span key={tag} className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        )}
        <p className="text-[10px] text-text-tertiary mt-2">{format(parseISO(note.updated_at), 'MMM d, yyyy')}</p>
      </motion.div>
      <div className="absolute inset-0 bg-status-error flex items-center justify-end pr-4 z-0">
        <span className="text-white text-xs font-semibold">Delete</span>
      </div>
    </motion.div>
  )
}
