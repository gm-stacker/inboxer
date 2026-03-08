using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Backend.Controllers;
using Xunit;

namespace Backend.Tests;

/// <summary>
/// Tests for TaxonomyController — uses a temp vault directory per test.
/// </summary>
public sealed class TaxonomyControllerTests : IDisposable
{
    private readonly string _vaultRoot;

    public TaxonomyControllerTests()
    {
        _vaultRoot = Path.Combine(Path.GetTempPath(), $"inboxer_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_vaultRoot);
    }

    public void Dispose()
    {
        if (Directory.Exists(_vaultRoot))
            Directory.Delete(_vaultRoot, recursive: true);
    }

    // Helper: build a controller pointing at _vaultRoot
    // TaxonomyController resolves vault from CWD — we hack via a subclass override instead.
    // Since the controller uses the constructor-hardcoded pattern, we'll test via the public API
    // by using a derived testable version that accepts a vault path.
    private TestableTaxonomyController BuildController() =>
        new(_vaultRoot);

    // ── GetTaxonomy ───────────────────────────────────────────────────────────

    [Fact(DisplayName = "GetTaxonomy returns categories with note counts")]
    public void GetTaxonomy_ReturnsCategories()
    {
        var catDir = Path.Combine(_vaultRoot, "Health");
        Directory.CreateDirectory(catDir);
        File.WriteAllText(Path.Combine(catDir, "note1.md"), "# Note 1");
        File.WriteAllText(Path.Combine(catDir, "note2.md"), "# Note 2");

        var result = BuildController().GetTaxonomy() as OkObjectResult;
        Assert.NotNull(result);

        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("Health", json);
        Assert.Contains("2", json); // NoteCount == 2
    }

    [Fact(DisplayName = "GetTaxonomy returns empty list when vault has no subdirectories")]
    public void GetTaxonomy_ReturnsEmpty_WhenVaultEmpty()
    {
        var result = BuildController().GetTaxonomy() as OkObjectResult;
        Assert.NotNull(result);
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Equal("[]", json);
    }

    // ── GetNotes ─────────────────────────────────────────────────────────────

    [Fact(DisplayName = "GetNotes returns notes list for an existing category")]
    public async Task GetNotes_ReturnsNotes_WhenCategoryExists()
    {
        var catDir = Path.Combine(_vaultRoot, "Travel");
        Directory.CreateDirectory(catDir);
        await File.WriteAllTextAsync(Path.Combine(catDir, "trip.md"), "Tokyo trip notes");

        var result = await BuildController().GetNotes("Travel") as OkObjectResult;
        Assert.NotNull(result);
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("trip.md", json);
    }

    [Fact(DisplayName = "GetNotes strips YAML frontmatter from preview")]
    public async Task GetNotes_StripsFrontmatterFromPreview()
    {
        var catDir = Path.Combine(_vaultRoot, "Health");
        Directory.CreateDirectory(catDir);
        await File.WriteAllTextAsync(Path.Combine(catDir, "bloodtest.md"),
            "---\ntype: health_metric\n---\nActual body content here.");

        var result = await BuildController().GetNotes("Health") as OkObjectResult;
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        // Preview should contain body, not frontmatter keys
        Assert.Contains("Actual body", json);
        Assert.DoesNotContain("health_metric", json);
    }

    [Fact(DisplayName = "GetNotes returns 404 for a missing category")]
    public async Task GetNotes_Returns404_WhenCategoryMissing()
    {
        var result = await BuildController().GetNotes("DoesNotExist");
        Assert.IsType<NotFoundObjectResult>(result);
    }

    // ── GetNoteDetails ────────────────────────────────────────────────────────

    [Fact(DisplayName = "GetNoteDetails returns full content on exact match")]
    public async Task GetNoteDetails_ReturnsContent()
    {
        var catDir = Path.Combine(_vaultRoot, "Work");
        Directory.CreateDirectory(catDir);
        await File.WriteAllTextAsync(Path.Combine(catDir, "meeting.md"), "Meeting notes");

        var result = await BuildController().GetNoteDetails("Work", "meeting.md") as OkObjectResult;
        Assert.NotNull(result);
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("Meeting notes", json);
    }

    [Fact(DisplayName = "GetNoteDetails resolves via case-insensitive fuzzy fallback")]
    public async Task GetNoteDetails_FuzzyFallback_CaseInsensitive()
    {
        var catDir = Path.Combine(_vaultRoot, "Finance");
        Directory.CreateDirectory(catDir);
        await File.WriteAllTextAsync(Path.Combine(catDir, "budget.md"), "Budget 2026");

        // Request with wrong case
        var result = await BuildController().GetNoteDetails("Finance", "BUDGET.MD") as OkObjectResult;
        Assert.NotNull(result);
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("Budget 2026", json);
    }

    [Fact(DisplayName = "GetNoteDetails returns 404 when note cannot be found")]
    public async Task GetNoteDetails_Returns404_WhenNotFound()
    {
        Directory.CreateDirectory(Path.Combine(_vaultRoot, "Inbox"));
        var result = await BuildController().GetNoteDetails("Inbox", "ghost.md");
        Assert.IsType<NotFoundObjectResult>(result);
    }

    // ── UpdateNote ────────────────────────────────────────────────────────────

    [Fact(DisplayName = "UpdateNote writes new content to disk")]
    public async Task UpdateNote_WritesContent()
    {
        var catDir = Path.Combine(_vaultRoot, "People");
        Directory.CreateDirectory(catDir);
        var filePath = Path.Combine(catDir, "alice.md");
        await File.WriteAllTextAsync(filePath, "Original");

        var req = new UpdateNoteRequest { Content = "Updated content" };
        var result = await BuildController().UpdateNote("People", "alice.md", req);

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal("Updated content", await File.ReadAllTextAsync(filePath));
    }

    [Fact(DisplayName = "UpdateNote returns 404 when file does not exist")]
    public async Task UpdateNote_Returns404_WhenNotFound()
    {
        Directory.CreateDirectory(Path.Combine(_vaultRoot, "People"));
        var result = await BuildController().UpdateNote("People", "ghost.md", new UpdateNoteRequest { Content = "x" });
        Assert.IsType<NotFoundObjectResult>(result);
    }

    // ── DeleteNote ────────────────────────────────────────────────────────────

    [Fact(DisplayName = "DeleteNote removes file from disk")]
    public void DeleteNote_RemovesFile()
    {
        var catDir = Path.Combine(_vaultRoot, "Inbox");
        Directory.CreateDirectory(catDir);
        var filePath = Path.Combine(catDir, "temp.md");
        File.WriteAllText(filePath, "delete me");

        var result = BuildController().DeleteNote("Inbox", "temp.md");
        Assert.IsType<OkObjectResult>(result);
        Assert.False(File.Exists(filePath));
    }

    [Fact(DisplayName = "DeleteNote returns 404 when file does not exist")]
    public void DeleteNote_Returns404_WhenNotFound()
    {
        Directory.CreateDirectory(Path.Combine(_vaultRoot, "Inbox"));
        var result = BuildController().DeleteNote("Inbox", "ghost.md");
        Assert.IsType<NotFoundObjectResult>(result);
    }

    // ── MoveNote ─────────────────────────────────────────────────────────────

    [Fact(DisplayName = "MoveNote moves file to target category")]
    public void MoveNote_MovesToTargetCategory()
    {
        var src = Path.Combine(_vaultRoot, "Inbox");
        var dst = Path.Combine(_vaultRoot, "Health");
        Directory.CreateDirectory(src);
        Directory.CreateDirectory(dst);
        File.WriteAllText(Path.Combine(src, "note.md"), "content");

        var result = BuildController().MoveNote("Inbox", "note.md", new MoveNoteRequest { TargetCategory = "Health" });

        Assert.IsType<OkObjectResult>(result);
        Assert.False(File.Exists(Path.Combine(src, "note.md")));
        Assert.True(File.Exists(Path.Combine(dst, "note.md")));
    }

    [Fact(DisplayName = "MoveNote returns 409 when target file already exists")]
    public void MoveNote_Returns409_OnConflict()
    {
        var src = Path.Combine(_vaultRoot, "Inbox");
        var dst = Path.Combine(_vaultRoot, "Health");
        Directory.CreateDirectory(src);
        Directory.CreateDirectory(dst);
        File.WriteAllText(Path.Combine(src, "note.md"), "src");
        File.WriteAllText(Path.Combine(dst, "note.md"), "dst"); // conflict

        var result = BuildController().MoveNote("Inbox", "note.md", new MoveNoteRequest { TargetCategory = "Health" });
        Assert.IsType<ConflictObjectResult>(result);
    }

    // ── RenameNote ────────────────────────────────────────────────────────────

    [Fact(DisplayName = "RenameNote appends .md extension if missing")]
    public void RenameNote_AppendsMdExtension()
    {
        var catDir = Path.Combine(_vaultRoot, "Work");
        Directory.CreateDirectory(catDir);
        File.WriteAllText(Path.Combine(catDir, "old.md"), "content");

        var result = BuildController().RenameNote("Work", "old.md", new RenameNoteRequest { NewName = "renamed" }) as OkObjectResult;
        Assert.NotNull(result);
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("renamed.md", json);
        Assert.True(File.Exists(Path.Combine(catDir, "renamed.md")));
    }
}

/// <summary>
/// Testable subclass that accepts an explicit vault path instead of resolving from CWD.
/// </summary>
internal sealed class TestableTaxonomyController : TaxonomyController
{
    public TestableTaxonomyController(string vaultPath) : base(vaultPath) { }
}
