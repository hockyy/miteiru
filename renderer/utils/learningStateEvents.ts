/**
 * Saved words can change without the page that shows them knowing: a progress file or a Gist is
 * loaded from Settings. This tells the page, so My words and the subtitle colours reload.
 */
export const LEARNING_STATE_CHANGED_EVENT = 'miteiru:learning-state-changed';

export const announceLearningStateChanged = (lang: string) => {
  window.dispatchEvent(new CustomEvent(LEARNING_STATE_CHANGED_EVENT, {detail: {lang}}));
};
