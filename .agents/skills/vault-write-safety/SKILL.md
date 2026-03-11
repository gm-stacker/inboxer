---
name: vault-write-safety
description: Use this skill when any operation writes to, modifies, moves, or deletes files in the Obsidian vault. Also use when reviewing code that touches vault files, frontmatter, or note content on disk.
---

# Vault Write Safety

## DO NOT USE THIS SKILL FOR
- Read-only vault operations
- API endpoint changes that don't write to disk
- Frontend-only changes

---

## Why this matters
The vault contains the user's personal note data. Corrupted or deleted vault files cannot be recovered from within the app. Safety is non-negotiable.

---

## Rules

### 1. Never destructively overwrite without backup
Before any write that replaces existing content:
```csharp
// 1. Read the current content
var current = await File.ReadAllTextAsync(path);
// 2. Write to a temp file first
var tempPath = path + ".tmp";
await File.WriteAllTextAsync(tempPath, newContent);
// 3. Validate temp file is non-empty and well-formed
if (new FileInfo(tempPath).Length == 0) throw new InvalidOperationException("Write produced empty file");
// 4. Replace original
File.Replace(tempPath, path, path + ".bak");
```

- **Filesystem Boundaries:** The `.tmp` file MUST be created in the exact same directory as the target file. Do not use `/tmp` or system temp directories — cross-device atomic moves fail on Docker volume mounts.
- **Backups:** Always pass a backup file path to `File.Replace`. Example: `File.Replace(tempFile, targetFile, targetFile + ".bak");`
- **New Files:** Use `File.Move(tempFile, targetFile, overwrite: true)` if the target file does not yet exist.

### 2. Never delete vault files — archive only
Do not implement hard delete for vault notes. Use the `done` tag or a dedicated archive mechanism.
If a delete feature is required, it must:
- Move the file to a `_archive/` subfolder, not `File.Delete()`
- Be explicitly approved in the spec

### 3. YAML frontmatter must remain valid after writes
Any write that touches frontmatter must:
- Parse the existing frontmatter before modifying
- Write back a valid YAML block
- Never truncate or re-order fields not being modified
- Validate with a YAML parser, not string replacement

See `obsidian-frontmatter-schema` skill for the exact frontmatter schema.

### 4. Preserve original content below frontmatter
When writing updated frontmatter, the note body (everything after `---\n`) must be preserved byte-for-byte.
Never re-encode or normalise line endings — Obsidian is sensitive to these.

### 5. All vault writes must use IVaultWriteLocker
All vault writes are serialised through the `IVaultWriteLocker` singleton injected via DI.
This guarantees application-wide write safety across all controllers and services.

```csharp
await _writeLocker.WaitAsync();
try
{
    // vault write here
}
finally
{
    _writeLocker.Release();
}
```

**Do NOT use a `private static SemaphoreSlim` on a controller or service.** A per-class lock
only serialises writes within that class — concurrent writes from different controllers will
bypass each other's lock entirely. `IVaultWriteLocker` is the only correct pattern.

**Cache invalidation must happen AFTER the lock is released** — never inside the `try...finally`
block. Holding the lock during cache I/O unnecessarily extends lock duration.

### 6. Log all vault writes
Every write to the vault must be logged:
```csharp
_logger.LogInformation("Vault write: {Operation} on {Filename} at {Timestamp}", op, filename, DateTime.UtcNow);
```

---

## Test requirements for vault write tasks
Any test involving vault writes must:
- Use a temporary test directory created in the test constructor — never the real vault
- Clean up the temp directory in `Dispose()`
- Assert both the written content AND that no other files were modified
- Never depend on pre-existing files or folders on the developer's machine
