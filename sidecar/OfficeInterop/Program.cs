using System.Text.Json;
using System.Text.Json.Serialization;
using OfficeInterop;
using OfficeInterop.Uia;

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
};

Console.OutputEncoding = System.Text.Encoding.UTF8;
Console.InputEncoding = System.Text.Encoding.UTF8;

Console.WriteLine(JsonSerializer.Serialize(new { ready = true }, jsonOptions));

while (true)
{
    var line = Console.ReadLine();
    if (line is null)
        break;

    RpcRequest? req;
    try
    {
        req = JsonSerializer.Deserialize<RpcRequest>(line, jsonOptions);
    }
    catch
    {
        SendError("parse_error", "Invalid JSON", jsonOptions);
        continue;
    }

    if (req is null)
    {
        SendError("parse_error", "Null request", jsonOptions);
        continue;
    }

    try
    {
        object result = req.Method switch
        {
            "excel.read_cell" => ExcelService.ReadCell(req.Args),
            "excel.write_cell" => ExcelService.WriteCell(req.Args),
            "excel.read_range" => ExcelService.ReadRange(req.Args),
            "excel.run_macro" => ExcelService.RunMacro(req.Args),
            "word.open" => WordService.Open(req.Args),
            "word.insert_text" => WordService.InsertText(req.Args),
            "word.export_pdf" => WordService.ExportPdf(req.Args),
            "outlook.send_email" => OutlookService.SendEmail(req.Args),
            "outlook.list_inbox" => OutlookService.ListInbox(req.Args),
            "secrets.encrypt" => SecretsService.Encrypt(req.Args),
            "secrets.decrypt" => SecretsService.Decrypt(req.Args),
            "uia.get_elements" => FlaUIService.GetElements(req.Args),
            "uia.click" => FlaUIService.Click(req.Args),
            "uia.fill" => FlaUIService.Fill(req.Args),
            "uia.get_text" => FlaUIService.GetText(req.Args),
            "uia.is_visible" => FlaUIService.IsVisible(req.Args),
            "ping" => new { pong = true },
            _ => throw new NotSupportedException($"Unknown method: {req.Method}"),
        };
        SendOk(result, jsonOptions);
    }
    catch (Exception ex)
    {
        SendError(req.Method, ex.Message, jsonOptions);
    }
}

static void SendOk(object data, JsonSerializerOptions jsonOptions) =>
    Console.WriteLine(JsonSerializer.Serialize(new { ok = true, data }, jsonOptions));

static void SendError(string method, string message, JsonSerializerOptions jsonOptions) =>
    Console.WriteLine(JsonSerializer.Serialize(new { ok = false, method, error = message }, jsonOptions));
