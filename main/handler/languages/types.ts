export type LanguagePluginKind = "language" | "resource";

export interface LanguagePluginLoadResult {
  ok: number;
  message: string;
}

export interface LanguagePluginContext {
  appDataDirectory: string;
  setTokenizer: (tokenizerMode: string) => void;
}

/** What loading a language's engine for the language tools needs: not the learner's tokenizer setting. */
export type LanguageEngineContext = Pick<LanguagePluginContext, "appDataDirectory">;

export interface LanguagePlugin {
  id: string;
  kind: LanguagePluginKind;
  name: string;
  tokenizerMode?: string;
  languageCode?: string;
  dependencies?: string[];
  /** Home's load: sets the language up as the learner's (the word popup's) language. */
  setup?: (context: LanguagePluginContext) => Promise<string | void>;
  /**
   * The language tools' load: sets up its dictionaries and tokenizer only, leaving the learner's
   * language as it is (Chinese keeps the word popup on the other one). Defaults to `setup`.
   */
  setupEngine?: (context: LanguageEngineContext) => Promise<string | void>;
  /** The data a setup reads (its resolved paths): the same key and a ready engine mean no new setup is needed. */
  engineKey?: (context: LanguageEngineContext) => Promise<string>;
  /** Whether its engine is set up and open now (a dictionary cache removal closes it). */
  engineReady?: () => boolean;
}
