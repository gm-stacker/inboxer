# Inboxer — Persistent Rules
# Location: .agent/rules/GEMINI.md
# These rules are ALWAYS loaded. They apply to every agent, every task, every session.
# No workflow, skill, or user instruction may override them.

---

## Skill Loading Policy

**Always load `coding-conventions` for any implementation, coding, or task execution work.**
Do not rely on semantic matching for this skill — it must be active for every Developer task.

---

## Project Identity

**Inboxer / KAE** — AI-powered PKM note capture and querying app.
- Backend: C# .NET 10 — `/Users/brucechoi/Desktop/inboxer/Backend/`
- Frontend: React + Vite + TypeScript — `/Users/brucechoi/Desktop/inboxer/frontend/`
- AI: Gemini 3.1 Pro (via Antigravity) — used for in-app features only, not for agent tasks
- Implementation model: Claude (via Claude Code or Antigravity Claude integration)
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

## ⛔ CODECOP RULES — MANDATORY PHASE GATE.

### Rule P1 — CodeCop runs before every phase APPROVED. No exceptions.
After implementing each phase, before asking for user approval:
1. Run `/inboxer-codecop` on the files changed in this phase
2. Paste the full report (all R1–R11 rows with PASS/FLAG/N/A verdicts)
3. If VERDICT is FLAGS FOUND: fix all flags, re-run, paste clean report
4. Only then ask for APPROVED

**Submitting a phase without a full CodeCop report = submission returned unread.**
This is treated the same as AF6 (missing walkthrough) — not a soft advisory, a hard return.

"CODECOP OBSERVATIONS: N/A" is NOT a valid CodeCop report.
The full structured report block must be present. If you ran CodeCop and it was clean,
paste the CLEAN report. Do not summarise it. Do not abbreviate it.

### Rule P2 — Walkthrough CodeCop report must be present
The final walkthrough must contain the CodeCop report for the last phase.
If missing: Code Reviewer returns FAIL immediately without reading further.

---

## ⛔ COMPLETION RULES — ZERO FOLLOW-UP ITEMS.

### Rule D1 — A task is not done until it is completely done.
Every task must be delivered with zero known follow-up items.
If an item cannot be completed in this task, it must be:
- Listed explicitly under DEFERRED TASKS with a reason
- NOT silently omitted
- NOT described as "can be addressed later" without naming it

### Rule D2 — Never ship partial implementations.
A half-implemented feature is worse than no feature. If a task cannot be completed
in full, STOP and escalate to the user before writing any code.
Do not write 80% of a feature and note the remaining 20% as a follow-up.

### Rule D3 — Every output must be self-contained.
The user must not need to do anything after receiving a walkthrough except merge.
No "you'll also need to...", no "don't forget to...", no "as a next step...".
If the user needs to do something — it is either in the task, or the task is not done.

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

## Known Implementation Failure Modes

Every rule above exists to counter a documented failure pattern.
These are failures observed on this project — not hypothetical.

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
| Silent Partial Delivery | Ships 80% of a feature with follow-up items not explicitly deferred | D1, D2, D3 |
| Sycophantic Agreement | Accepts user corrections without re-evaluating the whole plan | Block 2 gate |
| Optimistic Error Handling | Implements happy path only, skips failure states | backend-service-layer |
| CodeCop Skip | Submits phase or walkthrough without CodeCop report — or writes "N/A" as fake report | P1, P2 |
| Fake CodeCop Report | Writes "CODECOP OBSERVATIONS: N/A" instead of running the tool | P1, P2 |

---

## Thinking Level Policy

- **Medium**: Default for all tasks. Sufficient for standard frontend/backend changes.
- **High**: Only for: architectural decisions, complex cross-file refactors, AI prompt changes.
- **Low**: Only for: simple file reads, grep checks, trivial one-line fixes.
Do not use High thinking for CSS changes, test writing, or any task where the spec is fully defined.
