using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Backend.Services
{
    /// <summary>
    /// All Gemini API communication lives here.
    /// To change the model, update Gemini:ModelName in appsettings.json — no code changes needed.
    /// </summary>
    public interface IGeminiService
    {
        /// <summary>Text-only generation. Returns the raw response string (markdown stripped).</summary>
        Task<string> GenerateAsync(
            string systemPrompt,
            string userPayload,
            string responseMimeType = "application/json",
            double temperature = 0.2);

        /// <summary>Multimodal generation (image / file + text). Returns the raw response string.</summary>
        Task<string> GenerateMultimodalAsync(
            string systemPrompt,
            string userPayload,
            string fileMimeType,
            string fileBase64,
            string responseMimeType = "application/json",
            double temperature = 0.2);
    }

    public class GeminiService : IGeminiService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<GeminiService> _logger;
        private readonly string _apiKey;
        private readonly string _modelName;

        private readonly int _timeoutSeconds;

        private string ApiUrl => $"https://generativelanguage.googleapis.com/v1beta/models/{_modelName}:generateContent?key={_apiKey}";

        public GeminiService(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<GeminiService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _apiKey = configuration["Gemini:ApiKey"] ?? throw new InvalidOperationException("Gemini:ApiKey is not configured.");
            _modelName = configuration["Gemini:ModelName"] ?? "gemini-3.1-flash";
            _timeoutSeconds = configuration.GetValue<int>("Gemini:TimeoutSeconds", 30);
            _logger.LogInformation("GeminiService initialised with model: {Model}, timeout: {Timeout}s", _modelName, _timeoutSeconds);
        }

        public Task<string> GenerateAsync(
            string systemPrompt,
            string userPayload,
            string responseMimeType = "application/json",
            double temperature = 0.2)
        {
            var requestBody = BuildRequest(systemPrompt, userPayload, null, null, responseMimeType, temperature);
            return CallApiAsync(requestBody);
        }

        public Task<string> GenerateMultimodalAsync(
            string systemPrompt,
            string userPayload,
            string fileMimeType,
            string fileBase64,
            string responseMimeType = "application/json",
            double temperature = 0.2)
        {
            var requestBody = BuildRequest(systemPrompt, userPayload, fileMimeType, fileBase64, responseMimeType, temperature);
            return CallApiAsync(requestBody);
        }

        // ── Private Helpers ───────────────────────────────────────────────────

        private object BuildRequest(
            string systemPrompt,
            string userPayload,
            string? fileMimeType,
            string? fileBase64,
            string responseMimeType,
            double temperature)
        {
            // Build the parts array — text always first, file inline_data appended when provided
            object[] parts = fileMimeType != null && fileBase64 != null
                ? new object[]
                  {
                      new { text = userPayload },
                      new { inline_data = new { mime_type = fileMimeType, data = fileBase64 } }
                  }
                : new object[]
                  {
                      new { text = userPayload }
                  };

            // Only set responseMimeType when caller wants json (some callers pass "text/plain")
            object generationConfig = responseMimeType == "text/plain"
                ? (object)new { temperature }
                : new { temperature, response_mime_type = responseMimeType };

            return new
            {
                system_instruction = new { parts = new { text = systemPrompt } },
                contents = new[] { new { parts } },
                generationConfig
            };
        }

        private async Task<string> CallApiAsync(object requestBody)
        {
            var client = _httpClientFactory.CreateClient();
            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(_timeoutSeconds));
            var response = await client.PostAsync(ApiUrl, content, cts.Token);
            var responseBody = await response.Content.ReadAsStringAsync(cts.Token);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Gemini API error {Status}: {Body}", (int)response.StatusCode, responseBody);
                throw new GeminiException((int)response.StatusCode, responseBody);
            }

            // Extract text from Gemini response envelope
            using var doc = JsonDocument.Parse(responseBody);
            var text = doc.RootElement
                          .GetProperty("candidates")[0]
                          .GetProperty("content")
                          .GetProperty("parts")[0]
                          .GetProperty("text")
                          .GetString();

            if (string.IsNullOrWhiteSpace(text))
                return string.Empty;

            // Strip markdown code fences if the model added them despite the mime-type hint
            text = Regex.Replace(text, @"```json\s*", "");
            text = Regex.Replace(text, @"```\s*$", "");

            return text.Trim();
        }
    }

    /// <summary>Thrown when the Gemini API returns a non-2xx response.</summary>
    public class GeminiException : Exception
    {
        public int StatusCode { get; }
        public string ResponseBody { get; }

        public GeminiException(int statusCode, string responseBody)
            : base($"Gemini API returned {statusCode}: {responseBody}")
        {
            StatusCode = statusCode;
            ResponseBody = responseBody;
        }
    }
}
