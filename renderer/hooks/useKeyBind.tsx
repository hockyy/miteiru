// hooks/useKeyBind.js
import {useEffect, useMemo} from 'react';
import {setGlobalSubtitleId, SubtitleContainer} from "../components/Subtitle/DataStructures";
import {useRouter} from "next/router";

export default function useKeyBind(
    setMeaning,
    setShowController,
    setShowSidebar,
    setPrimarySub,
    setSecondarySub,
    primarySub,
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
    setShowLyricsSearch
) {
  const router = useRouter();

  // Define all commands with their metadata
  const commands = useMemo(() => [
    {
      id: 'clear-meaning',
      commandName: 'Clear Meaning',
      currentKey: 'H',
      modifiers: [],
      category: 'General',
      handler: () => {
        setMeaning("");
      }
    },
    {
      id: 'go-home',
      commandName: 'Go to Home',
      currentKey: 'H',
      modifiers: ['Ctrl'],
      category: 'Navigation',
      handler: async () => {
        await router.push('/home');
      }
    },
    {
      id: 'go-learn',
      commandName: 'Go to Learn Page',
      currentKey: 'L',
      modifiers: ['Shift'],
      category: 'Navigation',
      handler: async () => {
        await router.push('/learn');
      }
    },
    {
      id: 'search-lyrics',
      commandName: 'Search Lyrics',
      currentKey: 'M',
      modifiers: [],
      category: 'Media',
      handler: () => {
        setShowLyricsSearch(old => !old);
      }
    },
    {
      id: 'go-flash',
      commandName: 'Go to Flashcards',
      currentKey: 'K',
      modifiers: ['Shift'],
      category: 'Navigation',
      handler: async () => {
        await router.push('/flash');
      }
    },
    {
      id: 'toggle-controller',
      commandName: 'Toggle Video Controller',
      currentKey: 'Z',
      modifiers: [],
      category: 'UI',
      handler: () => {
        setShowController(old => !old);
      }
    },
    {
      id: 'toggle-sidebar',
      commandName: 'Toggle Sidebar',
      currentKey: 'X',
      modifiers: [],
      category: 'UI',
      handler: () => {
        setShowSidebar(old => !old);
      }
    },
    {
      id: 'toggle-vocab-sidebar',
      commandName: 'Toggle Vocabulary Sidebar',
      currentKey: 'X',
      modifiers: ['Ctrl'],
      category: 'UI',
      handler: () => {
        setShowVocabSidebar(old => !old);
      }
    },
    {
      id: 'toggle-furigana',
      commandName: 'Toggle Furigana',
      currentKey: 'Y',
      modifiers: [],
      category: 'Subtitles',
      handler: () => {
        const newCopy = JSON.parse(JSON.stringify(primaryStyling));
        newCopy.showFurigana = !primaryStyling.showFurigana;
        setPrimaryStyling(newCopy);
      }
    },
    {
      id: 'toggle-primary-sub',
      commandName: 'Toggle Primary Subtitle',
      currentKey: 'O',
      modifiers: [],
      category: 'Subtitles',
      handler: () => {
        setShowPrimarySub(old => !old);
      }
    },
    {
      id: 'clear-primary-sub',
      commandName: 'Clear Primary Subtitle',
      currentKey: 'O',
      modifiers: ['Ctrl'],
      category: 'Subtitles',
      handler: () => {
        setPrimarySub(new SubtitleContainer(''));
        setGlobalSubtitleId(primarySub.id);
      }
    },
    {
      id: 'toggle-secondary-sub',
      commandName: 'Toggle Secondary Subtitle',
      currentKey: 'P',
      modifiers: [],
      category: 'Subtitles',
      handler: () => {
        setShowSecondarySub(old => !old);
      }
    },
    {
      id: 'clear-secondary-sub',
      commandName: 'Clear Secondary Subtitle',
      currentKey: 'P',
      modifiers: ['Ctrl'],
      category: 'Subtitles',
      handler: () => {
        setSecondarySub(new SubtitleContainer(''));
      }
    },
    {
      id: 'undo',
      commandName: 'Undo',
      currentKey: 'Escape',
      modifiers: [],
      category: 'General',
      handler: () => {
        undo();
      }
    },
    {
      id: 'open-google-translate',
      commandName: 'Open Google Translate',
      currentKey: 'G',
      modifiers: [],
      category: 'Translation',
      handler: () => {
        openGoogleTranslate();
      }
    },
    {
      id: 'open-deepl',
      commandName: 'Open DeepL',
      currentKey: 'T',
      modifiers: [],
      category: 'Translation',
      handler: () => {
        openDeepL();
      }
    },
    {
      id: 'reload-subtitles',
      commandName: 'Reload All Subtitles',
      currentKey: 'A',
      modifiers: [],
      category: 'Subtitles',
      handler: () => {
        reloadLastSecondarySubtitle();
        reloadLastPrimarySubtitle();
      }
    },
    {
      id: 'copy-ruby',
      commandName: 'Copy Ruby Content',
      currentKey: 'C',
      modifiers: [],
      category: 'Clipboard',
      handler: async () => {
        if (rubyContent) {
          try {
            await navigator.clipboard.writeText(rubyContent);
          } catch (err) {
            console.error("Failed to copy text: ", err);
          }
        }
      }
    },
    {
      id: 'copy-content',
      commandName: 'Copy Content String',
      currentKey: 'C',
      modifiers: ['Shift'],
      category: 'Clipboard',
      handler: async () => {
        if (contentString) {
          try {
            await navigator.clipboard.writeText(contentString);
          } catch (err) {
            console.error("Failed to copy text: ", err);
          }
        }
      }
    }
  ], [
    router, setMeaning, setShowController, setShowSidebar, setPrimarySub,
    setSecondarySub, setPrimaryStyling, primarySub.id, setShowPrimarySub,
    setShowSecondarySub, undo, primaryStyling, openGoogleTranslate, openDeepL,
    reloadLastSecondarySubtitle, reloadLastPrimarySubtitle, setShowVocabSidebar,
    rubyContent, contentString, setShowLyricsSearch
  ]);

  useEffect(() => {
    const handleKeyPress = async (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
      }

      // Find matching command
      const matchingCommand = commands.find(cmd => {
        const keyMatch = (cmd.currentKey === 'Escape' && event.code === 'Escape') ||
            (event.code === `Key${cmd.currentKey}`);

        if (!keyMatch) return false;

        const modifiersMatch =
            cmd.modifiers.includes('Ctrl') === event.ctrlKey &&
            cmd.modifiers.includes('Shift') === event.shiftKey &&
            cmd.modifiers.includes('Alt') === event.altKey &&
            (!cmd.modifiers.length || cmd.modifiers.some(m =>
                (m === 'Ctrl' && event.ctrlKey) ||
                (m === 'Shift' && event.shiftKey) ||
                (m === 'Alt' && event.altKey)
            ));

        return modifiersMatch || (!cmd.modifiers.length && !event.ctrlKey && !event.shiftKey && !event.altKey);
      });

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