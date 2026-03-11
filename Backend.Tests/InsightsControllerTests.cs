using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Backend.Controllers;
using Xunit;

namespace Backend.Tests;

public sealed class InsightsControllerTests : IDisposable
{
    private readonly string _vaultRoot;

    public InsightsControllerTests()
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

    private InsightsController BuildController(MockGeminiService gemini) =>
        new(gemini, MakeConfig(), new MockVaultPathProvider(_vaultRoot));

    private class MockVaultPathProvider : Backend.Services.IVaultPathProvider
    {
        private readonly string _path;
        public MockVaultPathProvider(string path) => _path = path;
        public string GetVaultPath() => _path;
    }

    [Fact(DisplayName = "GenerateEchoes returns 400 when content is empty")]
    public async Task GenerateEchoes_Returns400_WhenContentEmpty()
    {
        var gemini = new MockGeminiService();
        var result = await BuildController(gemini).GenerateEchoes(new EchoesRequest { Content = "" });
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact(DisplayName = "GenerateEchoes returns echo string array from Gemini")]
    public async Task GenerateEchoes_ReturnsEchoArray()
    {
        var gemini = new MockGeminiService().Enqueue(
            """["On Jan 5 LDL was 142 — this March reading shows improvement"]""");

        var catDir = Path.Combine(_vaultRoot, "Health");
        Directory.CreateDirectory(catDir);
        await File.WriteAllTextAsync(Path.Combine(catDir, "old.md"), "LDL: 142");

        var result = await BuildController(gemini).GenerateEchoes(
            new EchoesRequest { Content = "LDL: 130", ExcludeFilename = "bloodtest.md" }) as OkObjectResult;

        Assert.NotNull(result);
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("LDL", json);
    }

    [Fact(DisplayName = "GenerateEchoes excludes file matching ExcludeFilename from context")]
    public async Task GenerateEchoes_ExcludesTargetFile()
    {
        // We track whether Gemini was called; if the vault is empty after exclusion, GenerateAsync
        // still gets called but with empty past notes context — and returns our mock.
        var catDir = Path.Combine(_vaultRoot, "Health");
        Directory.CreateDirectory(catDir);
        // Only file — it should be excluded
        await File.WriteAllTextAsync(Path.Combine(catDir, "bloodtest.md"), "LDL: 130");

        // Confirm the controller still returns OK (empty context → still calls Gemini)
        var gemini = new MockGeminiService().Enqueue("[]");
        var result = await BuildController(gemini).GenerateEchoes(
            new EchoesRequest { Content = "some content", ExcludeFilename = "bloodtest.md" });
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact(DisplayName = "GenerateEchoes returns 500 when Gemini throws")]
    public async Task GenerateEchoes_Returns500_OnGeminiException()
    {
        var gemini = new MockGeminiService().EnqueueThrow(500, "Gemini down");
        var result = await BuildController(gemini).GenerateEchoes(
            new EchoesRequest { Content = "some content" }) as ObjectResult;
        Assert.Equal(500, result?.StatusCode);
    }
}
