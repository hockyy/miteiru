using System.Diagnostics;
using System.Text.Json;
using System.Windows.Automation;

namespace Miteiru.LiveCaptionsBridge;

internal static class Program
{
    private const string ProcessName = "LiveCaptions";
    private const string CaptionAutomationId = "CaptionsTextBlock";
    private const int MaxCaptionChars = 70;
    private const int CaptionCharsToKeepAfterOverflow = 10;
    private const int MaxCaptionWords = 12;
    private static AutomationElement? captionsTextBlock;

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
        var windowStart = 0;
        var hasSkippedInitialCaption = false;
        var missingCaptionElementCount = 0;
        WriteMessage("debug", "Starting caption polling loop.");

        while (!cancellationToken.IsCancellationRequested)
        {
            string text;
            try
            {
                var rollingBuffer = NormalizeLiveCaptionsBuffer(GetCaptions(window));
                if (!hasSkippedInitialCaption)
                {
                    hasSkippedInitialCaption = true;
                    if (!string.IsNullOrWhiteSpace(rollingBuffer))
                    {
                        WriteMessage("debug", $"Skipped initial cached Live Captions text ({rollingBuffer.Length} chars).");
                        continue;
                    }
                }

                text = ExtractCaptionWindow(rollingBuffer, ref windowStart);
            }
            catch (ElementNotAvailableException)
            {
                WriteMessage("debug", "Live Captions automation element disappeared. Relaunching.");
                captionsTextBlock = null;
                window = LaunchLiveCaptions();
                windowStart = 0;
                lastText = string.Empty;
                hasSkippedInitialCaption = false;
                WriteMessage("state", "restarted");
                Thread.Sleep(200);
                continue;
            }

            if (!string.Equals(text, lastText, StringComparison.Ordinal))
            {
                lastText = text;
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

    private static string NormalizeLiveCaptionsBuffer(string rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return string.Empty;
        }

        var rollingBuffer = rawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n')
            .Select(line => line.Trim())
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToArray();

        return NormalizeSpaces(string.Join(" ", rollingBuffer));
    }

    private static string NormalizeSpaces(string text)
    {
        return string.Join(" ", text.Split(
            [' ', '\t', '\n', '\r'],
            StringSplitOptions.RemoveEmptyEntries));
    }

    private static string ExtractCaptionWindow(string rollingBuffer, ref int windowStart)
    {
        if (string.IsNullOrWhiteSpace(rollingBuffer))
        {
            windowStart = 0;
            return string.Empty;
        }

        windowStart = Math.Clamp(windowStart, 0, rollingBuffer.Length);

        if (rollingBuffer.Length - windowStart > MaxCaptionChars)
        {
            windowStart = Math.Max(0, rollingBuffer.Length - CaptionCharsToKeepAfterOverflow);
        }

        var window = rollingBuffer[windowStart..].TrimStart();

        var words = window.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length > MaxCaptionWords)
        {
            window = string.Join(" ", words.Skip(words.Length - MaxCaptionWords));
        }

        if (window.Length > MaxCaptionChars)
        {
            window = window[^MaxCaptionChars..].TrimStart();
        }

        return window;
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
