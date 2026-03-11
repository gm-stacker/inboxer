using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CaptureController : ControllerBase
    {
        private readonly string _vaultPath;
        private readonly IGeminiService _gemini;
        private readonly ILogger<CaptureController> _logger;
        private readonly IVaultWriteLocker _writeLocker;
        private readonly IVaultCacheService _cacheService;

        public CaptureController(
            IConfiguration configuration, 
            IGeminiService gemini, 
            ILogger<CaptureController> logger,
            IVaultPathProvider pathProvider,
            IVaultWriteLocker writeLocker,
            IVaultCacheService cacheService)
        {
            _gemini = gemini;
            _logger = logger;
            _vaultPath = pathProvider.GetVaultPath();
            _writeLocker = writeLocker;
            _cacheService = cacheService;

            if (!Directory.Exists(_vaultPath))
                Directory.CreateDirectory(_vaultPath);
        }

        // ── POST /api/capture ─────────────────────────────────────────────────

        [HttpPost]
        public async Task<IActionResult> Post([FromBody] CaptureRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.RawText))
                return BadRequest("raw_text is required.");

            var taxonomy = Directory.GetDirectories(_vaultPath).Select(Path.GetFileName).ToArray();
            var currentTimeSgt = DateTime.UtcNow.AddHours(8).ToString("yyyy-MM-ddTHH:mm:sszzz");
            var pastNotesCtx = await GetVaultContextAsync();

            var systemPrompt = @"Role: You are the Taxonomy Routing Engine for a local-first markdown knowledge base. Your job is to analyze incoming user text, extract metadata, calculate relative time occurrences, cross-reference past notes, and determine the correct folder destination.

Routing Rules:
- Prioritize Existing Taxonomy: Map raw_text to an existing category in the current_taxonomy if there is a reasonable semantic match.
- Threshold for Creation: Only create a new category if the raw_text represents a distinctly new domain. Use PascalCase with underscores (e.g., Home_Maintenance).
- Metrics & Event Timing: If the user describes an event happening relatively (e.g., 'today took 40mins'), you MUST calculate the literal Date and exact Time based off the `current_datetime`. 
- Medical Data Extraction: Extract physiological metrics, blood test panels (e.g. LDL/HDL/Triglycerides for cholesterol), or other health readings into the structured `metrics` metadata, and place the file under 'Health'.
- Wine Extraction: If the user describes wine, you MUST extract it into a structured `wine` object. Include `country_of_origin`, `region`, `vintage` (as an integer if possible), `grape_varieties` (as an array of strings), and `characteristics` (as an array of strings like tasting notes).
- CRITICAL: For wine, DO NOT put wine attributes in `metrics`. Use the `wine` block exclusively.
- Memory Echoes / Footnotes: Read through `past_notes`. If the new `raw_text` shares strong contextual relevance, describe that connection in a footnote list payload as an array of strings. 
  - QUALITY GUIDELINES: 
    - Prioritize utility (health trends, task dependencies, deep knowledge connections). 
    - AVOID TRIVIALITY: Do not generate insights based on superficial geographical or weather overlaps (e.g., ""You visited Spain once and this is Spanish wine""). 
    - Maintain a professional, non-judgmental tone. 
    - Explain *why* the connection matters and provide actionable insights.
- Task Auto-Completion (`updates`): If the user's `raw_text` indicates they just finished a task that exists in `past_notes` (e.g. ""I collected the basil today""), YOU MUST provide an update object to check off the old task. Set `source_file` to the File name from `past_notes` (e.g. `Tasks/CollectBasil.md`). Set `exact_search` to the exact markdown string (e.g. `Need to collect basil in 2 weeks' time`). Set `replace_with` to what it should become, such as `- [x] Need to collect basil in 2 weeks' time (Completed on [current_datetime])`. Always append `(Completed on ...)` so the user has a record of when it was done.
- Duplicate Detection: If this new `raw_text` seems to be logging the EXACT same task or information that already exists in `past_notes`, you must return the existing file name(s) in the `duplicates` string array.

Output Requirement:
You must respond ONLY with a valid JSON object. Do not include markdown formatting, conversational text, or explanations. Use the following schema:
{
  ""action"": ""ROUTE"" | ""CREATE_CATEGORY"",
  ""target_category"": ""Name of existing or newly created category"",
  ""confidence_score"": 0.0 to 1.0,
  ""suggested_filename"": ""BriefDescriptionWithoutDate"",
  ""frontmatter"": {
    ""type"": ""note"" | ""task"" | ""health_metric"" | ""wine_note"",
    ""tags"": [""extracted"", ""keywords""],
    ""extracted_date"": ""YYYY-MM-DD"" | null,
    ""entities"": [""Spain"", ""JB""] | [],
    ""metrics"": {""bp"": ""120/65"", ""ldl"": 130, ""hdl"": 45, ""duration_mins"": 40, ""calculated_time"": ""hh:mm""} | {},
    ""wine"": {
      ""country_of_origin"": ""France"",
      ""region"": ""Bordeaux"",
      ""vintage"": 2018,
      ""grape_varieties"": [""Merlot"", ""Cabernet Sauvignon""],
      ""characteristics"": [""oak"", ""blackberry"", ""tannic""]
    }
  },
  ""footnotes"": [""In March 2025, you visited Spain and noted that the weather was miserable and rainy.""] | [],
  ""updates"": [
    {
      ""source_file"": ""Category/Filename.md"",
      ""exact_search"": ""Need to collect basil in 2 weeks' time"",
      ""replace_with"": ""- [x] Need to collect basil in 2 weeks' time (Completed on 2026-03-05)""
    }
  ],
  ""duplicates"": [""Category/Filename.md""] | []
}";

            var userPayload = $@"current_taxonomy: [{string.Join(", ", taxonomy)}]
current_datetime: {currentTimeSgt}
past_notes:
{pastNotesCtx}

raw_text: {request.RawText}";

            try
            {
                var textResponse = await _gemini.GenerateAsync(systemPrompt, userPayload, "application/json", 0.2);

                if (string.IsNullOrWhiteSpace(textResponse))
                    return StatusCode(500, "Empty response from Gemini.");

                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
                };
                var routingData = JsonSerializer.Deserialize<GeminiRoutingResponse>(textResponse, options);

                if (routingData == null)
                    return StatusCode(500, "Failed to parse Gemini response.");

                if (routingData.ConfidenceScore < 0.6m)
                {
                    routingData.TargetCategory = "Inbox";
                    var tagsList = routingData.Frontmatter.Tags?.ToList() ?? new List<string>();
                    tagsList.Add("requires_review");
                    routingData.Frontmatter.Tags = tagsList.ToArray();
                }

                if (string.IsNullOrWhiteSpace(routingData.SuggestedFilename) || routingData.SuggestedFilename == "BriefDescriptionWithoutDate")
                    routingData.SuggestedFilename = "Note_" + Guid.NewGuid().ToString("N").Substring(0, 4);

                // Apply AI-generated note updates (task completions etc.)
                if (routingData.Updates != null && routingData.Updates.Any())
                {
                    foreach (var update in routingData.Updates)
                    {
                        try
                        {
                            var updatePath = Path.Combine(_vaultPath, update.SourceFile);
                            if (System.IO.File.Exists(updatePath))
                            {
                                var existingContent = await System.IO.File.ReadAllTextAsync(updatePath);
                                if (!string.IsNullOrWhiteSpace(update.ExactSearch) && existingContent.Contains(update.ExactSearch))
                                {
                                    var newContent = existingContent.Replace(update.ExactSearch, update.ReplaceWith);
                                    
                                    await _writeLocker.WaitAsync();
                                    try
                                    {
                                        var tempPath = updatePath + ".tmp";
                                        await System.IO.File.WriteAllTextAsync(tempPath, newContent);
                                        System.IO.File.Replace(tempPath, updatePath, updatePath + ".bak");
                                        _logger.LogInformation("Vault write: {Operation} on {Filename} at {Timestamp}", "Apply AI Note Update", update.SourceFile, DateTime.UtcNow);
                                    }
                                    catch
                                    {
                                        var tempPath = updatePath + ".tmp";
                                        if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath);
                                        throw;
                                    }
                                    finally
                                    {
                                        _writeLocker.Release();
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning("Failed to apply update to {File}: {Error}", update.SourceFile, ex.Message);
                        }
                    }
                }

                await ProcessAndSaveMarkdownFile(request.RawText, routingData);
                return Ok(new { message = "Capture saved successfully.", details = routingData });
            }
            catch (GeminiException ex)
            {
                return StatusCode(500, $"Gemini API error ({ex.StatusCode}): {ex.ResponseBody}");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error during capture: {ex.Message}");
            }
        }

        // ── POST /api/capture/upload ──────────────────────────────────────────

        [HttpPost("upload")]
        public async Task<IActionResult> Upload([FromForm] IFormFile file, [FromForm] string? description, [FromForm] string? category)
        {
            if (file == null || file.Length == 0)
                return BadRequest("file is required.");

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            var fileBytes = ms.ToArray();
            var base64File = Convert.ToBase64String(fileBytes);
            var mimeType = file.ContentType;

            var taxonomy = Directory.GetDirectories(_vaultPath).Select(Path.GetFileName).ToArray();
            var currentTimeSgt = DateTime.UtcNow.AddHours(8).ToString("yyyy-MM-ddTHH:mm:sszzz");
            var pastNotesCtx = await GetVaultContextAsync();

            var systemPrompt = @"Role: You are the Taxonomy Routing Engine for a local-first markdown knowledge base. Your job is to analyze incoming user files (images or documents) along with an optional user description, extract metadata, calculate relative time occurrences, cross-reference past notes, and determine the correct folder destination.
CRITICAL RULE: The user-provided description represents their direct intent and MUST be treated as higher-confidence context (ground truth) than the extracted content from the file.

Routing Rules:
- Prioritize Existing Taxonomy: Map the content to an existing category if there is a reasonable semantic match.
- Threshold for Creation: Only create a new category if it represents a distinctly new domain. Use PascalCase with underscores.
- Metrics & Event Timing: Calculate literal Date and Time based on `current_datetime`.
- Medical Data Extraction: Extract physiological metrics, blood test panels into `metrics` metadata, under 'Health'.
- Wine Extraction: If the file or description describes wine, you MUST extract it into a structured `wine` object. Include `country_of_origin`, `region`, `vintage` (as integer), `grape_varieties` (array), and `characteristics` (array).
- CRITICAL: For wine, DO NOT put wine attributes in `metrics`. Use the `wine` block exclusively.
- Memory Echoes / Footnotes: If the new content shares strong contextual relevance with `past_notes`, describe that connection in `footnotes`.
  - QUALITY GUIDELINES: 
    - Prioritize utility (health trends, task dependencies, deep knowledge connections). 
    - AVOID TRIVIALITY: Do not generate insights based on superficial geographical or weather overlaps. 
    - Maintain a professional, non-judgmental tone.
    - Explain *why* the connection matters and provide actionable insights.
- Extracted Text: Provide a transcription or summary of the file's content in `extracted_text`. 
- CRITICAL: The `extracted_text` MUST ONLY contain new information found in the file. DO NOT REPEAT any part of the `User Description` in the `extracted_text` field. If the file contains no new information beyond the description, leave `extracted_text` empty.

VISUAL REASONING — CALENDAR GRIDS: When analyzing calendar grids to determine start and end dates, rely strictly on geometric alignment and the full visual extent of the event markers:

Event Marker Anatomy: Event bars consist of a solid colored block containing the text label, followed by a lighter, semi-transparent continuous horizontal band. You MUST evaluate the total length of the entire marker (solid block + semi-transparent band). Do not calculate the end date based solely on the solid text block.
Start Date: Locate the exact vertical grid line where the event's colored bar begins. The start date is the specific day cell immediately to the right of that leading edge.
End Date: Trace the lighter, semi-transparent band to its absolute end. Locate the exact vertical grid line where this band terminates. The end date is the specific day cell immediately to the left of that trailing edge.
Multi-Week Events: If an event's semi-transparent band extends to the right edge of the calendar and continues on the subsequent row, apply the start logic to the initial segment and the end logic to the final segment on the lower row.

Output Requirement:
You must respond ONLY with a valid JSON object. Do not include conversational text or markdown blocks outside the JSON. Use the following schema:
{
  ""action"": ""ROUTE"" | ""CREATE_CATEGORY"",
  ""target_category"": ""Name of existing or newly created category"",
  ""confidence_score"": 0.0 to 1.0,
  ""suggested_filename"": ""BriefDescriptionWithoutDate"",
  ""frontmatter"": {
    ""type"": ""note"" | ""task"" | ""health_metric"" | ""wine_note"",
    ""tags"": [""extracted"", ""keywords""],
    ""extracted_date"": ""YYYY-MM-DD"" | null,
    ""entities"": [""Spain""] | [],
    ""metrics"": {""amount"": ""27.60""} | {},
    ""wine"": {
      ""country_of_origin"": ""France"",
      ""region"": ""Rioja"",
      ""vintage"": 2018,
      ""grape_varieties"": [""Tempranillo""],
      ""characteristics"": [""smooth"", ""spicy""]
    }
  },
  ""footnotes"": [""Contextual insight""] | [],
  ""updates"": [],
  ""duplicates"": [],
  ""extracted_text"": ""Extracted text from the file goes here.""
}";

            var userPayload = $@"current_taxonomy: [{string.Join(", ", taxonomy)}]
current_datetime: {currentTimeSgt}
past_notes:
{pastNotesCtx}

User Description (HIGH PRIORITY GROUND TRUTH): {(string.IsNullOrWhiteSpace(description) ? "None provided" : description)}";

            try
            {
                var textResponse = await _gemini.GenerateMultimodalAsync(systemPrompt, userPayload, mimeType, base64File, "application/json", 0.2);

                if (string.IsNullOrWhiteSpace(textResponse))
                    return StatusCode(500, "Empty response from Gemini.");

                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
                };
                GeminiRoutingResponse? routingData;
                try
                {
                    routingData = JsonSerializer.Deserialize<GeminiRoutingResponse>(textResponse, options);
                }
                catch (Exception ex)
                {
                    _logger.LogError("Failed to deserialize Gemini response: {Error}. Raw: {Raw}", ex.Message, textResponse);
                    return StatusCode(500, $"Failed to parse Gemini response: {ex.Message}");
                }

                if (routingData == null)
                    return StatusCode(500, "Failed to parse Gemini response.");

                if (!string.IsNullOrEmpty(category))
                    routingData.TargetCategory = category;
                else if (routingData.ConfidenceScore < 0.6m)
                {
                    routingData.TargetCategory = "Inbox";
                    var tagsList = routingData.Frontmatter.Tags?.ToList() ?? new List<string>();
                    tagsList.Add("requires_review");
                    routingData.Frontmatter.Tags = tagsList.ToArray();
                }

                if (string.IsNullOrWhiteSpace(routingData.SuggestedFilename) || routingData.SuggestedFilename == "BriefDescriptionWithoutDate")
                    routingData.SuggestedFilename = "Upload_" + Guid.NewGuid().ToString("N").Substring(0, 4);

                // Save raw file to category folder
                string categoryPath = Path.Combine(_vaultPath, routingData.TargetCategory);
                if (!Directory.Exists(categoryPath))
                    Directory.CreateDirectory(categoryPath);

                string safeFileName = Guid.NewGuid().ToString("N").Substring(0, 6) + "_" + file.FileName.Replace(" ", "_");
                string savedFilePath = Path.Combine(categoryPath, safeFileName);
                
                await _writeLocker.WaitAsync();
                try
                {
                    var tempFilePath = savedFilePath + ".tmp";
                    await System.IO.File.WriteAllBytesAsync(tempFilePath, fileBytes);
                    System.IO.File.Move(tempFilePath, savedFilePath, overwrite: true);
                    _logger.LogInformation("Vault write: {Operation} on {Filename} at {Timestamp}", "Save Uploaded Media", safeFileName, DateTime.UtcNow);
                }
                catch
                {
                    var tempFilePath = savedFilePath + ".tmp";
                    if (System.IO.File.Exists(tempFilePath)) System.IO.File.Delete(tempFilePath);
                    throw;
                }
                finally
                {
                    _writeLocker.Release();
                }

                _cacheService.RemoveByPrefix("taxonomy_list");
                _cacheService.Remove($"category_notes:{routingData.TargetCategory}");

                // Build note body
                string noteBody = "";
                if (!string.IsNullOrWhiteSpace(description))
                    noteBody += $"{description}\n\n";

                string embedSyntax = mimeType.StartsWith("image") ? $"![[{safeFileName}]]" : $"[[{safeFileName}]]";
                noteBody += $"{embedSyntax}\n\n";

                var cleanExtracted = routingData.ExtractedText?.Trim() ?? "";
                if (!string.IsNullOrWhiteSpace(description) && cleanExtracted.StartsWith(description.Trim()))
                    cleanExtracted = cleanExtracted.Substring(description.Trim().Length).Trim();

                noteBody += $"{cleanExtracted}\n";
                await ProcessAndSaveMarkdownFile(noteBody, routingData);

                return Ok(new { message = "File captured successfully.", details = routingData });
            }
            catch (GeminiException ex)
            {
                return StatusCode(500, $"Gemini API error ({ex.StatusCode}): {ex.ResponseBody}");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error during file upload: {ex.Message}");
            }
        }

        // ── GET /api/capture/media/{category}/{filename} ──────────────────────

        [HttpGet("media/{category}/{filename}")]
        public async Task<IActionResult> GetMedia(string category, string filename)
        {
            try
            {
                string safeFileName = Path.GetFileName(filename);
                if (safeFileName.EndsWith(".HEIC.jpg", StringComparison.OrdinalIgnoreCase) || safeFileName.EndsWith(".HEIC.jpeg", StringComparison.OrdinalIgnoreCase))
                {
                    safeFileName = safeFileName.Substring(0, safeFileName.LastIndexOf(".jpg", StringComparison.OrdinalIgnoreCase));
                    if (safeFileName.EndsWith(".HEIC.jpeg", StringComparison.OrdinalIgnoreCase))
                        safeFileName = safeFileName.Substring(0, safeFileName.LastIndexOf(".jpeg", StringComparison.OrdinalIgnoreCase));
                }

                string catPath = Path.Combine(_vaultPath, category);
                string fullPath = Path.Combine(catPath, safeFileName);

                if (!System.IO.File.Exists(fullPath))
                    return NotFound();

                string ext = Path.GetExtension(safeFileName).ToLowerInvariant();

                if (ext == ".heic")
                {
                    string tempJpg = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString() + ".jpg");
                    var process = new System.Diagnostics.Process()
                    {
                        StartInfo = new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = "sips",
                            Arguments = $"-s format jpeg \"{fullPath}\" --out \"{tempJpg}\"",
                            RedirectStandardOutput = true,
                            RedirectStandardError = true,
                            UseShellExecute = false,
                            CreateNoWindow = true,
                        }
                    };
                    process.Start();
                    await process.WaitForExitAsync();
                    if (System.IO.File.Exists(tempJpg))
                    {
                        byte[] bytes = await System.IO.File.ReadAllBytesAsync(tempJpg);
                        System.IO.File.Delete(tempJpg);
                        return File(bytes, "image/jpeg");
                    }
                }

                string contentType = ext switch
                {
                    ".jpg" or ".jpeg" => "image/jpeg",
                    ".png" => "image/png",
                    ".gif" => "image/gif",
                    ".webp" => "image/webp",
                    ".pdf" => "application/pdf",
                    _ => "application/octet-stream"
                };

                return PhysicalFile(fullPath, contentType);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // ── POST /api/capture/query ───────────────────────────────────────────

        [HttpPost("query")]
        public async Task<IActionResult> Query([FromBody] CaptureChatRequest request)
        {
            if (request.Messages == null || !request.Messages.Any())
                return BadRequest("messages array is required.");

            var pastNotesCtx = await GetVaultContextAsync();

            var systemPrompt = @"Role: You are a thoughtful sleep health assistant embedded in a personal sleep journal app. You have access to the user's sleep journal entries.

Output Requirement:
You MUST respond ONLY with a valid JSON object. Do not include markdown blocks, conversational text, or explanations outside the JSON format.
Use the following exact schema:
{
  ""summary"": ""A synthesized, paragraph-style response answering their question directly."",
  ""timeline"": [
    {
       ""date"": ""YYYY-MM-DD"",
       ""event"": ""A brief description of what happened that day relating to the query"",
       ""source_file"": ""Category/Filename.md""
    }
  ],
  ""undetermined_items"": [
    {
       ""event"": ""A brief description of a task or event that has NO specific date attached to it"",
       ""source_file"": ""Category/Filename.md""
    }
  ]
}

Semantic Grouping Rule for Timeline:
When events are logically connected across multiple days, group them into a single timeline event block using the starting date.
Extract the `File: ` name from the past_notes context and provide it as `source_file` in the format `Category/Filename.md` so the UI can link to it. If you can't determine it, leave it blank.
For items that have no specific date (like an ongoing task without a deadline), place them ONLY in `undetermined_items`, not `timeline`.
CRITICAL: You MUST extract EVERY individual task or event discussed into either the `timeline` array (if it has a date) or the `undetermined_items` array (if it has no specific date). Do not leave any out.

CONVERSATION RULES:
1. You are in an ongoing CONVERSATION with full context of everything discussed. Never re-summarize prior messages or re-cite journal entries already mentioned unless explicitly asked.
2. Build forward. If a follow-up references something already covered, answer it directly without restating background.
3. Reason and advise freely. You are not a search engine — draw on patterns across entries AND general sleep health knowledge to give practical, opinionated answers.
4. On recommendations (e.g. ""should I increase X?""): give a direct, nuanced answer. Cite your reasoning from the data, then add relevant knowledge. Don't refuse because ""it's not in the vault.""
5. Be concise. No padding, no repetition across messages.
6. Proactively surface patterns if you notice them — don't wait to be asked.
7. Tone: warm, direct, like a knowledgeable friend — not clinical or robotic.
8. If you are answering a direct follow-up question, DO NOT include a `timeline` array unless there are NEW events to surface that haven't been mentioned in the previous turns of the chat.";

            var userPayload = $@"JOURNAL ENTRIES (most recent first):
{pastNotesCtx}

Conversation History:
{string.Join("\n\n", request.Messages.Select(m => $"{m.Role.ToUpper()}:\n{m.Content}"))}";

            try
            {
                var textResponse = await _gemini.GenerateAsync(systemPrompt, userPayload, "application/json", 0.2);

                if (string.IsNullOrWhiteSpace(textResponse))
                    return StatusCode(500, "Empty response from Gemini.");

                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
                };
                var queryResult = JsonSerializer.Deserialize<GeminiQueryResponse>(textResponse, options);
                return Ok(queryResult);
            }
            catch (GeminiException ex)
            {
                return StatusCode(500, $"Gemini API error ({ex.StatusCode}): {ex.ResponseBody}");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Failed to parse structured JSON: {ex.Message}");
            }
        }

        // ── POST /api/capture/conversation ────────────────────────────────────

        [HttpPost("conversation")]
        public async Task<IActionResult> SaveConversation([FromBody] CaptureRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.RawText))
                return BadRequest("raw_text is required.");

            string categoryPath = Path.Combine(_vaultPath, "Conversations");
            if (!Directory.Exists(categoryPath))
                Directory.CreateDirectory(categoryPath);

            string filename = $"ChatLog_{DateTime.Now:yyyyMMdd_HHmmss}.md";
            string filePath = Path.Combine(categoryPath, filename);

            string yamlFrontmatter = "---" + Environment.NewLine +
                                     "type: chat_log" + Environment.NewLine +
                                     "tags: [ai, conversation]" + Environment.NewLine +
                                     "---" + Environment.NewLine + Environment.NewLine;

            await _writeLocker.WaitAsync();
            try
            {
                var tempPath = filePath + ".tmp";
                await System.IO.File.WriteAllTextAsync(tempPath, yamlFrontmatter + request.RawText);
                System.IO.File.Move(tempPath, filePath, overwrite: true);
                _logger.LogInformation("Vault write: {Operation} on {Filename} at {Timestamp}", "Save AI Conversation", filename, DateTime.UtcNow);
            }
            catch
            {
                var tempPath = filePath + ".tmp";
                if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath);
                throw;
            }
            finally
            {
                _writeLocker.Release();
            }

            _cacheService.RemoveByPrefix("taxonomy_list");
            _cacheService.Remove("category_notes:Conversations");

            return Ok(new { message = "Conversation saved successfully.", filename });
        }

        // ── Private Helpers ───────────────────────────────────────────────────

        private async Task ProcessAndSaveMarkdownFile(string rawText, GeminiRoutingResponse routingData)
        {
            string categoryPath = Path.Combine(_vaultPath, routingData.TargetCategory);
            if (!Directory.Exists(categoryPath))
                Directory.CreateDirectory(categoryPath);

            string filePath = Path.Combine(categoryPath, $"{routingData.SuggestedFilename}.md");

            var tagsObj = routingData.Frontmatter.Tags?.Any() == true
                ? $"[{string.Join(", ", routingData.Frontmatter.Tags)}]"
                : "[]";
            var entitiesObj = routingData.Frontmatter.Entities?.Any() == true
                ? $"[{string.Join(", ", routingData.Frontmatter.Entities)}]"
                : "[]";

            string metricsJson = "{}";
            if (routingData.Frontmatter.Metrics != null && routingData.Frontmatter.Metrics.Any())
                metricsJson = JsonSerializer.Serialize(routingData.Frontmatter.Metrics);

            string wineYaml = "";
            if (routingData.Frontmatter.Wine != null && routingData.Frontmatter.Wine.Any())
            {
                wineYaml = "wine:" + Environment.NewLine;
                foreach (var kvp in routingData.Frontmatter.Wine)
                {
                    var value = kvp.Value;
                    if (value is System.Text.Json.JsonElement element)
                    {
                        if (element.ValueKind == JsonValueKind.Array)
                        {
                            var list = element.EnumerateArray().Select(e => e.ToString()).ToList();
                            wineYaml += $"  {kvp.Key}: [{string.Join(", ", list)}]" + Environment.NewLine;
                        }
                        else if (element.ValueKind == JsonValueKind.Number)
                            wineYaml += $"  {kvp.Key}: {element.GetRawText()}" + Environment.NewLine;
                        else
                            wineYaml += $"  {kvp.Key}: {element}" + Environment.NewLine;
                    }
                    else
                        wineYaml += $"  {kvp.Key}: {value}" + Environment.NewLine;
                }
            }

            string yamlFrontmatter = "---" + Environment.NewLine +
                                     $"type: {routingData.Frontmatter.Type}" + Environment.NewLine +
                                     $"tags: {tagsObj}" + Environment.NewLine +
                                     (routingData.Frontmatter.ExtractedDate != null ? $"extracted_date: {routingData.Frontmatter.ExtractedDate}{Environment.NewLine}" : "") +
                                     $"metrics: {metricsJson}" + Environment.NewLine +
                                     $"entities: {entitiesObj}" + Environment.NewLine +
                                     wineYaml +
                                     "---" + Environment.NewLine + Environment.NewLine;

            await _writeLocker.WaitAsync();
            try
            {
                var tempPath = filePath + ".tmp";
                await System.IO.File.WriteAllTextAsync(tempPath, yamlFrontmatter + rawText);
                
                if (System.IO.File.Exists(filePath))
                {
                    System.IO.File.Replace(tempPath, filePath, filePath + ".bak");
                }
                else
                {
                    System.IO.File.Move(tempPath, filePath, overwrite: true);
                }
                
                if (_logger != null)
                {
                    _logger.LogInformation("Vault write: {Operation} on {Filename} at {Timestamp}", "Process Capture Note", $"{routingData.SuggestedFilename}.md", DateTime.UtcNow);
                }
            }
            catch
            {
                var tempPath = filePath + ".tmp";
                if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath);
                throw;
            }
            finally
            {
                _writeLocker.Release();
            }

            _cacheService.RemoveByPrefix("taxonomy_list");
            _cacheService.Remove($"category_notes:{routingData.TargetCategory}");
        }

        private async Task<string> GetVaultContextAsync()
        {
            try
            {
                var files = Directory.GetFiles(_vaultPath, "*.md", SearchOption.AllDirectories);
                var notesContext = new List<string>();

                foreach (var file in files)
                {
                    var fileInfo = new FileInfo(file);
                    var categoryFolder = fileInfo.Directory?.Name ?? "Unknown";
                    var content = await System.IO.File.ReadAllTextAsync(file);
                    notesContext.Add($"File: {categoryFolder}/{Path.GetFileName(file)}\nContent:\n{content}\n");
                }

                return string.Join("\n---\n", notesContext);
            }
            catch (Exception ex)
            {
                _logger.LogError("Error reading vault: {Error}", ex.Message);
                return string.Empty;
            }
        }
    }

    // ── Request / Response Models ─────────────────────────────────────────────

    public class CaptureRequest
    {
        [JsonPropertyName("raw_text")]
        public string RawText { get; set; } = string.Empty;
    }

    public class CaptureChatRequest
    {
        [JsonPropertyName("messages")]
        public List<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
    }

    public class ChatMessage
    {
        [JsonPropertyName("role")]
        public string Role { get; set; } = string.Empty;
        
        [JsonPropertyName("content")]
        public string Content { get; set; } = string.Empty;
    }

    public class GeminiRoutingResponse
    {
        public string Action { get; set; } = string.Empty;
        public string TargetCategory { get; set; } = string.Empty;
        public decimal ConfidenceScore { get; set; }
        public string SuggestedFilename { get; set; } = string.Empty;
        public FrontmatterConfig Frontmatter { get; set; } = new FrontmatterConfig();
        public string[] Footnotes { get; set; } = Array.Empty<string>();
        [JsonPropertyName("updates")]
        public List<NoteUpdate> Updates { get; set; } = new List<NoteUpdate>();
        [JsonPropertyName("duplicates")]
        public string[] Duplicates { get; set; } = Array.Empty<string>();
        [JsonPropertyName("visual_reasoning")]
        public string VisualReasoning { get; set; } = string.Empty;
        [JsonPropertyName("extracted_text")]
        public string ExtractedText { get; set; } = string.Empty;
    }

    public class NoteUpdate
    {
        [JsonPropertyName("source_file")]
        public string SourceFile { get; set; } = string.Empty;
        [JsonPropertyName("exact_search")]
        public string ExactSearch { get; set; } = string.Empty;
        [JsonPropertyName("replace_with")]
        public string ReplaceWith { get; set; } = string.Empty;
    }

    public class FrontmatterConfig
    {
        public string Type { get; set; } = string.Empty;
        public string[] Tags { get; set; } = Array.Empty<string>();
        public string? ExtractedDate { get; set; }
        public string[] Entities { get; set; } = Array.Empty<string>();
        [JsonPropertyName("metrics")]
        public Dictionary<string, object> Metrics { get; set; } = new Dictionary<string, object>();
        [JsonPropertyName("wine")]
        public Dictionary<string, object> Wine { get; set; } = new Dictionary<string, object>();
    }

    public class GeminiQueryResponse
    {
        [JsonPropertyName("summary")]
        public string Summary { get; set; } = string.Empty;
        [JsonPropertyName("timeline")]
        public List<GeminiTimelineEvent> Timeline { get; set; } = new List<GeminiTimelineEvent>();
        [JsonPropertyName("undetermined_items")]
        public List<GeminiUndeterminedItem> UndeterminedItems { get; set; } = new List<GeminiUndeterminedItem>();
    }

    public class GeminiTimelineEvent
    {
        [JsonPropertyName("date")]
        public string Date { get; set; } = string.Empty;
        [JsonPropertyName("event")]
        public string Event { get; set; } = string.Empty;
        [JsonPropertyName("source_file")]
        public string SourceFile { get; set; } = string.Empty;
    }

    public class GeminiUndeterminedItem
    {
        [JsonPropertyName("event")]
        public string Event { get; set; } = string.Empty;
        [JsonPropertyName("source_file")]
        public string SourceFile { get; set; } = string.Empty;
    }
}
