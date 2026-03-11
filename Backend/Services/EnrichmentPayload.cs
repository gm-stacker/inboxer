namespace Backend.Services
{
    public class EnrichmentPayload
    {
        public string Address { get; set; } = string.Empty;
        public double Rating { get; set; }
        public string MapsUrl { get; set; } = string.Empty;
        public string PhotoReference { get; set; } = string.Empty;
    }
}
