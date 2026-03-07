using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using System.Text;
using System;
using System.Linq;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChatController : ControllerBase
    {
        private readonly IGeminiService _gemini;
        private readonly string _vaultPath;

        public ChatController(IGeminiService gemini, IConfiguration config)
        {
            _gemini = gemini;
            _vaultPath = config.GetValue<string>("VaultPath") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop", "inboxer_vault");
        }

        [HttpPost]
        public async Task<IActionResult> Post([FromBody] ChatRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Message)) return BadRequest("message is required.");

            // Step 1: Classify Message
            var classification = await ClassifyMessageAsync(request.Message);

            // Step 2: Retrieve Relevant Notes
            var relevantContext = await RetrieveTopNotesAsync(request.Message, classification);

            // Step 3: Generate Persona Response
            var historyText = string.Join("\n", request.ConversationHistory.Select(h => $"{h.Role.ToUpper()}: {h.Content}"));
            
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

You are a warm, highly observant personal assistant who remembers everything the user has ever journalled or recorded in their markdown vault.
The user is speaking to you casually (the 'Ambient Contextual Chat').

Your instructions:
1. Respond to their latest message naturally and conversationally.
2. If relevant, PROACTIVELY surface connections from their vault notes. E.g., if they mention going to Tokyo, and you see a note about a restaurant they wanted to try there, mention it! If they mention an event, and you see relevant notes from the past, bring them up.
3. Keep the tone warm, concise, and helpful. Do not sound like a robot reading a database.
4. If you decide to proactively remind them of a specific, actionable item from their notes (like an open task or a specific recommendation they saved), you MUST format it as a `[FLAG]` block at the very end of your response. 
   Format: `[FLAG] Your specific reminder here.`
   **IMPORTANT**: If your `[FLAG]` block or suggestions do not contain at least one fact, threshold, regulation, or consideration that is NOT mentioned anywhere in the user's notes, rewrite it until it does. Use the notes as raw data to reason from, not content to summarise back.
5. You can output multiple `[FLAG]` blocks if needed, but only for truly notable/actionable things.

Example Response:
Oh, have a great time in Tokyo! I remember you mentioning you were really looking forward to it. It looks like you'll be there during cherry blossom season.

[FLAG] You have an open task to book tickets for the Ghibli Museum.
[FLAG] Don't forget, Sarah recommended that ramen place in Shinjuku!";

            var userPayload = $@"SYSTEM CURRENT DATE: {DateTime.Now:yyyy-MM-dd HH:mm}

--- CONVERSATION HISTORY ---
{historyText}

--- RELEVANT VAULT NOTES (For your context) ---
{relevantContext}

--- NEW USER MESSAGE ---
{request.Message}";

            try
            {
                // Chat uses plain text response (no JSON mime type)
                var aiReply = await _gemini.GenerateAsync(systemPrompt, userPayload, "text/plain", 0.5);

                // Step 4: Parse Flags
                var flags = new List<string>();
                var cleanReply = new StringBuilder();
                
                var lines = aiReply.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var line in lines)
                {
                    var trimmed = line.Trim();
                    if (trimmed.StartsWith("[FLAG]", StringComparison.OrdinalIgnoreCase))
                        flags.Add(trimmed.Substring(6).Trim());
                    else
                        cleanReply.AppendLine(line);
                }

                return Ok(new ChatResponse 
                { 
                    Reply = cleanReply.ToString().Trim(),
                    Flags = flags
                });
            }
            catch (GeminiException ex)
            {
                return StatusCode(500, $"Gemini API error ({ex.StatusCode}): {ex.ResponseBody}");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error executing conversational chat: {ex.Message}");
            }
        }

        private async Task<MessageClassification> ClassifyMessageAsync(string message)
        {
            var prompt = @"Classify the following user message into one or more of these categories:
- PLAN: user is stating something they intend to do
- EVENT: user is describing something that happened
- STATEMENT: general observation or musing
- QUESTION: user is asking something

Also extract any key 'entities' (people, places, topics) and the 'timeframe' mentioned (e.g., 'next week', 'yesterday').

Return strictly this JSON schema:
{
  ""categories"": [""PLAN"", ""QUESTION""],
  ""entities"": [""Tokyo"", ""Sarah""],
  ""timeframe"": ""next week""
}";
            try
            {
                var text = await _gemini.GenerateAsync(prompt, message, "application/json", 0.1);
                return JsonSerializer.Deserialize<MessageClassification>(text, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new MessageClassification();
            }
            catch
            {
                return new MessageClassification();
            }
        }

        private async Task<string> RetrieveTopNotesAsync(string message, MessageClassification classification)
        {
            if (!Directory.Exists(_vaultPath)) return string.Empty;

            var files = Directory.GetFiles(_vaultPath, "*.md", SearchOption.AllDirectories);
            var scoredNotes = new List<(string Content, double Score)>();
            var messageParts = message.ToLowerInvariant().Split(new[] { ' ', '.', ',', '?', '!' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var file in files)
            {
                var fileInfo = new FileInfo(file);
                var content = await System.IO.File.ReadAllTextAsync(file);
                var contentLower = content.ToLowerInvariant();
                double score = 0;

                foreach (var entity in classification.Entities)
                    if (contentLower.Contains(entity.ToLowerInvariant())) score += 5;

                foreach (var part in messageParts)
                    if (part.Length > 3 && contentLower.Contains(part)) score += 1;

                var daysOld = (DateTime.Now - fileInfo.LastWriteTime).TotalDays;
                score += (1.0 / (daysOld + 1.0));

                if (score > 0.5)
                {
                    var categoryFolder = fileInfo.Directory?.Name ?? "Unknown";
                    scoredNotes.Add(($"--- File: {categoryFolder}/{Path.GetFileName(file)} ---\n{content}\n", score));
                }
            }

            var topNotes = scoredNotes.OrderByDescending(n => n.Score).Take(15).Select(n => n.Content);
            return string.Join("\n\n", topNotes);
        }
    }

    public class ChatRequest
    {
        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;
        
        [JsonPropertyName("conversationHistory")]
        public List<ChatTurn> ConversationHistory { get; set; } = new List<ChatTurn>();
    }

    public class ChatTurn 
    {
        [JsonPropertyName("role")]
        public string Role { get; set; } = string.Empty;
        
        [JsonPropertyName("content")]
        public string Content { get; set; } = string.Empty;
    }

    public class ChatResponse 
    {
        [JsonPropertyName("reply")]
        public string Reply { get; set; } = string.Empty;
        
        [JsonPropertyName("flags")]
        public List<string> Flags { get; set; } = new List<string>();
    }

    public class MessageClassification
    {
        [JsonPropertyName("categories")]
        public List<string> Categories { get; set; } = new List<string>();
        [JsonPropertyName("entities")]
        public List<string> Entities { get; set; } = new List<string>();
        [JsonPropertyName("timeframe")]
        public string Timeframe { get; set; } = string.Empty;
    }
}
