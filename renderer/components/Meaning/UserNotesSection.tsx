import React, { useCallback, useState, useEffect } from 'react';
import { AwesomeButton } from 'react-awesome-button';
import { MiteiruUserEntry } from '../../hooks/useUserNotes';

interface UserNotesSectionProps {
  term: string;
  userNote: MiteiruUserEntry | null;
  onSave: (entry: MiteiruUserEntry) => Promise<void>;
  onDelete: () => Promise<void>;
  onAIGenerate: () => Promise<void>;
  isGenerating: boolean;
  onNavigateToTerm: (term: string) => void;
}

export const UserNotesSection: React.FC<UserNotesSectionProps> = ({
  term,
  userNote,
  onSave,
  onDelete,
  onAIGenerate,
  isGenerating,
  onNavigateToTerm
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [usageNote, setUsageNote] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [newExample, setNewExample] = useState('');
  const [relatedTerms, setRelatedTerms] = useState<string[]>([]);
  const [newRelatedTerm, setNewRelatedTerm] = useState('');

  useEffect(() => {
    if (userNote) {
      setUsageNote(userNote.usageNote || '');
      setExamples(userNote.examples || []);
      setRelatedTerms(userNote.relatedTerms || []);
    } else {
      setUsageNote('');
      setExamples([]);
      setRelatedTerms([]);
    }
  }, [userNote, term]);

  const handleSave = useCallback(async () => {
    await onSave({
      usageNote,
      examples: examples.filter(ex => ex.trim() !== ''),
      relatedTerms: relatedTerms.filter(term => term.trim() !== '')
    });
    setIsEditing(false);
  }, [usageNote, examples, relatedTerms, onSave]);

  const handleAddExample = useCallback(() => {
    if (newExample.trim()) {
      setExamples([...examples, newExample.trim()]);
      setNewExample('');
    }
  }, [examples, newExample]);

  const handleRemoveExample = useCallback((index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
  }, [examples]);

  const handleAddRelatedTerm = useCallback(() => {
    if (newRelatedTerm.trim()) {
      setRelatedTerms([...relatedTerms, newRelatedTerm.trim()]);
      setNewRelatedTerm('');
    }
  }, [relatedTerms, newRelatedTerm]);

  const handleRemoveRelatedTerm = useCallback((index: number) => {
    setRelatedTerms(relatedTerms.filter((_, i) => i !== index));
  }, [relatedTerms]);

  const handleCancel = useCallback(() => {
    if (userNote) {
      setUsageNote(userNote.usageNote || '');
      setExamples(userNote.examples || []);
      setRelatedTerms(userNote.relatedTerms || []);
    } else {
      setUsageNote('');
      setExamples([]);
      setRelatedTerms([]);
    }
    setIsEditing(false);
  }, [userNote]);

  // Helper to bold the current term in text
  const boldCurrentTerm = useCallback((text: string) => {
    if (!text || typeof text !== 'string') return '';
    if (!term) return text;
    
    try {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      return parts.map((part, index) => 
        part.toLowerCase() === term.toLowerCase() 
          ? <strong key={index} className="font-bold text-green-900">{part}</strong>
          : part
      );
    } catch (error) {
      console.error('Error bolding term in text:', text, 'term:', term, error);
      return text;
    }
  }, [term]);

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-500 rounded-lg p-5 my-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-green-900 font-bold text-lg flex items-center gap-2">
          📝 My Notes
          {userNote && !isEditing && (
            <span className="text-sm font-normal text-green-600">(Saved)</span>
          )}
        </h3>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <AwesomeButton
                type="primary"
                size="small"
                onPress={() => setIsEditing(true)}
              >
                {userNote ? '✏️ Edit' : '➕ Add Note'}
              </AwesomeButton>
              {userNote && (
                <AwesomeButton
                  type="secondary"
                  size="small"
                  onPress={onAIGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? '⏳ Generating...' : '🤖 AI Enhance'}
                </AwesomeButton>
              )}
            </>
          ) : (
            <>
              <AwesomeButton
                type="primary"
                size="small"
                onPress={handleSave}
              >
                💾 Save
              </AwesomeButton>
              <AwesomeButton
                type="secondary"
                size="small"
                onPress={handleCancel}
              >
                ✕ Cancel
              </AwesomeButton>
            </>
          )}
        </div>
      </div>

      {!userNote && !isEditing ? (
        <div className="text-center py-6">
          <p className="text-gray-600 mb-3">No personal notes for "{term}" yet</p>
          <div className="flex gap-2 justify-center">
            <AwesomeButton
              type="primary"
              onPress={() => setIsEditing(true)}
            >
              ➕ Create Note
            </AwesomeButton>
            <AwesomeButton
              type="secondary"
              onPress={onAIGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? '⏳ Generating...' : '🤖 AI Generate'}
            </AwesomeButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Usage Note */}
          <div>
            <label className="block text-green-900 font-semibold mb-2">
              Usage Note
            </label>
            {isEditing ? (
              <textarea
                value={usageNote}
                onChange={(e) => setUsageNote(e.target.value)}
                placeholder="Add your personal notes about how to use this term..."
                className="w-full p-3 border-2 border-green-300 rounded-lg text-black focus:border-green-500 focus:outline-none min-h-[100px]"
              />
            ) : (
              <div className="bg-white p-3 rounded-lg border border-green-200 text-black whitespace-pre-wrap">
                {usageNote || <span className="text-gray-400 italic">No usage note</span>}
              </div>
            )}
          </div>

          {/* Examples */}
          <div>
            <label className="block text-green-900 font-semibold mb-2">
              Example Sentences
            </label>
            <div className="space-y-2">
              {examples.map((example, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-grow bg-white p-3 rounded-lg border border-green-200 text-black">
                    {boldCurrentTerm(example)}
                  </div>
                  {isEditing && (
                    <button
                      onClick={() => handleRemoveExample(index)}
                      className="text-red-600 hover:text-red-800 font-bold px-2 py-1"
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {examples.length === 0 && !isEditing && (
                <div className="bg-white p-3 rounded-lg border border-green-200 text-gray-400 italic">
                  No examples yet
                </div>
              )}
            </div>
            {isEditing && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newExample}
                  onChange={(e) => setNewExample(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddExample()}
                  placeholder="Add an example sentence..."
                  className="flex-grow p-2 border-2 border-green-300 rounded-lg text-black focus:border-green-500 focus:outline-none"
                />
                <AwesomeButton
                  type="primary"
                  size="small"
                  onPress={handleAddExample}
                >
                  ➕ Add
                </AwesomeButton>
              </div>
            )}
          </div>

          {/* Related Terms / See More */}
          <div>
            <label className="block text-green-900 font-semibold mb-2">
              Related Terms / See More
            </label>
            <div className="space-y-2">
              {relatedTerms.map((relatedTerm, index) => {
                // Handle both string and object formats
                const termText = typeof relatedTerm === 'string' ? relatedTerm : (relatedTerm as any)?.sentence || JSON.stringify(relatedTerm);
                return (
                  <div key={index} className="flex gap-2 items-center">
                    <button
                      onClick={() => !isEditing && onNavigateToTerm(termText)}
                      className={`flex-grow bg-white p-2 rounded-lg border border-green-200 text-black text-left ${
                        !isEditing ? 'hover:bg-green-50 hover:border-green-400 cursor-pointer transition-colors' : ''
                      }`}
                      disabled={isEditing}
                    >
                      {!isEditing && <span className="text-green-600 mr-2">🔗</span>}
                      {boldCurrentTerm(termText)}
                    </button>
                    {isEditing && (
                      <button
                        onClick={() => handleRemoveRelatedTerm(index)}
                        className="text-red-600 hover:text-red-800 font-bold px-2 py-1"
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
              {relatedTerms.length === 0 && !isEditing && (
                <div className="bg-white p-3 rounded-lg border border-green-200 text-gray-400 italic">
                  No related terms yet
                </div>
              )}
            </div>
            {isEditing && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newRelatedTerm}
                  onChange={(e) => setNewRelatedTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddRelatedTerm()}
                  placeholder="Add a related term..."
                  className="flex-grow p-2 border-2 border-green-300 rounded-lg text-black focus:border-green-500 focus:outline-none"
                />
                <AwesomeButton
                  type="primary"
                  size="small"
                  onPress={handleAddRelatedTerm}
                >
                  ➕ Add
                </AwesomeButton>
              </div>
            )}
          </div>

          {userNote && isEditing && (
            <div className="pt-3 border-t border-green-300">
              <AwesomeButton
                type="secondary"
                onPress={async () => {
                  if (confirm(`Delete all notes for "${term}"?`)) {
                    await onDelete();
                    setIsEditing(false);
                  }
                }}
              >
                🗑️ Delete All Notes
              </AwesomeButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

