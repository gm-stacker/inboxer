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
