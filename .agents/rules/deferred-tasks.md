# Deferred Task Enforcement
**Location:** `.agent/rules/deferred-tasks.md`
**Activation:** Always On — applies to every workflow, every task, every session.

---

## Purpose

Every requirement that enters the pipeline must exit in one of exactly three states:

| State | Meaning |
|---|---|
| **IN SCOPE** | Will be implemented in this task |
| **DEFERRED** | Explicitly excluded — named, reasoned, impact stated |
| **QUESTION** | Cannot be scoped until user answers a specific question |

There is no fourth state. Silence is not a valid status. If a requirement is not
IN SCOPE, it must be DEFERRED or QUESTION — never silently dropped.

---

## REQUEST DECOMPOSITION (required in Team Lead Block 4)

Before writing any plan, every item in the user's request must be decomposed:

```
REQUEST DECOMPOSITION
---------------------
Item 1: [exact requirement from user request]
  Status: IN SCOPE / DEFERRED / QUESTION
  If DEFERRED: reason: [specific — not "out of scope" or "future enhancement"]
               impact: [what breaks or is missing without this]
               follow-up task: [suggested name]
               blocking anything: [YES — what / NO]
  If QUESTION: ask: [the specific question]
               blocking: YES — cannot plan until answered

Item 2: ...
```

**If any item is QUESTION: STOP. Ask the question. Do not proceed to Block 4b.**
**Every IN SCOPE item must appear in the spec's permitted file list.**
**Every DEFERRED item must appear in the spec's section 1j.**

---

## DEFERRED format (required in spec section 1j)

```
DEFERRED ITEMS
--------------
[item name]: deferred because [specific reason]
  Impact if not done: [what is broken or missing]
  Suggested follow-up task: feature/[name]
  Blocking anything: [YES — what / NO]
```

**Banned deferral reasons:**
- "out of scope" — too vague, does not explain why
- "future enhancement" — not a reason
- "can be addressed later" — not a reason
- "not required for MVP" — does not name the specific constraint

**Required deferral reasons must be specific:**
- "requires vault-write-safety pattern and confirmation UX not in this spec"
- "depends on Places API key not yet provisioned in this environment"
- "destructive operation — requires explicit user confirmation flow not designed yet"

---

## Re-deferral rule

When a task touches files that were involved in a previously deferred item:
1. Check `.agent/handoffs/` and prior spec history for deferred items
2. Either implement the deferred item (if in scope) or explicitly re-defer it
3. Never silently proceed past a known deferred item in the files you are touching

---

## Enforcement

Team Lead Block 4 must contain REQUEST DECOMPOSITION before any plan is written.
Spec section 1j must be present with explicit DEFERRED ITEMS or "DEFERRED ITEMS: none".
Code Reviewer checks that every deferred item in the spec has a named reason.
