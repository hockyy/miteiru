export interface AppErrorReport {
  message: string;
  stack: string;
  componentStack: string;
}

const readText = (value: unknown, key: string): string => {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return '';
  try {
    const field = value[key];
    return typeof field === 'string' ? field : '';
  } catch {
    return '';
  }
};

// Diagnostics stay local and contain only error text, never request/config/prompt objects.
// Also mask common credentials if a library includes them in its own error message or URL.
const cleanErrorText = (text: string, limit: number) => text
  .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
  .replace(/\bsk-[a-z0-9_-]{12,}/gi, '[redacted]')
  .replace(/([?&]key=)[^&#\s]+/gi, '$1[redacted]')
  .replace(/((?:api[_ -]?key|access[_ -]?token|authorization|token)\s*["']?\s*[:=]\s*["']?)[^\s"'&,}\r\n]+/gi, '$1[redacted]')
  .slice(0, limit);

export const createAppErrorReport = (error: unknown, componentStack = ''): AppErrorReport => ({
  message: cleanErrorText((typeof error === 'string' ? error : readText(error, 'message')) || 'Error details were not provided.', 16000),
  stack: cleanErrorText(readText(error, 'stack'), 32000),
  componentStack: cleanErrorText(typeof componentStack === 'string' ? componentStack : '', 16000)
});

export const formatAppErrorReport = (report: AppErrorReport): string => [
  'Miteiru client error',
  report.message,
  report.stack && `JavaScript stack:\n${report.stack}`,
  report.componentStack && `React component stack:\n${report.componentStack}`
].filter(Boolean).join('\n\n');
