export const adjConjugations = [
  "Present",
  "Prenomial",
  "Negative",
  "Past",
  "NegativePast",
  "ConjunctiveTe",
  "Adverbial",
  "Conditional",
  "TaraConditional",
  "Tari",
  "Noun",
  "StemSou",
  "StemNegativeSou",
] as const;
export type AdjConjugation = (typeof adjConjugations)[number];

function never(x: never): never {
  throw new Error(`never? ${x}`);
}

export function adjConjugate(
  adjective: string,
  conj: AdjConjugation,
  iAdjective: boolean,
): string[] {
  if (iAdjective) {
    let stem = adjective.slice(0, -1);
    let addSa = false;
    if (adjective === "いい" || adjective === "良い" || adjective === "よい") {
      stem = adjective.startsWith("良") ? "良" : "よ";
      addSa = true;
    } else if (adjective.endsWith("ない")) {
      addSa = true;
    }
    switch (conj) {
      case "Present":
        return [adjective];
      case "Prenomial":
        return [adjective];
      case "Negative":
        return [stem + "くない"];
      case "Past":
        return [stem + "かった"];
      case "NegativePast":
        return [stem + "くなかった"];
      case "ConjunctiveTe":
        return [stem + "く", stem + "くて"];
      case "Adverbial":
        return [stem + "く"];
      case "Conditional":
        return [stem + "ければ"];
      case "TaraConditional":
        return [stem + "かったら"];
      case "Tari":
        return [stem + "かったり"];
      case "Noun":
        return [stem + "さ"];
      case "StemSou":
        return [addSa ? stem + "さそう" : stem + "そう"];
      case "StemNegativeSou": {
        const negativeStem = stem + "くな";
        // basically conjugate adjective with 'Negative' and redo stem
        return [negativeStem + "さそう"];
      }
      default:
        never(conj);
    }
  }
  // na-adjective
  switch (conj) {
    case "Prenomial":
      return [adjective + "な"];
    case "Present":
      return ["だ", "です", "でございます"].map((suffix) => adjective + suffix);
    case "Negative":
      return ["ではない", "でない", "じゃない", "ではありません"].map(
        (suffix) => adjective + suffix,
      );
    case "Past":
      return ["だった", "でした"].map((suffix) => adjective + suffix);
    case "NegativePast":
      return [
        "ではなかった",
        "でなかった",
        "じゃなかった",
        "ではありませんでした",
      ].map((suffix) => adjective + suffix);
    case "ConjunctiveTe":
      return [adjective + "で"];
    case "Adverbial":
      return [adjective + "に"];
    case "Conditional":
      return ["なら", "ならば"].map((suffix) => adjective + suffix);
    case "TaraConditional":
      return ["だったら"].map((suffix) => adjective + suffix);
    case "Tari":
      return ["だったり", "でしたり"].map((suffix) => adjective + suffix);
    case "Noun":
      return [adjective + "さ"];
    case "StemSou":
      return [adjective + "そう"];
    case "StemNegativeSou":
      return [adjective + "じゃなさそう"];
    default:
      never(conj);
  }

  throw new Error("unknown conjugation/iAdjective");
}

export interface AdjDeconjugated {
  conjugation: AdjConjugation;
  result: string[];
}
export function adjDeconjugate(
  conjugated: string,
  dictionary: string,
  iAdjective: boolean,
): AdjDeconjugated[] {
  const hits: AdjDeconjugated[] = [];
  for (const conj of adjConjugations) {
    const result = adjConjugate(dictionary, conj, iAdjective);
    if (result.includes(conjugated)) {
      hits.push({ conjugation: conj, result });
    }
  }
  return hits;
}
