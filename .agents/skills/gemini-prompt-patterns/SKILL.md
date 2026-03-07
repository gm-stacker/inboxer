---
name: gemini-prompt-patterns
description: Use this skill when writing, modifying, or reviewing any Gemini system prompt in BriefingController.cs, ChatController.cs, QueryController.cs, TripContextController.cs, CaptureController.cs, or VaultWatcherService.cs.
---

# Gemini Prompt Patterns Skill

## Mission
Ensure all Gemini system prompts in KAE produce expert-level, non-summarising responses that add genuine value beyond the user's own notes.

## Critical instruction — always place this first in every system prompt
```
CRITICAL INSTRUCTION: Your primary job is to add expertise and insight that is NOT already in the user's notes. Never restate or summarise what the user has already written. If you find yourself writing something the user could have read directly from their own notes, stop and replace it with genuine domain knowledge instead.
```

## Anti-summarisation rules
- Remove any instruction containing "summarise", "based on your notes here is a summary", or "synthesising notes"
- Replace with: "Use the notes as raw data to reason from, not content to summarise back"
- Patterns & Suggestions sections must contain at least one fact, threshold, regulation, or consideration NOT mentioned anywhere in the user's notes

## Domain reasoning block — include in ChatController and QueryController prompts
Apply expert-level reasoning for these domains:

**Sleep & Health:** Flag melatonin dosage thresholds (0.5–1mg clinically effective; higher doses cause grogginess not better sleep), irregular sleep timing impact, caffeine half-life, sleep debt accumulation

**Shopping & Purchases:** Reason about value, alternatives, warranty, import/customs considerations. For resale: margin, demand, regulatory implications

**Work & Productivity:** Surface scheduling conflicts, dependencies, risks. Name recurring patterns explicitly

**Finance:** Reason about whether spending patterns align with stated goals elsewhere in notes

**Food & Dining:** Reservation lead times, dietary patterns, venue-specific considerations

**Travel:** IATA 100Wh carry-on limit (Wh = mAh × V / 1000, assume 3.7V), Singapore SGD 500 GST customs threshold, Alipay/WeChat pre-trip foreign card linkage requirement, customs declaration for resale quantities

## Task surfacing rules — BriefingController only
- Dated tasks: always surface
- Undated tasks: only surface if a related note contains a CONCRETE time anchor (specific date, named day, or clear relative timeframe like "next Tuesday" or "this weekend")
- Vague intent ("soon", "eventually", "I want to") does NOT qualify
- If surfaced via time anchor, quote the actual timeframe inline

## Visual reasoning — CaptureController upload prompt (images)
When the uploaded file is an image, append this block to the system prompt:

```
VISUAL REASONING — CALENDAR GRIDS: When analyzing calendar grids to determine start and end dates, rely strictly on geometric alignment and the full visual extent of the event markers:

Event Marker Anatomy: Event bars consist of a solid colored block containing the text label, followed by a lighter, semi-transparent continuous horizontal band. You MUST evaluate the total length of the entire marker (solid block + semi-transparent band). Do not calculate the end date based solely on the solid text block.
Start Date: Locate the exact vertical grid line where the event's colored bar begins. The start date is the specific day cell immediately to the right of that leading edge.
End Date: Trace the lighter, semi-transparent band to its absolute end. Locate the exact vertical grid line where this band terminates. The end date is the specific day cell immediately to the left of that trailing edge.
Multi-Week Events: If an event's semi-transparent band extends to the right edge of the calendar and continues on the subsequent row, apply the start logic to the initial segment and the end logic to the final segment on the lower row.
```

## Structural patterns
- [TABLE] blocks: use `[TABLE]...[/TABLE]` delimiters for time-series, comparisons, ranked lists
- [FLAG] markers: prefix time-sensitive proactive callouts with `[FLAG]` in chat responses — strip from reply, return in separate flags array
- Trend sentences: single italic sentence after temporal tables summarising direction
- Maximum 4 Patterns & Suggestions — ordered by consequence of ignoring them