using System;
using System.Threading.Tasks;

namespace Backend.Services
{
    public interface IVaultCacheService
    {
        Task<T> GetOrAddAsync<T>(string cacheKey, Func<Task<T>> factory);
        void Remove(string cacheKey);
        void RemoveByPrefix(string prefix);
    }
}
