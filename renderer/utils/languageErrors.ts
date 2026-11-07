/** What the home page says when a language could not be set up, with the raw reason kept for bug reports. */
export const languageSetupFailure = (languageName: string, rawMessage?: string | null): {
  message: string;
  details: string | null;
} => ({
  message: `Couldn't set up ${languageName}. Try again; if it keeps failing, restart Miteiru.`,
  details: rawMessage?.trim() ? rawMessage.trim() : null
});
