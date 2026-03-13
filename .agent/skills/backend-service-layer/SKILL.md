---
name: backend-service-layer
description: Use this skill when writing or modifying C# controllers, services, repositories, or any backend business logic in the Inboxer .NET 10 backend.
---

# Backend Service Layer

## DO NOT USE THIS SKILL FOR
- Frontend React or TypeScript changes
- CSS or UI changes
- Docker/deployment changes with no C# impact

---

## Layer Responsibilities

```
Controller  → HTTP boundary only (deserialise, call service, serialise)
Service     → Business logic, vault interaction, Gemini calls
Repository  → Data access via IVaultCacheService
```

**Never put business logic in a controller.**
**Never access `IVaultCacheService` directly from a controller.**

### Approved exception — cache invalidation in write controllers
`TaxonomyController` and `CaptureController` are approved to call `IVaultCacheService.Remove()`
and `RemoveByPrefix()` directly after file writes, as an intentional architectural shortcut for
the POC. This is a known bypass of the layer rule. When CodeCop flags R2 for these specific
controllers on these specific calls, the resolution is: *"Team Lead approved — cache invalidation
bypass per backend-polish spec."* Do not introduce this pattern in any other controller.

---

## Singleton Services

The following singletons are registered in `Program.cs` and must be injected — never instantiated directly:

| Interface | Implementation | Purpose |
|---|---|---|
| `IVaultWriteLocker` | `VaultWriteLocker` | Application-wide write lock — serialises all vault file writes |
| `IVaultPathProvider` | `VaultPathProvider` | Resolves vault path once at startup — inject instead of `IConfiguration` path retrieval |
| `IVaultCacheService` | `VaultCacheService` | In-memory note cache |
| `IGeminiService` | `GeminiService` | Gemini API calls |

**Lock usage pattern:**
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
// cache invalidation AFTER finally — never inside the lock
_cacheService.RemoveByPrefix("taxonomy_list");
_cacheService.Remove($"category_notes:{category}");
```

**Path provider usage:**
```csharp
// In constructor — replace any IConfiguration vault path retrieval with:
_vaultPath = vaultPathProvider.GetVaultPath();
```

---

## Controller Pattern

```csharp
[HttpPost("reanalyze/{filename}")]
public async Task<IActionResult> ReanalyzeNote(string filename)
{
    // 1. Validate input
    if (string.IsNullOrWhiteSpace(filename))
        return BadRequest(new { error = "Filename is required", code = "INVALID_INPUT" });

    try
    {
        // 2. Delegate to service
        var result = await _noteService.ReanalyzeAsync(filename);

        // 3. Return result
        return Ok(result);
    }
    catch (NotFoundException ex)
    {
        return NotFound(new { error = ex.Message, code = "NOT_FOUND" });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error reanalyzing note {Filename}", filename);
        return StatusCode(500, new { error = "Internal error", code = "INTERNAL_ERROR" });
    }
}
```

---

## Service Pattern

```csharp
public class NoteService : INoteService
{
    private readonly IVaultCacheService _vault;
    private readonly IGeminiService _gemini;
    private readonly ILogger<NoteService> _logger;

    public async Task<ReanalyzeResult> ReanalyzeAsync(string filename)
    {
        // 1. Get from cache
        var note = _vault.GetNoteByFilename(filename)
            ?? throw new NotFoundException($"Note not found: {filename}");

        // 2. Call Gemini
        var analysis = await _gemini.AnalyzeAsync(note.Content);

        // 3. Return result (do not write to vault here unless spec explicitly requires it)
        return new ReanalyzeResult { ... };
    }
}
```

---

## Error Handling Rules

1. Every controller action must have a try/catch
2. Log errors at `LogError` level with structured parameters
3. Never expose exception stack traces to the client
4. Return consistent error shapes: `{ error: string, code: string }`
5. Use typed exceptions (`NotFoundException`, `ValidationException`) not generic `Exception`

---

## Response Shape Conventions

All list responses:
```csharp
return Ok(new { items = list, totalCount = list.Count });
```

All single-item responses:
```csharp
return Ok(item);  // direct, no wrapper
```

All error responses:
```csharp
return StatusCode(500, new { error = "message", code = "CODE_STRING" });
```

---

## Naming Conventions

- Controllers: `[Entity]Controller.cs`
- Services: `[Entity]Service.cs` + `I[Entity]Service.cs`
- DTOs: `[Entity]Request.cs`, `[Entity]Response.cs`
- Async methods: `[Name]Async()`
- No abbreviations in public APIs — `GetNoteByFilename` not `GetNoteFN`

---

## Test Conventions (C# xUnit)

Every new controller must have a corresponding `Backend.Tests/[Name]ControllerTests.cs`.

**Standard test class structure:**
```csharp
public sealed class [Name]ControllerTests : IDisposable
{
    private readonly string _vaultRoot;

    public [Name]ControllerTests()
    {
        _vaultRoot = Path.Combine(Path.GetTempPath(), $"inboxer_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_vaultRoot);
    }

    public void Dispose()
    {
        if (Directory.Exists(_vaultRoot))
            Directory.Delete(_vaultRoot, recursive: true);
    }

    private [Name]Controller BuildController(MockGeminiService gemini) =>
        new(gemini, new MockVaultPathProvider(_vaultRoot));
}
```

**Coverage requirements per controller action:**
- Happy path → returns expected shape with correct data
- Invalid input → returns `BadRequestObjectResult` (400)
- Service/Gemini throws → returns `ObjectResult` with `StatusCode` 500

**Never use the real vault path in tests.** Always use `_vaultRoot` (temp directory).
**Never rely on pre-existing files or folders on disk.** Tests create everything they need.
