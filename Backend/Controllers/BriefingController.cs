using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System;
using System.Linq;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class BriefingController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly string _vaultPath;

        public BriefingController(IConfiguration config, IHttpClientFactory httpClientFactory)
        {
            _config = config;
            _httpClientFactory = httpClientFactory;
            _vaultPath = _config.GetValue<string>("VaultPath") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop", "inboxer_vault");
        }

        [HttpGet]
        public async Task<IActionResult> GetBriefing()
        {
            var apiKey = _config["Gemini:ApiKey"];
            if (string.IsNullOrEmpty(apiKey)) return StatusCode(500, "Gemini API key missing");

            var vaultContext = await GetBriefingContextAsync();

            var client = _httpClientFactory.CreateClient();
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={apiKey}";

            var systemPrompt = @"You are a proactive personal assistant. Based on the user's vault notes, generate a concise morning briefing. Structure it as follows:

1. **Tasks & Reminders** — list any open tasks, upcoming dates, or flagged items. Include how many days until due if a date is present.
   Task surfacing rules:
   - Always include tasks that have an explicit due date or deadline set in their frontmatter.
   - Only include undated tasks if there is a related note containing a CONCRETE time anchor — meaning a specific date, a named day, or a relative timeframe with clear imminence (e.g. ""next Tuesday"", ""this weekend"", ""next week"", ""in 3 days"", ""on the 5th"").
   - Vague future intent does NOT qualify as a time anchor. Phrases like ""soon"", ""one day"", ""eventually"", ""I want to"", ""I'd like to"", ""planning to"" without a specific timeframe must be ignored for this purpose.
   - If no concrete time anchor exists for an undated task, do not surface it in the briefing regardless of topic relevance.
   - If a task is surfaced due to a concrete time anchor, the inline reason must quote or paraphrase the actual timeframe from the note — e.g. ""you're flying next week"" not ""you're planning to travel soon"".
2. **Patterns This Week** — one or two sentences on any recurring themes, health signals, or unresolved topics visible across this week's notes.
3. **Suggested Focus** — one actionable suggestion for today based on what you see in the notes.

Rules:
- Be concise. The entire briefing should be readable in under 30 seconds.
- Never invent data. Only reference what is explicitly in the provided notes.
- If there is nothing notable, say so plainly rather than padding the response.
- Dates should be human-readable (e.g. ""Thu 19 Mar"") not ISO format.

CRITICAL TASK FILTERING RULES:
You will be penalized if you include ANY undated task that is not semantically linked to a recent time-anchored event. If it is linked, you MUST append the reason to the string. Failure to append the reason or failure to omit unrelated undated tasks is a failure.

- Output MUST be a valid JSON object matching this exact schema:
{
  ""analysis"": ""First, explicitly list each task found in the notes, decide if it has a due date or a linked event, and state whether it will be INCLUDED or EXCLUDED based on the strict filtering rules."",
  ""tasks"": [""Task 1 string"", ""Task 2 string""],
  ""patterns"": ""One or two sentences summarizing patterns"",
  ""focus"": ""One actionable suggestion""
}";

            var userPayload = $@"SYSTEM CURRENT DATE: {DateTime.Now:yyyy-MM-dd HH:mm}

User's Notes from the Past 14 Days & Open Tasks:
{vaultContext}";

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
                    return StatusCode(500, $"Gemini API error: {jsonStr}");

                using var doc = JsonDocument.Parse(jsonStr);
                var contentText = doc.RootElement
                                      .GetProperty("candidates")[0]
                                      .GetProperty("content")
                                      .GetProperty("parts")[0]
                                      .GetProperty("text")
                                      .GetString();

                if (string.IsNullOrWhiteSpace(contentText))
                    return Ok(new BriefingResponse { Patterns = "The AI returned an empty response." });

                var cleanJson = Regex.Replace(contentText, @"```json\s*", "");
                cleanJson = Regex.Replace(cleanJson, @"```\s*$", "");

                var resultObj = JsonSerializer.Deserialize<BriefingResponse>(cleanJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                return Ok(resultObj ?? new BriefingResponse { Patterns = "Failed to parse AI response." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error executing briefing: {ex.Message}");
            }
        }

        private async Task<string> GetBriefingContextAsync()
        {
            try
            {
                if (!Directory.Exists(_vaultPath)) return string.Empty;

                var files = Directory.GetFiles(_vaultPath, "*.md", SearchOption.AllDirectories);
                var notesContext = new List<string>();
                var thresholdDate = DateTime.Now.AddDays(-14);

                foreach (var file in files)
                {
                    var fileInfo = new FileInfo(file);
                    var content = await System.IO.File.ReadAllTextAsync(file);
                    var lastModified = fileInfo.LastWriteTime;

                    bool isRecent = lastModified >= thresholdDate;
                    
                    // Simple open task detection: check if file claims to be a task type in frontmatter, 
                    // and doesn't have a completion marker like '[x]' or 'Completed on'
                    bool isOpenTask = content.Contains("type: task") && !content.Contains("[x]") && !content.Contains("Completed on");

                    if (isRecent || isOpenTask)
                    {
                        var categoryFolder = fileInfo.Directory?.Name ?? "Unknown";
                        notesContext.Add($"--- File: {categoryFolder}/{Path.GetFileName(file)} | Last Modified: {lastModified:yyyy-MM-dd HH:mm:ss} ---\n{content}\n");
                    }
                }
                
                return string.Join("\n\n", notesContext);
            }
            catch (Exception)
            {
                return string.Empty;
            }
        }
    }

    public class BriefingResponse 
    {
        [JsonPropertyName("tasks")]
        public List<string> Tasks { get; set; } = new List<string>();
        
        [JsonPropertyName("patterns")]
        public string Patterns { get; set; } = string.Empty;
        
        [JsonPropertyName("focus")]
        public string Focus { get; set; } = string.Empty;
    }
}
