using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Concurrent;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;
using System.Text.RegularExpressions;
using System.Net.Http;
using System.Text.Json;

namespace Backend.Services
{
    public class VaultWatcherService : BackgroundService
    {
        private readonly ILogger<VaultWatcherService> _logger;
        private readonly IConfiguration _config;
        private readonly IGeminiService _geminiService;
        private readonly IVaultCacheService _cacheService;
        private FileSystemWatcher? _watcher;
        private string _vaultPath;
        
        // Debounce dictionary: file path -> debounce timer CTS
        private readonly ConcurrentDictionary<string, CancellationTokenSource> _debounceTimers = new();

        public VaultWatcherService(ILogger<VaultWatcherService> logger, IConfiguration config, IGeminiService geminiService, IVaultCacheService cacheService)
        {
            _logger = logger;
            _config = config;
            _geminiService = geminiService;
            _cacheService = cacheService;
            
            _vaultPath = _config["VAULT_PATH"];
            
            if (string.IsNullOrEmpty(_vaultPath))
            {
                // Falling back to Desktop for local dev convenience, but logging a warning
                _vaultPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop", "inboxer_vault");
                _logger.LogWarning($"VAULT_PATH env var not set. Falling back to local Desktop path: {_vaultPath}");
            }
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            InitializeWatcher();

            // Loop to handle config updates for the vault path
            while (!stoppingToken.IsCancellationRequested)
            {
                var currentConfigPath = _config["VAULT_PATH"] ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop", "inboxer_vault");
                if (currentConfigPath != _vaultPath)
                {
                    _logger.LogInformation($"Vault path changed from {_vaultPath} to {currentConfigPath}. Restarting watcher.");
                    _vaultPath = currentConfigPath;
                    InitializeWatcher();
                }
                await Task.Delay(5000, stoppingToken);
            }
        }

        private void InitializeWatcher()
        {
            if (_watcher != null)
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Dispose();
            }

            if (!Directory.Exists(_vaultPath))
            {
                var errorMsg = $"CRITICAL ERROR: Vault directory not found at '{_vaultPath}'. " + 
                               "Ensure you have set the VAULT_PATH environment variable (or OBSIDIAN_VAULT_PATH in .env) " + 
                               "and that the host directory exists and is correctly mounted.";
                _logger.LogCritical(errorMsg);
                throw new DirectoryNotFoundException(errorMsg);
            }

            _watcher = new FileSystemWatcher(_vaultPath, "*.md")
            {
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.CreationTime,
                IncludeSubdirectories = true
            };

            _watcher.Changed += OnFileChanged;
            _watcher.Created += OnFileChanged;
            _watcher.Renamed += OnFileChanged;
            _watcher.Deleted += OnFileChanged;

            _watcher.EnableRaisingEvents = true;
            _logger.LogInformation($"VaultWatcherService started tracking: {_vaultPath}");
        }

        private void OnFileChanged(object sender, FileSystemEventArgs e)
        {
            // Debounce the file change event
            QueueFileProcessing(e.FullPath);
        }

        private void QueueFileProcessing(string filePath)
        {
            if (_debounceTimers.TryGetValue(filePath, out var existingCts))
            {
                existingCts.Cancel();
            }

            var cts = new CancellationTokenSource();
            _debounceTimers[filePath] = cts;

            Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(1500, cts.Token); // 1.5s debounce
                    await ProcessFileSurgicallyAsync(filePath);
                }
                catch (TaskCanceledException)
                {
                    // Debounced
                }
                finally
                {
                    _debounceTimers.TryRemove(filePath, out _);
                }
            });
        }

        private async Task ProcessFileSurgicallyAsync(string filePath)
        {
            try
            {
                var filename = Path.GetFileName(filePath);
                var category = Path.GetFileName(Path.GetDirectoryName(filePath) ?? string.Empty);

                // Watcher-side Invalidation Strategy (Safety Net)
                _cacheService.Remove($"note_detail:{category}:{filename}");
                _cacheService.Remove($"category_notes:{category}");
                _cacheService.Remove("taxonomy_list");

                if (!File.Exists(filePath))
                {
                    _logger.LogInformation($"File removed or missing during processing: {filePath}. Cache invalidated.");
                    return;
                }

                _logger.LogInformation($"Processing modified vault file: {filePath}");

                // Basic exponential backoff if file is locked
                string content = null;
                int retries = 3;
                while (retries > 0)
                {
                    try
                    {
                        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
                        using var reader = new StreamReader(stream);
                        content = await reader.ReadToEndAsync();
                        break;
                    }
                    catch (IOException)
                    {
                        retries--;
                        if (retries == 0) throw;
                        await Task.Delay(500);
                    }
                }

                if (string.IsNullOrWhiteSpace(content)) return;

                // Split frontmatter and body
                var (yamlRaw, body) = ExtractYamlAndBody(content);
                
                // Hash body
                using var md5 = MD5.Create();
                var hashBytes = md5.ComputeHash(Encoding.UTF8.GetBytes(body.Trim()));
                var currentBodyHash = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();

                // Deserialize existing YAML to preserve user props
                var deserializer = new DeserializerBuilder()
                    .WithNamingConvention(UnderscoredNamingConvention.Instance)
                    .IgnoreUnmatchedProperties()
                    .Build();

                var existingProps = new Dictionary<string, object>();
                if (!string.IsNullOrWhiteSpace(yamlRaw))
                {
                    try {
                        existingProps = deserializer.Deserialize<Dictionary<string, object>>(yamlRaw) ?? new Dictionary<string, object>();
                    } catch (Exception ex) {
                        _logger.LogWarning($"Failed to deserialize frontmatter for {filePath}. Preserving raw. Error: {ex.Message}");
                    }
                }

                // Check hash
                if (existingProps.TryGetValue("body_hash", out var storedHashObj) && storedHashObj?.ToString() == currentBodyHash)
                {
                    _logger.LogInformation($"Skipping {filePath} - body hash matches stored hash.");
                    return;
                }

                // File body changed. Send to Gemini.
                _logger.LogInformation($"Body change detected for {filePath}. Sending to AI for taxonomy enrichment...");
                var enrichedProps = await CallGeminiEnrichmentAsync(body);

                // Surgical merge
                // Obsidian requires properties like arrays to be proper YAML lists
                existingProps["body_hash"] = currentBodyHash;
                
                if (enrichedProps != null)
                {
                    if (enrichedProps.Type != null) existingProps["type"] = enrichedProps.Type;
                    if (enrichedProps.Tags?.Length > 0) existingProps["tags"] = enrichedProps.Tags;
                    if (enrichedProps.ExtractedDate != null) existingProps["extracted_date"] = enrichedProps.ExtractedDate;
                    if (enrichedProps.Entities?.Length > 0) existingProps["entities"] = enrichedProps.Entities;
                    
                    if (enrichedProps.Metrics != null && enrichedProps.Metrics.Count > 0) {
                        // Merge metrics dictionary
                        var metricsDict = existingProps.ContainsKey("metrics") && existingProps["metrics"] is Dictionary<object, object> m 
                            ? m : new Dictionary<object, object>();
                            
                        foreach(var kvp in enrichedProps.Metrics) {
                            metricsDict[kvp.Key] = kvp.Value;
                        }
                        existingProps["metrics"] = metricsDict;
                    }
                }

                // Serialize back
                var serializer = new SerializerBuilder()
                    .WithNamingConvention(UnderscoredNamingConvention.Instance)
                    .DisableAliases() // Important for Obsidian
                    .Build();

                var newYamlRaw = serializer.Serialize(existingProps);
                
                var finalFileContent = $"---\n{newYamlRaw.TrimEnd()}\n---\n{body}";

                // Write back atomically
                retries = 3;
                while (retries > 0)
                {
                    try
                    {
                        File.WriteAllText(filePath, finalFileContent);
                        _logger.LogInformation($"Successfully updated frontmatter for {filePath}");
                        break;
                    }
                    catch (IOException)
                    {
                        retries--;
                        if (retries == 0) throw;
                        await Task.Delay(500);
                    }
                }

            }
            catch (Exception ex)
            {
                _logger.LogError($"Error processing file {filePath}: {ex.Message}");
            }
        }

        private (string yaml, string body) ExtractYamlAndBody(string content)
        {
            if (content.StartsWith("---\n") || content.StartsWith("---\r\n"))
            {
                var endIdx = content.IndexOf("---\n", 4);
                if (endIdx == -1) endIdx = content.IndexOf("---\r\n", 4);

                if (endIdx != -1)
                {
                    var yamlStart = content.IndexOf('\n') + 1;
                    return (content.Substring(yamlStart, endIdx - yamlStart).Trim(), content.Substring(endIdx + 4).TrimStart());
                }
            }
            return ("", content);
        }

        private async Task<EnrichmentPayload?> CallGeminiEnrichmentAsync(string bodyText)
        {
            try
            {
                var systemPrompt = @"You are a data extraction engine for markdown notes.
Analyze the raw text and extract metadata into the following JSON schema exactly.
{
  ""type"": ""note|task|health_metric|journal"",
  ""tags"": [""tag1"", ""tag2""],
  ""extracted_date"": ""YYYY-MM-DD"",
  ""entities"": [""Person"", ""Location""],
  ""metrics"": {""key"": ""value"", ""hr"": 65}
}
Return ONLY valid JSON.";

                var contentText = await _geminiService.GenerateAsync(systemPrompt, bodyText, "application/json", 0.1);

                if (string.IsNullOrWhiteSpace(contentText)) return null;

                return JsonSerializer.Deserialize<EnrichmentPayload>(contentText, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Watcher Gemini enrichment failed: {ex.Message}");
                return null;
            }
        }
    }

    public class EnrichmentPayload
    {
        public string? Type { get; set; }
        public string[]? Tags { get; set; }
        public string? ExtractedDate { get; set; }
        public string[]? Entities { get; set; }
        public Dictionary<string, object>? Metrics { get; set; }
    }
}
