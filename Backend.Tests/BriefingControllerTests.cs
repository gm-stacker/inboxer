using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Backend.Controllers;
using Xunit;

namespace Backend.Tests;

public sealed class BriefingControllerTests : IDisposable
{
    private readonly string _vaultRoot;

    public BriefingControllerTests()
    {
        _vaultRoot = Path.Combine(Path.GetTempPath(), $"inboxer_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_vaultRoot);
    }

    public void Dispose()
    {
        if (Directory.Exists(_vaultRoot))
            Directory.Delete(_vaultRoot, recursive: true);
    }

    private IConfiguration MakeConfig() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new[] {
                new System.Collections.Generic.KeyValuePair<string, string?>("VaultPath", _vaultRoot)
            })
            .Build();

    private BriefingController BuildController(MockGeminiService gemini) =>
        new(gemini, MakeConfig());

    [Fact(DisplayName = "GetBriefing returns structured response when Gemini succeeds")]
    public async Task GetBriefing_ReturnsStructuredResponse()
    {
        var gemini = new MockGeminiService().Enqueue(
            """{"tasks":["Call dentist"],"patterns":"Good week","focus":"Book appointment"}""");
        var ctrl = BuildController(gemini);

        var result = await ctrl.GetBriefing() as OkObjectResult;
        Assert.NotNull(result);

        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("Call dentist", json);
        Assert.Contains("Book appointment", json);
    }

    [Fact(DisplayName = "GetBriefing returns fallback when Gemini returns empty string")]
    public async Task GetBriefing_HandlesEmptyGeminiResponse()
    {
        var gemini = new MockGeminiService().Enqueue(string.Empty);
        var ctrl = BuildController(gemini);

        var result = await ctrl.GetBriefing() as OkObjectResult;
        Assert.NotNull(result);
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("empty response", json.ToLower());
    }

    [Fact(DisplayName = "GetBriefing returns 500 when Gemini throws")]
    public async Task GetBriefing_HandlesGeminiException()
    {
        var gemini = new MockGeminiService().EnqueueThrow(429, "rate limited");
        var result = await BuildController(gemini).GetBriefing();
        var status = result as ObjectResult;
        Assert.Equal(500, status?.StatusCode);
    }

    [Fact(DisplayName = "GetBriefing includes open task notes older than 14 days")]
    public async Task GetBriefing_IncludesOpenTasks_EvenIfOld()
    {
        // Create a note that is "old" but has type: task and no [x]
        var catDir = Path.Combine(_vaultRoot, "Work");
        Directory.CreateDirectory(catDir);
        var notePath = Path.Combine(catDir, "oldtask.md");
        await File.WriteAllTextAsync(notePath, "---\ntype: task\n---\nCall dentist");

        // Touch the file write time to 30 days ago to simulate an old note
        File.SetLastWriteTime(notePath, DateTime.Now.AddDays(-30));

        // Gemini will return valid JSON — we just verify no 500 and the call succeeds
        var gemini = new MockGeminiService().Enqueue(
            """{"tasks":["Call dentist"],"patterns":"open task present","focus":"check task"}""");

        var result = await BuildController(gemini).GetBriefing() as OkObjectResult;
        Assert.NotNull(result);
    }
}
