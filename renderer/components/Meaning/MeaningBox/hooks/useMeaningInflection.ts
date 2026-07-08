import { useEffect, useMemo, useState } from "react";
import { videoConstants } from "../../../../utils/constants";
import type { InflectionTable } from "../../../../../main/handler/languages/inflectionTypes";
import type { MeaningContentState } from "../types";

const collectPosTags = (meaningContent: MeaningContentState): string[] => {
  const tags = new Set<string>();
  for (const sense of meaningContent.sense ?? []) {
    for (const pos of sense.partOfSpeech ?? []) {
      if (pos) tags.add(pos);
    }
  }
  return Array.from(tags);
};

const resolveDictionaryForm = (
  term: string,
  meaningContent: MeaningContentState,
): string => {
  const singleText = meaningContent.single?.[0]?.text;
  if (typeof singleText === "string" && singleText.trim()) {
    return singleText.trim();
  }
  return term;
};

export const useMeaningInflection = (
  term: string,
  lang: string,
  meaningContent: MeaningContentState,
) => {
  const [table, setTable] = useState<InflectionTable | null>(null);
  const [loading, setLoading] = useState(false);

  const posTags = useMemo(() => collectPosTags(meaningContent), [meaningContent]);
  const dictionaryForm = useMemo(
    () => resolveDictionaryForm(term, meaningContent),
    [term, meaningContent],
  );

  useEffect(() => {
    if (lang !== videoConstants.japaneseLang || !term.trim()) {
      setTable(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    window.ipc
      .invoke("getInflectionTable", {
        term,
        dictionaryForm,
        posTags,
      })
      .then((result: InflectionTable | null) => {
        if (!cancelled) {
          setTable(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTable(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dictionaryForm, lang, posTags, term]);

  return { table, loading };
};
