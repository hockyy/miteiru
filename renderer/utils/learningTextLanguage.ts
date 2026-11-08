/** Explanations use English prose; source-language phrases belong in the separate heading. */
export const isEnglishLearningText = (text: string): boolean => typeof text === 'string'
  && /\p{Script=Latin}/u.test(text)
  && !Array.from(text).some((character) => /\p{L}/u.test(character) && !/\p{Script=Latin}/u.test(character));
