using Microsoft.Extensions.Configuration;
using System.IO;

namespace Backend.Services
{
    public class VaultPathProvider : IVaultPathProvider
    {
        private readonly string _vaultPath;

        public VaultPathProvider(IConfiguration config)
        {
            var configPath = config["VaultPath"];
            if (!string.IsNullOrEmpty(configPath))
            {
                _vaultPath = Path.GetFullPath(configPath);
            }
            else
            {
                // Fallback to local desktop for dev
                _vaultPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "vault"));
            }
            
            // Ensure the configured path exists or can be created
            if (!Directory.Exists(_vaultPath))
            {
                Directory.CreateDirectory(_vaultPath);
            }
        }

        public string GetVaultPath()
        {
            return _vaultPath;
        }
    }
}
