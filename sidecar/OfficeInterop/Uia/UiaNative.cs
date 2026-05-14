using System.Runtime.InteropServices;

namespace OfficeInterop.Uia;

internal static class UiaNative
{
    private static readonly nint PerMonitorAwareV2 = unchecked((nint)(-4));

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetProcessDpiAwarenessContext(nint dpiContext);

    internal static void SetPerMonitorDpiAware()
    {
        try
        {
            SetProcessDpiAwarenessContext(PerMonitorAwareV2);
        }
        catch
        {
            /* optional on older Windows */
        }
    }
}
