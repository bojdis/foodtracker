export interface ExtractedBodyMeasurement {
  weight_kg: number | null;
  waist_cm: number | null;
  /** Any remaining food/activity text after stripping body measurements (empty string if pure measurement). */
  remainingText: string;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

const STANDALONE_WEIGHT_RE =
  /^(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?(\d{2,3}(?:[.,]\d+)?)\s*kg\.?$/iu;

const EXPLICIT_WEIGHT_CLAUSE_RE =
  /(?:(?:^|[,;.\n])\s*(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?|(?<![\p{L}\p{N}])(?:a\s+)?(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?)(?:(?:tělesná|telesna|moje|ranní|ranni)\s+)?(?:váha|vaha|hmotnost|vážím|vazim)(?![\p{L}\p{N}])\s*(?:(?:je|dnes|ráno|rano)\s+)?[:=]?\s*(\d{2,3}(?:[.,]\d+)?)(?![\d.,])\s*(?:kg(?![\p{L}\p{N}]))?(?!\s*(?:g|mg|dg|ml|dl|l|ks|kcal|kj|min|h|mm|m|%)(?![\p{L}\p{N}]))/giu;

const EXPLICIT_WAIST_CLAUSE_RE =
  /(?:(?:^|[,;.\n])\s*(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?|(?<![\p{L}\p{N}])(?:a\s+)?(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?)(?:obvod\s+pasu|pas|v\s+pase)(?![\p{L}\p{N}])\s*(?:(?:je|dnes|ráno|rano)\s+)?[:=]?\s*(\d{2,3}(?:[.,]\d+)?)(?![\d.,])\s*(?:cm(?![\p{L}\p{N}]))?(?!\s*(?:g|mg|dg|ml|dl|l|ks|kcal|kj|min|h|kg|mm|m|%)(?![\p{L}\p{N}]))/giu;

function cleanRemainingFoodOrActivityText(text: string): string {
  let cleaned = text
    .replace(/(?:\s*,\s*){2,}/g, ", ")
    .replace(/^[\s,;.+–-]+/u, "")
    .replace(/[\s,;.+–-]+$/u, "")
    .replace(/^(?:a\s+)?(?:pak\s+|potom\s+|dále\s+|dale\s+)?/iu, "")
    .replace(/\s+(?:a|pak|potom)$/iu, "")
    .replace(/^[\s,;.+–-]+/u, "")
    .replace(/[\s,;.+–-]+$/u, "")
    .trim();

  if (/^(?:dnes(?:ka)?|ráno|rano|večer|vecer)$/iu.test(cleaned)) {
    cleaned = "";
  }

  return cleaned;
}

/**
 * Extracts body weight (kg) and/or waist circumference (cm) from natural Czech text.
 * Supports both pure measurements ("váha 99,4 kg, pas 96 cm", "99,2 kg")
 * and mixed inputs ("váha 99,2 kg, toast a kafe" -> remainingText: "toast a kafe").
 * Never confuses food gram portions ("váha 180 g") or exercise weights ("dřepy s váhou 80 kg") with body weight.
 */
export function extractBodyMeasurementFromText(
  rawText: string
): ExtractedBodyMeasurement | null {
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.length > 600) {
    return null;
  }

  // 1. Standalone "99,4 kg" / "dnes 99.4 kg"
  const standaloneMatch = STANDALONE_WEIGHT_RE.exec(trimmed);
  if (standaloneMatch) {
    const val = round1(Number(standaloneMatch[1].replace(",", ".")));
    if (Number.isFinite(val) && val >= 35 && val <= 260) {
      return {
        weight_kg: val,
        waist_cm: null,
        remainingText: "",
      };
    }
  }

  let weightKg: number | null = null;
  let waistCm: number | null = null;

  let working = trimmed;

  working = working.replace(EXPLICIT_WEIGHT_CLAUSE_RE, (fullMatch, numStr: string) => {
    const val = round1(Number(numStr.replace(",", ".")));
    if (Number.isFinite(val) && val >= 35 && val <= 260) {
      weightKg = val;
      return ", ";
    }
    return fullMatch;
  });

  working = working.replace(EXPLICIT_WAIST_CLAUSE_RE, (fullMatch, numStr: string) => {
    const val = round1(Number(numStr.replace(",", ".")));
    if (Number.isFinite(val) && val >= 45 && val <= 190) {
      waistCm = val;
      return ", ";
    }
    return fullMatch;
  });

  if (weightKg === null && waistCm === null) {
    return null;
  }

  const remainingText = cleanRemainingFoodOrActivityText(working);

  return {
    weight_kg: weightKg,
    waist_cm: waistCm,
    remainingText,
  };
}

/**
 * Convenience helper returning non-null ONLY when the text is purely a body measurement
 * (no food or sport items mixed in).
 */
export function tryParseBodyMeasurementText(
  rawText: string
): { weight_kg: number | null; waist_cm: number | null } | null {
  const extracted = extractBodyMeasurementFromText(rawText);
  if (!extracted || extracted.remainingText.length > 0) {
    return null;
  }
  return {
    weight_kg: extracted.weight_kg,
    waist_cm: extracted.waist_cm,
  };
}
