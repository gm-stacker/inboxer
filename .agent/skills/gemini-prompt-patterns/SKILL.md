---
name: gemini-prompt-patterns
description: Use this skill when writing, modifying, reviewing, or testing any Gemini API system prompt, user prompt, or prompt template in Inboxer. Also use when changing thinking level settings or response parsing logic.
---

# Gemini Prompt Patterns

## DO NOT USE THIS SKILL FOR
- CSS or UI changes
- Non-AI backend logic
- Frontend state management

---

## Model Configuration

```
Model: gemini-3.1-pro-preview
Thinking levels:
  Low:    simple extraction, tag lookups, metadata reads
  Medium: standard analysis, categorisation, summary generation (DEFAULT)
  High:   re-analysis, cross-note reasoning, complex synthesis
```

**Use Medium by default. Escalate to High only when the task genuinely requires deep multi-step reasoning.**
High thinking uses 3–5x more tokens than Medium. Never default to High.

---

## Prompt Structure Rules

### 1. System prompt = role + constraints + output format
Every system prompt must define:
1. The model's role (what it is doing)
2. Hard constraints (what it must never do)
3. Exact output format (JSON schema or explicit structure)

```
You are [role] for [purpose].

Your task: [specific task description]

Rules:
- [constraint 1]
- [constraint 2]

Output format (respond with valid JSON only, no markdown, no preamble):
{
  "field": "type and description"
}
```

### 2. Always request structured output for machine-consumed responses
If the response will be parsed by code, always request JSON:
- Include `no markdown`, `no preamble`, `no explanation` in the prompt
- Parse with try/catch — Gemini occasionally wraps JSON in markdown fences despite instructions
- Strip ` ```json ` and ` ``` ` fences before parsing

```csharp
var raw = response.Text;
var clean = Regex.Replace(raw, @"```json\s*|\s*```", "").Trim();
var result = JsonSerializer.Deserialize<T>(clean);
```

### 3. Few-shot examples improve consistency
For classification or extraction tasks, include 2–3 examples:
```
Examples:
Input: "Remind me to call John tomorrow at 3pm"
Output: {"type": "reminder", "tags": ["reminder", "call", "John"]}

Input: "Great coffee spot — Blue Bottle in Chelsea"
Output: {"type": "place", "tags": ["place", "coffee", "Chelsea"]}
```

### 4. Grounding: include the note content, not just a description
When re-analysing or generating echoes, pass the full note content:
```
Note content:
---
[full note text here]
---
```
Never pass a summary of the note. Pass the actual content.

### 5. Response validation
Always validate that the parsed response contains the expected fields before using:
```csharp
if (string.IsNullOrEmpty(result.Category))
    throw new InvalidOperationException($"Gemini response missing category field: {raw}");
```

---

## Prompt Change Testing Requirements
Any change to a Gemini prompt must be tested with:
- At least 3 diverse note examples (different types: reminder, idea, place, etc.)
- One edge case (empty note, very short note, non-English content)
- Assertion that output matches expected structure
- Comparison of before/after behaviour for the same inputs
