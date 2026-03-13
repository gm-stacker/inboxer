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

### IVaultCacheService
The vault is loaded into memory at startup. All reads go through the cache — never direct file reads.

```csharp
IVaultCacheService.GetAllNotes()           // O(n), no disk I/O
IVaultCacheService.GetCompletedNotes()     // pre-filtered list
IVaultCacheService.GetNoteByFilename(fn)   // O(1) dictionary lookup
```

**CRITICAL:** Never add direct file I/O in a controller. Route through `IVaultCacheService`.

### Controller responsibilities
- HTTP boundary only: deserialise request, call service, serialise response
- No business logic in controllers
- Validation in controllers is acceptable; transformation is not

### Service responsibilities
- All business logic
- Vault interaction via `IVaultCacheService`
- Gemini API calls via `GeminiService`
- External API calls (e.g. Google Places) via their own dedicated service

### Service interface pattern
Every service must have a corresponding interface:
```
PlacesEnrichmentService.cs  ←  implements  →  IPlacesEnrichmentService.cs
GeminiService.cs            ←  implements  →  IGeminiService.cs
```
Never create a service class without a matching `I[Entity]Service` interface.
Register both in `Program.cs` as `services.AddScoped<IPlacesEnrichmentService, PlacesEnrichmentService>()`.

---

## Watcher Boundary Rule

**`VaultWatcherService` is an infrastructure component — it detects changes and delegates.**

It must NOT contain:
- Business logic
- External API calls (Google Places, Gemini, etc.)
- Data transformation
- YAML parsing or frontmatter manipulation

Any logic triggered by the watcher must be encapsulated in a dedicated service and
injected into the watcher. The watcher calls the service — it does not implement the logic.

```
✅ Correct:
VaultWatcherService detects type: place note
  → calls IPlacesEnrichmentService.EnrichAsync(filename)
  → service handles API call, returns result
  → VaultWatcherService passes result to vault write

❌ Wrong:
VaultWatcherService detects type: place note
  → directly calls HttpClient to query Google Places
  → parses the response itself
  → writes to frontmatter itself
```

If a plan puts business logic directly in `VaultWatcherService`: **flag it as an architecture
violation before the spec is written.**

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
7. **Every service must have an interface** — `I[Entity]Service` + `[Entity]Service` pair, always

---

## Known Issues (for context, not for fixing in unrelated tasks)

- `places[].address` not indexed for search — retrieval layer gap
- Alias expansion not implemented (JB → Johor Bahru etc.)
- `TimelineTableToggle.tsx` exists but is untracked — full spec in vault
