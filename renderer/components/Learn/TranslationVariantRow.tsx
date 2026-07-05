/** Single formal/neutral/casual row with copy + move-to-analyzer actions */
import React from 'react';
import {TranslationVariant} from '../../types/aiTranslation';
import {formatVariantForCopy} from '../../utils/parseAiTranslation';
import {CopyButton} from '../Utils/CopyButton';

interface TranslationVariantRowProps {
  label: string;
  variant: TranslationVariant;
  pronunciationLabel: string;
  onMoveToAnalyzer: (text: string) => void;
}

export const TranslationVariantRow: React.FC<TranslationVariantRowProps> = ({
  label,
  variant,
  pronunciationLabel,
  onMoveToAnalyzer,
}) => {
  if (!variant.text) {
    return null;
  }

  return (
    <div className="rounded-md border border-purple-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs font-bold uppercase tracking-wide text-purple-700">{label}</span>
        <div className="flex flex-wrap gap-1 justify-end">
          <CopyButton text={formatVariantForCopy(variant)} label="Copy" />
          <button
            type="button"
            onClick={() => onMoveToAnalyzer(variant.text)}
            title="Move to analyzer"
            // Sends target-language text only; learn.tsx handleMoveToAnalyzer fills middle column
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs text-blue-800 transition-colors hover:bg-blue-100"
          >
            → Analyzer
          </button>
        </div>
      </div>
      <p className="text-base text-gray-900 leading-relaxed">{variant.text}</p>
      {variant.pronunciation && (
        <p className="text-sm text-purple-600 mt-1">
          {pronunciationLabel}: {variant.pronunciation}
        </p>
      )}
    </div>
  );
};
