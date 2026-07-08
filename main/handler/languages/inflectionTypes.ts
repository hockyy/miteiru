export type InflectionKind = "verb" | "i-adjective" | "na-adjective";

export type InflectionRow = {
  id: string;
  label: string;
  forms: string[];
  useHint: string;
  essential: boolean;
};

export type DeconjugationLadderStep = {
  surface: string;
  description: string;
};

export type InflectionTable = {
  kind: InflectionKind;
  dictionaryForm: string;
  clickedForm: string;
  isInflected: boolean;
  rows: InflectionRow[];
  ladder: DeconjugationLadderStep[];
};

export type InflectionTableRequest = {
  term: string;
  dictionaryForm?: string;
  posTags?: string[];
};
