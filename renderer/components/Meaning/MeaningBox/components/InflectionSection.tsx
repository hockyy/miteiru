import React, { useCallback, useMemo, useState } from "react";
import { AwesomeButton } from "react-awesome-button";
import type { UserNoteExample } from "../../../hooks/useUserNotes";
import {
  flattenInflectionRows,
  indexInflectionExamples,
} from "../../../../utils/aiInflectionPrompts";
import { NoteExampleSentence } from "../../NoteExampleSentence";
import type { InflectionRow, InflectionTable } from "../../../../../main/handler/languages/inflectionTypes";
import {
  MEANING_SECTION,
  MEANING_SECTION_HEADER,
  MEANING_SECTION_TITLE,
} from "../../meaningBoxTheme";

type InflectionSectionProps = {
  table: InflectionTable;
  lang: string;
  tokenizeMiteiru: (text: string) => Promise<unknown>;
  examples: UserNoteExample[];
  onNavigateToTerm: (term: string) => void;
  onGenerateExamples: (rows: InflectionRow[]) => Promise<void>;
  isGenerating: boolean;
  errorMessage?: string | null;
};

const KIND_LABELS: Record<InflectionTable["kind"], string> = {
  verb: "Verb",
  "i-adjective": "I-adjective",
  "na-adjective": "Na-adjective",
};

export const InflectionSection = ({
  table,
  lang,
  tokenizeMiteiru,
  examples,
  onNavigateToTerm,
  onGenerateExamples,
  isGenerating,
  errorMessage = null,
}: InflectionSectionProps) => {
  const [showExtended, setShowExtended] = useState(false);

  const essentialRows = useMemo(
    () => table.rows.filter((row) => row.essential),
    [table.rows],
  );
  const extendedRows = useMemo(
    () => table.rows.filter((row) => !row.essential),
    [table.rows],
  );
  const visibleRows = showExtended ? table.rows : essentialRows;

  const visibleForms = useMemo(
    () => flattenInflectionRows(visibleRows),
    [visibleRows],
  );

  const examplesByForm = useMemo(
    () => indexInflectionExamples(examples),
    [examples],
  );

  const handleGenerate = useCallback(async () => {
    await onGenerateExamples(visibleRows);
  }, [onGenerateExamples, visibleRows]);

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
            AI examples appear in the table below and are saved to My Notes
          </p>
        </div>
        <AwesomeButton
          type="secondary"
          size="small"
          onPress={handleGenerate}
          disabled={isGenerating || visibleForms.length === 0}
        >
          {isGenerating ? "Generating…" : `AI examples (${visibleForms.length})`}
        </AwesomeButton>
      </div>

      <div className="space-y-4 px-4 py-3 text-sm">
        {errorMessage ? (
          <p className="rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errorMessage}
          </p>
        ) : null}

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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-blue-300 text-xs uppercase tracking-wide text-blue-800">
                <th className="py-2 pr-3 font-bold">Form</th>
                <th className="py-2 pr-3 font-bold">Label</th>
                <th className="py-2 pr-3 font-bold">When to use</th>
                <th className="py-2 font-bold">Example</th>
              </tr>
            </thead>
            <tbody>
              {visibleForms.map((entry) => {
                const example = examplesByForm.get(`${entry.label}::${entry.form}`);
                return (
                  <tr
                    key={`${entry.label}-${entry.form}`}
                    className="border-b border-blue-100 align-top"
                  >
                    <td className="py-2 pr-3 font-mono font-bold text-blue-950">
                      {entry.form}
                    </td>
                    <td className="py-2 pr-3 font-semibold text-blue-900">{entry.label}</td>
                    <td className="py-2 pr-3 text-blue-800">{entry.useHint}</td>
                    <td className="py-2 text-blue-950">
                      {example ? (
                        <div className="min-w-[220px] rounded-lg border border-blue-300 bg-blue-50 px-3 py-2">
                          <NoteExampleSentence
                            sentence={example.sentence}
                            lang={lang}
                            tokenizeMiteiru={tokenizeMiteiru}
                            setMeaning={onNavigateToTerm}
                          />
                          {example.meaning ? (
                            <p className="mt-2 border-t border-blue-200 pt-2 text-xs font-medium italic text-red-700">
                              {example.meaning}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs italic text-blue-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
