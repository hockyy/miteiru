/** Rust accepts Unicode scalars. Lone UTF-16 surrogates are unknown characters with no pronunciation. */
export const nativeReadingText = (text: string): string => text.toWellFormed?.() ?? text.replace(/[\uD800-\uDFFF]/gu, "\uFFFD");
