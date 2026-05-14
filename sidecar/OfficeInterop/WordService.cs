using System.Runtime.InteropServices;
using System.Text.Json;
using WordInterop = Microsoft.Office.Interop.Word;

public static class WordService
{
    public static object Open(JsonElement args)
    {
        var file = args.GetProperty("file").GetString()!;
        if (!File.Exists(file))
            throw new FileNotFoundException(file);
        return new { opened = true, file };
    }

    public static object InsertText(JsonElement args)
    {
        var file = args.GetProperty("file").GetString()!;
        var bookmark = args.GetProperty("bookmark").GetString()!;
        var text = args.GetProperty("text").GetString()!;

        var word = new WordInterop.Application { Visible = false };
        try
        {
            var doc = word.Documents.Open(file);
            if (doc.Bookmarks.Exists(bookmark))
                doc.Bookmarks[bookmark].Range.Text = text;
            doc.Save();
            doc.Close();
            return new { inserted = true };
        }
        finally
        {
            word.Quit();
            Marshal.ReleaseComObject(word);
        }
    }

    public static object ExportPdf(JsonElement args)
    {
        var file = args.GetProperty("file").GetString()!;
        var output = args.GetProperty("output").GetString()!;

        var word = new WordInterop.Application { Visible = false };
        try
        {
            var doc = word.Documents.Open(file);
            doc.ExportAsFixedFormat(output, WordInterop.WdExportFormat.wdExportFormatPDF);
            doc.Close(false);
            return new { exported = true, output };
        }
        finally
        {
            word.Quit();
            Marshal.ReleaseComObject(word);
        }
    }
}
