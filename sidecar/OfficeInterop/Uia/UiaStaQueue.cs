using System.Collections.Concurrent;
using FlaUI.UIA3;

namespace OfficeInterop.Uia;

/// <summary>
/// FlaUI / UIA3 and WinForms SendKeys require STA. The console host is MTA, so all UI work
/// is marshaled to a single long-lived STA thread that owns one <see cref="UIA3Automation"/>.
/// </summary>
internal static class UiaStaQueue
{
    private static readonly object InitLock = new();
    private static Thread? _staThread;
    private static UIA3Automation? _automation;
    private static readonly BlockingCollection<Action> Queue = new(new ConcurrentQueue<Action>());

    internal static void Invoke(Action<UIA3Automation> work)
    {
        Invoke(_ =>
        {
            work(_);
            return true;
        });
    }

    internal static T Invoke<T>(Func<UIA3Automation, T> work)
    {
        EnsureStarted();
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        Queue.Add(() =>
        {
            try
            {
                tcs.SetResult(work(_automation!));
            }
            catch (Exception ex)
            {
                tcs.SetException(ex);
            }
        });
        return tcs.Task.GetAwaiter().GetResult();
    }

    private static void EnsureStarted()
    {
        lock (InitLock)
        {
            if (_staThread is not null) return;

            using var ready = new ManualResetEventSlim(false);
            _staThread = new Thread(() =>
            {
                UiaNative.SetPerMonitorDpiAware();
                _automation = new UIA3Automation();
                ready.Set();
                foreach (var action in Queue.GetConsumingEnumerable())
                {
                    try
                    {
                        action();
                    }
                    catch
                    {
                        /* Action body owns TCS; swallow stray failures */
                    }
                }
            })
            {
                IsBackground = true,
            };
            _staThread.SetApartmentState(ApartmentState.STA);
            _staThread.Start();
            ready.Wait();
        }
    }
}
