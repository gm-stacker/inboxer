---
name: obsidian-frontmatter-schema
description: Use this skill when working on note enrichment, frontmatter parsing, AI extraction outputs, or any code that reads/writes YAML properties in markdown files.
---

# Obsidian Frontmatter Schema Skill

## Mission
Ensure all YAML frontmatter written by KAE is valid Obsidian properties format and consistent across all notes.

## App-managed fields — only these fields are written by KAE
```yaml
---
type: note          # string: note | task | log | event | metric
tags:               # array of strings, lowercase, underscores not spaces
  - sleep
  - health
extracted_date: 2026-03-07   # YYYY-MM-DD string, never a YAML date type
metrics:            # object of key-value pairs for quantitative data
  melatonin_mg: 8
  sleep_duration_hours: 6.5
entities:           # array of extracted proper nouns (people, places, orgs)
  - Tim Hong
  - Changi Airport
last_processed_hash: abc123def456   # MD5 of note body, used for loop prevention
---
```

## Obsidian compatibility rules
- Arrays: always use block style (`- item`) not inline (`[item1, item2]`)
- Dates: always `YYYY-MM-DD` quoted string — never YAML native date type
- No YAML anchors (`&`, `*`)
- No multiline strings unless absolutely necessary
- Property names: lowercase, underscores only, no hyphens or spaces
- All string values containing `:` must be quoted

## Type definitions
- `note` — general journal entry, thought, observation
- `task` — actionable item, may have extracted_date as due date
- `log` — recurring entry (sleep log, mood log, daily log)
- `event` — something that happened or is scheduled
- `metric` — quantitative tracking entry

## What never to write
- Never write AI Memory Echoes to the vault
- Never write chat responses to the vault
- Never write query results to the vault
- Never add a `title` field that duplicates the filename
- Never modify any user-written property not in the app-managed list above