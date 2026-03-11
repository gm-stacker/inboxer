using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace Backend.Services
{
    public class PlacesEnrichmentService : IPlacesEnrichmentService
    {
        private readonly ILogger<PlacesEnrichmentService> _logger;
        private readonly IConfiguration _config;
        private readonly HttpClient _httpClient;
        
        private string ApiKey => _config["GOOGLE_PLACES_API_KEY"] ?? string.Empty;

        public PlacesEnrichmentService(ILogger<PlacesEnrichmentService> logger, IConfiguration config, HttpClient httpClient)
        {
            _logger = logger;
            _config = config;
            _httpClient = httpClient;
        }

        public async Task<EnrichmentPayload?> EnrichPlaceAsync(string content, string title)
        {
            if (string.IsNullOrWhiteSpace(ApiKey))
            {
                _logger.LogWarning("GOOGLE_PLACES_API_KEY is missing. Skipping Google Places enrichment.");
                return null;
            }

            try
            {
                var requestBody = new { textQuery = title + " " + content };

                var requestMessage = new HttpRequestMessage(HttpMethod.Post, "https://places.googleapis.com/v1/places:searchText");
                requestMessage.Headers.Add("X-Goog-Api-Key", ApiKey);
                requestMessage.Headers.Add("X-Goog-FieldMask", "places.displayName,places.formattedAddress,places.rating,places.googleMapsUri,places.photos");

                requestMessage.Content = new StringContent(JsonSerializer.Serialize(requestBody), System.Text.Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(requestMessage);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Google Places API returned {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
                    return null;
                }

                var responseString = await response.Content.ReadAsStringAsync();
                
                using var jsonDoc = JsonDocument.Parse(responseString);
                var root = jsonDoc.RootElement;
                
                if (!root.TryGetProperty("places", out var places) || places.GetArrayLength() == 0)
                {
                    _logger.LogInformation($"No places found for query: {title}");
                    return null;
                }

                var firstPlace = places[0];
                var payload = new EnrichmentPayload();
                
                if (firstPlace.TryGetProperty("formattedAddress", out var addressProp))
                    payload.Address = addressProp.GetString() ?? "";
                    
                if (firstPlace.TryGetProperty("rating", out var ratingProp))
                    payload.Rating = ratingProp.GetDouble();
                    
                if (firstPlace.TryGetProperty("googleMapsUri", out var mapsUriProp))
                    payload.MapsUrl = mapsUriProp.GetString() ?? "";
                    
                if (firstPlace.TryGetProperty("photos", out var photosProp) && photosProp.GetArrayLength() > 0)
                {
                    var firstPhoto = photosProp[0];
                    if (firstPhoto.TryGetProperty("name", out var photoNameProp))
                    {
                        payload.PhotoReference = photoNameProp.GetString() ?? "";
                    }
                }
                
                return payload;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to enrich place via Google Places API");
                return null;
            }
        }
    }
}
