// SRT/ASS markup such as <i>…</i> or {\an8}; kept as-is and ignored when judging case.
const MARKUP = /(<[^>]*>|\{[^}]*\})/;
const UPPERCASE_LETTER = /\p{Lu}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
const ANY_LETTER = /\p{L}/u;
const SENTENCE_END = /[.!?…♪]["'”’»)\]]*\s*$/u;
const DIALOGUE_DASH = /^\s*[-–—]/u;

const textParts = (line: string) => line.split(MARKUP).filter((_, index) => index % 2 === 0);

/**
 * A line counts as all caps when it has at least two letters and every letter is an
 * uppercase Latin letter. Lines with lowercase or non-Latin letters ("Việt Nam",
 * "NHK ニュース") are not all caps.
 */
export const isAllCapsLine = (line: string): boolean => {
  const letters = Array.from(textParts(line).join("")).filter((char) => ANY_LETTER.test(char));
  return letters.length >= 2 && letters.every((letter) => UPPERCASE_LETTER.test(letter) && LATIN_LETTER.test(letter));
};

const sentenceCaseLine = (line: string, capitalizeFirst: boolean) => {
  let pendingCapital = capitalizeFirst;
  return line.split(MARKUP).map((part, index) => {
    if (index % 2 === 1) return part;
    let lowered = part.toLowerCase();
    if (pendingCapital && ANY_LETTER.test(lowered)) {
      lowered = lowered.replace(ANY_LETTER, (letter) => letter.toUpperCase());
      pendingCapital = false;
    }
    return lowered;
  }).join("");
};

/**
 * Sentence-cases the all-caps lines of a subtitle cue and leaves every other line untouched.
 * A line keeps its leading capital when it starts the cue, follows a sentence end, or
 * starts with a dialogue dash.
 */
export const normalizeCapitalization = (text: string): string => {
  let startsSentence = true;
  return text.split(/\r?\n/).map((line) => {
    const result = isAllCapsLine(line)
      ? sentenceCaseLine(line, startsSentence || DIALOGUE_DASH.test(line))
      : line;
    const visible = textParts(line).join("");
    if (ANY_LETTER.test(visible)) startsSentence = SENTENCE_END.test(visible);
    return result;
  }).join("\n");
};
