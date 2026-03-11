---
name: kae-architecture
description: Use this skill when making changes to system architecture, AI integration patterns, service boundaries, data flow between frontend and backend, or the Gemini prompt pipeline in Inboxer.
---

# Inboxer Architecture

## DO NOT USE THIS SKILL FOR
- Purely cosmetic CSS changes
- Renaming variables with no structural impact
- Writing test files

---

## System Overview

```
Obsidian Vault (.md files)
        ↓
IVaultCacheService (in-memory cache, C#)
        ↓
Controllers (REST API, C# .NET 10)
        ↓  HTTP
React Frontend (Vite + TypeScript)
        ↓
Gemini 3.1 Pro (via API) — for analysis, echo generation, re-analysis
```

---

## Backend Service Layer

### Singleton Services
All of the following are registered as singletons in `Program.cs`. Inject them — never instantiate.

| Interface | Purpose |
|---|---|
| `IVaultCacheService` | In-memory note cache. All reads go through here — never direct file reads. |
| `IVaultWriteLocker` | Application-wide async write lock. All vault writes must acquire this before writing. |
| `IVaultPathProvider` | Resolves vault path once at startup. Inject instead of reading `IConfiguration` for the path. |
| `IGeminiService` | All Gemini API calls. Never call Gemini directly from a controller. |

### IVaultCacheService
```csharp
IVaultCacheService.GetAllNotes()           // O(n), no disk I/O
IVaultCacheService.GetCompletedNotes()     // pre-filtered list
IVaultCacheService.GetNoteByFilename(fn)   // O(1) dictionary lookup
```

**CRITICAL:** Never add direct file I/O in a controller. Route reads through `IVaultCacheService`.

### IVaultWriteLocker
Serialises all vault file writes across the entire application. Prevents concurrent write corruption when multiple controllers write simultaneously.

```csharp
await _writeLocker.WaitAsync();
try { /* write */ }
finally { _writeLocker.Release(); }
// cache invalidation after finally — never inside lock
```

### IVaultPathProvider
Eliminates duplicated vault path resolution across controllers. One source of truth, resolved at startup.

```csharp
// In constructor
_vaultPath = _vaultPathProvider.GetVaultPath();
```

### Controller responsibilities
- HTTP boundary only: deserialise request, call service, serialise response
- No business logic in controllers
- Validation in controllers is acceptable; transformation is not

### Service responsibilities
- All business logic
- Vault interaction via `IVaultCacheService`
- Gemini API calls via `IGeminiService`

---

## Gemini Integration

All Gemini calls go through `GeminiService`. Never call the Gemini API directly from a controller.

Thinking level policy:
- Standard analysis: **Medium thinking**
- Re-analysis or complex cross-note reasoning: **High thinking**
- Simple tag/metadata extraction: **Low thinking**

See `gemini-prompt-patterns` skill for prompt format rules.

---

## Frontend Data Flow

```
App.tsx (state owner)
  ├── Sidebar.tsx (receives notes list, callbacks)
  ├── Editor.tsx (receives selected note, callbacks)
  └── Right panel (receives echo data)
```

State lives in `App.tsx`. Child components receive data and callbacks via props.
Never lift state into a child component. Never store duplicate state.

### API service
All API calls go through `frontend/src/services/api.ts`.
Never call `fetch` directly from a component — always through the service layer.

---

## Architecture Constraints

1. **No new npm packages without Team Lead approval** — evaluate necessity first
2. **No NuGet packages without Team Lead approval** — `IVaultCacheService` covers most data needs
3. **No direct file reads in frontend** — all data comes from the backend API
4. **No business logic in React components** — components render and handle events only
5. **No Gemini API calls from frontend** — all AI calls are backend-mediated
6. **One concern per PR** — do not bundle architectural changes with UI changes

---

## Known Issues (for context, not for fixing in unrelated tasks)

- `places[].address` not indexed for search — retrieval layer gap
- Alias expansion not implemented (JB → Johor Bahru etc.)
