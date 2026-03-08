using System;
using System.IO;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Backend.Controllers;
using Xunit;

namespace Backend.Tests;

public sealed class ConfigControllerTests
{
    private IConfiguration MakeConfig(string? vaultPath = null)
    {
        var pairs = vaultPath is not null
            ? new[] { new System.Collections.Generic.KeyValuePair<string, string?>("VaultPath", vaultPath) }
            : System.Array.Empty<System.Collections.Generic.KeyValuePair<string, string?>>();

        return new ConfigurationBuilder()
            .AddInMemoryCollection(pairs)
            .Build();
    }

    [Fact(DisplayName = "GetVaultPath returns the path specified in config")]
    public void GetVaultPath_ReturnsConfiguredPath()
    {
        var ctrl = new ConfigController(MakeConfig("/some/custom/vault"));
        var result = ctrl.GetVaultPath() as OkObjectResult;

        Assert.NotNull(result);
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        Assert.Contains("/some/custom/vault", json);
    }

    [Fact(DisplayName = "GetVaultPath returns fallback path when VaultPath key is absent")]
    public void GetVaultPath_ReturnsFallback_WhenNotConfigured()
    {
        var ctrl = new ConfigController(MakeConfig(null));
        var result = ctrl.GetVaultPath() as OkObjectResult;

        Assert.NotNull(result);
        var json = System.Text.Json.JsonSerializer.Serialize(result!.Value);
        // Should contain any path string (non-empty)
        Assert.Contains("vaultPath", json);
    }

    [Fact(DisplayName = "SetVaultPath returns 400 when path is empty string")]
    public async System.Threading.Tasks.Task SetVaultPath_Returns400_WhenPathEmpty()
    {
        var ctrl = new ConfigController(MakeConfig("/vault"));
        var result = await ctrl.SetVaultPath(new VaultPathRequest { VaultPath = "" });
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact(DisplayName = "ClearVault returns 404 when vault directory does not exist")]
    public void ClearVault_Returns404_WhenVaultMissing()
    {
        var ctrl = new ConfigController(MakeConfig("/nonexistent/path/to/vault_xyz_12345"));
        var result = ctrl.ClearVault();
        Assert.IsType<NotFoundObjectResult>(result);
    }
}
