---
name: vault-write-safety
description: Use this skill when modifying VaultWatcherService.cs, any file that reads or writes to the Obsidian vault, or any code that touches markdown files. Enforces safe vault write patterns.
---

# Vault Write Safety Skill

## Mission
Prevent any code changes from corrupting the user's Obsidian vault. The vault is the single source of truth and contains irreplaceable personal data.

## Rules — enforce all of these without exception

### Never touch the note body
- Only read and write the YAML frontmatter block (between `---` delimiters at the top of the file)
- The note body (everything after the closing `---`) must be passed through byte-for-byte unchanged
- Never append, prepend, or modify any content in the note body

### Surgical frontmatter writes
- Parse existing frontmatter before writing
- Merge new AI-managed fields into existing properties
- Preserve all user-written properties exactly as found
- Only update these app-managed fields: `type`, `tags`, `extracted_date`, `entities`, `metrics`, `last_processed_hash`
- Never delete or rename user properties

### Infinite loop prevention
- Always store a `last_processed_hash` in frontmatter after processing
- Hash covers the note body only — not the full file including frontmatter
- On FileSystemWatcher trigger, compare current body hash to stored hash
- Skip processing if hashes match — the trigger was caused by a frontmatter write, not a content change

### Concurrency safety
- Debounce FileSystemWatcher events — minimum 800ms after last event before processing
- Implement retry with exponential backoff if file is locked (Obsidian may be writing)
- Never process the same file in parallel

### Obsidian YAML compatibility
- Arrays must use proper YAML list format
- Dates must be `YYYY-MM-DD` string format
- Never use YAML anchors or complex types
- Test round-trip: parsed YAML must re-serialize identically