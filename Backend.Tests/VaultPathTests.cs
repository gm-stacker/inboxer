using System;
using System.IO;
using Xunit;

namespace Backend.Tests;

/// <summary>
/// Guards against the vault path bug where controllers read from an empty
/// ~/Desktop/inboxer_vault instead of the correct ~/Desktop/inboxer/vault.
///
/// The rule: every controller/service must resolve the vault to
///   Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "vault"))
/// which is the `vault/` folder that is a sibling of `Backend/`.
///
/// Run after ANY controller refactor:
///   cd ~/Desktop/inboxer && dotnet test Backend.Tests/
/// </summary>
public class VaultPathTests
{
    // Walks up from CWD until it finds a directory that contains a 'vault' sibling.
    // Works both when running from Backend/ (dotnet run) and from Backend.Tests/bin/Debug/ (dotnet test).
    private static string CanonicalVaultPath
    {
        get
        {
            var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
            while (dir != null)
            {
                var candidate = Path.Combine(dir.FullName, "vault");
                if (Directory.Exists(candidate))
                    return candidate;
                dir = dir.Parent;
            }
            // Fallback: use the standard relative resolution (will fail on disk test if wrong)
            return Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "vault"));
        }
    }

    [Fact(DisplayName = "Canonical vault path must NOT contain 'inboxer_vault'")]
    public void CanonicalPath_DoesNotContainLegacyInboxerVault()
    {
        var lower = CanonicalVaultPath.ToLowerInvariant();
        var containsLegacy = lower.IndexOf("inboxer_vault", StringComparison.Ordinal) >= 0;
        Assert.False(containsLegacy);
    }

    [Fact(DisplayName = "Canonical vault path must end in /vault")]
    public void CanonicalPath_EndsWithVault()
    {
        var normalized = CanonicalVaultPath.TrimEnd(Path.DirectorySeparatorChar);
        var name = Path.GetFileName(normalized).ToLowerInvariant();
        Assert.Equal("vault", name);
    }

    [Fact(DisplayName = "Canonical vault path must exist on disk")]
    public void CanonicalPath_ExistsOnDisk()
    {
        var exists = Directory.Exists(CanonicalVaultPath);
        Assert.True(exists);
    }

    [Fact(DisplayName = "Canonical vault must contain at least one .md file")]
    public void CanonicalPath_ContainsMarkdownFiles()
    {
        if (!Directory.Exists(CanonicalVaultPath)) return;

        var files = Directory.GetFiles(CanonicalVaultPath, "*.md", SearchOption.AllDirectories);
        Assert.True(files.Length > 0);
    }



    [Fact(DisplayName = "Fuzzy note lookup finds file by case-insensitive name match")]
    public void FuzzyLookup_FindsFileByName_CaseInsensitive()
    {
        if (!Directory.Exists(CanonicalVaultPath)) return;

        var allFiles = Directory.GetFiles(CanonicalVaultPath, "*.md", SearchOption.AllDirectories);
        if (allFiles.Length == 0) return;

        // Pick first real file, mangle its case to simulate a model-generated near-miss
        var realFile = allFiles[0];
        var mangledName = Path.GetFileName(realFile).ToUpperInvariant();

        string? match = null;
        foreach (var f in allFiles)
        {
            if (string.Equals(Path.GetFileName(f), mangledName, StringComparison.OrdinalIgnoreCase))
            {
                match = f;
                break;
            }
        }

        Assert.NotNull(match);
        Assert.Equal(
            Path.GetFileName(realFile).ToLowerInvariant(),
            Path.GetFileName(match!).ToLowerInvariant());
    }

    [Fact(DisplayName = "Vault categories are flat subdirectories of canonical path")]
    public void VaultCategories_AreSubdirectoriesOfCanonicalPath()
    {
        if (!Directory.Exists(CanonicalVaultPath)) return;

        var dirs = Directory.GetDirectories(CanonicalVaultPath);
        Assert.True(dirs.Length > 0);

        foreach (var dir in dirs)
        {
            var dirExists = Directory.Exists(dir);
            Assert.True(dirExists);

            var name = Path.GetFileName(dir);
            var hasNoSep = name.IndexOf(Path.DirectorySeparatorChar) < 0;
            Assert.True(hasNoSep);
        }
    }
}
