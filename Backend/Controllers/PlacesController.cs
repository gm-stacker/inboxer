using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Net.Http;
using System.Threading.Tasks;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PlacesController : ControllerBase
    {
        private readonly ILogger<PlacesController> _logger;
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _config;
        
        private string ApiKey => _config["GOOGLE_PLACES_API_KEY"] ?? string.Empty;

        public PlacesController(ILogger<PlacesController> logger, HttpClient httpClient, IConfiguration config)
        {
            _logger = logger;
            _httpClient = httpClient;
            _config = config;
        }

        [HttpGet("photo")]
        public async Task<IActionResult> GetPhoto([FromQuery] string reference)
        {
            if (string.IsNullOrWhiteSpace(reference))
            {
                return BadRequest(new { error = "Reference is required", code = "INVALID_INPUT" });
            }

            if (string.IsNullOrWhiteSpace(ApiKey))
            {
                _logger.LogWarning("GOOGLE_PLACES_API_KEY is not configured.");
                return StatusCode(500, new { error = "Internal configuration error", code = "CONFIG_ERROR" });
            }

            try
            {
                // The reference is typically in the format "places/{placeId}/photos/{photoReference}"
                // The media endpoint requests max dimensions.
                string url = $"https://places.googleapis.com/v1/{reference}/media?key={ApiKey}&maxHeightPx=400&maxWidthPx=400";

                var response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Failed to proxy photo. Google returned {response.StatusCode}");
                    return NotFound(new { error = "Photo not found or proxy failed", code = "NOT_FOUND" });
                }

                var stream = await response.Content.ReadAsStreamAsync();
                var contentType = response.Content.Headers.ContentType?.ToString() ?? "image/jpeg";

                return File(stream, contentType);
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "Exception while proxying photo for reference {Reference}", reference);
                return StatusCode(500, new { error = "Internal server error", code = "INTERNAL_ERROR" });
            }
        }
    }
}
