import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { AwesomeButton } from 'react-awesome-button';
import { MiteiruUserEntry, UserNoteExample } from '../../hooks/useUserNotes';
import { emptyUserNote } from '../../utils/aiUserNotePrompts';
import { isInflectionExample } from '../../utils/aiInflectionPrompts';
import { CopyButton } from '../Utils/CopyButton';
import { NoteExampleSentence } from './NoteExampleSentence';
import {
  MEANING_FIELD_INPUT,
  MEANING_NOTE_DIVIDER,
  MEANING_NOTE_LABEL,
  MEANING_SECTION,
  MEANING_SECTION_HEADER,
  MEANING_SECTION_TITLE,
} from './meaningBoxTheme';

interface UserNotesSectionProps {
  term: string;
  lang: string;
  tokenizeMiteiru: (text: string) => Promise<unknown>;
  userNote: MiteiruUserEntry | null;
  onSave: (entry: MiteiruUserEntry) => Promise<void>;
  onDelete: () => Promise<void>;
  onAIGenerate: () => Promise<void>;
  isGenerating: boolean;
  onNavigateToTerm: (term: string) => void;
}

const MAX_RELATED_TERMS = 2;

const fieldInputClass = MEANING_FIELD_INPUT;
const sectionLabelClass = MEANING_NOTE_LABEL;

const cloneEntry = (entry: MiteiruUserEntry): MiteiruUserEntry => ({
  definition: entry.definition || '',
  usageNote: entry.usageNote || '',
  funFact: entry.funFact || '',
  examples: (entry.examples || []).map((example) => ({
    sentence: example.sentence || '',
    meaning: example.meaning || '',
  })),
  relatedTerms: [...(entry.relatedTerms || [])],
});

const NoteSection = ({
  title,
  hint,
  children,
  variant = 'default',
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  variant?: 'default' | 'accent';
}) => (
  <section
    className={[
      MEANING_NOTE_DIVIDER + ' px-4 py-3.5',
      variant === 'accent' ? 'border-l-4 border-l-yellow-400 bg-yellow-100' : '',
    ].join(' ')}
  >
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h4 className={sectionLabelClass}>{title}</h4>
      {hint && <span className="text-[11px] font-medium text-blue-600">{hint}</span>}
    </div>
    {children}
  </section>
);

export const UserNotesSection: React.FC<UserNotesSectionProps> = ({
  term,
  lang,
  tokenizeMiteiru,
  userNote,
  onSave,
  onDelete,
  onAIGenerate,
  isGenerating,
  onNavigateToTerm,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<MiteiruUserEntry>(emptyUserNote());

  useEffect(() => {
    setDraft(userNote ? cloneEntry(userNote) : emptyUserNote());
  }, [userNote, term]);

  const handleSave = useCallback(async () => {
    await onSave({
      definition: draft.definition.trim(),
      usageNote: draft.usageNote.trim(),
      funFact: draft.funFact.trim(),
      examples: draft.examples
        .map((example) => ({
          sentence: example.sentence.trim(),
          meaning: example.meaning.trim(),
        }))
        .filter((example) => example.sentence !== ''),
      relatedTerms: draft.relatedTerms.filter((relatedTerm) => relatedTerm.trim() !== ''),
    });
    setIsEditing(false);
  }, [draft, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(userNote ? cloneEntry(userNote) : emptyUserNote());
    setIsEditing(false);
  }, [userNote]);

  const boldCurrentTerm = useCallback((text: string) => {
    if (!text || typeof text !== 'string') return '';
    if (!term) return text;

    try {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      return parts.map((part, index) =>
        part.toLowerCase() === term.toLowerCase()
          ? <strong key={index} className="font-semibold text-blue-800">{part}</strong>
          : part
      );
    } catch (error) {
      console.error('Error bolding term in text:', text, 'term:', term, error);
      return text;
    }
  }, [term]);

  const updateDraft = useCallback((patch: Partial<MiteiruUserEntry>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const handleAddExample = useCallback((example: UserNoteExample) => {
    if (!example.sentence.trim()) {
      return;
    }
    updateDraft({
      examples: [...draft.examples, {
        sentence: example.sentence.trim(),
        meaning: example.meaning.trim(),
      }],
    });
  }, [draft.examples, updateDraft]);

  const handleUpdateExample = useCallback((index: number, patch: Partial<UserNoteExample>) => {
    updateDraft({
      examples: draft.examples.map((example, itemIndex) => (
        itemIndex === index ? { ...example, ...patch } : example
      )),
    });
  }, [draft.examples, updateDraft]);

  const handleAddRelatedTerm = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || draft.relatedTerms.length >= MAX_RELATED_TERMS) {
      return;
    }
    updateDraft({ relatedTerms: [...draft.relatedTerms, trimmed] });
  }, [draft.relatedTerms, updateDraft]);

  const hasSavedNote = Boolean(
    userNote && (
      userNote.definition?.trim()
      || userNote.usageNote?.trim()
      || userNote.funFact?.trim()
      || userNote.examples?.length
      || userNote.relatedTerms?.length
    )
  );

  const showFunFact = Boolean(draft.funFact?.trim() || isEditing);

  const visibleExamples = useMemo(
    () => (isEditing ? draft.examples : draft.examples.filter((example) => !isInflectionExample(example.meaning))),
    [draft.examples, isEditing],
  );

  return (
    <section className={MEANING_SECTION}>
      <div className={MEANING_SECTION_HEADER}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={MEANING_SECTION_TITLE}>My Notes</h3>
            {hasSavedNote && !isEditing && (
              <span className="rounded-full border-2 border-green-700 bg-green-400 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Saved
              </span>
            )}
            {isEditing && (
              <span className="rounded-full border-2 border-blue-700 bg-blue-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Editing
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs font-medium text-blue-700">
            Used for Anki export when filled in
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isEditing ? (
            <>
              <AwesomeButton
                type="primary"
                size="small"
                onPress={() => setIsEditing(true)}
              >
                {hasSavedNote ? 'Edit' : 'Add note'}
              </AwesomeButton>
              <AwesomeButton
                type="secondary"
                size="small"
                onPress={onAIGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating…' : 'AI generate'}
              </AwesomeButton>
            </>
          ) : (
            <>
              <AwesomeButton type="primary" size="small" onPress={handleSave}>
                Save
              </AwesomeButton>
              <AwesomeButton type="secondary" size="small" onPress={handleCancel}>
                Cancel
              </AwesomeButton>
            </>
          )}
        </div>
      </div>

      {!hasSavedNote && !isEditing ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm font-bold text-blue-900">No notes for “{term}” yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-relaxed text-blue-700">
            Generate with AI or write your own definition, usage tip, examples, and related terms.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <AwesomeButton type="primary" onPress={() => setIsEditing(true)}>
              Write manually
            </AwesomeButton>
            <AwesomeButton type="secondary" onPress={onAIGenerate} disabled={isGenerating}>
              {isGenerating ? 'Generating…' : 'AI generate'}
            </AwesomeButton>
          </div>
        </div>
      ) : (
        <>
          <NoteSection title="Definition">
            {isEditing ? (
              <input
                type="text"
                value={draft.definition}
                onChange={(e) => updateDraft({ definition: e.target.value })}
                placeholder="Short English meaning for flashcards"
                className={fieldInputClass}
              />
            ) : (
              <p className="text-xl font-bold leading-snug text-blue-900">
                {draft.definition || <span className="text-sm font-medium italic text-blue-400">No definition</span>}
              </p>
            )}
          </NoteSection>

          <NoteSection title="Usage tip">
            {isEditing ? (
              <textarea
                value={draft.usageNote}
                onChange={(e) => updateDraft({ usageNote: e.target.value })}
                placeholder="One concise sentence on when or how to use this word"
                rows={2}
                className={`${fieldInputClass} resize-y`}
              />
            ) : (
              <p className="text-sm font-medium leading-relaxed text-blue-800">
                {draft.usageNote || <span className="italic text-blue-400">No usage tip</span>}
              </p>
            )}
          </NoteSection>

          {showFunFact && (
            <NoteSection title="Fun fact" variant="accent">
              {isEditing ? (
                <textarea
                  value={draft.funFact}
                  onChange={(e) => updateDraft({ funFact: e.target.value })}
                  placeholder="Optional etymology, culture note, or memory hook"
                  rows={2}
                  className={`${fieldInputClass} resize-y`}
                />
              ) : (
                <p className="text-sm font-medium leading-relaxed text-blue-800">{draft.funFact}</p>
              )}
            </NoteSection>
          )}

          <NoteSection title="Examples">
            {visibleExamples.length > 0 ? (
              <div className="space-y-2.5">
                {visibleExamples.map((example, index) => (
                  <div key={index} className="flex gap-2">
                    <div className="min-w-0 flex-grow rounded-lg border border-blue-300 bg-blue-50 px-3 py-2.5">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={example.sentence}
                            onChange={(e) => handleUpdateExample(index, { sentence: e.target.value })}
                            placeholder="Example sentence"
                            className={fieldInputClass}
                          />
                          <input
                            type="text"
                            value={example.meaning}
                            onChange={(e) => handleUpdateExample(index, { meaning: e.target.value })}
                            placeholder="English meaning"
                            className={fieldInputClass}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-grow">
                              <NoteExampleSentence
                                sentence={example.sentence}
                                lang={lang}
                                tokenizeMiteiru={tokenizeMiteiru}
                                setMeaning={onNavigateToTerm}
                              />
                            </div>
                            <CopyButton
                              text={example.sentence}
                              label="Copy"
                              className="border border-blue-600 bg-yellow-100 font-bold text-blue-900 hover:bg-yellow-200"
                            />
                          </div>
                          {example.meaning && (
                            <p className="mt-2 border-t-2 border-blue-200 pt-2 text-sm font-medium italic text-red-700">
                              {example.meaning}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => updateDraft({
                          examples: draft.examples.filter((_, itemIndex) => itemIndex !== index),
                        })}
                        className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                        title="Remove example"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-medium italic text-blue-500">No examples yet</p>
            )}
            {isEditing && (
              <ExampleInput onAdd={handleAddExample} />
            )}
          </NoteSection>

          <NoteSection title="See also" hint={`up to ${MAX_RELATED_TERMS}`}>
            {draft.relatedTerms.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {draft.relatedTerms.map((relatedTerm, index) => (
                  <div key={index} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => !isEditing && onNavigateToTerm(relatedTerm)}
                      className={[
                        'rounded-lg border border-blue-500 bg-yellow-100 px-3 py-1.5 text-sm font-bold text-blue-900',
                        !isEditing ? 'hover:bg-yellow-200 cursor-pointer' : '',
                      ].join(' ')}
                      disabled={isEditing}
                    >
                      {boldCurrentTerm(relatedTerm)}
                    </button>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => updateDraft({
                          relatedTerms: draft.relatedTerms.filter((_, itemIndex) => itemIndex !== index),
                        })}
                        className="rounded-md px-1.5 text-sm text-red-600 hover:bg-red-50"
                        title="Remove"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-medium italic text-blue-500">No related terms yet</p>
            )}
            {isEditing && draft.relatedTerms.length < MAX_RELATED_TERMS && (
              <RelatedTermInput onAdd={handleAddRelatedTerm} />
            )}
          </NoteSection>

          {hasSavedNote && isEditing && (
            <div className={MEANING_NOTE_DIVIDER + ' px-4 py-3'}>
              <button
                type="button"
                className="text-sm font-bold text-red-700 hover:text-red-800"
                onClick={async () => {
                  if (confirm(`Delete all notes for "${term}"?`)) {
                    await onDelete();
                    setIsEditing(false);
                  }
                }}
              >
                Delete all notes
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

const ExampleInput = ({ onAdd }: { onAdd: (example: UserNoteExample) => void }) => {
  const [sentence, setSentence] = useState('');
  const [meaning, setMeaning] = useState('');

  const handleAdd = useCallback(() => {
    if (!sentence.trim()) {
      return;
    }
    onAdd({ sentence, meaning });
    setSentence('');
    setMeaning('');
  }, [meaning, onAdd, sentence]);

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed border-blue-400 bg-blue-50/80 p-3">
      <input
        type="text"
        value={sentence}
        onChange={(e) => setSentence(e.target.value)}
        placeholder="Example sentence"
        className={fieldInputClass}
      />
      <div className="flex gap-2">
        <input
          type="text"
          value={meaning}
          onChange={(e) => setMeaning(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="English meaning (optional)"
          className={`${fieldInputClass} flex-grow`}
        />
        <AwesomeButton type="primary" size="small" onPress={handleAdd}>
          Add
        </AwesomeButton>
      </div>
    </div>
  );
};

const RelatedTermInput = ({ onAdd }: { onAdd: (value: string) => void }) => {
  const [value, setValue] = useState('');

  return (
    <div className="mt-3 flex gap-2 rounded-lg border border-dashed border-blue-400 bg-blue-50/80 p-3">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onAdd(value);
            setValue('');
          }
        }}
        placeholder="Related term"
        className={`${fieldInputClass} flex-grow`}
      />
      <AwesomeButton
        type="primary"
        size="small"
        onPress={() => {
          onAdd(value);
          setValue('');
        }}
      >
        Add
      </AwesomeButton>
    </div>
  );
};
