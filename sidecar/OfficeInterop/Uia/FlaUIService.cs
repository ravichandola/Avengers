using System.Text.Json;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;

namespace OfficeInterop.Uia;

/// <summary>
/// FlaUI-backed UIA (STA-marshaled). Selector and pattern order match <c>WINDOWS_UIA_HELPERS_PS1</c>
/// so the TypeScript adapter can share one element shape for PS vs sidecar.
/// </summary>
internal static class FlaUIService
{
    public static object GetElements(JsonElement args) =>
        UiaStaQueue.Invoke(automation =>
        {
            var app = GetAppRoot(automation, ReadPid(args));
            return CollectElements(app, ReadMax(args));
        });

    public static object Click(JsonElement args)
    {
        RunOnResolvedElement(args, InvokeClick);
        return new { clicked = true };
    }

    public static object Fill(JsonElement args)
    {
        var value = ReadValue(args);
        RunOnResolvedElement(args, el => SetValue(el, value));
        return new { filled = true };
    }

    public static object GetText(JsonElement args) =>
        UiaStaQueue.Invoke(automation =>
        {
            var app = GetAppRoot(automation, ReadPid(args));
            var el = FindForRead(app, ReadSelector(args));
            return new { text = el is null ? string.Empty : ReadText(el) };
        });

    public static object IsVisible(JsonElement args) =>
        UiaStaQueue.Invoke(automation =>
        {
            var app = GetAppRoot(automation, ReadPid(args));
            var needle = ReadSelector(args);
            var el = FindForAction(app, needle) ?? FindLoose(app, needle);
            return new { visible = el is not null && IsReallyVisible(el) };
        });

    private static int ReadPid(JsonElement args) => args.GetProperty("pid").GetInt32();

    private static string ReadSelector(JsonElement args) => args.GetProperty("selector").GetString() ?? string.Empty;

    private static string ReadValue(JsonElement args) =>
        args.TryGetProperty("value", out var v) ? v.GetString() ?? string.Empty : string.Empty;

    private static int ReadMax(JsonElement args, int fallback = 100)
    {
        if (!args.TryGetProperty("max", out var m)) return fallback;
        var n = m.GetInt32();
        return n <= 0 ? fallback : n;
    }

    /// <summary>Resolve selector against the app root (automation id first, then exact name) and run on STA.</summary>
    private static void RunOnResolvedElement(JsonElement args, Action<AutomationElement> action)
    {
        UiaStaQueue.Invoke(automation =>
        {
            var app = GetAppRoot(automation, ReadPid(args));
            var el = FindForAction(app, ReadSelector(args))
                     ?? throw new InvalidOperationException("UIA: Element not found for selector");
            action(el);
        });
    }

    private static AutomationElement GetAppRoot(UIA3Automation automation, int processId)
    {
        var desktop = automation.GetDesktop();
        var app = desktop.FindFirstChild(cf => cf.ByProcessId(processId));
        if (app is null)
            throw new InvalidOperationException($"UIA: No automation root for PID {processId} (is the app running?)");
        return app;
    }

    private static AutomationElement? FindByAutomationId(AutomationElement app, string automationId)
    {
        if (string.IsNullOrEmpty(automationId)) return null;
        return app.FindFirstDescendant(cf => cf.ByAutomationId(automationId));
    }

    private static AutomationElement? FindByNameExact(AutomationElement app, string name)
    {
        if (string.IsNullOrEmpty(name)) return null;
        return app.FindFirstDescendant(cf => cf.ByName(name));
    }

    private static AutomationElement? FindForAction(AutomationElement app, string needle)
    {
        if (string.IsNullOrEmpty(needle)) return null;
        return FindByAutomationId(app, needle) ?? FindByNameExact(app, needle);
    }

    private static AutomationElement? FindForRead(AutomationElement app, string needle)
    {
        if (string.IsNullOrEmpty(needle)) return null;
        return FindByNameExact(app, needle) ?? FindByAutomationId(app, needle);
    }

    private static AutomationElement? FindLoose(AutomationElement app, string needle)
    {
        if (string.IsNullOrEmpty(needle)) return null;
        var comparer = StringComparison.OrdinalIgnoreCase;
        var seen = 0;
        const int max = 600;
        var queue = new Queue<AutomationElement>();
        queue.Enqueue(app);
        while (queue.Count > 0 && seen < max)
        {
            var cur = queue.Dequeue();
            foreach (var ch in cur.FindAllChildren())
            {
                queue.Enqueue(ch);
                seen++;
                var id = ch.Properties.AutomationId.ValueOrDefault ?? string.Empty;
                var nm = ch.Properties.Name.ValueOrDefault ?? string.Empty;
                if (id.Length > 0 && id.Contains(needle, comparer)) return ch;
                if (nm.Length > 0 && nm.Contains(needle, comparer)) return ch;
            }
        }
        return null;
    }

    private static void InvokeClick(AutomationElement el)
    {
        if (el.Patterns.Invoke.IsSupported)
        {
            el.Patterns.Invoke.Pattern.Invoke();
            return;
        }
        if (el.Patterns.Toggle.IsSupported)
        {
            el.Patterns.Toggle.Pattern.Toggle();
            return;
        }
        if (el.Patterns.ExpandCollapse.IsSupported)
        {
            var p = el.Patterns.ExpandCollapse.Pattern;
            var st = p.ExpandCollapseState;
            if (st is ExpandCollapseState.Collapsed or ExpandCollapseState.PartiallyExpanded)
                p.Expand();
            else if (st == ExpandCollapseState.Expanded)
                p.Collapse();
            return;
        }
        if (el.Patterns.SelectionItem.IsSupported)
        {
            el.Patterns.SelectionItem.Pattern.Select();
            return;
        }
        throw new InvalidOperationException("UIA: No Invoke/Toggle/ExpandCollapse/SelectionItem pattern (control not clickable via UIA)");
    }

    private static void SetValue(AutomationElement el, string value)
    {
        if (!el.Patterns.Value.IsSupported)
            throw new InvalidOperationException("UIA: ValuePattern not supported (readonly or non-editable control)");
        var p = el.Patterns.Value.Pattern;
        if (p.IsReadOnly)
            throw new InvalidOperationException("UIA: ValuePattern is read-only");
        p.SetValue(value);
    }

    private static string ReadText(AutomationElement el)
    {
        if (el.Patterns.Value.IsSupported)
        {
            var v = el.Patterns.Value.Pattern.Value;
            if (!string.IsNullOrEmpty(v)) return v;
        }
        if (el.Patterns.Text.IsSupported)
        {
            try
            {
                return el.Patterns.Text.Pattern.DocumentRange.GetText(-1);
            }
            catch
            {
                /* fall through */
            }
        }
        return el.Properties.Name.ValueOrDefault ?? string.Empty;
    }

    private static bool IsReallyVisible(AutomationElement el)
    {
        try
        {
            if (el.Properties.IsOffscreen.ValueOrDefault) return false;
        }
        catch
        {
            return false;
        }
        var r = el.BoundingRectangle;
        return r.Width > 0 && r.Height > 0;
    }

    private static List<Dictionary<string, object?>> CollectElements(AutomationElement app, int limit)
    {
        var outRows = new List<Dictionary<string, object?>>(Math.Min(limit, 64));
        var queue = new Queue<AutomationElement>();
        queue.Enqueue(app);
        while (queue.Count > 0 && outRows.Count < limit)
        {
            var current = queue.Dequeue();
            foreach (var child in current.FindAllChildren())
            {
                queue.Enqueue(child);
                outRows.Add(ToElementRow(child));
            }
        }
        return outRows;
    }

    private static Dictionary<string, object?> ToElementRow(AutomationElement child)
    {
        var r = child.BoundingRectangle;
        return new Dictionary<string, object?>
        {
            ["Id"] = child.Properties.AutomationId.ValueOrDefault ?? string.Empty,
            ["Name"] = child.Properties.Name.ValueOrDefault ?? string.Empty,
            ["Type"] = ProgrammaticControlTypeName(child),
            ["LocalizedType"] = child.Properties.LocalizedControlType.ValueOrDefault ?? string.Empty,
            ["Enabled"] = child.Properties.IsEnabled.ValueOrDefault,
            ["Offscreen"] = child.Properties.IsOffscreen.ValueOrDefault,
            ["X"] = r.X,
            ["Y"] = r.Y,
            ["W"] = r.Width,
            ["H"] = r.Height,
            ["Value"] = TryReadValuePattern(child),
            ["ClassName"] = TryReadClassName(child),
        };
    }

    private static string? TryReadValuePattern(AutomationElement child)
    {
        try
        {
            return child.Patterns.Value.IsSupported ? child.Patterns.Value.Pattern.Value : null;
        }
        catch
        {
            return null;
        }
    }

    private static string TryReadClassName(AutomationElement child)
    {
        try
        {
            return child.Properties.ClassName.ValueOrDefault ?? string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string ProgrammaticControlTypeName(AutomationElement child)
    {
        try
        {
            var s = child.ControlType.ToString();
            if (string.IsNullOrEmpty(s)) return string.Empty;
            return s.StartsWith("ControlType.", StringComparison.OrdinalIgnoreCase) ? s : "ControlType." + s;
        }
        catch
        {
            return string.Empty;
        }
    }
}
