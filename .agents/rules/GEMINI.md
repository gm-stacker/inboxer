# Inboxer — Persistent Rules
# Location: .agent/rules/GEMINI.md
# These rules are ALWAYS loaded. They apply to every agent, every task, every session.
# No workflow, skill, or user instruction may override them.

---

## Project Identity

**Inboxer** — AI-powered PKM note capture and querying app.
- Backend: C# .NET 10 — `/Users/brucechoi/Desktop/inboxer/Backend/`
- Frontend: React + Vite + TypeScript — `/Users/brucechoi/Desktop/inboxer/frontend/`
- AI: Gemini 3.1 Pro via Antigravity
- Data: Local Obsidian vault (`.md` files with YAML frontmatter)
- Frontend: `http://127.0.0.1:5173` (NEVER `localhost:5173`)
- Backend: `http://127.0.0.1:6130`
- Workflows: `.agent/workflows/` — triggered via `/command-name`
- Skills: `.agent/skills/` — auto-loaded by agent intent matching
- Rules: `.agent/rules/` — always loaded (this file)

---

## ⛔ GIT RULES — ABSOLUTE. ZERO EXCEPTIONS.

### Rule G1 — Stash before ANY branch operation
Before creating or switching branches, always run:
```bash
git status
```
If output contains ANYTHING other than "nothing to commit, working tree clean":
```bash
git stash push -m "wip: [description] [YYYY-MM-DD]"
git stash list    # MUST confirm stash@{N} exists before proceeding
```
**If dirty and stash not confirmed: STOP. Do not proceed under any circumstances.**

### Rule G2 — Feature branches only. Never main.
```bash
git checkout -b feature/[task-name]
git status    # confirm clean tree on new branch
```
Working directly on `main` is an automatic task failure.

### Rule G3 — Commit before walkthrough. No exceptions.
```bash
git add [spec-listed files only]
git commit -m "feat: [description]"
git log --oneline -3    # confirm commit exists
```
Submitting a walkthrough without a commit = uncommitted work = work that WILL be lost.

### Rule G4 — Scope is a hard boundary
```bash
git diff main --name-only
```
Output must match the spec's permitted file list exactly.
If any unlisted file appears:
```bash
git diff main -- [unlisted-file]    # identify the specific out-of-scope lines
# manually remove ONLY those lines
# then re-check: git diff main --name-only
```

### Rule G5 — NEVER use these commands to fix scope violations
```
git checkout main -- <file>     ← FORBIDDEN — destroys legitimate changes
git reset --hard                ← FORBIDDEN without explicit user approval
git stash drop                  ← FORBIDDEN without explicit user approval
```

### Rule G6 — Stashes are permanent until user approves deletion
Never run `git stash drop` or `git stash pop` on a stash you did not create in the current task.
List stashes before touching them: `git stash list`

---

## ⛔ TESTING RULES — ABSOLUTE. ZERO EXCEPTIONS.

### Rule T1 — Tests verify components. Components NEVER change for tests.
If a test cannot pass without modifying an existing component file:
- The test is wrong
- STOP immediately
- Escalate to Team Lead
- Do NOT modify the component
- Do NOT rewrite the test to hide the failure

### Rule T2 — Read before writing any test
Before writing a single test, read each component file in scope and output:
```
CLASS INVENTORY
---------------
[filename]:
  CSS classNames present: [exact list from file]
  TypeScript props interface: [exact interface from file]
```
Tests reference ONLY names confirmed in this inventory.

### Rule T3 — Testing task scope check
For any task involving test files:
`git diff main --name-only` must show ONLY:
- New test files
- Test configuration files
- Test infrastructure files
If ANY existing component file appears (App.tsx, Editor.tsx, Sidebar.tsx, App.css, etc.) = automatic FAIL.

### Rule T4 — Tests own their own environment
Every test that touches the filesystem must create and destroy its own temporary directory.
```csharp
// Constructor
_vaultRoot = Path.Combine(Path.GetTempPath(), $"inboxer_test_{Guid.NewGuid():N}");
Directory.CreateDirectory(_vaultRoot);

// Dispose
Directory.Delete(_vaultRoot, recursive: true);
```
A test that passes only because of a specific pre-existing machine state is not a valid test.
Never rely on real vault paths, specific desktop folders, or manually-created fixtures.

### Rule T5 — Never delete or weaken tests to make the suite pass
If a test fails after your change:
- If your change broke the behaviour the test asserts: fix the code, not the test
- If your change altered the method signature: update mock props/constructor args only
- Never change `Assert.Equal(expected, actual)` to `Assert.NotNull(result)` to pass
- Never skip or delete a failing test — escalate to Team Lead if genuinely unresolvable

---

## ⛔ CSS RULES — ABSOLUTE.

### Rule C1 — Never invent class names
Read the file. List what exists. Use only what you confirmed with your own eyes.

### Rule C2 — Never delete a class without grepping first
```bash
grep -r "class-name" frontend/src/
```
If found in more than one file: do NOT delete. Add new classes alongside.

### Rule C3 — No Tailwind. No inline styles (except dynamic computed values).
This project uses CSS custom properties. See design tokens below.

---

## ⛔ SERVER RESTART RULES

**Frontend:**
```bash
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1 && cd /Users/brucechoi/Desktop/inboxer/frontend && nohup npm run dev > /tmp/frontend.log 2>&1 &
```
- NEVER `pkill -9 -f "vite|node"` — this kills Antigravity itself
- NEVER edit `vite.config.ts` while Vite is running
- ALWAYS use `http://127.0.0.1:5173` not `localhost:5173`

**Backend:**
```bash
pkill -f "dotnet run|dotnet.*Backend" 2>/dev/null
lsof -ti:6130 | xargs kill -9 2>/dev/null
sleep 1 && cd /Users/brucechoi/Desktop/inboxer/Backend && nohup dotnet run > /tmp/backend.log 2>&1 &
```
- NEVER run any command after the start command — SIGHUP will silently kill the process

---

## Design Tokens (always available — no need to load a skill for these)

```css
--bg-base: #0b111e          /* main content area */
--bg-surface: #0f172a       /* sidebar + right panel */
--bg-raised: #1e293b        /* cards, elevated surfaces */
--border: #1e293b
--text-primary: #f8fafc
--text-secondary: #94a3b8
--text-muted: #64748b
--ui-accent: #6366f1        /* indigo — interactive UI */
--ai-accent: #c9974a        /* amber — Re-analyze, Memory Echo borders */
--sidebar-w: 260px
```
Three-column layout: `sidebar (260px) | content (flex:1) | right-panel (320px)`

---

## Gemini 3.1 Pro — Known Failure Modes

Every rule above exists to counter a documented failure pattern.

| Failure Mode | Description | Rule |
|---|---|---|
| Shadow Refactoring | Touches adjacent files while fixing the target file | G4 |
| Dirty Tree Start | Starts work without checking git status | G1 |
| Working on Main | Forgets to branch, commits to main | G2 |
| Uncommitted Work | Completes task without committing, work gets wiped | G3 |
| Hard Revert Abuse | Uses `git checkout main -- file` to "clean up", destroying legitimate changes | G5 |
| CSS Invention | Creates class names that don't exist | C1 |
| Class Deletion Without Grep | Deletes a class used elsewhere | C2 |
| Test-Driven Component Modification | Modifies components to make tests pass | T1, T2, T3 |
| Thin Verification | "Refresh browser" as acceptance criterion | Workflow rules |
| Deferred Ambiguity | Assumes instead of asking, proceeds with wrong interpretation | Workflow rules |
| High Thinking Overuse | Uses High for simple tasks, wasting tokens/time | Use Medium by default |
| Skipping Test Writing | Ships new public methods without writing corresponding tests | T4, T5 |
| Fragile Test Preconditions | Test passes only due to specific machine state, not self-contained setup | T4 |
| Weakening Tests to Pass | Changes Assert.Equal to Assert.NotNull to silence a failure | T5 |
| Constructor Param Loss | Drops existing constructor params when adding new ones during refactor | Workflow rules |
| Injecting Unused Dependencies | Adds a dependency to a class that never uses it | Workflow rules |
| Cache Invalidation Inside Lock | Calls _cacheService.Remove() inside try...finally lock block | Workflow rules |

---

## Thinking Level Policy

- **Medium**: Default for ALL tasks. Sufficient for standard frontend/backend changes, refactors, test writing, and CSS changes.
- **High**: Only for: architectural decisions, complex cross-file refactors where multiple interacting systems change simultaneously, AI prompt redesign.
- **Low**: Only for: simple file reads, grep checks, trivial one-line fixes.

Do not use High thinking for CSS changes, test writing, DI refactors, or any task where the spec is fully defined.
When in doubt, use Medium — you can always escalate mid-task if genuine complexity emerges.
