/** Structured analysis sections (grammar table, vocab, bullets). Used by AIAnalysisDisplay.tsx */
import React from 'react';
import {GrammarPoint, VocabularyItem} from '../../types/sentenceAnalysis';
import {CopyButton} from '../Utils/CopyButton';

const SectionHeader: React.FC<{ icon: string; title: string }> = ({ icon, title }) => (
  <h4 className="flex items-center gap-2 text-sm font-bold text-purple-900 mb-2">
    <span aria-hidden>{icon}</span>
    {title}
  </h4>
);

export const AnalysisSummary: React.FC<{ summary: string }> = ({ summary }) => {
  if (!summary) {
    return null;
  }

  return (
    <div className="rounded-lg border-2 border-purple-300 bg-white p-3 shadow-sm">
      <SectionHeader icon="💡" title="Summary" />
      <p className="text-sm text-gray-800 leading-relaxed">{summary}</p>
    </div>
  );
};

export const AnalysisTranslationSection: React.FC<{ translation: string }> = ({
  translation,
}) => {
  if (!translation) {
    return null;
  }

  return (
    <div className="rounded-lg border-2 border-purple-300 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <SectionHeader icon="🌐" title="English Translation" />
        <CopyButton text={translation} label="Copy" />
      </div>
      <p className="text-sm text-gray-800 leading-relaxed">{translation}</p>
    </div>
  );
};

export const AnalysisGrammarSection: React.FC<{ items: GrammarPoint[] }> = ({ items }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader icon="📐" title="Grammar" />
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={`${item.pattern}-${index}`}
            className="rounded-lg border border-purple-200 bg-purple-50/60 p-3"
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

export const AnalysisVocabularySection: React.FC<{ items: VocabularyItem[] }> = ({ items }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader icon="📖" title="Vocabulary" />
      <div className="rounded-lg border border-purple-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-purple-100 text-purple-900">
              <th className="text-left px-3 py-2 font-semibold">Word</th>
              <th className="text-left px-3 py-2 font-semibold">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.word}-${index}`} className="border-t border-purple-100 bg-white">
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-gray-900">{item.word}</div>
                  {item.reading && (
                    <div className="text-xs text-purple-600 mt-0.5">{item.reading}</div>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-gray-700">
                  <div>{item.meaning}</div>
                  {item.note && (
                    <div className="text-xs text-gray-500 mt-1 italic">{item.note}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const AnalysisBulletSection: React.FC<{
  icon: string;
  title: string;
  items: string[];
  accentClass?: string;
}> = ({ icon, title, items, accentClass = 'text-purple-700' }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader icon={icon} title={title} />
      <ul className={`space-y-1.5 text-sm ${accentClass} list-disc pl-5`}>
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="leading-relaxed text-gray-700 marker:text-purple-400">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
};
