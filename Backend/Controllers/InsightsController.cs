using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class InsightsController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly string _vaultPath;

        public InsightsController(IConfiguration config, IHttpClientFactory httpClientFactory)
        {
            _config = config;
            _httpClientFactory = httpClientFactory;
            _vaultPath = _config.GetValue<string>("VaultPath") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop", "inboxer_vault");
        }

        [HttpPost("echoes")]
        public async Task<IActionResult> GenerateEchoes([FromBody] EchoesRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Content))
                return BadRequest("Content cannot be empty");

            var pastNotesCtx = await GetVaultContextAsync(request.ExcludeFilename);
            
            var apiKey = _config["Gemini:ApiKey"];
            if (string.IsNullOrEmpty(apiKey)) return StatusCode(500, "Gemini API key missing");

            var client = _httpClientFactory.CreateClient();
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={apiKey}";

            var systemPrompt = @"You are a memory synthesis engine. 
Read the context of `past_notes`, then read the `target_note`.
If the `target_note` shares strong contextual relevance to anything in `past_notes` (e.g., repeating a past task, contradicting a past journal entry, or progressing a past metric), describe that connection.
Generate a list of brief, actionable insights connecting the two. Provide your response ONLY as a JSON array of strings. Do not include markdown blocks or other text.
Example: [""On March 5 you did X, which aligns with Y""]";

            var userPayload = $@"past_notes:
{pastNotesCtx}

target_note:
{request.Content}";

            var geminiRequest = new
            {
                system_instruction = new { parts = new { text = systemPrompt } },
                contents = new[] { new { parts = new[] { new { text = userPayload } } } },
                generationConfig = new
                {
                    temperature = 0.2,
                    response_mime_type = "application/json"
                }
            };

            try
            {
                var requestContent = new StringContent(JsonSerializer.Serialize(geminiRequest), Encoding.UTF8, "application/json");
                var response = await client.PostAsync(url, requestContent);
                var jsonStr = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                    return StatusCode(500, $"Gemini error: {jsonStr}");

                using var doc = JsonDocument.Parse(jsonStr);
                var contentText = doc.RootElement
                                      .GetProperty("candidates")[0]
                                      .GetProperty("content")
                                      .GetProperty("parts")[0]
                                      .GetProperty("text")
                                      .GetString();

                if (string.IsNullOrWhiteSpace(contentText))
                    return Ok(new string[0]);

                var cleanJson = Regex.Replace(contentText, @"```json\s*", "");
                cleanJson = Regex.Replace(cleanJson, @"```\s*$", "");

                var array = JsonSerializer.Deserialize<string[]>(cleanJson) ?? Array.Empty<string>();
                return Ok(array);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error generating echoes: {ex.Message}");
            }
        }

        private async Task<string> GetVaultContextAsync(string excludeFilename)
        {
            try
            {
                if (!Directory.Exists(_vaultPath)) return string.Empty;

                var files = Directory.GetFiles(_vaultPath, "*.md", SearchOption.AllDirectories);
                var notesContext = new List<string>();

                foreach (var file in files)
                {
                    if (!string.IsNullOrEmpty(excludeFilename) && file.EndsWith(excludeFilename))
                        continue;

                    var fileInfo = new FileInfo(file);
                    var categoryFolder = fileInfo.Directory?.Name ?? "Unknown";
                    var content = await System.IO.File.ReadAllTextAsync(file);
                    notesContext.Add($"File: {categoryFolder}/{Path.GetFileName(file)}\nContent:\n{content}\n");
                }
                
                return string.Join("\n---\n", notesContext);
            }
            catch (Exception)
            {
                return string.Empty;
            }
        }
    }

    public class EchoesRequest
    {
        public string Content { get; set; } = string.Empty;
        public string ExcludeFilename { get; set; } = string.Empty;
    }
}
