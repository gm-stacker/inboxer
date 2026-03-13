---
name: api-efficiency
description: Use this skill when adding new API endpoints, modifying existing endpoints, writing frontend data-fetching logic, or reviewing how the frontend retrieves and displays lists of notes or aggregated data.
---

# API Efficiency

## DO NOT USE THIS SKILL FOR
- CSS or UI changes with no API impact
- Gemini prompt changes
- Vault write operations

---

## Mission
Prevent N+1 query patterns and unnecessary API round-trips.
The vault is cached in memory — aggregation is cheap server-side. HTTP round-trips are expensive.

---

## Rules

### 1. Never loop over API results to make sequential follow-up calls
If the frontend needs data from multiple notes, the backend returns it in one response.

❌ Anti-pattern:
```typescript
for (const cat of categories) {
  const notes = await api.taxonomy.getNotes(cat.name);
  for (const note of notes) {
    const detail = await api.taxonomy.getNoteDetail(cat.name, note.filename);
  }
}
```

✅ Correct:
```typescript
const completedNotes = await api.taxonomy.getCompleted();  // one call
```

### 2. Backend list endpoints return complete data
If the UI displays title + date + status, the endpoint returns all three.
Not just filenames requiring follow-up fetches.

Use:
```csharp
IVaultCacheService.GetAllNotes()         // all notes, in-memory, O(n)
IVaultCacheService.GetCompletedNotes()   // done-tagged notes only
```

### 3. Prefer a new endpoint over chaining existing ones
If frontend calls endpoint A, uses its result to call endpoint B in a loop → create endpoint C.
One HTTP round-trip always beats N round-trips.

### 4. Frontend search must be debounced
```typescript
// Always use the useDebounce hook
const debouncedQuery = useDebounce(query, 300);
```
- Never fire a search request on every keystroke
- Current delay: 300ms — adjust if needed, never remove

### 5. Pagination for large result sets
If an endpoint could return more than 50 items, add pagination parameters:
- `?page=0&pageSize=20`
- Include `totalCount` in response so frontend can show "showing X of Y"

---

## Response shapes

All list endpoints must return:
```typescript
{
  items: T[],
  totalCount: number
}
```

All single-item endpoints must return the item directly or:
```typescript
{
  data: T,
  error?: string
}
```

All error responses:
```typescript
{
  error: string,
  code: string   // e.g. "NOT_FOUND", "INVALID_INPUT"
}
```
