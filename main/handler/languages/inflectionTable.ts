import {
  adjConjugate,
  adjDeconjugate,
  conjugate,
  conjugateAuxiliaries,
  verbDeconjugate,
  type AdjConjugation,
  type Auxiliary,
  type Conjugation,
  type Deconjugated,
} from "kamiya-codec";
import type {
  DeconjugationLadderStep,
  InflectionKind,
  InflectionRow,
  InflectionTable,
  InflectionTableRequest,
} from "./inflectionTypes";

export type {
  DeconjugationLadderStep,
  InflectionKind,
  InflectionRow,
  InflectionTable,
  InflectionTableRequest,
} from "./inflectionTypes";

type VerbRowSpec = {
  id: string;
  label: string;
  useHint: string;
  essential: boolean;
  conjugation: Conjugation;
  auxiliaries?: Auxiliary[];
};

type AdjRowSpec = {
  id: string;
  label: string;
  useHint: string;
  essential: boolean;
  conjugation: AdjConjugation;
};

const VERB_ROW_SPECS: VerbRowSpec[] = [
  {
    id: "plain",
    label: "Plain present",
    useHint: "Casual statements, among friends, or inside grammar patterns.",
    essential: true,
    conjugation: "Dictionary",
  },
  {
    id: "negative",
    label: "Negative",
    useHint: "Say something does not happen or is not true.",
    essential: true,
    conjugation: "Negative",
  },
  {
    id: "te",
    label: "Te-form",
    useHint: "Link actions, make requests (〜て), or start ている / てください.",
    essential: true,
    conjugation: "Te",
  },
  {
    id: "past",
    label: "Past (ta)",
    useHint: "Completed actions or past states in casual speech.",
    essential: true,
    conjugation: "Ta",
  },
  {
    id: "polite",
    label: "Polite (masu)",
    useHint: "Default safe choice with strangers, teachers, and service staff.",
    essential: true,
    conjugation: "Dictionary",
    auxiliaries: ["Masu"],
  },
  {
    id: "volitional",
    label: "Volitional",
    useHint: "Suggestions and invitations: “let's …”, “shall we …”.",
    essential: true,
    conjugation: "Volitional",
  },
  {
    id: "conditional",
    label: "Conditional (ba)",
    useHint: "If/when conditions: “if X, then …”.",
    essential: true,
    conjugation: "Conditional",
  },
  {
    id: "imperative",
    label: "Imperative",
    useHint: "Direct commands; often blunt unless softened.",
    essential: true,
    conjugation: "Imperative",
  },
  {
    id: "tai",
    label: "Want to",
    useHint: "Express your own desire to do something.",
    essential: false,
    conjugation: "Dictionary",
    auxiliaries: ["Tai"],
  },
  {
    id: "potential",
    label: "Potential",
    useHint: "Can / able to do something.",
    essential: false,
    conjugation: "Dictionary",
    auxiliaries: ["Potential"],
  },
  {
    id: "progressive",
    label: "Progressive (te iru)",
    useHint: "Ongoing actions or resulting states.",
    essential: false,
    conjugation: "Dictionary",
    auxiliaries: ["TeIru"],
  },
  {
    id: "passive",
    label: "Passive",
    useHint: "Receive an action, or passive / suffering passive nuance.",
    essential: false,
    conjugation: "Dictionary",
    auxiliaries: ["ReruRareru"],
  },
  {
    id: "causative",
    label: "Causative",
    useHint: "Make/let someone do something.",
    essential: false,
    conjugation: "Dictionary",
    auxiliaries: ["SeruSaseru"],
  },
  {
    id: "tara",
    label: "Tara conditional",
    useHint: "When / if (temporal): “when X happens …”.",
    essential: false,
    conjugation: "Tara",
  },
  {
    id: "polite-negative",
    label: "Polite negative",
    useHint: "Politely deny or refuse.",
    essential: false,
    conjugation: "Negative",
    auxiliaries: ["Masu"],
  },
];

const I_ADJ_ROW_SPECS: AdjRowSpec[] = [
  {
    id: "plain",
    label: "Plain present",
    useHint: "Casual descriptions before です or a noun.",
    essential: true,
    conjugation: "Present",
  },
  {
    id: "negative",
    label: "Negative",
    useHint: "Say something is not that quality.",
    essential: true,
    conjugation: "Negative",
  },
  {
    id: "past",
    label: "Past",
    useHint: "Was/were … in casual speech.",
    essential: true,
    conjugation: "Past",
  },
  {
    id: "negative-past",
    label: "Negative past",
    useHint: "Was not / were not …",
    essential: true,
    conjugation: "NegativePast",
  },
  {
    id: "te",
    label: "Te-form",
    useHint: "Connect clauses or soften a request.",
    essential: true,
    conjugation: "ConjunctiveTe",
  },
  {
    id: "adverbial",
    label: "Adverbial (ku)",
    useHint: "Modify verbs: “quickly”, “loudly”, etc.",
    essential: true,
    conjugation: "Adverbial",
  },
  {
    id: "conditional",
    label: "Conditional",
    useHint: "If it is … then …",
    essential: true,
    conjugation: "Conditional",
  },
  {
    id: "tara",
    label: "Tara conditional",
    useHint: "When it was / if it becomes …",
    essential: false,
    conjugation: "TaraConditional",
  },
  {
    id: "stem-sou",
    label: "Looks like",
    useHint: "Seems / looks … from appearance.",
    essential: false,
    conjugation: "StemSou",
  },
];

const NA_ADJ_ROW_SPECS: AdjRowSpec[] = [
  {
    id: "attributive",
    label: "Attributive (na)",
    useHint: "Before a noun: “a quiet room”.",
    essential: true,
    conjugation: "Prenomial",
  },
  {
    id: "plain",
    label: "Plain / polite",
    useHint: "Predicate: “it is quiet” — pick だ/です for politeness.",
    essential: true,
    conjugation: "Present",
  },
  {
    id: "negative",
    label: "Negative",
    useHint: "It is not … — じゃない (casual) vs ではありません (polite).",
    essential: true,
    conjugation: "Negative",
  },
  {
    id: "past",
    label: "Past",
    useHint: "It was … — だった vs でした.",
    essential: true,
    conjugation: "Past",
  },
  {
    id: "negative-past",
    label: "Negative past",
    useHint: "It was not …",
    essential: true,
    conjugation: "NegativePast",
  },
  {
    id: "te",
    label: "Te-form (de)",
    useHint: "Connect clauses: “quiet and …”.",
    essential: true,
    conjugation: "ConjunctiveTe",
  },
  {
    id: "adverbial",
    label: "Adverbial (ni)",
    useHint: "Modify verbs: “do something quietly”.",
    essential: true,
    conjugation: "Adverbial",
  },
  {
    id: "conditional",
    label: "Conditional",
    useHint: "If it is … / if you are …",
    essential: false,
    conjugation: "Conditional",
  },
  {
    id: "stem-sou",
    label: "Looks like",
    useHint: "Seems / looks …",
    essential: false,
    conjugation: "StemSou",
  },
];

const CONJUGATION_LABELS: Record<Conjugation, string> = {
  Negative: "negative",
  Conjunctive: "stem",
  Dictionary: "dictionary",
  Conditional: "conditional (ba)",
  Imperative: "imperative",
  Volitional: "volitional",
  Te: "te-form",
  Ta: "past (ta)",
  Tara: "tara conditional",
  Tari: "tari",
  Zu: "classical negative",
  Nu: "classical negative (nu)",
};

const AUXILIARY_LABELS: Partial<Record<Auxiliary, string>> = {
  Masu: "polite masu",
  Tai: "want to",
  Potential: "potential",
  TeIru: "te iru (progressive)",
  ReruRareru: "passive / potential",
  SeruSaseru: "causative",
  Nai: "negative auxiliary",
  Tagaru: "want to (3rd person)",
  Hoshii: "want (object)",
};

const ADJ_CONJUGATION_LABELS: Record<AdjConjugation, string> = {
  Present: "present",
  Prenomial: "attributive (na)",
  Negative: "negative",
  Past: "past",
  NegativePast: "negative past",
  ConjunctiveTe: "te-form",
  Adverbial: "adverbial",
  Conditional: "conditional",
  TaraConditional: "tara conditional",
  Tari: "tari",
  Noun: "nominalized (-sa)",
  StemSou: "looks like (sou)",
  StemNegativeSou: "does not look like",
};

const uniqueForms = (forms: string[]) =>
  Array.from(new Set(forms.map((form) => form.trim()).filter(Boolean)));

const safeVerbForms = (
  dictionaryForm: string,
  conjugation: Conjugation,
  typeII: boolean,
  auxiliaries: Auxiliary[] = [],
): string[] => {
  try {
    const forms =
      auxiliaries.length > 0
        ? conjugateAuxiliaries(dictionaryForm, auxiliaries, conjugation, typeII)
        : conjugate(dictionaryForm, conjugation, typeII);
    return uniqueForms(forms);
  } catch {
    return [];
  }
};

const safeAdjForms = (
  dictionaryForm: string,
  conjugation: AdjConjugation,
  iAdjective: boolean,
): string[] => {
  try {
    return uniqueForms(adjConjugate(dictionaryForm, conjugation, iAdjective));
  } catch {
    return [];
  }
};

export const isIchidanVerb = (posTags: string[]): boolean =>
  posTags.some((tag) => tag === "v1" || tag === "vz");

export const isVerbPos = (posTags: string[], tagDescriptions: Record<string, string> = {}): boolean => {
  if (posTags.some((tag) => /^v\d/.test(tag) || tag === "vk" || tag === "vs" || tag === "vn")) {
    return true;
  }
  return posTags.some((tag) => {
    const description = (tagDescriptions[tag] ?? "").toLowerCase();
    return (
      description.includes("ichidan verb") ||
      description.includes("godan verb") ||
      description.includes("suru verb") ||
      description.includes("kuru verb") ||
      (description.includes("verb") && !description.includes("auxiliary"))
    );
  });
};

export const isIAdjectivePos = (posTags: string[], tagDescriptions: Record<string, string> = {}): boolean => {
  if (posTags.includes("adj-i")) return true;
  return posTags.some((tag) => (tagDescriptions[tag] ?? "").toLowerCase().includes("adjective (keiyoushi)"));
};

export const isNaAdjectivePos = (posTags: string[], tagDescriptions: Record<string, string> = {}): boolean => {
  if (posTags.includes("adj-na") || posTags.includes("adj-f")) return true;
  return posTags.some((tag) => {
    const description = (tagDescriptions[tag] ?? "").toLowerCase();
    return (
      description.includes("adjectival nouns") ||
      description.includes("quasi-adjective") ||
      description.includes("nouns which may take the genitive case particle")
    );
  });
};

export const classifyInflectionKind = (
  posTags: string[],
  tagDescriptions: Record<string, string> = {},
): InflectionKind | null => {
  if (isVerbPos(posTags, tagDescriptions)) return "verb";
  if (isIAdjectivePos(posTags, tagDescriptions)) return "i-adjective";
  if (isNaAdjectivePos(posTags, tagDescriptions)) return "na-adjective";
  return null;
};

export const resolveDictionaryForm = (
  term: string,
  dictionaryForm: string | undefined,
  kind: InflectionKind,
): string => {
  const candidate = (dictionaryForm ?? term).trim();
  if (kind === "na-adjective" && candidate.endsWith("な") && candidate.length > 1) {
    return candidate.slice(0, -1);
  }
  return candidate;
};

const describeDeconjugation = (hit: Deconjugated): string => {
  const conj = CONJUGATION_LABELS[hit.conjugation] ?? hit.conjugation;
  if (!hit.auxiliaries.length) {
    return conj;
  }
  const aux = hit.auxiliaries
    .map((entry) => AUXILIARY_LABELS[entry] ?? entry)
    .join(" + ");
  return `${aux} (${conj})`;
};

const buildVerbLadder = (
  clickedForm: string,
  dictionaryForm: string,
  typeII: boolean,
): DeconjugationLadderStep[] => {
  if (clickedForm === dictionaryForm) return [];

  const hits = verbDeconjugate(clickedForm, dictionaryForm, typeII, 2);
  if (!hits.length) return [];

  const best = [...hits].sort((left, right) => right.auxiliaries.length - left.auxiliaries.length)[0];
  return [
    {
      surface: clickedForm,
      description: describeDeconjugation(best),
    },
    {
      surface: dictionaryForm,
      description: "dictionary form",
    },
  ];
};

const buildAdjLadder = (
  clickedForm: string,
  dictionaryForm: string,
  iAdjective: boolean,
): DeconjugationLadderStep[] => {
  if (clickedForm === dictionaryForm) return [];

  const hits = adjDeconjugate(clickedForm, dictionaryForm, iAdjective);
  if (!hits.length) return [];

  const best = hits[0];
  return [
    {
      surface: clickedForm,
      description: ADJ_CONJUGATION_LABELS[best.conjugation] ?? best.conjugation,
    },
    {
      surface: dictionaryForm,
      description: "dictionary form",
    },
  ];
};

const buildVerbRows = (dictionaryForm: string, typeII: boolean): InflectionRow[] =>
  VERB_ROW_SPECS.flatMap((spec) => {
    const forms = safeVerbForms(
      dictionaryForm,
      spec.conjugation,
      typeII,
      spec.auxiliaries ?? [],
    );
    if (!forms.length) return [];
    return [
      {
        id: spec.id,
        label: spec.label,
        forms,
        useHint: spec.useHint,
        essential: spec.essential,
      },
    ];
  });

const buildAdjRows = (
  dictionaryForm: string,
  specs: AdjRowSpec[],
  iAdjective: boolean,
): InflectionRow[] =>
  specs.flatMap((spec) => {
    const forms = safeAdjForms(dictionaryForm, spec.conjugation, iAdjective);
    if (!forms.length) return [];
    return [
      {
        id: spec.id,
        label: spec.label,
        forms,
        useHint: spec.useHint,
        essential: spec.essential,
      },
    ];
  });

export const buildInflectionTable = (
  request: InflectionTableRequest,
  tagDescriptions: Record<string, string> = {},
): InflectionTable | null => {
  const clickedForm = request.term.trim();
  if (!clickedForm) return null;

  const posTags = request.posTags ?? [];
  const kind = classifyInflectionKind(posTags, tagDescriptions);
  if (!kind) return null;

  const dictionaryForm = resolveDictionaryForm(clickedForm, request.dictionaryForm, kind);
  const isInflected = clickedForm !== dictionaryForm;

  if (kind === "verb") {
    const typeII = isIchidanVerb(posTags);
    return {
      kind,
      dictionaryForm,
      clickedForm,
      isInflected,
      rows: buildVerbRows(dictionaryForm, typeII),
      ladder: buildVerbLadder(clickedForm, dictionaryForm, typeII),
    };
  }

  const iAdjective = kind === "i-adjective";
  return {
    kind,
    dictionaryForm,
    clickedForm,
    isInflected,
    rows: buildAdjRows(
      dictionaryForm,
      iAdjective ? I_ADJ_ROW_SPECS : NA_ADJ_ROW_SPECS,
      iAdjective,
    ),
    ladder: buildAdjLadder(clickedForm, dictionaryForm, iAdjective),
  };
};
