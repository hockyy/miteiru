using System.Diagnostics;
using System.Text.Json;
using System.Windows.Automation;

namespace Miteiru.LiveCaptionsBridge;

internal static class Program
{
    private const string ProcessName = "LiveCaptions";
    private const string CaptionAutomationId = "CaptionsTextBlock";
    private const int MaxCaptionChars = 120;
    private static AutomationElement? captionsTextBlock;
    private static readonly char[] SentenceBreaks =
    [
        '.', '!', '?', ',', ';', ':',
        '。', '！', '？', '，', '、', '；', '：',
        '\n'
    ];

    public static int Main()
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        try
        {
            using var cancellation = new CancellationTokenSource();
            Console.CancelKeyPress += (_, eventArgs) =>
            {
                eventArgs.Cancel = true;
                cancellation.Cancel();
            };

            WriteMessage("debug", "Helper process started.");
            var window = LaunchLiveCaptions();
            WriteMessage("state", "started");
            StreamCaptions(window, cancellation.Token);
            WriteMessage("state", "stopped");
            return 0;
        }
        catch (OperationCanceledException)
        {
            WriteMessage("state", "stopped");
            return 0;
        }
        catch (Exception error)
        {
            WriteMessage("error", error.Message);
            return 1;
        }
    }

    private static AutomationElement LaunchLiveCaptions()
    {
        var existingWindow = FindWindowByClassName("LiveCaptionsDesktopWindow");
        if (existingWindow != null)
        {
            WriteMessage("debug", "Found existing Live Captions desktop window.");
            return existingWindow;
        }

        WriteMessage("debug", "Looking for existing Windows Live Captions process.");
        var existingProcesses = Process.GetProcessesByName(ProcessName);
        if (existingProcesses.Length > 0)
        {
            WriteMessage("debug", $"Found {existingProcesses.Length} LiveCaptions process(es), but no window. Restarting stale process(es).");
            foreach (var existingProcess in existingProcesses)
            {
                try
                {
                    existingProcess.Kill();
                    existingProcess.WaitForExit(3000);
                }
                catch (Exception error)
                {
                    WriteMessage("debug", $"Could not stop stale LiveCaptions process {existingProcess.Id}: {error.Message}");
                }
            }
        }

        var process = Process.Start(ProcessName);

        WriteMessage(
            "debug",
            $"Started LiveCaptions process {process?.Id}.");

        if (process == null)
        {
            throw new InvalidOperationException("Failed to start Windows Live Captions.");
        }

        for (var attempt = 0; attempt < 400; attempt++)
        {
            if (process.HasExited)
            {
                throw new InvalidOperationException($"Windows Live Captions exited early with code {process.ExitCode}.");
            }

            var window = FindWindowByProcessId(process.Id) ?? FindWindowByClassName("LiveCaptionsDesktopWindow");
            if (window != null && window.Current.ClassName == "LiveCaptionsDesktopWindow")
            {
                WriteMessage("debug", "Found Live Captions desktop window.");
                return window;
            }

            if (attempt % 40 == 0)
            {
                WriteMessage("debug", $"Waiting for Live Captions window... attempt {attempt}/400.");
            }

            Thread.Sleep(50);
        }

        throw new TimeoutException("Timed out waiting for Windows Live Captions.");
    }

    private static void StreamCaptions(AutomationElement window, CancellationToken cancellationToken)
    {
        var lastText = string.Empty;
        var hasSkippedInitialCaption = false;
        var missingCaptionElementCount = 0;
        WriteMessage("debug", "Starting caption polling loop.");

        while (!cancellationToken.IsCancellationRequested)
        {
            string text;
            try
            {
                text = ExtractLatestCaption(GetCaptions(window));
            }
            catch (ElementNotAvailableException)
            {
                WriteMessage("debug", "Live Captions automation element disappeared. Relaunching.");
                captionsTextBlock = null;
                window = LaunchLiveCaptions();
                WriteMessage("state", "restarted");
                Thread.Sleep(200);
                continue;
            }

            if (!string.Equals(text, lastText, StringComparison.Ordinal))
            {
                lastText = text;
                if (!hasSkippedInitialCaption)
                {
                    hasSkippedInitialCaption = true;
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        WriteMessage("debug", $"Skipped initial cached Live Captions text ({text.Length} chars).");
                        continue;
                    }
                }
                WriteCaption(text);
            }
            else if (captionsTextBlock == null)
            {
                missingCaptionElementCount++;
                if (missingCaptionElementCount % 25 == 0)
                {
                    WriteMessage("debug", "CaptionsTextBlock not found yet. Is Windows Live Captions fully configured?");
                }
            }

            Thread.Sleep(80);
        }

        cancellationToken.ThrowIfCancellationRequested();
    }

    private static string GetCaptions(AutomationElement window)
    {
        captionsTextBlock ??= FindElementByAutomationId(window, CaptionAutomationId);
        return captionsTextBlock?.Current.Name ?? string.Empty;
    }

    private static string ExtractLatestCaption(string rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return string.Empty;
        }

        var lines = rawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n')
            .Select(line => line.Trim())
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToArray();

        var candidate = lines.Length == 0
            ? rawText.Trim()
            : string.Join(" ", lines.Skip(Math.Max(0, lines.Length - 2)));

        candidate = string.Join(" ", candidate.Split(
            [' ', '\t', '\n', '\r'],
            StringSplitOptions.RemoveEmptyEntries));

        if (candidate.Length <= MaxCaptionChars)
        {
            return candidate;
        }

        var searchStart = Math.Max(0, candidate.Length - MaxCaptionChars);
        var breakIndex = candidate.LastIndexOfAny(SentenceBreaks, candidate.Length - 1, candidate.Length - searchStart);
        if (breakIndex >= searchStart && breakIndex + 1 < candidate.Length)
        {
            return candidate[(breakIndex + 1)..].Trim();
        }

        return candidate[^MaxCaptionChars..].Trim();
    }

    private static AutomationElement? FindWindowByProcessId(int processId)
    {
        var condition = new PropertyCondition(AutomationElement.ProcessIdProperty, processId);
        return AutomationElement.RootElement.FindFirst(TreeScope.Children, condition);
    }

    private static AutomationElement? FindWindowByClassName(string className)
    {
        var condition = new PropertyCondition(AutomationElement.ClassNameProperty, className);
        return AutomationElement.RootElement.FindFirst(TreeScope.Children, condition);
    }

    private static AutomationElement? FindElementByAutomationId(AutomationElement window, string automationId)
    {
        var condition = new PropertyCondition(AutomationElement.AutomationIdProperty, automationId);
        return window.FindFirst(TreeScope.Descendants, condition);
    }

    private static void WriteCaption(string text)
    {
        WriteJson(new
        {
            type = "caption",
            text
        });
    }

    private static void WriteMessage(string type, string message)
    {
        WriteJson(new
        {
            type,
            message
        });
    }

    private static void WriteJson(object payload)
    {
        Console.WriteLine(JsonSerializer.Serialize(payload));
        Console.Out.Flush();
    }
}
