using System.Threading.Tasks;

namespace Backend.Services
{
    public interface IPlacesEnrichmentService
    {
        Task<EnrichmentPayload?> EnrichPlaceAsync(string content, string title);
    }
}
