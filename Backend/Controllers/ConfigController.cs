using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ConfigController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly IVaultPathProvider _pathProvider;
        private readonly string _appSettingsPath = "appsettings.json";

        public ConfigController(IConfiguration config, IVaultPathProvider pathProvider)
        {
            _config = config;
            _pathProvider = pathProvider;
        }

        [HttpGet("vault")]
        public IActionResult GetVaultPath()
        {
            var path = _pathProvider.GetVaultPath();
            return Ok(new { vaultPath = path });
        }

        [HttpPost("vault")]
        public async Task<IActionResult> SetVaultPath([FromBody] VaultPathRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.VaultPath))
                return BadRequest("Path cannot be empty");

            if (!Directory.Exists(req.VaultPath))
            {
                try
                {
                    Directory.CreateDirectory(req.VaultPath);
                }
                catch (System.Exception ex)
                {
                    return BadRequest($"Failed to create directory: {ex.Message}");
                }
            }

            // Update appsettings.json
            try
            {
                var json = await System.IO.File.ReadAllTextAsync(_appSettingsPath);
                var jDoc = JsonDocument.Parse(json);
                using var stream = new MemoryStream();
                using var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = true });
                
                writer.WriteStartObject();
                bool writtenVault = false;
                
                foreach (var prop in jDoc.RootElement.EnumerateObject())
                {
                    if (prop.NameEquals("VaultPath"))
                    {
                        writer.WriteString("VaultPath", req.VaultPath);
                        writtenVault = true;
                    }
                    else
                    {
                        prop.WriteTo(writer);
                    }
                }
                
                if (!writtenVault)
                {
                    writer.WriteString("VaultPath", req.VaultPath);
                }
                
                writer.WriteEndObject();
                writer.Flush();
                
                // Read stream
                stream.Position = 0;
                using var reader = new StreamReader(stream);
                var outputJson = await reader.ReadToEndAsync();
                
                await System.IO.File.WriteAllTextAsync(_appSettingsPath, outputJson);
                
                return Ok(new { message = "Vault path updated successfully", vaultPath = req.VaultPath });
            }
            catch (System.Exception ex)
            {
                return StatusCode(500, $"Failed to save config: {ex.Message}");
            }
        }

        [HttpDelete("vault/clear")]
        public IActionResult ClearVault()
        {
            var path = _pathProvider.GetVaultPath();
            
            if (!Directory.Exists(path))
            {
                return NotFound("Vault directory does not exist.");
            }

            try
            {
                // Delete all files and subdirectories
                var dirInfo = new DirectoryInfo(path);
                foreach (var file in dirInfo.GetFiles())
                {
                    file.Delete();
                }
                foreach (var dir in dirInfo.GetDirectories())
                {
                    dir.Delete(true);
                }

                return Ok(new { message = "Vault cleared successfully." });
            }
            catch (System.Exception ex)
            {
                return StatusCode(500, $"Failed to clear vault: {ex.Message}");
            }
        }
    }

    public class VaultPathRequest
    {
        public string VaultPath { get; set; } = "";
    }
}
