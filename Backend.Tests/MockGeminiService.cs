using System.Collections.Generic;
using System.Threading.Tasks;
using Backend.Services;

namespace Backend.Tests;

/// <summary>
/// Hand-rolled IGeminiService mock. Provide a queue of responses in order.
/// Each call to GenerateAsync or GenerateMultimodalAsync dequeues the next response.
/// Configure ThrowOnNext to have the next call throw a GeminiException instead.
/// </summary>
public sealed class MockGeminiService : IGeminiService
{
    private readonly Queue<System.Func<string>> _responses = new();

    public MockGeminiService Enqueue(string json)
    {
        _responses.Enqueue(() => json);
        return this;
    }

    public MockGeminiService EnqueueThrow(int statusCode = 500, string body = "Simulated Gemini failure")
    {
        _responses.Enqueue(() => throw new GeminiException(statusCode, body));
        return this;
    }

    public Task<string> GenerateAsync(
        string systemPrompt,
        string userPayload,
        string responseMimeType = "application/json",
        double temperature = 0.2)
    {
        if (_responses.Count == 0)
            return Task.FromResult(string.Empty);

        return Task.FromResult(_responses.Dequeue()());
    }

    public Task<string> GenerateMultimodalAsync(
        string systemPrompt,
        string userPayload,
        string fileMimeType,
        string fileBase64,
        string responseMimeType = "application/json",
        double temperature = 0.2)
    {
        return GenerateAsync(systemPrompt, userPayload, responseMimeType, temperature);
    }
}
