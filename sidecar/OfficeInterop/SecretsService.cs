using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public static class SecretsService
{
    private static string KeyDir =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "desktop-agent");

    private static string KeyPath(string name) =>
        Path.Combine(KeyDir, $"{name}.enc");

    public static object Encrypt(JsonElement args)
    {
        var name = args.GetProperty("name").GetString()!;
        var plaintext = args.GetProperty("value").GetString()!;

        Directory.CreateDirectory(KeyDir);
        var bytes = Encoding.UTF8.GetBytes(plaintext);
        var encrypted = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(KeyPath(name), encrypted);

        return new { stored = true, name };
    }

    public static object Decrypt(JsonElement args)
    {
        var name = args.GetProperty("name").GetString()!;
        var path = KeyPath(name);

        if (!File.Exists(path))
            throw new FileNotFoundException($"No stored secret named '{name}'");

        var encrypted = File.ReadAllBytes(path);
        var decrypted = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
        return new { value = Encoding.UTF8.GetString(decrypted) };
    }
}
