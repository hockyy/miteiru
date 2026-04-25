export type LanguagePluginKind = "language" | "resource";

export interface LanguagePluginLoadResult {
  ok: number;
  message: string;
}

export interface LanguagePluginContext {
  appDataDirectory: string;
  setTokenizer: (tokenizerMode: string) => void;
}

export interface LanguagePlugin {
  id: string;
  kind: LanguagePluginKind;
  name: string;
  tokenizerMode?: string;
  languageCode?: string;
  dependencies?: string[];
  setup?: (context: LanguagePluginContext) => Promise<string | void>;
}
