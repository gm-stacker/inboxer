---
name: frontend-modules
description: Use this skill when creating new React components, modifying component file structure, adding new TypeScript modules, changing import paths, or restructuring the frontend src directory in Inboxer.
---

# Frontend Modules

## DO NOT USE THIS SKILL FOR
- Backend C# changes
- CSS-only changes with no component structure impact
- Writing test files only

---

## Directory Structure

```
frontend/src/
  components/         # Reusable UI components
  services/
    api.ts            # ALL API calls go here — never fetch() in components
  utils/
    markdown.ts       # Note content parsing utilities
  hooks/              # Custom React hooks (e.g. useDebounce)
  App.tsx             # Root component — state owner
  App.css             # Global styles and design tokens
  main.tsx            # Entry point
```

---

## Component Rules

### 1. Props must be fully typed — no implicit any
```typescript
// CORRECT
interface EditorProps {
  note: SelectedNote;
  onReanalyze: () => void;
  isReanalyzing: boolean;
}

// WRONG
function Editor({ note, onReanalyze, isReanalyzing }: any) {
```

### 2. State lives in App.tsx
Child components receive data and callbacks via props. They do not own shared state.
```typescript
// CORRECT — state in App.tsx, passed down
<Editor note={selectedNote} onReanalyze={handleReanalyze} />

// WRONG — Editor managing its own copy of note state
const [note, setNote] = useState(props.note);
```

### 3. All API calls through services/api.ts
```typescript
// CORRECT
import { api } from '../services/api';
const result = await api.notes.reanalyze(filename);

// WRONG
const result = await fetch('/api/reanalyze/' + filename);
```

### 4. New components follow the existing prop pattern
Look at `Editor.tsx` and `Sidebar.tsx` as reference for prop naming conventions:
- Handler props: `on[Action]` (e.g. `onReanalyze`, `onMarkAsDone`)
- Boolean state props: `is[State]` (e.g. `isReanalyzing`, `isSaving`)
- Setter props: `onSet[State]` (e.g. `onSetNote`, `onSetMoveToCategory`)

### 5. No default exports for utility functions
```typescript
// CORRECT — named exports for utilities
export function parseNoteContent(content: string): ParsedNote { ... }

// CORRECT — default export for components
export default function Editor(props: EditorProps) { ... }
```

### 6. useDebounce hook
Available at `frontend/src/hooks/useDebounce.ts`.
Always use it for any text input that triggers an API call.
```typescript
import { useDebounce } from '../hooks/useDebounce';
const debouncedSearch = useDebounce(searchQuery, 300);
```

---

## Import ordering convention
```typescript
// 1. React
import React, { useState, useEffect } from 'react';

// 2. External libraries (if any — require Team Lead approval)
import { something } from 'library';

// 3. Internal services and utils
import { api } from '../services/api';
import { parseNoteContent } from '../utils/markdown';

// 4. Types
import type { SelectedNote, TaxonomyCategory } from '../services/api';

// 5. Styles (only in App.tsx)
import './App.css';
```

---

## What requires Team Lead approval
- Any new npm package
- Any new top-level directory under `src/`
- Any change to `vite.config.ts`
- Any change to `tsconfig.json`
