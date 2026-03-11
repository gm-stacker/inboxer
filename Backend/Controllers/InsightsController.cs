using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using System;
using Backend.Services;
using Microsoft.Extensions.Logging;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class InsightsController : ControllerBase
    {
        private readonly IGeminiService _gemini;
        private readonly string _vaultPath;
        private readonly ILogger<InsightsController> _logger;

        public InsightsController(IGeminiService gemini, IConfiguration config, IVaultPathProvider pathProvider, ILogger<InsightsController> logger = null)
        {
            _gemini = gemini;
            _vaultPath = pathProvider.GetVaultPath();
            _logger = logger;
        }

        [HttpPost("echoes")]
        public async Task<IActionResult> GenerateEchoes([FromBody] EchoesRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Content))
                return BadRequest("Content cannot be empty");

            var pastNotesCtx = await GetVaultContextAsync(request.ExcludeFilename);

            var systemPrompt = @"You are a memory synthesis engine. 
Read the context of `past_notes`, then read the `target_note`.
If the `target_note` shares strong contextual relevance to anything in `past_notes` (e.g., repeating a past task, contradicting a past journal entry, or progressing a past metric), describe that connection.
Generate a list of brief, actionable insights connecting the two. Provide your response ONLY as a JSON array of strings. Do not include markdown blocks or other text.
Example: [""On March 5 you did X, which aligns with Y""]";

            var userPayload = $@"past_notes:
{pastNotesCtx}

target_note:
{request.Content}";

            try
            {
                var text = await _gemini.GenerateAsync(systemPrompt, userPayload, "application/json", 0.2);

                if (string.IsNullOrWhiteSpace(text))
                    return Ok(Array.Empty<string>());

                var array = JsonSerializer.Deserialize<string[]>(text) ?? Array.Empty<string>();
                return Ok(array);
            }
            catch (GeminiException ex)
            {
                return StatusCode(500, $"Gemini API error ({ex.StatusCode}): {ex.ResponseBody}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating echoes");
                return StatusCode(500, new { error = "Error generating echoes", code = "INTERNAL_ERROR" });
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
