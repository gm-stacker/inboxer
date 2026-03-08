---
name: kae-architecture
description: Core architecture rules, conventions, and project context for the Knowledge Abstraction Engine (KAE). Load this skill whenever working on any part of the KAE project — frontend, backend, AI integration, or vault handling.
---

## What This App Is

KAE is a personal AI knowledge management tool. The user chats with an AI that has access to their personal Obsidian vault, surfacing relevant notes and enriching them over time using Google Gemini.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | C# (.NET) |
| AI Model | Google Gemini |
| IDE | Antigravity |
| Knowledge Base | Local Obsidian vault (Markdown files with YAML frontmatter) |

## Critical Architecture Rules — Never Violate These

1. **The Obsidian vault is the single source of truth.** Do not suggest introducing a database, duplicating notes elsewhere, or treating any other store as authoritative.

2. **The backend uses FileSystemWatcher** to detect vault changes in real time. Do not replace this with polling loops or manual sync triggers.

3. **Writes are frontmatter-only.** The backend may enrich YAML frontmatter in `.md` files. It must never rewrite or modify note body content.

4. **Gemini is called from the C# backend only.** The frontend never calls AI APIs directly.

5. **Frontend ↔ Backend communication is REST (JSON only).** Do not introduce GraphQL, gRPC, or WebSockets unless explicitly requested.

## Code Conventions

- TypeScript strict mode — no `any` types unless absolutely unavoidable
- C# follows standard .NET naming conventions (PascalCase for classes and methods)
- YAML frontmatter keys use snake_case
- Keep components and services small and single-responsibility

## Before Making Any Changes

1. Read every file in the project before proposing or writing anything
2. Generate an `implementation_plan.md` artifact and wait for approval before touching code
3. If a proposed change would violate any Critical Architecture Rule above, stop and flag it explicitly rather than proceeding

## Anti-Patterns — Reject These If Suggested

- Introducing SQLite, PostgreSQL, or any other database
- Rewriting note body content (frontmatter enrichment only)
- Moving Gemini API calls to the frontend
- Replacing FileSystemWatcher with a polling loop
- Adding unnecessary abstraction layers or over-engineering simple features
- **Using `Path.Combine(Environment.GetFolderPath(...), "Desktop", "inboxer_vault")` as a vault path default** — this is ALWAYS wrong. The correct path is `Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "vault"))`.

## ⚠️ Vault Path — Critical Rule

There are **two vault-related paths** in this project. They must ALWAYS resolve to the same directory:

| Controller/Service | Correct path resolution |
|---|---|
| `TaxonomyController` | `Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "vault"))` |
| All other controllers (QueryController, BriefingController, ChatController, InsightsController, TripContextController) | Same as above — populated via `config["VaultPath"]` with the above as the fallback |
| VaultWatcherService | Must track the same path |

**The vault is at: `<project_root>/vault/`** (sibling of `Backend/`)

**NEVER** use `~/Desktop/inboxer_vault` as a path — that directory is empty and exists only as a legacy artifact.

### Vault Path Verification Checklist

Before restarting the backend, verify:
```bash
# Vault has notes
find ~/Desktop/inboxer/vault -name "*.md" | head -5

# Correct path should return categories
curl -s http://localhost:5177/api/taxonomy | python3 -m json.tool

# Query should return note content, not hallucinated facts
curl -s -X POST http://localhost:5177/api/query \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"list my notes"}]}' | python3 -m json.tool
```

### Unit Test
A unit test exists at `Backend.Tests/VaultPathTests.cs`. **Run it after any controller refactor:**
```bash
cd ~/Desktop/inboxer && dotnet test Backend.Tests/
```

## Current Project State

> Update this section at the end of every session before closing the chat.

- **Last working feature:**
- **Currently building:**
- **Known bugs or issues:**
- **Recent architectural changes:**