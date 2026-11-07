// hooks/useKeyBind.js
import {useEffect, useMemo} from 'react';
import {useRouter} from "next/router";
import {isTextEntryTarget} from "../utils/keyboardTargets";
import {hasCtrlModifier} from "../utils/platform";
import {keyCommandDefinitions, type KeyCommandId} from "../utils/keyCommands";

/** The `event.code` a command's key is pressed as: `Key` + letter for letters, the name itself otherwise. */
const codeOf = (key: string) => (key.length === 1 ? `Key${key}` : key);

/** Whether a key press goes to a field where typing (Backspace included) belongs to the field. */
const isTypingTarget = (target: EventTarget | null) =>
    isTextEntryTarget(target) || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

export default function useKeyBind(
    setMeaning,
    setShowController,
    setShowSidebar,
    // Steps back to the previous word in the word popup.
    undo,
    setShowPrimarySub,
    setShowSecondarySub,
    primaryStyling,
    setPrimaryStyling,
    openDeepL,
    openGoogleTranslate,
    reloadLastPrimarySubtitle,
    reloadLastSecondarySubtitle,
    setShowVocabSidebar,
    rubyContent,
    contentString,
    setShowLyricsSearch,
    // Opens the video and subtitle picker.
    openFiles,
    // The language being learned ("Japanese"), named in the commands about its subtitle.
    languageName: string = 'main'
) {
  const router = useRouter();

  // The actions, by command id (the names and keys are in utils/keyCommands.ts, which the shortcut
  // sheet and the command palette read too).
  const commands = useMemo(() => {
    const copy = async (text: string) => {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        console.error("Failed to copy text: ", err);
      }
    };
    const actions: Record<KeyCommandId, () => void | Promise<void>> = {
      'close-meaning': () => setMeaning(""),
      'meaning-back': () => undo(),
      'clear-meaning': () => setMeaning(""),
      // Home keeps the language in use selected (it is the remembered "last used" one).
      'go-home': async () => {
        await router.push('/home');
      },
      'go-learn': async () => {
        await router.push('/learn');
      },
      'go-flash': async () => {
        await router.push('/flash');
      },
      'open-files': () => openFiles(),
      'search-lyrics': () => setShowLyricsSearch(old => !old),
      'toggle-controller': () => setShowController(old => !old),
      'toggle-sidebar': () => setShowSidebar(old => !old),
      'toggle-vocab-sidebar': () => setShowVocabSidebar(old => !old),
      'toggle-furigana': () => {
        const newCopy = JSON.parse(JSON.stringify(primaryStyling));
        newCopy.showFurigana = !primaryStyling.showFurigana;
        setPrimaryStyling(newCopy);
      },
      'toggle-primary-sub': () => setShowPrimarySub(old => !old),
      'toggle-secondary-sub': () => setShowSecondarySub(old => !old),
      'reload-subtitles': () => {
        reloadLastSecondarySubtitle();
        reloadLastPrimarySubtitle();
      },
      'open-google-translate': () => openGoogleTranslate(),
      'open-deepl': () => openDeepL(),
      'copy-ruby': () => copy(rubyContent),
      'copy-content': () => copy(contentString),
    };
    return keyCommandDefinitions(languageName).map(definition => ({...definition, handler: actions[definition.id]}));
  }, [
    router, setMeaning, setShowController, setShowSidebar, openFiles, languageName,
    setPrimaryStyling, setShowPrimarySub,
    setShowSecondarySub, undo, primaryStyling, openGoogleTranslate, openDeepL,
    reloadLastSecondarySubtitle, reloadLastPrimarySubtitle, setShowVocabSidebar,
    rubyContent, contentString, setShowLyricsSearch
  ]);

  useEffect(() => {
    const handleKeyPress = async (event) => {
      if (isTextEntryTarget(event.target)) {
        return;
      }
      // Backspace belongs to any field the focus is in, not only to text fields.
      if (event.code === 'Backspace' && isTypingTarget(event.target)) {
        return;
      }

      // Find the command for this key. Its modifiers must all be held, and no others.
      const ctrl = hasCtrlModifier(event);
      const matchingCommand = commands.find(cmd => (
          event.code === codeOf(cmd.currentKey) &&
          cmd.modifiers.includes('Ctrl') === ctrl &&
          cmd.modifiers.includes('Shift') === event.shiftKey &&
          cmd.modifiers.includes('Alt') === event.altKey
      ));

      if (matchingCommand) {
        event.preventDefault();
        await matchingCommand.handler();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [commands]);

  return commands;
}
