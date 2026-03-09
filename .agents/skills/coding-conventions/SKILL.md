# Coding Conventions — Inboxer Developer Skill

This skill must be loaded for every Developer task. It defines mandatory reasoning checkpoints, sequencing discipline, and completion standards for all implementation work in this project.

> **Important — read this first**: Every section below contains steps you must output explicitly before proceeding. These are not internal thoughts. They are required outputs. If you skip a step, you have not followed this skill.

> **The rules in `GEMINI.md` are always active and take precedence over this skill.**

---

## Step 1 — Ambiguity check (only if ambiguities exist)

**Skip this step entirely if there are no unclear items, no assumptions, and no questions.**

Only output this block if at least one field is non-empty:

```
AMBIGUITY CHECK
---------------
Unclear items: [list anything ambiguous or underspecified]
Assumptions I would otherwise make: [list them]
Questions I need answered before proceeding: [list them]
```

If there are open questions, stop and ask. Do not infer. Do not proceed until resolved.

---

## Step 2 — Pre-code checklist (before writing a single line of implementation)

Output this block in full. Do not abbreviate or skip fields.

```
PRE-CODE CHECKLIST
------------------
File(s) I am about to write or modify:  [exact paths — one per line]
Existing CSS classes I will reuse:       [name each one — not "existing classes" generically]
Existing components I will reuse:        [name each one — not "existing components" generically]
Props/interfaces I will implement:       [exact TypeScript names and types from the spec]
Skills in scope:                         [list each skill and the specific constraint it imposes]
Constraints that conflict with my default style:
  - [constraint] → [how I will resolve it]
  (or "none")
```

Only begin writing after this checklist is complete and accurate.

---

## Step 3 — Design fidelity check (for any UI work)

Before writing any component or CSS, output this block:

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

Break implementation into phases. For each phase that does not apply, state explicitly which phase you are skipping and why.

- **Phase 1** — Types and interfaces only. No implementation.
- **Phase 2** — Backend / service layer. No UI.
- **Phase 3** — Component shell with props wired up. No logic.
- **Phase 4** — Logic implementation.
- **Phase 5** — CSS only.

**APPROVED gate rules:**
- If **two or more phases apply**: output one phase at a time and wait for **APPROVED** before proceeding to the next.
- If **only one phase applies**: state which phase you are in, state that all others are skipped, and proceed immediately without waiting for APPROVED.

At the start of each phase, re-state which phase you are in and what it covers.

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
- **Never** introduce new npm packages or NuGet dependencies without explicit Team Lead approval

---

## Step 5 — Completion verification (before marking any task done)

### 5a — Run the test suite
```bash
cd frontend && npm test
```

All tests must pass. If any test fails:
- If the failure is a genuine regression caused by your change — fix the code, not the test
- If the failure is because a test's mock props don't match the actual component interface — update the mock props only, never weaken the assertion
- Do not mark the task done until `npm test` exits with 0 failures

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