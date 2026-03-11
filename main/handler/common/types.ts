export interface RegisterCommonHandlersArgs {
  getTokenizer: () => string;
  packageJson: {
    version: string;
  };
  appDataDirectory: string;
}
