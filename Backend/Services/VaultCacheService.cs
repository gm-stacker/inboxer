using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace Backend.Services
{
    public class VaultCacheService : IVaultCacheService
    {
        private readonly ConcurrentDictionary<string, Lazy<Task<object>>> _cache = new();
        private readonly ILogger<VaultCacheService> _logger;

        public VaultCacheService(ILogger<VaultCacheService> logger)
        {
            _logger = logger;
        }

        public async Task<T> GetOrAddAsync<T>(string cacheKey, Func<Task<T>> factory)
        {
            bool isHit = true;
            var lazyTask = _cache.GetOrAdd(cacheKey, key => 
            {
                isHit = false;
                return new Lazy<Task<object>>(async () => 
                {
                    _logger.LogInformation("Cache miss: {Key}", cacheKey);
                    var result = await factory();
                    return result!;
                });
            });

            if (isHit)
            {
                _logger.LogInformation("Cache hit: {Key}", cacheKey);
            }

            try
            {
                var result = await lazyTask.Value;
                return (T)result;
            }
            catch
            {
                // Remove failed tasks from cache so subsequent requests retry
                _cache.TryRemove(cacheKey, out _);
                throw;
            }
        }

        public void Remove(string cacheKey)
        {
            _cache.TryRemove(cacheKey, out _);
        }

        public void RemoveByPrefix(string prefix)
        {
            var keysToRemove = _cache.Keys.Where(k => k.StartsWith(prefix)).ToList();
            foreach (var key in keysToRemove)
            {
                _cache.TryRemove(key, out _);
            }
        }
    }
}
