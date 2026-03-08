using System;
using System.IO;
using System.Threading.Tasks;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Backend.Controllers;
using Xunit;

namespace Backend.Tests;

public sealed class ChatControllerTests : IDisposable
{
    private readonly string _vaultRoot;

    public ChatControllerTests()
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

    private ChatController BuildController(MockGeminiService gemini) =>
        new(gemini, MakeConfig());

    private static ChatRequest Req(string message) =>
        new() { Message = message, ConversationHistory = new List<ChatTurn>() };

    [Fact(DisplayName = "Post returns 400 when message is empty")]
    public async Task Post_Returns400_WhenMessageEmpty()
    {
        var gemini = new MockGeminiService();
        var result = await BuildController(gemini).Post(new ChatRequest { Message = "" });
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact(DisplayName = "Post parses [FLAG] blocks into flags array")]
    public async Task Post_ParsesFlags_FromAiResponse()
    {
        // ClassifyMessageAsync + main GenerateAsync — two calls
        var gemini = new MockGeminiService()
            .Enqueue("""{"categories":["STATEMENT"],"entities":[],"timeframe":""}""")   // classify
            .Enqueue("Nice!\n[FLAG] Don't forget to call the dentist.");                  // main reply

        var result = await BuildController(gemini).Post(Req("Hello")) as OkObjectResult;
        Assert.NotNull(result);

        var chat = result!.Value as ChatResponse;
        Assert.NotNull(chat);
        Assert.Single(chat!.Flags);
        Assert.Contains("dentist", chat.Flags[0]);
    }

    [Fact(DisplayName = "Post strips [FLAG] lines from the reply field")]
    public async Task Post_StripsFlags_FromReply()
    {
        var gemini = new MockGeminiService()
            .Enqueue("""{"categories":["STATEMENT"],"entities":[],"timeframe":""}""")
            .Enqueue("Hello there!\n[FLAG] Something important.");

        var result = await BuildController(gemini).Post(Req("Hi")) as OkObjectResult;
        var chat = result!.Value as ChatResponse;

        Assert.NotNull(chat);
        Assert.DoesNotContain("[FLAG]", chat!.Reply, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Hello there", chat.Reply);
    }

    [Fact(DisplayName = "Post returns empty flags when AI response has no [FLAG] lines")]
    public async Task Post_ReturnsReply_WithNoFlags()
    {
        var gemini = new MockGeminiService()
            .Enqueue("""{"categories":["QUESTION"],"entities":[],"timeframe":""}""")
            .Enqueue("Sure, I can help with that.");

        var result = await BuildController(gemini).Post(Req("Can you help?")) as OkObjectResult;
        var chat = result!.Value as ChatResponse;

        Assert.NotNull(chat);
        Assert.Empty(chat!.Flags);
        Assert.Equal("Sure, I can help with that.", chat.Reply);
    }

    [Fact(DisplayName = "Post returns 500 when Gemini throws on the main call")]
    public async Task Post_Returns500_OnGeminiException()
    {
        var gemini = new MockGeminiService()
            .Enqueue("""{"categories":[],"entities":[],"timeframe":""}""") // classify succeeds
            .EnqueueThrow(500, "Internal Gemini error");                       // main call throws

        var result = await BuildController(gemini).Post(Req("Hello")) as ObjectResult;
        Assert.Equal(500, result?.StatusCode);
    }
}
