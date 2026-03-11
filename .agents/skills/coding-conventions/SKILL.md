---
name: coding-conventions
description: Load this skill for EVERY Developer task, without exception. Defines mandatory reasoning checkpoints, phased sequencing, and completion standards for all implementation work in the Inboxer project.
---

# Coding Conventions — Inboxer Developer Skill

This skill must be loaded for every Developer task. Every section below contains steps you must output explicitly before proceeding. These are not internal thoughts — they are required outputs. If you skip a step, you have not followed this skill.

> The rules in `GEMINI.md` are always active and take precedence over this skill.

> **Gemini note:** You have a large context window and strong reasoning. Use both — read relevant existing files before writing, and reason carefully at each checkpoint. Do not skip steps because they feel obvious. The checkpoints exist precisely because Gemini-generated code tends to drift in predictable ways: touching out-of-scope files, inventing CSS, assuming the happy path, and skipping test coverage.

---

## Step 1 — Ambiguity check (before anything else)

Before writing a spec, a checklist, or any code, output this block in full:

```
AMBIGUITY CHECK
---------------
Unclear items: [list anything in the request that is ambiguous or underspecified]
Assumptions I would otherwise make: [list them]
Questions I need answered before proceeding: [list them, or "none"]
```

If there are open questions, stop and ask. Do not infer. Do not proceed until resolved.

---

## Step 2 — Pre-code checklist (before writing a single line of implementation)

Output this block in full. Do not abbreviate or skip fields.

```
PRE-CODE CHECKLIST
------------------
File(s) I am about to write or modify:  [exact paths — one per line]
Existing CSS classes I will reuse:       [name each one — not "existing classes" generically / N/A for backend tasks]
Existing components I will reuse:        [name each one — not "existing components" generically / N/A for backend tasks]
Props/interfaces I will implement:       [exact TypeScript names and types from the spec / N/A for backend tasks]
Skills in scope:                         [list each skill and the specific constraint it imposes]
Constraints that conflict with my default style:
  - [constraint] → [how I will resolve it]
  (or "none")
Test files I will create or modify:      [list exact paths / "none — reason"]
```

Only begin writing after this checklist is complete and accurate.

---

## Step 3 — Design fidelity check (frontend tasks only)

Skip this step entirely for backend-only tasks. Output "Step 3: N/A — backend task" and proceed.

For any task that touches React components or CSS, output this block before writing:

```
DESIGN FIDELITY CHECK
---------------------
Reference component:              frontend/src/components/PlaceCard.tsx
Layout pattern I am matching:     [describe — e.g. "flex column, gap via --space-sm"]
Colour tokens I will use:         [exact token names — e.g. --text-primary, --ai-accent]
CSS classes I will use:           [exact class names from the existing stylesheet]
Deviations from PlaceCard I am introducing: [list them, or "none"]
Justification for each deviation: [or "n/a"]
```

If you are introducing a deviation with no justification, remove the deviation. Default to PlaceCard's patterns exactly.

---

## Step 4 — Implementation sequencing

Break implementation into phases. Output one phase at a time. Wait for **APPROVED** before proceeding to the next phase.

- **Phase 1** — Types and interfaces only. No implementation.
- **Phase 2** — Backend / service layer. No UI.
- **Phase 3** — Component shell with props wired up. No logic.
- **Phase 4** — Logic implementation.
- **Phase 5** — CSS only.
- **Phase 6** — Tests. (Always last, never skipped for tasks with new or modified public methods.)

At the start of each phase, re-state which phase you are in and what it covers. At the end of each phase, stop and wait for APPROVED.

Not every phase applies to every task — skip phases that are genuinely not applicable, but state explicitly which phases you are skipping and why. Phase 6 (tests) may only be skipped if the task contains no new public methods and no modifications to existing tested methods.

### Explicit Deferrals
If a feature request, test requirement, or refactor mentioned in the prompt is intentionally excluded from your implementation plan to control scope, you MUST explicitly list it under a "DEFERRED TASKS" heading in your plan output. Never silently omit a requirement. If it's not in the plan and not in DEFERRED, it doesn't exist.

---

## Hard rules — Never

These are absolute. There are no exceptions.

- **Never** modify files outside the scope defined in your task — even if you notice an adjacent improvement opportunity
- **Never** create new CSS classes when an existing one covers the case — check `kae-design-system` first
- **Never** use inline styles except for genuinely dynamic values that cannot be expressed as a class
- **Never** use Tailwind utility classes — this project uses CSS custom properties exclusively
- **Never** add shadows, gradients, or border-radius values beyond what is defined in design tokens
- **Never** create a new component when the spec says to extend an existing one
- **Never** infer missing information — ask instead
- **Never** proceed past a checkpoint without outputting the required block
- **Never** introduce new npm packages or NuGet dependencies without explicit Team Lead approval and user sign-off
- **Never** skip Phase 6 (tests) for tasks that introduce new public methods
- **Never** delete or weaken a test assertion to make the suite pass — fix the code instead
- **Enforce scope discipline for locks:** Always wrap async vault write operations in `try...finally` blocks. The `finally` block exclusively calls `_writeLocker.Release()`. Cache invalidation calls go AFTER the finally block, never inside it.

---

## Step 5 — Completion verification (before marking any task done)

### 5a — Run the test suite

**Frontend tasks:**
```bash
cd frontend && npm test
```

**Backend tasks:**
```bash
cd Backend && dotnet test
```

**Full-stack tasks:** run both.

All tests must pass. If any test fails:
- If the failure is a genuine regression caused by your change — fix the code, not the test
- If the failure is because a test's mock props or constructor args don't match the updated interface — update the mock only, never weaken the assertion
- Do not mark the task done until the test suite exits with 0 failures

### 5b — Verify acceptance criteria
Re-read the original spec. For every acceptance criterion, output one of:

```
PASS: [criterion] — [exact file and line where this is satisfied]
FAIL: [criterion] — [what is missing or wrong]
```

Rules:
- Do not mark the task done if any criterion is FAIL
- Fix all FAILs, then re-run the full verification block
- "I believe this passes" is not evidence — cite the file and line

---

## Reference implementation

`frontend/src/components/PlaceCard.tsx` is the canonical reference for all UI work in this project.

Before writing any component, open `PlaceCard.tsx` and note:
- How it structures its JSX (element hierarchy, class application)
- Which CSS custom properties it uses for colour and spacing
- How it handles conditional rendering
- How it applies interactive states

Match these patterns exactly. When in doubt, do what PlaceCard does.
