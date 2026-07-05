/** Grammar, glossary, and chunk sections for AI translation cards. Used by TranslationSentenceCard.tsx */
import React from 'react';
import {
  TranslationChunkNote,
  TranslationGlossaryEntry,
  TranslationGrammarNote,
} from '../../types/aiTranslation';

const SectionHeader: React.FC<{ icon: string; title: string }> = ({ icon, title }) => (
  <h5 className="flex items-center gap-2 text-sm font-bold text-purple-900 mb-2">
    <span aria-hidden>{icon}</span>
    {title}
  </h5>
);

const registerLabels: Record<TranslationChunkNote['register'], string> = {
  formal: 'Formal',
  neutral: 'Neutral',
  casual: 'Casual',
};

export const TranslationGrammarSection: React.FC<{ items: TranslationGrammarNote[] }> = ({
  items,
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader icon="📐" title="Grammar Notes" />
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={`${item.pattern}-${index}`}
            className="rounded-lg border border-purple-200 bg-white p-3"
          >
            {item.pattern && (
              <div className="text-sm font-semibold text-purple-900 mb-1">{item.pattern}</div>
            )}
            {item.explanation && (
              <p className="text-sm text-gray-700 leading-relaxed">{item.explanation}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export const TranslationGlossarySection: React.FC<{ items: TranslationGlossaryEntry[] }> = ({
  items,
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader icon="📖" title="Glossary" />
      <div className="rounded-lg border border-purple-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-purple-100 text-purple-900">
              <th className="text-left px-3 py-2 font-semibold">Term</th>
              <th className="text-left px-3 py-2 font-semibold">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry, index) => (
              <tr key={`${entry.target}-${index}`} className="border-t border-purple-100 bg-white">
                <td className="px-3 py-2 align-top">
                  {entry.source && (
                    <div className="text-xs text-gray-500 mb-0.5">{entry.source}</div>
                  )}
                  <div className="font-medium text-gray-900">{entry.target}</div>
                  {entry.reading && (
                    <div className="text-xs text-purple-600 mt-0.5">{entry.reading}</div>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-gray-700">{entry.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const TranslationChunkNotesSection: React.FC<{ items: TranslationChunkNote[] }> = ({
  items,
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader icon="🧩" title="Wording Notes" />
      <div className="space-y-2">
        {items.map((chunk, index) => (
          <div
            key={`${chunk.chunk}-${index}`}
            className="rounded-lg border border-purple-200 bg-white p-3"
          >
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">
                {registerLabels[chunk.register]}
              </span>
              {chunk.chunk && (
                <code className="text-sm font-medium text-purple-900 bg-purple-50 px-1.5 py-0.5 rounded">
                  {chunk.chunk}
                </code>
              )}
            </div>
            {chunk.note && (
              <p className="text-sm text-gray-700 leading-relaxed">{chunk.note}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
