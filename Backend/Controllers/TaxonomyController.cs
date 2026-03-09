using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TaxonomyController : ControllerBase
    {
        private readonly string _vaultPath;
        private readonly ILogger<TaxonomyController> _logger;
        private static readonly SemaphoreSlim _writeLock = new SemaphoreSlim(1, 1);

        public TaxonomyController(ILogger<TaxonomyController> logger)
        {
            _logger = logger;
            _vaultPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "vault"));
            if (!Directory.Exists(_vaultPath))
            {
                Directory.CreateDirectory(_vaultPath);
            }
        }

        // For unit testing isolated vaults
        protected TaxonomyController(string vaultPath, ILogger<TaxonomyController> logger = null)
        {
            _logger = logger;
            _vaultPath = vaultPath;
            if (!Directory.Exists(_vaultPath))
            {
                Directory.CreateDirectory(_vaultPath);
            }
        }

        [HttpGet]
        public IActionResult GetTaxonomy()
        {
            try
            {
                var directories = Directory.GetDirectories(_vaultPath)
                    .Select(d => new
                    {
                        Name = Path.GetFileName(d),
                        NoteCount = Directory.GetFiles(d, "*.md").Count(f => !Path.GetFileName(f).StartsWith("."))
                    })
                    .OrderBy(d => d.Name)
                    .ToList();

                return Ok(directories);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error reading taxonomy: {ex.Message}");
            }
        }

        [HttpGet("{category}/notes")]
        public async Task<IActionResult> GetNotes(string category)
        {
            var categoryPath = Path.Combine(_vaultPath, category);

            if (!Directory.Exists(categoryPath))
            {
                return NotFound($"Category '{category}' does not exist.");
            }

            try
            {
                var files = Directory.GetFiles(categoryPath, "*.md")
                                     .Where(f => !Path.GetFileName(f).StartsWith("."))
                                     .OrderByDescending(System.IO.File.GetCreationTime);
                var notes = new System.Collections.Generic.List<object>();

                foreach (var file in files)
                {
                    // Read file content for preview
                    var contentLines = await System.IO.File.ReadAllLinesAsync(file);
                    
                    // Basic frontmatter stripping for preview
                    var previewContent = string.Join("\n", contentLines);
                    if (previewContent.StartsWith("---"))
                    {
                        var endFrontmatter = previewContent.IndexOf("---", 3);
                        if (endFrontmatter > -1)
                        {
                            previewContent = previewContent.Substring(endFrontmatter + 3).TrimStart();
                        }
                    }

                    notes.Add(new
                    {
                        Filename = Path.GetFileName(file),
                        Preview = new string(previewContent.Take(100).ToArray()) + (previewContent.Length > 100 ? "..." : ""),
                        CreatedAt = System.IO.File.GetCreationTime(file).ToString("yyyy-MM-dd HH:mm")
                    });
                }

                return Ok(notes);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error reading notes: {ex.Message}");
            }
        }

        [HttpPut("{oldName}/rename")]
        public async Task<IActionResult> RenameCategory(string oldName, [FromBody] RenameRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.NewName))
            {
                return BadRequest("new_name is required.");
            }

            var oldPath = Path.Combine(_vaultPath, oldName);
            var newPath = Path.Combine(_vaultPath, request.NewName);

            if (!Directory.Exists(oldPath))
            {
                return NotFound($"Category '{oldName}' does not exist.");
            }

            if (Directory.Exists(newPath))
            {
                return Conflict($"Category '{request.NewName}' already exists.");
            }

            try
            {
                // Note: a more robust implementation would open each .md file, parse the YAML frontmatter,
                // and replace any usage of the old category tag with the new one.
                // For this minimal viable version, we just rename the directory.
                Directory.Move(oldPath, newPath);
                
                return Ok(new { message = $"Category renamed from {oldName} to {request.NewName}" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error renaming category: {ex.Message}");
            }
        }

        [HttpGet("{category}/notes/{filename}")]
        public async Task<IActionResult> GetNoteDetails(string category, string filename)
        {
            var filePath = Path.Combine(_vaultPath, category, filename);
            if (System.IO.File.Exists(filePath))
            {
                var content = await System.IO.File.ReadAllTextAsync(filePath);
                return Ok(new { Filename = filename, Content = content, Category = category });
            }

            // Fuzzy fallback: search entire vault case-insensitively by filename
            var allFiles = Directory.GetFiles(_vaultPath, "*.md", SearchOption.AllDirectories);
            var fuzzyMatch = allFiles.FirstOrDefault(f =>
                string.Equals(Path.GetFileName(f), filename, StringComparison.OrdinalIgnoreCase) ||
                Path.GetFileNameWithoutExtension(f).Contains(
                    Path.GetFileNameWithoutExtension(filename), StringComparison.OrdinalIgnoreCase));

            if (fuzzyMatch != null)
            {
                var content = await System.IO.File.ReadAllTextAsync(fuzzyMatch);
                var actualCategory = Path.GetFileName(Path.GetDirectoryName(fuzzyMatch) ?? string.Empty);
                var actualFilename = Path.GetFileName(fuzzyMatch);
                return Ok(new { Filename = actualFilename, Content = content, Category = actualCategory });
            }

            return NotFound("Note not found.");
        }

        [HttpPut("{category}/notes/{filename}")]
        public async Task<IActionResult> UpdateNote(string category, string filename, [FromBody] UpdateNoteRequest request)
        {
            var filePath = Path.Combine(_vaultPath, category, filename);
            if (!System.IO.File.Exists(filePath)) return NotFound("Note not found.");

            await System.IO.File.WriteAllTextAsync(filePath, request.Content);
            return Ok(new { message = "Note updated successfully." });
        }

        [HttpDelete("{category}/notes/{filename}")]
        public async Task<IActionResult> DeleteNote(string category, string filename)
        {
            var filePath = Path.Combine(_vaultPath, category, filename);
            if (!System.IO.File.Exists(filePath)) return NotFound("Note not found.");

            var archiveDir = Path.Combine(_vaultPath, "_archive");
            if (!Directory.Exists(archiveDir))
            {
                Directory.CreateDirectory(archiveDir);
            }

            var archivePath = Path.Combine(archiveDir, filename);

            await _writeLock.WaitAsync();
            try
            {
                if (System.IO.File.Exists(archivePath))
                {
                    System.IO.File.Delete(archivePath);
                }
                System.IO.File.Move(filePath, archivePath);
                
                if (_logger != null)
                {
                    _logger.LogInformation("Vault write: {Operation} on {Filename} at {Timestamp}", "Move to Archive", filename, DateTime.UtcNow);
                }
            }
            finally
            {
                _writeLock.Release();
            }

            return Ok(new { message = "Note deleted successfully." });
        }

        [HttpPut("{category}/notes/{filename}/move")]
        public IActionResult MoveNote(string category, string filename, [FromBody] MoveNoteRequest request)
        {
            var oldPath = Path.Combine(_vaultPath, category, filename);
            var targetCategoryPath = Path.Combine(_vaultPath, request.TargetCategory);
            var newPath = Path.Combine(targetCategoryPath, filename);

            if (!System.IO.File.Exists(oldPath)) return NotFound("Note not found.");
            if (!Directory.Exists(targetCategoryPath)) Directory.CreateDirectory(targetCategoryPath);
            if (System.IO.File.Exists(newPath)) return Conflict("A note with this name already exists in the target category.");

            System.IO.File.Move(oldPath, newPath);
            return Ok(new { message = "Note moved successfully." });
        }

        [HttpPut("{category}/notes/{filename}/done")]
        public async Task<IActionResult> MarkNoteAsDone(string category, string filename)
        {
            var filePath = Path.Combine(_vaultPath, category, filename);
            if (!System.IO.File.Exists(filePath)) return NotFound("Note not found.");

            var content = await System.IO.File.ReadAllTextAsync(filePath);
            var updatedContent = AddDoneToFrontmatter(content);
            await System.IO.File.WriteAllTextAsync(filePath, updatedContent);
            return Ok(new { message = "Note marked as done." });
        }

        /// <summary>
        /// Parses the YAML frontmatter and injects/updates the tags array to include "done",
        /// and sets a done_at timestamp. Body content is never modified.
        /// </summary>
        public static string AddDoneToFrontmatter(string content)
        {
            const string doneTag = "done";
            var doneAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");

            if (!content.StartsWith("---"))
            {
                // No frontmatter — prepend a minimal one
                var minimal = $"---\ntags:\n  - {doneTag}\ndone_at: \"{doneAt}\"\n---\n\n";
                return minimal + content;
            }

            var endIdx = content.IndexOf("\n---", 3);
            if (endIdx == -1)
            {
                var minimal = $"---\ntags:\n  - {doneTag}\ndone_at: \"{doneAt}\"\n---\n\n";
                return minimal + content;
            }

            var frontmatter = content.Substring(3, endIdx - 3);
            var body = content.Substring(endIdx + 4); // skip the closing \n---

            var lines = frontmatter.Split('\n').ToList();

            // ── Handle tags block ─────────────────────────────────────────
            var tagsIdx = lines.FindIndex(l => l.TrimStart().StartsWith("tags:"));
            if (tagsIdx == -1)
            {
                // No tags key — append before closing
                lines.Add($"tags:");
                lines.Add($"  - {doneTag}");
            }
            else
            {
                // tags: key exists — check for existing block items
                var tagItems = new List<int>();
                for (int i = tagsIdx + 1; i < lines.Count; i++)
                {
                    if (lines[i].TrimStart().StartsWith("- ")) tagItems.Add(i);
                    else break;
                }

                // Check if "done" is already present
                bool alreadyTagged = tagItems.Any(i => lines[i].Trim().TrimStart('-').Trim() == doneTag);
                if (!alreadyTagged)
                {
                    var insertAt = tagItems.Count > 0 ? tagItems.Last() + 1 : tagsIdx + 1;
                    lines.Insert(insertAt, $"  - {doneTag}");
                }
            }

            // ── Handle done_at ─────────────────────────────────────────────
            var doneAtIdx = lines.FindIndex(l => l.TrimStart().StartsWith("done_at:"));
            if (doneAtIdx == -1)
                lines.Add($"done_at: \"{doneAt}\"");
            else
                lines[doneAtIdx] = $"done_at: \"{doneAt}\"";

            var newFrontmatter = string.Join('\n', lines);
            return $"---{newFrontmatter}\n---{body}";
        }

        [HttpDelete("{category}/notes/{filename}/done")]
        public async Task<IActionResult> UnmarkNoteAsDone(string category, string filename)
        {
            var filePath = Path.Combine(_vaultPath, category, filename);
            if (!System.IO.File.Exists(filePath)) return NotFound(new { error = "Note not found." });

            var content = await System.IO.File.ReadAllTextAsync(filePath);
            var updatedContent = RemoveDoneFromFrontmatter(content);
            await System.IO.File.WriteAllTextAsync(filePath, updatedContent);
            return Ok(new { message = "Note unmarked as done." });
        }

        /// <summary>
        /// Parses the YAML frontmatter and removes the "done" tag and the done_at timestamp.
        /// Body content is never modified.
        /// </summary>
        public static string RemoveDoneFromFrontmatter(string content)
        {
            if (!content.StartsWith("---")) return content;

            var endIdx = content.IndexOf("\n---", 3);
            if (endIdx == -1) return content;

            var frontmatter = content.Substring(3, endIdx - 3);
            var body = content.Substring(endIdx + 4); // skip the closing \n---

            var lines = frontmatter.Split('\n').ToList();

            // Remove `- done` exactly from the tags array
            lines.RemoveAll(l => l.Trim().Equals("- done", StringComparison.OrdinalIgnoreCase) || l.Trim().Equals("- \"done\"", StringComparison.OrdinalIgnoreCase));
            
            // Remove `done_at:` property
            lines.RemoveAll(l => l.TrimStart().StartsWith("done_at:", StringComparison.OrdinalIgnoreCase));

            var newFrontmatter = string.Join('\n', lines);
            return $"---{newFrontmatter}\n---{body}";
        }

        // ── Full-Text Search ───────────────────────────────────────────────

        [HttpGet("search")]
        public async Task<IActionResult> Search([FromQuery] string q)
        {
            if (string.IsNullOrWhiteSpace(q))
                return BadRequest("Query parameter 'q' is required.");

            try
            {
                var results = await SearchNotes(_vaultPath, q);
                return Ok(results);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error searching notes: {ex.Message}");
            }
        }

        /// <summary>
        /// Searches all non-done .md files in the vault for notes whose title or body
        /// contains the given query (case-insensitive). Returns results sorted with
        /// title matches first, then body-only matches.
        /// </summary>
        /// <param name="vaultPath">Root path of the vault directory.</param>
        /// <param name="query">Search term.</param>
        public static async Task<List<SearchResult>> SearchNotes(string vaultPath, string query)
        {
            var comparison = StringComparison.OrdinalIgnoreCase;
            var allFiles = Directory.GetFiles(vaultPath, "*.md", SearchOption.AllDirectories)
                .Where(f => !Path.GetFileName(f).StartsWith("."));

            var titleMatches = new List<SearchResult>();
            var bodyMatches  = new List<SearchResult>();

            foreach (var file in allFiles)
            {
                var rawContent = await System.IO.File.ReadAllTextAsync(file);

                // Skip completed notes
                if (HasDoneTag(rawContent)) continue;

                // Strip frontmatter for body search
                var body = rawContent;
                if (rawContent.StartsWith("---"))
                {
                    var endFm = rawContent.IndexOf("---", 3);
                    if (endFm > -1)
                        body = rawContent.Substring(endFm + 3).TrimStart();
                }

                // Derive display title: first non-empty body line, strip Markdown #
                var firstLine = body.Split('\n')
                    .Select(l => l.Trim())
                    .FirstOrDefault(l => !string.IsNullOrWhiteSpace(l)) ?? string.Empty;
                var title = System.Text.RegularExpressions.Regex.Replace(firstLine, @"^#+\s*", "").Trim();
                if (string.IsNullOrWhiteSpace(title))
                    title = Path.GetFileNameWithoutExtension(file).Replace('_', ' ');

                var category = Path.GetFileName(Path.GetDirectoryName(file) ?? string.Empty);
                var filename = Path.GetFileName(file);
                var preview  = new string(body.Take(150).ToArray()).Trim();
                if (body.Length > 150) preview += "...";

                bool titleHit = title.Contains(query, comparison);
                bool bodyHit  = body.Contains(query, comparison);

                if (titleHit)
                    titleMatches.Add(new SearchResult { Category = category, Filename = filename, Title = title, Preview = preview });
                else if (bodyHit)
                    bodyMatches.Add(new SearchResult { Category = category, Filename = filename, Title = title, Preview = preview });
            }

            // Sort each bucket alphabetically
            titleMatches.Sort((a, b) => string.Compare(a.Category + a.Filename, b.Category + b.Filename, StringComparison.OrdinalIgnoreCase));
            bodyMatches.Sort((a, b)  => string.Compare(a.Category + a.Filename, b.Category + b.Filename, StringComparison.OrdinalIgnoreCase));

            titleMatches.AddRange(bodyMatches);
            return titleMatches;
        }

        /// <summary>
        /// Returns true if the given markdown content has "done" in its frontmatter tags array.
        /// Used by QueryController to exclude completed notes from standard queries.
        /// </summary>
        public static bool HasDoneTag(string content)
        {
            if (!content.StartsWith("---")) return false;
            var endIdx = content.IndexOf("\n---", 3);
            if (endIdx == -1) return false;
            var frontmatter = content.Substring(3, endIdx - 3);
            var lines = frontmatter.Split('\n');
            bool inTagsBlock = false;
            foreach (var line in lines)
            {
                if (line.TrimStart().StartsWith("tags:")) { inTagsBlock = true; continue; }
                if (inTagsBlock)
                {
                    if (!line.TrimStart().StartsWith("- ")) break;
                    if (line.Trim().TrimStart('-').Trim().Equals("done", StringComparison.OrdinalIgnoreCase)) return true;
                }
            }
            return false;
        }

        [HttpPut("{category}/notes/{filename}/rename")]
        public IActionResult RenameNote(string category, string filename, [FromBody] RenameNoteRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.NewName))
            {
                return BadRequest("new_name is required.");
            }

            var newName = request.NewName.EndsWith(".md", StringComparison.OrdinalIgnoreCase) 
                ? request.NewName 
                : request.NewName + ".md";

            var oldPath = Path.Combine(_vaultPath, category, filename);
            var newPath = Path.Combine(_vaultPath, category, newName);

            if (oldPath.Equals(newPath, StringComparison.OrdinalIgnoreCase))
            {
                return Ok(new { message = "Note renamed successfully.", newFilename = newName });
            }

            if (!System.IO.File.Exists(oldPath)) return NotFound("Note not found.");
            if (System.IO.File.Exists(newPath)) return Conflict("A note with this name already exists.");

            System.IO.File.Move(oldPath, newPath);
            return Ok(new { message = "Note renamed successfully.", newFilename = newName });
        }
    }

    public class SearchResult
    {
        [System.Text.Json.Serialization.JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("filename")]
        public string Filename { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("preview")]
        public string Preview { get; set; } = string.Empty;
    }

    public class RenameRequest
    {
        [System.Text.Json.Serialization.JsonPropertyName("new_name")]
        public string NewName { get; set; } = string.Empty;
    }

    public class UpdateNoteRequest
    {
        [System.Text.Json.Serialization.JsonPropertyName("content")]
        public string Content { get; set; } = string.Empty;
    }

    public class MoveNoteRequest
    {
        [System.Text.Json.Serialization.JsonPropertyName("target_category")]
        public string TargetCategory { get; set; } = string.Empty;
    }

    public class RenameNoteRequest
    {
        [System.Text.Json.Serialization.JsonPropertyName("new_name")]
        public string NewName { get; set; } = string.Empty;
    }
}
