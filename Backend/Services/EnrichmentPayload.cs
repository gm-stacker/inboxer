using System.Collections.Generic;

namespace Backend.Services
{
    public class EnrichmentPayload
    {
        // General enrichment properties (VaultWatcherService / Gemini)
        public string? Type { get; set; }
        public string[]? Tags { get; set; }
        public string? ExtractedDate { get; set; }
        public string[]? Entities { get; set; }
        public Dictionary<string, object>? Metrics { get; set; }

        // Places enrichment properties
        public string Address { get; set; } = string.Empty;
        public double Rating { get; set; }
        public string MapsUrl { get; set; } = string.Empty;
        public string PhotoReference { get; set; } = string.Empty;
    }
}
