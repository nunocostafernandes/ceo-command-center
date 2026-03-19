# Notes Table Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add table insertion to the Notes rich-text editor with a toolbar popover for choosing dimensions.

**Architecture:** Register Tiptap's 4 table extensions (Table, TableRow, TableHeader, TableCell), add a toolbar button that opens a Radix popover with rows/cols inputs, insert the table on confirm. Update CSS for dark-mode table rendering. Remove `<table` from the legacy-content stripper so saved tables survive reload.

**Tech Stack:** @tiptap/extension-table (v2.27.x), @radix-ui/react-popover (already installed), Lucide React icons, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `package.json` | Add 4 @tiptap/extension-table-* packages |
| Modify | `src/pages/NotesPage.tsx:1-17` | Import table extensions + Table2 icon |
| Modify | `src/pages/NotesPage.tsx:38-53` | Remove `<table` from safeContent legacy check, update comment |
| Modify | `src/pages/NotesPage.tsx:584-595` | Register 4 table extensions in useEditor |
| Modify | `src/pages/NotesPage.tsx:643-654` | Add table button + popover after Link button |
| Modify | `src/index.css:174` | Add table CSS styles before the reduced-motion section |

---

### Task 1: Install Tiptap table packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd "/Users/nunocostafernandes/CRANK Dropbox/18B-Crank Nuno/Claude/ceo-command-center"
npm install @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-header @tiptap/extension-table-cell
```

- [ ] **Step 2: Verify installation**

Run: `grep "@tiptap/extension-table" package.json`
Expected: 4 lines — table, table-row, table-header, table-cell

---

### Task 2: Register table extensions in the editor

**Files:**
- Modify: `src/pages/NotesPage.tsx:1-17` (imports)
- Modify: `src/pages/NotesPage.tsx:38-53` (safeContent)
- Modify: `src/pages/NotesPage.tsx:584-595` (useEditor extensions)

- [ ] **Step 1: Add imports**

At `src/pages/NotesPage.tsx`, after line 17 (`import Placeholder ...`), add:

```typescript
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
```

- [ ] **Step 2: Update safeContent to allow tables**

In `src/pages/NotesPage.tsx`, the `safeContent` function (line 41-53):

Remove `raw.includes('<table') ||` from the `isLegacy` check (line 50).

Update the comment at line 38-40 to include `<table>, <tr>, <th>, <td>` in the list of Tiptap-native HTML tags.

- [ ] **Step 3: Register extensions in useEditor**

In `src/pages/NotesPage.tsx`, inside the `extensions` array (line 585-594), add after `Placeholder.configure(...)`:

```typescript
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
```

- [ ] **Step 4: Verify build**

Run: `cd "/Users/nunocostafernandes/CRANK Dropbox/18B-Crank Nuno/Claude/ceo-command-center" && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

---

### Task 3: Add table toolbar button with dimensions popover

**Files:**
- Modify: `src/pages/NotesPage.tsx:5-8` (lucide import)
- Modify: `src/pages/NotesPage.tsx:643-654` (toolbar JSX)

This task adds:
1. A `Table2` icon button in the toolbar (after the Link button)
2. A Radix popover that opens on click with Rows/Cols number inputs (default 3, min 1, max 10)
3. An "Insert" button that calls `editor.chain().focus().insertTable(...)` and closes the popover

- [ ] **Step 1: Add imports**

Add `Table2` to the lucide-react import at line 5-8:

```typescript
import {
  Search, Pin, Plus, ChevronLeft, Trash2, FileText,
  Bold, Italic, Underline, List, ListOrdered, CheckSquare, Link, Table2,
} from 'lucide-react'
```

Add Radix Popover import after the existing Radix/tiptap imports (near line 16-17):

```typescript
import * as Popover from '@radix-ui/react-popover'
```

- [ ] **Step 2: Add table popover state and insert handler**

Inside the `NoteEditorContent` function, before the `const toolbar = (` line (before line 643), add:

```typescript
  const [tableOpen, setTableOpen] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)

  const insertTable = () => {
    editor?.chain().focus().insertTable({ rows: tableRows, cols: tableCols, withHeaderRow: true }).run()
    setTableOpen(false)
    setTableRows(3)
    setTableCols(3)
  }
```

- [ ] **Step 3: Add table button + popover to toolbar**

In the toolbar JSX (after the Link `<Btn>` at line 653), add:

```tsx
      <Popover.Root open={tableOpen} onOpenChange={setTableOpen}>
        <Popover.Trigger asChild>
          <button
            title="Table"
            style={{
              padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', flexShrink: 0,
              background: tableOpen ? 'rgba(94,106,210,0.2)' : 'transparent',
              color: tableOpen ? '#5E6AD2' : 'rgba(255,255,255,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Table2 size={15} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="z-50 rounded-lg border border-white/[0.08] bg-[#1a1a1e] p-3 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-white/40">Rows</span>
                <input
                  type="number" min={1} max={10} value={tableRows}
                  onChange={e => setTableRows(Math.max(1, Math.min(10, +e.target.value || 1)))}
                  className="w-14 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-sm text-white/80 outline-none focus:border-[#5E6AD2]"
                />
              </label>
              <span className="text-white/20 mt-4">×</span>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-white/40">Cols</span>
                <input
                  type="number" min={1} max={10} value={tableCols}
                  onChange={e => setTableCols(Math.max(1, Math.min(10, +e.target.value || 1)))}
                  className="w-14 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-sm text-white/80 outline-none focus:border-[#5E6AD2]"
                />
              </label>
              <button
                onClick={insertTable}
                className="mt-4 rounded-md bg-[#5E6AD2] px-3 py-1 text-sm font-medium text-white hover:bg-[#4F5ABF] transition-colors"
              >
                Insert
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
```

- [ ] **Step 4: Verify build**

Run: `cd "/Users/nunocostafernandes/CRANK Dropbox/18B-Crank Nuno/Claude/ceo-command-center" && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

---

### Task 4: Add table CSS styles

**Files:**
- Modify: `src/index.css:174` (before reduced-motion section)

- [ ] **Step 1: Add table styles**

In `src/index.css`, insert before the `/* ── Reduced motion */` comment (line 176):

```css
/* Tables */
.tiptap-editor table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75em 0;
  overflow: hidden;
  table-layout: fixed;
}
.tiptap-editor th,
.tiptap-editor td {
  border: 1px solid rgba(255,255,255,0.12);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  min-width: 60px;
}
.tiptap-editor th {
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.7);
  font-weight: 600;
  font-size: 13px;
}
.tiptap-editor td {
  color: rgba(255,255,255,0.55);
}
.tiptap-editor .selectedCell {
  background: rgba(94,106,210,0.15);
}
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/nunocostafernandes/CRANK Dropbox/18B-Crank Nuno/Claude/ceo-command-center" && npm run build 2>&1 | tail -5`
Expected: Build succeeds.

---

### Task 5: Smoke test and commit

- [ ] **Step 1: Run dev server and test manually**

Run: `cd "/Users/nunocostafernandes/CRANK Dropbox/18B-Crank Nuno/Claude/ceo-command-center" && npm run dev`

Test checklist:
1. Open Notes page
2. Click Table icon in toolbar — popover appears with Rows/Cols inputs
3. Set to 4×2, click Insert — a 4-row 2-col table appears with header row
4. Type in cells — content saves on blur/debounce
5. Navigate away and back — table persists (not stripped)
6. Existing notes without tables still load correctly

- [ ] **Step 2: Commit**

```bash
cd "/Users/nunocostafernandes/CRANK Dropbox/18B-Crank Nuno/Claude/ceo-command-center"
git add package.json package-lock.json src/pages/NotesPage.tsx src/index.css
git commit -m "feat(notes): add table support with dimensions popover"
```
