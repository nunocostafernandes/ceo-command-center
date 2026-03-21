# Global Search — Design Spec

## Goal

Add a persistent search bar at the top of the sidebar that searches across all entities (Notes, Tasks, Projects, Reminders) with a grouped results dropdown. Hybrid approach: instant cache search + server-side Supabase queries for completeness.

## Architecture

Search input lives in the Sidebar component, always visible above nav items. On typing (300ms debounce), results are gathered in two phases: instant client-side filtering from React Query cache, then parallel Supabase `ilike` queries that merge and deduplicate by ID. Results appear in a dropdown panel overlaying sidebar content.

## Components

### 1. Search Input (in Sidebar)

- Rendered at the top of the sidebar, above the Workspace nav group
- `<Search />` icon (Lucide) + text input
- When sidebar is collapsed: shows only the Search icon; clicking it expands the sidebar
- Keyboard shortcut: `/` focuses the input (only when no other input is focused)
- 300ms debounce on input change before triggering search
- Clear button (`X` icon) when query is non-empty
- On Escape: clears query and closes results dropdown

### 2. Search Results Dropdown

- Positioned below the search input, overlays the sidebar nav content
- Max height ~60vh, scrollable
- Styled as dark glass panel: `bg-[#1a1a1e]`, `border border-white/[0.08]`, `rounded-lg`, `shadow-xl`
- Only visible when query is non-empty and results exist (or show "no results" state)

**Sections (in order):**

| Section | Icon | Fields searched | Result subtitle |
|---------|------|----------------|----------------|
| Notes | `FileText` | title, content (stripped HTML) | First ~60 chars of content |
| Tasks | `CheckSquare` | title, description, tags | List name + priority pill |
| Projects | `FolderKanban` | title, description | Status pill |
| Reminders | `Bell` | title, description | Remind at date |

- Max 3 results per section
- Section header: icon + label + result count (e.g. "Notes (3)")
- Each result row: type icon (muted), title (white), subtitle (tertiary text)
- Active/hovered row: `bg-white/[0.06]` highlight

**Keyboard navigation:**
- Arrow up/down: move between results
- Enter: navigate to selected result
- Escape: close dropdown

**Empty state:** "No results for '[query]'" in muted text, centered

### 3. Search Logic (`src/lib/search.ts`)

**Phase 1 — Cache search (instant):**
```
For each entity type:
  Get data from queryClient.getQueryData(['entity', userId])
  Filter by substring match (case-insensitive) on searchable fields
  Return top 3 matches per type
```

**Phase 2 — Supabase search (async):**
```
Fire 4 parallel queries:
  supabase.from('ceo_notes').select('id,title,content').ilike('title', '%query%').limit(3)
  supabase.from('ceo_tasks').select('id,title,description,list_name,priority,tags').or(`title.ilike.%query%,description.ilike.%query%`).limit(3)
  supabase.from('ceo_projects').select('id,title,description,status').or(`title.ilike.%query%,description.ilike.%query%`).limit(3)
  supabase.from('ceo_reminders').select('id,title,description,remind_at').or(`title.ilike.%query%,description.ilike.%query%`).limit(3)
```

All queries filtered by `user_id`.

**Notes on specific fields:**
- **Tags (Tasks):** searched in cache only (iterate `tags` array, case-insensitive substring match). Not searched via Supabase `ilike` since `tags` is a `text[]` column — array search via PostgREST is unreliable for substring matching.
- **Tags (Notes):** not searched (low value vs. complexity).
- **Reminders cache:** use the page-level query key (check RemindersPage for the exact key, likely `['reminders', userId]`). If no full-list query exists, skip cache phase for reminders and rely on server-only search.

**Merge:** Combine cache + server results. Deduplicate by `id` (cache results take precedence since they may have optimistic updates). Notes also search content via `ilike` on server but not in cache (HTML stripping is expensive).

**State shape:**
```ts
type SearchResults = {
  notes: Note[]
  tasks: Task[]
  projects: Project[]
  reminders: Reminder[]
  isLoading: boolean // true while server queries are in flight
}
```

### 4. Navigation on Select

| Entity | Navigation |
|--------|-----------|
| Note | `navigate('/notes')` + dispatch custom event `search-select-note` with note ID (NotesPage listens and selects it) |
| Task | `navigate('/tasks?task=' + id)` (existing deep-link support opens edit sheet) |
| Project | `navigate('/projects/' + id)` |
| Reminder | `navigate('/reminders')` + dispatch custom event `search-select-reminder` with reminder ID |

Custom events are needed for Notes and Reminders because those pages don't have URL-based item selection. The pages will add event listeners to handle focusing the selected item.

## Files

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/search.ts` | searchCache() and searchSupabase() functions, merge/dedup logic |
| Create | `src/components/layout/SearchBar.tsx` | Search input + results dropdown + keyboard nav |
| Modify | `src/components/layout/Sidebar.tsx` | Render SearchBar at top of sidebar |
| Modify | `src/pages/NotesPage.tsx` | Listen for `search-select-note` event to select a note |
| Modify | `src/pages/RemindersPage.tsx` | Listen for `search-select-reminder` event to highlight a reminder |

## Styling

- Input: `bg-white/[0.04]`, `border-white/[0.08]`, `rounded-lg`, `text-sm`, placeholder "Search..." in `text-white/30`
- Results panel: `bg-[#1a1a1e]`, `border-white/[0.08]`, `rounded-lg`, `shadow-xl`, positioned absolutely below input
- Section headers: `text-[11px]`, `text-white/40`, uppercase, `tracking-wider`
- Result rows: `px-3 py-2`, hover `bg-white/[0.06]`, `cursor-pointer`
- Result title: `text-sm text-text-primary`
- Result subtitle: `text-[11px] text-text-tertiary truncate`
- Loading state: subtle spinner or shimmer in dropdown while server results load

## Edge Cases

- **Empty query:** No dropdown shown
- **Query < 2 chars:** Only cache search (skip server queries to avoid overly broad results)
- **Sidebar collapsed:** Clicking search icon expands sidebar, focuses input
- **Navigation clears search:** After selecting a result, clear the query and close dropdown
- **Content search for Notes:** Server-side only (searching HTML content in cache is expensive and unreliable)
- **Stale cache:** Server results arrive and replace/supplement cache results — dedup handles this
- **Click outside:** Clicking outside the dropdown closes it (standard behavior)
- **`/` shortcut:** Must check `document.activeElement` is not an input, textarea, or contenteditable (e.g. Tiptap editor)
- **Mobile:** Search is sidebar-only; sidebar is desktop-only (`hidden lg:flex`). Mobile search is out of scope for this iteration
