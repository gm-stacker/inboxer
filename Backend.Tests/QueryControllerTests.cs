using System;
using System.IO;
using System.Threading.Tasks;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Backend.Controllers;
using Xunit;

namespace Backend.Tests;

public sealed class QueryControllerTests : IDisposable
{
    private readonly string _vaultRoot;

    public QueryControllerTests()
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
                new KeyValuePair<string, string?>("VaultPath", _vaultRoot)
            })
            .Build();

    private QueryController BuildController(MockGeminiService gemini) =>
        new(gemini, MakeConfig());

    private static AdvancedQueryRequest StandardReq(string msg, string mode = "standard") =>
        new()
        {
            Messages = new List<QueryMessage> { new() { Role = "user", Content = msg } },
            Mode = mode
        };

    [Fact(DisplayName = "ExecuteQuery returns 400 when messages list is empty")]
    public async Task ExecuteQuery_Returns400_WhenNoMessages()
    {
        var gemini = new MockGeminiService();
        var result = await BuildController(gemini).ExecuteQuery(new AdvancedQueryRequest { Messages = new() });
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact(DisplayName = "ExecuteQuery returns structured summary on success")]
    public async Task ExecuteQuery_ReturnsStructuredResponse()
    {
        var gemini = new MockGeminiService().Enqueue(
            """{"summary":"Your LDL is trending down."}""");

        var result = await BuildController(gemini).ExecuteQuery(StandardReq("Show my cholesterol")) as OkObjectResult;
        Assert.NotNull(result);

        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("LDL", json);
    }

    [Fact(DisplayName = "ExecuteQuery temporal mode response includes trend field")]
    public async Task ExecuteQuery_TemporalMode_IncludesTrend()
    {
        var gemini = new MockGeminiService().Enqueue(
            """{"summary":"Cholesterol improving.","trend":"LDL declining over 3 months"}""");

        var result = await BuildController(gemini).ExecuteQuery(StandardReq("LDL trend", "temporal")) as OkObjectResult;
        Assert.NotNull(result);

        var response = result!.Value as AdvancedQueryResponse;
        Assert.NotNull(response?.Trend);
        Assert.Contains("declining", response!.Trend);
    }

    [Fact(DisplayName = "ExecuteQuery returns fallback message when Gemini returns empty string")]
    public async Task ExecuteQuery_HandlesEmptyGeminiResponse()
    {
        var gemini = new MockGeminiService().Enqueue(string.Empty);
        var result = await BuildController(gemini).ExecuteQuery(StandardReq("any question")) as OkObjectResult;
        Assert.NotNull(result);
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("empty response", json.ToLower());
    }

    [Fact(DisplayName = "ExecuteQuery returns 500 when Gemini throws")]
    public async Task ExecuteQuery_Returns500_OnGeminiException()
    {
        var gemini = new MockGeminiService().EnqueueThrow(503, "Service unavailable");
        var result = await BuildController(gemini).ExecuteQuery(StandardReq("hi")) as ObjectResult;
        Assert.Equal(500, result?.StatusCode);
    }
}
