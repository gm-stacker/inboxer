---
name: obsidian-frontmatter-schema
description: Use this skill when reading, writing, or validating YAML frontmatter in Obsidian vault notes. Also use when adding new frontmatter fields, changing enrichment logic, or writing tests that involve note metadata.
---

# Obsidian Frontmatter Schema

## DO NOT USE THIS SKILL FOR
- Note body content (below the closing ---)
- CSS or UI changes
- API endpoint design with no frontmatter impact

---

## Canonical Frontmatter Schema

```yaml
---
title: string                    # Human-readable title, no timestamp
created: YYYY-MM-DD HH:MM        # ISO-like creation datetime
type: capture | reminder | idea | place | note
tags:
  - string                       # lowercase, hyphen-separated
category: string                 # taxonomy category from IVaultCacheService
done: true | false               # omit field if false (not "done: false")
places:                          # optional, only if type: place
  - name: string
    address: string
    rating: float
    maps_url: string
    photo_url: string
---
```

---

## Rules

### 1. Required fields for every note
`title`, `created`, `type`, `tags` — these must always be present.
`category` is added during enrichment. `done` is added when marked done.

### 2. Never write `done: false`
Omit the `done` field entirely when a note is not done.
Only write `done: true` when marking complete.

### 3. Title must not contain the timestamp
The display title comes from `frontmatter.title`, not from parsing the filename.
```csharp
// Correct
var title = frontmatter.Title;

// Wrong
var title = filename.Replace(".md", "").Split(' ').Skip(1).Join(" ");
```

### 4. Tags must be lowercase and hyphen-separated
```yaml
tags:
  - meeting-notes       ✅
  - MeetingNotes        ❌
  - meeting notes       ❌
```

### 5. `places` array — all fields must be indexed
When enriching place notes, all fields in the `places` array must be populated if available:
- `name` — required
- `address` — required (currently a known gap in retrieval — must be fixed before retrieval tasks)
- `rating` — include 0.0 if unknown, not null
- `maps_url` — include if available
- `photo_url` — include if available

### 6. Parsing rules
Always parse frontmatter with a YAML library, never with string manipulation:
```csharp
// Use YamlDotNet or equivalent
var deserializer = new DeserializerBuilder().Build();
var frontmatter = deserializer.Deserialize<NoteFrontmatter>(yamlBlock);
```

### 7. Preserve note body on frontmatter writes
When writing updated frontmatter, the note body must be preserved exactly.
See `vault-write-safety` skill for the required write pattern.

---

## Parsing the note file

```
[frontmatter block]
---
title: My Note
created: 2026-01-15 14:30
type: idea
tags:
  - project-x
---

[note body starts here]
Everything below the closing --- is the body.
```

Split on `---\n` — first block is frontmatter, everything after the second `---\n` is body.
