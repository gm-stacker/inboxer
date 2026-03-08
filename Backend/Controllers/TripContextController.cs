using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using System;
using System.Linq;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TripContextController : ControllerBase
    {
        private readonly IGeminiService _gemini;
        private readonly string _vaultPath;

        public TripContextController(IGeminiService gemini, IConfiguration config)
        {
            _gemini = gemini;
            _vaultPath = config.GetValue<string>("VaultPath") ?? Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "vault"));
        }

        [HttpPost]
        public async Task<IActionResult> Post([FromBody] TripContextRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Destination))
                return BadRequest("destination is required.");

            var vaultContext = await GetRelevantVaultContextAsync(request.Destination);
            var dateStr = string.IsNullOrWhiteSpace(request.Date) ? "an upcoming date" : request.Date;

            var systemPrompt = $@"CRITICAL INSTRUCTION: Your primary job is to add expertise and insight that is NOT already in the user's notes. Never restate or summarise what the user has already written. If you find yourself writing something the user could have read directly from their own notes, stop and replace it with genuine domain knowledge instead.

The user is travelling to {request.Destination} on {dateStr}. Based on their personal notes, surface anything relevant to this trip. Structure the response strictly as a JSON object containing arrays of strings for each section:

Rules:
- Only include items where relevant notes exist. If a section is empty based on the notes, return an empty array for that JSON key.
- Never invent connections. Semantic proximity is allowed (e.g. airport -> duty free) but note when you are inferring rather than directly quoting.
- Keep it concise and scannable.
- Ensure the output strictly matches this JSON schema:

{{
  ""tasks"": [""Task 1"", ""Task 2""],
  ""pastExperiences"": [""Experience 1""],
  ""people"": [""Person 1""],
  ""prepare"": [""Item to bring 1""]
}}

Sections explanation:
1. **Tasks & Reminders** (`tasks`) — anything they noted they need to do at or near this destination
2. **Past Experiences** (`pastExperiences`) — anything they previously noted about this place (good or bad)
3. **People & Connections** (`people`) — any people in their notes associated with this location
4. **Bring or Prepare** (`prepare`) — Patterns & Suggestions rules:
   - Use the notes as raw data to reason from, not content to summarise back.
   - Reason about the specific items and product categories mentioned.
   - Apply real-world knowledge to add genuine value beyond what the notes contain. Think like a well-travelled, knowledgeable assistant who spots things the user may not have considered.
   - For each major theme you identify in the notes, ask: ""What does someone experienced in this area know that this person might not have thought of?"" Surface those insights.
   - Be specific and actionable.
   - Flag regulatory, safety, logistics, and explicit domain constraints:
     - Alipay and WeChat Pay require a Chinese bank card or foreign card linkage — set this up before the trip.
     - Power banks -> IATA carry-on restriction is strictly 100Wh without airline approval. Always carry on, never check in. Calculate capacity: Wh = mAh × V / 1000 (assume 3.7V for batteries).
     - Power bank quantities -> Quantities above 2 power banks may require explicit declaration or face confiscation.
     - Singapore Customs -> SGD 500 GST relief threshold for personal imports traveling > 48 hours (SGD 150 if < 48h). Electronics over this value must be declared.
   - Keep suggestions concise but substantive — one well-reasoned specific insight is worth more than three generic ones.
   - **IMPORTANT**: Your suggestions MUST contain at least one fact, threshold, regulation, or consideration that is NOT explicitly mentioned anywhere in the user's notes.
   - Maximum 4 suggestions. Prioritise by potential impact to the user if ignored.";

            var userPayload = $@"User's Notes:
{vaultContext}";

            try
            {
                var text = await _gemini.GenerateAsync(systemPrompt, userPayload, "application/json", 0.2);

                if (string.IsNullOrWhiteSpace(text))
                    return Ok(new TripContextResponse());

                var resultObj = JsonSerializer.Deserialize<TripContextResponse>(text, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                return Ok(resultObj ?? new TripContextResponse());
            }
            catch (GeminiException ex)
            {
                return StatusCode(500, $"Gemini API error ({ex.StatusCode}): {ex.ResponseBody}");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error executing trip context: {ex.Message}");
            }
        }

        private async Task<string> GetRelevantVaultContextAsync(string destination)
        {
            try
            {
                if (!Directory.Exists(_vaultPath)) return string.Empty;

                var files = Directory.GetFiles(_vaultPath, "*.md", SearchOption.AllDirectories);
                var notesContext = new List<string>();
                var searchTarget = destination.ToLowerInvariant();

                foreach (var file in files)
                {
                    var fileInfo = new FileInfo(file);
                    var content = await System.IO.File.ReadAllTextAsync(file);
                    var contentLower = content.ToLowerInvariant();

                    bool hasDestKeyword = contentLower.Contains(searchTarget);
                    bool hasTravelTag = contentLower.Contains("tags: [") && (contentLower.Contains("travel") || contentLower.Contains("trip"));
                    bool impliesLocation = contentLower.Contains("entities: [") && contentLower.Contains(searchTarget);

                    if (hasDestKeyword || hasTravelTag || impliesLocation)
                    {
                        var categoryFolder = fileInfo.Directory?.Name ?? "Unknown";
                        notesContext.Add($"--- File: {categoryFolder}/{Path.GetFileName(file)} ---\n{content}\n");
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

    public class TripContextRequest
    {
        [JsonPropertyName("destination")]
        public string Destination { get; set; } = string.Empty;
        
        [JsonPropertyName("date")]
        public string? Date { get; set; }
    }

    public class TripContextResponse 
    {
        [JsonPropertyName("tasks")]
        public List<string> Tasks { get; set; } = new List<string>();
        
        [JsonPropertyName("pastExperiences")]
        public List<string> PastExperiences { get; set; } = new List<string>();
        
        [JsonPropertyName("people")]
        public List<string> People { get; set; } = new List<string>();
        
        [JsonPropertyName("prepare")]
        public List<string> Prepare { get; set; } = new List<string>();
    }
}
