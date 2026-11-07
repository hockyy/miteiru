// components/CommandPalette/CommandPalette.jsx
import React, {useState, useMemo, useEffect, useRef, useCallback, useId} from 'react';
import {Command, X, Search} from 'lucide-react';
import {commandKeys} from '../../utils/shortcuts';
import {hasCtrlModifier} from '../../utils/platform';
import {useDialogFocus} from '../../hooks/useDialogFocus';

const CommandPalette = ({showCommandPalette, setShowCommandPalette, commands}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Before the search box takes focus below, so focus goes back to where it was on close. Esc is handled further down.
  useDialogFocus(dialogRef, {active: showCommandPalette});

  // Add a keyboard shortcut to open the command palette (e.g., Ctrl+Shift+P)
  useEffect(() => {
    const handleCommandPalette = (e) => {
      if (hasCtrlModifier(e) && e.shiftKey && e.code === 'KeyP') {
        e.preventDefault();
        setShowCommandPalette(old => !old);
      }
    };

    window.addEventListener('keydown', handleCommandPalette);
    return () => window.removeEventListener('keydown', handleCommandPalette);
  }, [setShowCommandPalette]);

  // Focus search input when palette opens
  useEffect(() => {
    if (showCommandPalette && searchInputRef.current) {
      searchInputRef.current.focus();
      setSearchQuery(''); // Clear search when opening
    }
  }, [showCommandPalette]);

  // Fuzzy search function
  const fuzzyMatch = useCallback((str, pattern) => {
    pattern = pattern.toLowerCase();
    str = str.toLowerCase();

    let patternIdx = 0;
    let strIdx = 0;
    const matchedIndexes = [];

    while (strIdx < str.length && patternIdx < pattern.length) {
      if (str[strIdx] === pattern[patternIdx]) {
        matchedIndexes.push(strIdx);
        patternIdx++;
      }
      strIdx++;
    }

    return patternIdx === pattern.length ? matchedIndexes : null;
  }, []);

  // Group commands by category with fuzzy search
  const groupedCommands = useMemo(() => {
    const filtered = commands.filter(cmd => {
      if (!searchQuery) return true;

      // Check if fuzzy match exists in command name or category
      const nameMatch = fuzzyMatch(cmd.commandName, searchQuery);
      const categoryMatch = fuzzyMatch(cmd.category, searchQuery);

      return nameMatch || categoryMatch;
    });

    return filtered.reduce((acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = [];
      }
      acc[cmd.category].push(cmd);
      return acc;
    }, {});
  }, [commands, fuzzyMatch, searchQuery]);

  const formatKeybinding = (cmd) => commandKeys(cmd);

  const handleCommandClick = async (cmd) => {
    await cmd.handler();
    setShowCommandPalette(false);
  };

  // Prevent event propagation when palette is open
  useEffect(() => {
    if (!showCommandPalette) return;

    const stopPropagation = (e) => {
      // Allow Escape to close the palette
      if (e.code === 'Escape') {
        // Closing the palette should not also close the meaning box or undo.
        e.stopPropagation();
        setShowCommandPalette(false);
        return;
      }

      // Allow Ctrl+Shift+P to toggle
      if (hasCtrlModifier(e) && e.shiftKey && e.code === 'KeyP') {
        return;
      }

      // Stop all other shortcuts when palette is open
      e.stopPropagation();
    };

    // Capture phase to prevent shortcuts before they reach other handlers
    window.addEventListener('keydown', stopPropagation, true);

    return () => {
      window.removeEventListener('keydown', stopPropagation, true);
    };
  }, [showCommandPalette, setShowCommandPalette]);

  if (!showCommandPalette) return null;

  return (
      <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setShowCommandPalette(false)}
      >
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col focus:outline-none"
            onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 id={titleId} className="text-xl font-semibold text-white flex items-center gap-2">
              <Command className="w-5 h-5"/>
              Keyboard Shortcuts
            </h2>
            <button
                type="button"
                aria-label="Close"
                onClick={() => setShowCommandPalette(false)}
                className="text-gray-400 hover:text-white transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="w-5 h-5"/>
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-gray-700">
            <div className="relative">
              <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"/>
              <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search commands..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Commands List */}
          <div className="flex-1 overflow-y-auto p-4">
            {Object.keys(groupedCommands).length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  No commands found matching &quot;{searchQuery}&quot;
                </div>
            ) : (
                Object.entries(groupedCommands).map(([category, categoryCommands]) => (
                    <div key={category} className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        {category}
                      </h3>
                      <div className="space-y-1">
                        {(categoryCommands as any[]).map((cmd) => (
                            <button
                                key={cmd.id}
                                onClick={() => handleCommandClick(cmd)}
                                className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                            >
                              <span className="text-white text-left">{cmd.commandName}</span>
                              <kbd
                                  className="px-2 py-1 text-xs font-semibold text-gray-300 bg-gray-900 rounded">
                                {formatKeybinding(cmd)}
                              </kbd>
                            </button>
                        ))}
                      </div>
                    </div>
                ))
            )}
          </div>
        </div>
      </div>
  );
};

export default CommandPalette;