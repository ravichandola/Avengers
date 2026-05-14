using System.Text.Json;

namespace OfficeInterop;

internal sealed record RpcRequest(string Method, JsonElement Args);
