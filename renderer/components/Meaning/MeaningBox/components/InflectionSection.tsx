import React, { useCallback, useMemo, useState } from "react";
import { AwesomeButton } from "react-awesome-button";
import { TranslationVariantRow } from "../../../../Learn/TranslationVariantRow";
import type { InflectionRow, InflectionTable } from "../../../../../main/handler/languages/inflectionTypes";
import { buildInflectionExamples } from "../../../../utils/inflectionExamples";
import {
  MEANING_SECTION,
  MEANING_SECTION_HEADER,
  MEANING_SECTION_TITLE,
} from "../../meaningBoxTheme";

type InflectionSectionProps = {
  table: InflectionTable;
  wordMeaning: string;
  onAddExamples: (rows: InflectionRow[]) => Promise<void>;
  onMoveToAnalyzer?: (text: string) => void;
};

const KIND_LABELS: Record<InflectionTable["kind"], string> = {
  verb: "Verb",
  "i-adjective": "I-adjective",
  "na-adjective": "Na-adjective",
};

export const InflectionSection = ({
  table,
  wordMeaning,
  onAddExamples,
  onMoveToAnalyzer = () => {},
}: InflectionSectionProps) => {
  const [showExtended, setShowExtended] = useState(false);
  const [isAddingExamples, setIsAddingExamples] = useState(false);

  const essentialRows = useMemo(
    () => table.rows.filter((row) => row.essential),
    [table.rows],
  );
  const extendedRows = useMemo(
    () => table.rows.filter((row) => !row.essential),
    [table.rows],
  );
  const visibleRows = showExtended ? table.rows : essentialRows;

  const previewExamples = useMemo(
    () => buildInflectionExamples(visibleRows, table, wordMeaning),
    [table, visibleRows, wordMeaning],
  );

  const handleAddExamples = useCallback(async () => {
    setIsAddingExamples(true);
    try {
      await onAddExamples(visibleRows);
    } finally {
      setIsAddingExamples(false);
    }
  }, [onAddExamples, visibleRows]);

  return (
    <section className={MEANING_SECTION}>
      <div className={MEANING_SECTION_HEADER}>
        <div className="min-w-0">
          <h3 className={MEANING_SECTION_TITLE}>
            Inflection · {KIND_LABELS[table.kind]}
            {table.dictionaryForm !== table.clickedForm ? (
              <span className="ml-2 font-normal normal-case text-blue-800">
                from {table.dictionaryForm}
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-blue-700">
            Saves one example sentence per form into My Notes
          </p>
        </div>
        <AwesomeButton
          type="secondary"
          size="small"
          onPress={handleAddExamples}
          disabled={isAddingExamples || previewExamples.length === 0}
        >
          {isAddingExamples ? "Adding…" : `Add examples (${previewExamples.length})`}
        </AwesomeButton>
      </div>

      <div className="space-y-4 px-4 py-3 text-sm">
        {table.isInflected && table.ladder.length > 0 ? (
          <div className="rounded-lg border border-blue-500 bg-blue-50 px-3 py-2">
            <div className="text-xs font-bold uppercase tracking-wide text-blue-900">
              Breakdown
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-blue-950">
              {table.ladder.map((step, index) => (
                <React.Fragment key={`${step.surface}-${index}`}>
                  {index > 0 ? <span className="text-blue-600">→</span> : null}
                  <span className="rounded-md border border-blue-600 bg-white px-2 py-1 font-mono font-bold">
                    {step.surface}
                  </span>
                  <span className="text-xs text-blue-700">{step.description}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {previewExamples.map((example, index) => (
            <TranslationVariantRow
              key={`${example.label}-${index}`}
              label={example.label}
              variant={{
                text: example.sentence,
                pronunciation: example.meaning,
              }}
              pronunciationLabel="Meaning"
              onMoveToAnalyzer={onMoveToAnalyzer}
            />
          ))}
        </div>

        {extendedRows.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowExtended((current) => !current)}
            className="rounded-lg border border-blue-600 bg-yellow-100 px-3 py-1.5 text-xs font-bold text-blue-900 hover:bg-yellow-200"
          >
            {showExtended
              ? "Show essentials only"
              : `Show more (${extendedRows.length} forms)`}
          </button>
        ) : null}
      </div>
    </section>
  );
};
