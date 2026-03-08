using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TaxonomyController : ControllerBase
    {
        private readonly string _vaultPath;

        public TaxonomyController()
        {
            _vaultPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "vault"));
            if (!Directory.Exists(_vaultPath))
            {
                Directory.CreateDirectory(_vaultPath);
            }
        }

        // For unit testing isolated vaults
        protected TaxonomyController(string vaultPath)
        {
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
        public IActionResult DeleteNote(string category, string filename)
        {
            var filePath = Path.Combine(_vaultPath, category, filename);
            if (!System.IO.File.Exists(filePath)) return NotFound("Note not found.");

            System.IO.File.Delete(filePath);
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
