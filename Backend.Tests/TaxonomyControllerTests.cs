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
    private class MockVaultCacheService : Backend.Services.IVaultCacheService
    {
        public Task<T> GetOrAddAsync<T>(string cacheKey, Func<Task<T>> factory) => factory();
        public void Remove(string cacheKey) { }
        public void RemoveByPrefix(string prefix) { }
    }

    private class MockVaultWriteLocker : Backend.Services.IVaultWriteLocker
    {
        public Task WaitAsync() => Task.CompletedTask;
        public void Release() { }
    }

    private TestableTaxonomyController BuildController() =>
        new(_vaultRoot, null, new MockVaultCacheService(), new MockVaultWriteLocker());

    // ── GetTaxonomy ───────────────────────────────────────────────────────────

    [Fact(DisplayName = "GetTaxonomy returns categories with note counts")]
    public async Task GetTaxonomy_ReturnsCategories()
    {
        var catDir = Path.Combine(_vaultRoot, "Health");
        Directory.CreateDirectory(catDir);
        File.WriteAllText(Path.Combine(catDir, "note1.md"), "# Note 1");
        File.WriteAllText(Path.Combine(catDir, "note2.md"), "# Note 2");

        var result = await BuildController().GetTaxonomy() as OkObjectResult;
        Assert.NotNull(result);

        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("Health", json);
        Assert.Contains("2", json); // NoteCount == 2
    }

    [Fact(DisplayName = "GetTaxonomy returns empty list when vault has no subdirectories")]
    public async Task GetTaxonomy_ReturnsEmpty_WhenVaultEmpty()
    {
        var result = await BuildController().GetTaxonomy() as OkObjectResult;
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

    [Fact(DisplayName = "DeleteNote archives file to per-category _archive subfolder")]
    public async Task DeleteNote_ArchivesToPerCategorySubfolder()
    {
        var catDir = Path.Combine(_vaultRoot, "Inbox");
        Directory.CreateDirectory(catDir);
        var filePath = Path.Combine(catDir, "temp.md");
        File.WriteAllText(filePath, "delete me");

        var result = await BuildController().DeleteNote("Inbox", "temp.md");
        Assert.IsType<OkObjectResult>(result);

        // Original file must be gone
        Assert.False(File.Exists(filePath));

        // Archived file must exist at {_vaultPath}/{category}/_archive/{filename}
        var expectedArchivePath = Path.Combine(_vaultRoot, "Inbox", "_archive", "temp.md");
        Assert.True(File.Exists(expectedArchivePath), $"Archived file not found at {expectedArchivePath}");

        // Verify content is preserved
        var archivedContent = await File.ReadAllTextAsync(expectedArchivePath);
        Assert.Equal("delete me", archivedContent);
    }

    [Fact(DisplayName = "DeleteNote returns 404 when file does not exist")]
    public async Task DeleteNote_Returns404_WhenNotFound()
    {
        Directory.CreateDirectory(Path.Combine(_vaultRoot, "Inbox"));
        var result = await BuildController().DeleteNote("Inbox", "ghost.md");
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
    // ── MarkNoteAsDone ────────────────────────────────────────────────────────

    [Fact(DisplayName = "MarkNoteAsDone adds done tag and done_at to frontmatter")]
    public async Task MarkNoteAsDone_AddsDoneTagAndTimestamp()
    {
        var catDir = Path.Combine(_vaultRoot, "Projects");
        Directory.CreateDirectory(catDir);
        var filePath = Path.Combine(catDir, "task.md");
        await File.WriteAllTextAsync(filePath, "---\ntype: task\ntags:\n  - work\n---\n\nDo the thing.\n");

        var result = await BuildController().MarkNoteAsDone("Projects", "task.md");
        Assert.IsType<OkObjectResult>(result);

        var content = await File.ReadAllTextAsync(filePath);
        Assert.Contains("- done", content);
        Assert.Contains("done_at:", content);
        // Body must be untouched
        Assert.Contains("Do the thing.", content);
    }

    [Fact(DisplayName = "MarkNoteAsDone is idempotent — does not duplicate done tag")]
    public async Task MarkNoteAsDone_Idempotent()
    {
        var catDir = Path.Combine(_vaultRoot, "Projects");
        Directory.CreateDirectory(catDir);
        var filePath = Path.Combine(catDir, "task2.md");
        await File.WriteAllTextAsync(filePath, "---\ntags:\n  - done\n---\n\nAlready done.\n");

        await BuildController().MarkNoteAsDone("Projects", "task2.md");
        var content = await File.ReadAllTextAsync(filePath);

        var doneCount = System.Text.RegularExpressions.Regex.Matches(content, "- done").Count;
        Assert.Equal(1, doneCount);
    }

    [Fact(DisplayName = "MarkNoteAsDone returns 404 when file does not exist")]
    public async Task MarkNoteAsDone_Returns404_WhenNotFound()
    {
        Directory.CreateDirectory(Path.Combine(_vaultRoot, "Projects"));
        var result = await BuildController().MarkNoteAsDone("Projects", "ghost.md");
        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact(DisplayName = "AddDoneToFrontmatter prepends frontmatter when note has none")]
    public void AddDoneToFrontmatter_HandlesMissingFrontmatter()
    {
        var content = "Just plain text without frontmatter.";
        var result = TaxonomyController.AddDoneToFrontmatter(content);
        Assert.Contains("tags:", result);
        Assert.Contains("- done", result);
        Assert.Contains("done_at:", result);
        Assert.Contains("Just plain text without frontmatter.", result);
    }

    // ── HasDoneTag ────────────────────────────────────────────────────────────

    [Fact(DisplayName = "HasDoneTag returns true when done tag is in frontmatter")]
    public void HasDoneTag_ReturnsTrue_WhenDoneTagPresent()
    {
        var content = "---\ntags:\n  - work\n  - done\n---\n\nBody text\n";
        Assert.True(TaxonomyController.HasDoneTag(content));
    }

    [Fact(DisplayName = "HasDoneTag returns false when done tag is not present")]
    public void HasDoneTag_ReturnsFalse_WhenNotTagged()
    {
        var content = "---\ntags:\n  - work\n---\n\nBody text\n";
        Assert.False(TaxonomyController.HasDoneTag(content));
    }

    [Fact(DisplayName = "HasDoneTag returns false for note with no frontmatter")]
    public void HasDoneTag_ReturnsFalse_WhenNoFrontmatter()
    {
        Assert.False(TaxonomyController.HasDoneTag("Just body text."));
    }
    // ── SearchNotes ───────────────────────────────────────────────────────

    [Fact(DisplayName = "SearchNotes returns note when query matches title (first heading)")]
    public async Task SearchNotes_MatchesTitle()
    {
        var catDir = Path.Combine(_vaultRoot, "Travel Planning");
        Directory.CreateDirectory(catDir);
        await File.WriteAllTextAsync(Path.Combine(catDir, "trip.md"),
            "# here are my travel dates\n\nLeaving on March 15th.");

        var results = await TaxonomyController.SearchNotes(_vaultRoot, "travel dates");

        Assert.Single(results);
        Assert.Equal("trip.md", results[0].Filename);
        Assert.Equal("Travel Planning", results[0].Category);
        Assert.Contains("travel dates", results[0].Title, StringComparison.OrdinalIgnoreCase);
    }

    [Fact(DisplayName = "SearchNotes returns note when query matches body text but not title")]
    public async Task SearchNotes_MatchesBodyText()
    {
        var catDir = Path.Combine(_vaultRoot, "Health");
        Directory.CreateDirectory(catDir);
        await File.WriteAllTextAsync(Path.Combine(catDir, "checkup.md"),
            "# Annual Checkup\n\nCholesterol level: 185 mg/dL. Blood pressure normal.");

        var results = await TaxonomyController.SearchNotes(_vaultRoot, "cholesterol");

        Assert.Single(results);
        Assert.Equal("checkup.md", results[0].Filename);
    }

    [Fact(DisplayName = "SearchNotes is case-insensitive")]
    public async Task SearchNotes_IsCaseInsensitive()
    {
        var catDir = Path.Combine(_vaultRoot, "Fitness");
        Directory.CreateDirectory(catDir);
        await File.WriteAllTextAsync(Path.Combine(catDir, "run.md"),
            "Completed a 5km run this morning.");

        var results = await TaxonomyController.SearchNotes(_vaultRoot, "5KM RUN");

        Assert.Single(results);
    }

    [Fact(DisplayName = "SearchNotes returns empty list when no notes match")]
    public async Task SearchNotes_ReturnsEmpty_WhenNoMatch()
    {
        var catDir = Path.Combine(_vaultRoot, "Work");
        Directory.CreateDirectory(catDir);
        await File.WriteAllTextAsync(Path.Combine(catDir, "meeting.md"), "# Quarterly Review\n\nBudget discussed.");

        var results = await TaxonomyController.SearchNotes(_vaultRoot, "xyzzy_no_match");

        Assert.Empty(results);
    }

    [Fact(DisplayName = "SearchNotes excludes notes that have the done tag")]
    public async Task SearchNotes_ExcludesDoneNotes()
    {
        var catDir = Path.Combine(_vaultRoot, "Projects");
        Directory.CreateDirectory(catDir);
        // Done note — should be hidden from search
        await File.WriteAllTextAsync(Path.Combine(catDir, "completed_task.md"),
            "---\ntags:\n  - done\n---\n\nThis project is about machine learning.");
        // Active note — should appear
        await File.WriteAllTextAsync(Path.Combine(catDir, "active_task.md"),
            "# Machine learning research\n\nStill ongoing.");

        var results = await TaxonomyController.SearchNotes(_vaultRoot, "machine learning");

        Assert.Single(results);
        Assert.Equal("active_task.md", results[0].Filename);
    }
}

/// <summary>
/// Testable subclass that accepts an explicit vault path instead of resolving from CWD.
/// </summary>
internal sealed class TestableTaxonomyController : TaxonomyController
{
    public TestableTaxonomyController(string vaultPath, Microsoft.Extensions.Logging.ILogger<TaxonomyController> logger = null, Backend.Services.IVaultCacheService cacheService = null, Backend.Services.IVaultWriteLocker writeLocker = null) 
        : base(vaultPath, logger, cacheService, writeLocker) { }
}
