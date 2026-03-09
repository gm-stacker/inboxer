---
description: /inboxer-spec
---

---
description: Inboxer Spec Writer — use after /inboxer-teamlead outputs an approved context block. Writes the full implementation spec, self-audits it, and invokes the Developer.
---

# Inboxer — Spec Writer

Triggered after `/inboxer-teamlead` outputs an approved context block.
You write the complete spec, self-audit it, write a verification plan, then invoke the Developer.
The rules in `GEMINI.md` are always active and must be enforced explicitly in this spec.

---

## Step 1 — Write the spec

A spec is not complete until every section below is answered.
If any section cannot be answered from the context block: STOP and say which section is missing. Do not infer.

### 1a. Branch & stash instruction
```
Feature branch: feature/[task-name]
Stash instruction: if `git status` shows any dirty files, run:
  git stash push -m "wip: stash before [task-name] [date]"
  git stash list    ← confirm stash@{N} exists before creating the branch
Branch creation: git checkout -b feature/[task-name]
```

### 1b. Permitted file list
List every file the Developer may create or modify.
This is the hard boundary. Any file not on this list may not be touched — not to fix a bug, not to improve something nearby, not for any reason.

```
PERMITTED FILES
---------------
Modify: [exact path]
Modify: [exact path]
Create: [exact path]
```

### 1c. Component specs
For every new or modified component:
- Exact TypeScript props interface (names and types)
- Default prop values
- Which existing CSS classes or components it reuses (confirmed by reading the file)

### 1d. CSS changes
- Exact existing class name being modified (confirmed present in file — never invented)
- Exact CSS property and value
- Confirmation the class does not apply to elements that should NOT receive this change
- If deleting: grep result showing it is safe to delete

**New classes must be declared explicitly:**
For every new CSS class this spec introduces, list:
```
NEW CLASS: .[class-name]
Properties: [full CSS definition]
Used in: [which JSX element]
Confirmed does not already exist: grep -r "[class-name]" frontend/src/ → [result]
```

### 1e. Backend changes
- Exact endpoint path and HTTP method
- Request body (fields, types)
- Response shape (fields, types)
- Error handling: 4xx behaviour, 5xx behaviour

### 1f. Function changes
- What the function currently does
- Exact change
- What must not change

**Inline style rule — applies to all JSX snippets in this section:**
Any style={{ }} attribute in a JSX snippet must be justified inline as follows:
```
style={{ [property]: [value] }}  ← DYNAMIC: computed from [state/prop name] at runtime
```
If a style value is static (not computed at runtime), it must be moved to a CSS class.
Static inline styles in spec JSX snippets will be implemented as static inline styles by the
Developer — do not include them.

### 1g. Testing tasks — mandatory extra section
If this spec involves test files:

**CLASS INVENTORY REQUIRED** — Developer must output this before writing any test:
```
CLASS INVENTORY
---------------
[filename]:
  CSS classNames present: [exact list]
  TypeScript props interface: [exact interface]
```
Rules the Developer must follow:
1. Tests reference ONLY names from the CLASS INVENTORY
2. If a name in this spec does not appear in the inventory: escalate — do not invent
3. If any test cannot pass without modifying a component: STOP and escalate
4. `git diff main --name-only` must show ONLY test files and test config
5. Any existing component file in the diff = automatic task failure

### 1h. Constraints
Copy every constraint from every loaded skill verbatim. Do not paraphrase.
The Developer reads only this spec. If a constraint is not written here, it will not be applied.

### 1i. Commit instruction
```
Before submitting walkthrough:
  git add [permitted files only]
  git commit -m "feat: [description]"
  git log --oneline -3    ← paste this output in your walkthrough
```

---

## Step 2 — Self-audit

Run through every item. Fix every NO before proceeding.

```
SPEC SELF-AUDIT
---------------
Feature branch named:                              [YES/NO]
Stash instruction included:                        [YES/NO]
Permitted file list complete (every file named):   [YES/NO — list missing]
Props interfaces fully typed:                      [YES/NO — list missing]
CSS uses only confirmed existing class names:      [YES/NO — list any invented]
All new CSS classes declared in 1d with full
  definition and grep confirmation:                [YES/NO/N/A — list any missing]
All JSX inline styles in 1f are dynamic (runtime
  computed) — no static values:                    [YES/NO — list any static ones found]
No unresolved "or" branches anywhere in spec:      [YES/NO — list any]
Layout impact before/after callout present:        [YES/NO/N/A]
Backend request+response shapes defined:           [YES/NO/N/A]
All skill constraints copied verbatim:             [YES/NO — list missing skills]
All acceptance criteria concretely testable:       [YES/NO — list any vague ones]
CLASS INVENTORY section present (testing tasks):   [YES/NO/N/A]
Commit instruction included:                       [YES/NO]
```

Do not proceed to Step 3 until all items are YES or N/A.

---

## Step 3 — Verification plan

Every acceptance criterion gets a verification step in this exact format:
```
- [ ] [criterion] — verified by: [exact action] → [exact observable result]
```

Good examples:
```
- [ ] Three-column layout intact — verified by: open any note → DevTools shows .editor-right-panel
      is flex sibling of .note-editor, not a child
- [ ] Sidebar count unchanged — verified by: note count shown → click Completed → count unchanged
- [ ] Timestamp stripped from body — verified by: open note → no [DD-MM-YYYY] text in editor body
- [ ] Vault file unchanged — verified by: open .md file on disk → raw timestamp still present
```

Always include these three:
```
- [ ] npm test passes — verified by: cd frontend && npm test → exit code 0, 0 failures
- [ ] Scope clean — verified by: git diff main --name-only → only permitted files listed
- [ ] Commit present — verified by: git log --oneline -3 → task commit on feature branch shown
```

❌ BANNED verification phrases:
- "Refresh the browser"
- "Check if it looks right"
- "Verify the layout"
- "npm run build passes" (build ≠ test)

---

## Step 4 — Approval gate

After self-audit passes (all YES/N/A), output exactly:

> "Spec complete. Switch to your implementation model and reply APPROVED to begin development."

Do not invoke the Developer until APPROVED is received.

---

## Step 5 — Invoke Developer

Send to `/inboxer-fullstackdev`:
- Complete spec (all sections 1a–1i)
- Permitted file list
- Acceptance criteria (numbered list)
- Skills to load
- Constraints (verbatim)
- Verification plan (Step 3)
- Thinking level (from Team Lead context block)

Then output:
> "Developer invoked. Run `/inboxer-handoff` when the Developer returns their walkthrough."