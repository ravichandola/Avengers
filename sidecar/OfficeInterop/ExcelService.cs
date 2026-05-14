using System.Runtime.InteropServices;
using System.Text.Json;
using ClosedXML.Excel;
using ExcelInterop = Microsoft.Office.Interop.Excel;

public static class ExcelService
{
    public static object ReadCell(JsonElement args)
    {
        var file = args.GetProperty("file").GetString()!;
        var cell = args.GetProperty("cell").GetString()!;
        using var wb = new XLWorkbook(file);
        var ws = wb.Worksheet(1);
        return new { value = ws.Cell(cell).GetValue<string>() };
    }

    public static object WriteCell(JsonElement args)
    {
        var file = args.GetProperty("file").GetString()!;
        var cell = args.GetProperty("cell").GetString()!;
        var value = args.GetProperty("value").GetString()!;
        using var wb = new XLWorkbook(file);
        wb.Worksheet(1).Cell(cell).Value = value;
        wb.Save();
        return new { written = true };
    }

    public static object ReadRange(JsonElement args)
    {
        var file = args.GetProperty("file").GetString()!;
        var range = args.GetProperty("range").GetString()!;
        using var wb = new XLWorkbook(file);
        var ws = wb.Worksheet(1);
        var rows = ws.Range(range).Rows()
            .Select(r => r.Cells().Select(c => c.GetValue<string>()).ToArray())
            .ToArray();
        return new { rows };
    }

    public static object RunMacro(JsonElement args)
    {
        var file = args.GetProperty("file").GetString()!;
        var macro = args.GetProperty("macro").GetString()!;

        var excel = new ExcelInterop.Application { Visible = false };
        try
        {
            var wb = excel.Workbooks.Open(file);
            excel.Run(macro);
            wb.Save();
            wb.Close(false);
            return new { ran = true };
        }
        finally
        {
            excel.Quit();
            Marshal.ReleaseComObject(excel);
        }
    }
}
