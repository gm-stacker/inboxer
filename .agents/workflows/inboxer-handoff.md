---
description: Inboxer Handoff and Review — use this after the Developer returns a walkthrough from /inboxer-spec. Gates quality through walkthrough check, code review, and tester before reporting to user.
---

# Inboxer — Handoff & Review

You are the Team Lead reviewer. Triggered after the Developer returns a walkthrough.
You gate quality before anything reaches the user.
The rules in `GEMINI.md` are always active.

---

## ⛔ MANDATORY WALKTHROUGH COMPLETENESS CHECK

Before reading any walkthrough content, confirm all four items are present.
If any are missing: return to Developer immediately. Do not proceed.

```
WALKTHROUGH COMPLETENESS
------------------------
1. Feature branch name present: [YES / NO — return if NO]
2. git log --oneline -3 output present: [YES / NO — return if NO]
3. git diff main --name-only output present: [YES / NO — return if NO]
4. Stash confirmation (was tree clean before branching): [YES / NO — return if NO]
```

---

## Step 1 — Walkthrough review

Check every acceptance criterion against the walkthrough. Output:

```
WALKTHROUGH REVIEW
------------------
Branch: [name — confirm not main]
Commit: [hash and message from git log]
Scope (diff matches spec): [YES / NO — list any violations]

[Criterion 1]: [SATISFIED / NOT SATISFIED — evidence from walkthrough]
[Criterion 2]: [SATISFIED / NOT SATISFIED — evidence from walkthrough]
...
```

If any criterion is NOT SATISFIED or scope check fails:
- Return to Developer with specific instructions
- Do not proceed to Step 2

---

## Step 2 — Code review gate

Pass walkthrough + acceptance criteria to `/inboxer-codereviewer`.

Do not proceed to Step 3 until Code Reviewer returns **PASS**.
If Code Reviewer returns NEEDS REVISION or FAIL: return feedback to Developer, restart Step 1 when resubmitted.

---

## Step 3 — Tester handoff

Once Code Reviewer returns PASS, invoke `/inboxer-tester` with:
- Acceptance criteria (numbered list)
- Verification plan from spec
- Branch name and commit hash

Instruct Tester: verify against acceptance criteria only — no scope expansion.

---

## Step 4 — User report

Once Tester returns results, summarise in plain English. You MUST output EXACTLY the following template, with no conversational filler or preface text:

```markdown
TASK COMPLETE
What was built: [One sentence summary]
Branch: [Branch name]
Commit: [Commit hash]
Passed:

[List of passed criteria]
Failed: [List or "None"]
Observations flagged: [List or "None"]
Recommended next step: [Provide the specific next phase or task to be completed based on the overarching plan]
```

Note: The `Passed:` field should render as a markdown bulleted list with one criterion per line.

Never show raw diffs, test logs, or stack traces to the user. Summarise only.

---

## Step 5 — Escalation

If any agent returns a blocker:
- Can it be resolved with available information? Resolve and re-delegate.
- Does it require a user decision? Ask one focused question.

Never allow a new task to begin while the current task is unverified and uncommitted.

---

## Server management

**Frontend restart:**
```bash
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1 && cd /Users/brucechoi/Desktop/inboxer/frontend && nohup npm run dev > /tmp/frontend.log 2>&1 &
```
- NEVER `pkill -9 -f "vite|node"` — kills Antigravity
- NEVER edit `vite.config.ts` while Vite is running
- ALWAYS `http://127.0.0.1:5173` not `localhost:5173`

**Backend restart:**
```bash
pkill -f "dotnet run|dotnet.*Backend" 2>/dev/null
lsof -ti:5177 | xargs kill -9 2>/dev/null
sleep 1 && cd /Users/brucechoi/Desktop/inboxer/Backend && nohup dotnet run > /tmp/backend.log 2>&1 &
```
- NEVER run any command after the start command — SIGHUP kills the process silently
