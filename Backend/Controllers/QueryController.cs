using Microsoft.AspNetCore.Mvc;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class QueryController : ControllerBase
    {
        private readonly IGeminiService _gemini;
        private readonly string _vaultPath;

        public QueryController(IGeminiService gemini, Microsoft.Extensions.Configuration.IConfiguration config)
        {
            _gemini = gemini;
            _vaultPath = config.GetValue<string>("VaultPath") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop", "inboxer_vault");
        }

        [HttpPost]
        public async Task<IActionResult> ExecuteQuery([FromBody] AdvancedQueryRequest request)
        {
            if (request.Messages == null || request.Messages.Count == 0)
                return BadRequest("Messages cannot be empty");

            var latestMessage = request.Messages[request.Messages.Count - 1].Content;
            var vaultContext = await GetVaultContextAsync();

            var systemPrompt = @"CRITICAL INSTRUCTION: Your primary job is to add expertise and insight that is NOT already in the user's notes. Never restate or summarise what the user has already written. If you find yourself writing something the user could have read directly from their own notes, stop and replace it with genuine domain knowledge instead.

Domain reasoning rules:
When the user's notes or statements touch on any of the following domains, apply expert-level reasoning beyond what is in the notes. Do not summarise — add value.

SLEEP & HEALTH:
- If sleep times, durations, or supplements are mentioned, reason about sleep science. Flag patterns like irregular sleep timing (more disruptive than duration), caffeine half-life, melatonin dosage thresholds (0.5mg–1mg is clinically effective; higher doses don't improve sleep quality and may cause grogginess), blue light, sleep debt accumulation.
- If bloodwork, medication, or health metrics appear, flag anything that warrants attention without diagnosing.

SHOPPING & PURCHASES:
- If specific products are mentioned with quantities or prices, reason about value, alternatives, or purchasing considerations the user may not have noted.
- Flag warranty, return policy, or import considerations if relevant to context.
- If buying for resale, flag margin, demand, or regulatory considerations.

WORK & PRODUCTIVITY:
- If deadlines, meetings, or projects are mentioned, surface scheduling conflicts, dependencies, or risks based on what is in the notes.
- If recurring patterns appear (e.g. always tired on Mondays, consistently missing a habit), name the pattern explicitly.

FINANCE & SPENDING:
- If purchases, budgets, or financial goals are mentioned, reason about whether the pattern is consistent with stated goals elsewhere in the notes.

FOOD & DINING:
- If restaurants, recipes, or dietary patterns are mentioned, surface relevant considerations (e.g. reservation lead times for popular venues, dietary conflicts, patterns in what the user enjoys).

TRAVEL:
- Flag regulatory, safety, and domain constraints:
  - Alipay and WeChat Pay require a Chinese bank card or foreign card linkage — set this up before the trip.
  - Power banks -> IATA carry-on restriction is strictly 100Wh without airline approval. Always carry on, never check in. Calculate capacity: Wh = mAh × V / 1000 (assume 3.7V for batteries).
  - Power bank quantities -> Quantities above 2 power banks may require explicit declaration or face confiscation.
  - Singapore Customs -> SGD 500 GST relief threshold for personal imports traveling > 48 hours (SGD 150 if < 48h). Electronics over this value must be declared.

General rule for all domains:
- Reference the user's actual data — specific quantities, dates, products, names from their notes. Use the notes as raw data to reason from, not content to summarise back.
- One specific insight grounded in their data is worth more than three generic tips.
- If you have nothing domain-specific to add, respond naturally without forcing advice.

You are a personal knowledge assistant. The user has provided a set of their own notes from their Obsidian vault. Your job is to answer their question by synthesizing information across all provided notes.

Rules:
- Always respond in natural language prose first, highlighting the key direct insight or answer from data.
- Where the data supports it, follow the prose with one or more embedded data tables in this exact markdown format:

[TABLE]
| Column 1 | Column 2 | Source File |
|----------|----------|-------------|
| value    | value    | Category/Filename.md |
[/TABLE]

- Use [TABLE] blocks for: time-series data (sleep logs, weight, mood over days), comparisons, ranked lists, or any repeating structured data across notes.
- Each [TABLE] block should have a plain-language caption immediately above it (e.g. ""Here is your sleep over the past week:"").
- **CRITICAL REQUIREMENT**: You MUST include a final column named exactly `Source File` in EVERY table. The value MUST be an EXACT copy-paste of the path shown in the `--- File: path/to/file.md | Last Modified... ---` header, including the exact folder (Category) and filename. Do not guess the category. Do not omit this under any circumstances.
- After tables, add a brief ""Patterns & Suggestions"" section if the data reveals anything notable.
  - **IMPORTANT**: If your Patterns & Suggestions section does not contain at least one fact, threshold, regulation, or consideration that is NOT mentioned anywhere in the user's notes, rewrite it until it does. Use the notes as raw data to reason from, not content to summarise back.
- If the notes do not contain enough data to answer the question, say so clearly and specify what kind of notes would help.
- **STRICT ANTI-HALLUCINATION**: You must NEVER create a table row for a date or data point that does not explicitly exist in the provided notes. When extracting data points or metrics (like amounts, dosages, times), you MUST quote the EXACT figures found in the notes. Do not round, assume, or hallucinate different numbers. Do not interpolate, do not fill in missing days, and do not guess. If there is no note for a specific day, skip it entirely. Every single row MUST trace back to a real `Source File`.
- Dates should always be rendered as human-readable (e.g. ""Thu 5 Mar"") not ISO format.
- Use explicit dates mentioned in text, the filename, or the 'Last Modified' metadata to resolve relative times like 'yesterday' or 'tonight'. Pay close attention to the system's current date below.
- Extract metric values from both the note body and the frontmatter `metrics` field.
- Your entire response MUST be returned as a JSON object matching this schema:
{
  ""summary"": ""Your full response including prose, [TABLE] blocks, and Patterns & Suggestions""";

            if (request.Mode == "temporal")
            {
                systemPrompt += @",
  ""trend"": ""A single sentence summarising the chronological direction or pattern""";
                systemPrompt += @"
}";
                systemPrompt += @"
                
The user is asking a pattern or trend question across time. In addition to the standard response format:
- Always include a time-series [TABLE] ordered chronologically, even if some dates have missing data (mark as ""—"")
- After the table, add the ""Trend"" sentence summarising direction (improving, declining, inconsistent) to the JSON `trend` property.
- If fewer than 3 data points exist, note this and tell the user what kind of notes would build a better picture in the `summary`.";
            }
            else
            {
                systemPrompt += @"
}";
            }

            var userPayload = $@"SYSTEM CURRENT DATE: {DateTime.Now:yyyy-MM-dd HH:mm}

Past Notes Context:
{vaultContext}

User Query:
{latestMessage}";

            try
            {
                var text = await _gemini.GenerateAsync(systemPrompt, userPayload, "application/json", 0.1);

                if (string.IsNullOrWhiteSpace(text))
                    return Ok(new AdvancedQueryResponse { Summary = "The AI returned an empty response." });

                var resultObj = JsonSerializer.Deserialize<AdvancedQueryResponse>(text, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                return Ok(resultObj ?? new AdvancedQueryResponse { Summary = "Failed to parse AI response." });
            }
            catch (GeminiException ex)
            {
                return StatusCode(500, $"Gemini API error ({ex.StatusCode}): {ex.ResponseBody}");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error executing query: {ex.Message}");
            }
        }

        private async Task<string> GetVaultContextAsync()
        {
            try
            {
                if (!Directory.Exists(_vaultPath)) return string.Empty;

                var files = Directory.GetFiles(_vaultPath, "*.md", SearchOption.AllDirectories);
                var notesContext = new System.Collections.Generic.List<string>();

                foreach (var file in files)
                {
                    var fileInfo = new FileInfo(file);
                    var categoryFolder = fileInfo.Directory?.Name ?? "Unknown";
                    var content = await System.IO.File.ReadAllTextAsync(file);
                    var lastModified = fileInfo.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss");
                    notesContext.Add($"--- File: {categoryFolder}/{Path.GetFileName(file)} | Last Modified: {lastModified} ---\n{content}\n");
                }

                return string.Join("\n\n", notesContext);
            }
            catch (Exception)
            {
                return string.Empty;
            }
        }
    }

    public class AdvancedQueryRequest
    {
        [JsonPropertyName("messages")]
        public List<QueryMessage> Messages { get; set; } = new List<QueryMessage>();
        
        [JsonPropertyName("mode")]
        public string Mode { get; set; } = "standard";
    }

    public class QueryMessage
    {
        [JsonPropertyName("role")]
        public string Role { get; set; } = string.Empty;
        
        [JsonPropertyName("content")]
        public string Content { get; set; } = string.Empty;
    }

    public class AdvancedQueryResponse 
    {
        [JsonPropertyName("summary")]
        public string Summary { get; set; } = string.Empty;
        
        [JsonPropertyName("trend")]
        public string? Trend { get; set; }
    }
}
