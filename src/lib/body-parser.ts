export interface ExtractedBodyMeasurement {
  weight_kg: number | null;
  waist_cm: number | null;
  blood_pressure_sys: number | null;
  blood_pressure_dia: number | null;
  pulse_bpm: number | null;
  /** Any remaining food/activity text after stripping body measurements (empty string if pure measurement). */
  remainingText: string;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

const STANDALONE_WEIGHT_RE =
  /^(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?(\d{2,3}(?:[.,]\d+)?)\s*kg\.?$/iu;

const STANDALONE_BP_RE =
  /^(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?(?:(?:krevní|krevni)\s+)?(?:tlak\s*[:=]?\s*)?(\d{2,3})\s*(?:\/|\s+na\s+)\s*(\d{2,3})(?:\s*(?:mm\s*hg|tlak))?$/iu;

const EXPLICIT_WEIGHT_CLAUSE_RE =
  /(?:(?:^|[,;.\n])\s*(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?|(?<![\p{L}\p{N}])(?:a\s+)?(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?)(?:(?:tělesná|telesna|moje|ranní|ranni)\s+)?(?:váha|vaha|hmotnost|vážím|vazim)(?![\p{L}\p{N}])\s*(?:(?:je|dnes|ráno|rano)\s+)?[:=]?\s*(\d{2,3}(?:[.,]\d+)?)(?![\d.,])\s*(?:kg(?![\p{L}\p{N}]))?(?!\s*(?:g|mg|dg|ml|dl|l|ks|kcal|kj|min|h|mm|m|%)(?![\p{L}\p{N}]))/giu;

const EXPLICIT_WAIST_CLAUSE_RE =
  /(?:(?:^|[,;.\n])\s*(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?|(?<![\p{L}\p{N}])(?:a\s+)?(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?)(?:obvod\s+pasu|pas|v\s+pase)(?![\p{L}\p{N}])\s*(?:(?:je|dnes|ráno|rano)\s+)?[:=]?\s*(\d{2,3}(?:[.,]\d+)?)(?![\d.,])\s*(?:cm(?![\p{L}\p{N}]))?(?!\s*(?:g|mg|dg|ml|dl|l|ks|kcal|kj|min|h|kg|mm|m|%)(?![\p{L}\p{N}]))/giu;

const EXPLICIT_BP_CLAUSE_RE =
  /(?:(?:^|[,;.\n])\s*(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?|(?<![\p{L}\p{N}])(?:a\s+)?(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?)(?:(?:krevní|krevni)\s+)?(?:tlak)\s*[:=]?\s*(\d{2,3})\s*(?:\/|\s+na\s+)\s*(\d{2,3})(?:\s*mm\s*hg)?(?!\s*(?:g|mg|dg|ml|dl|l|ks|kcal|kj|min|h)(?![\p{L}\p{N}]))/giu;

const EXPLICIT_PULSE_CLAUSE_RE =
  /(?:(?:^|[,;.\n])\s*(?:(?:dnes(?:ka)?|ráno|rano|večer|vecer)\s+)?|(?<![\p{L}\p{N}])(?:a\s+)?)(?:tep(?:ová\s+frekvence)?|pulz|puls|tepu)\s*[:=]?\s*(\d{2,3})(?:\s*(?:bpm|tepů|úderů))?(?!\s*(?:g|mg|dg|ml|dl|l|ks|kcal|kj|min|h)(?![\p{L}\p{N}]))/giu;

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
 * Extracts body weight (kg), waist circumference (cm), blood pressure (sys/dia mmHg),
 * and pulse (bpm) from natural Czech text.
 * Supports both pure measurements ("váha 99,4 kg, pas 96 cm, tlak 120/80 tep 72")
 * and mixed inputs ("tlak 130/85, toast a kafe" -> remainingText: "toast a kafe").
 * Never confuses food gram portions or calorie amounts with body measurements.
 */
export function extractBodyMeasurementFromText(
  rawText: string
): ExtractedBodyMeasurement | null {
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.length > 600) {
    return null;
  }

  // 1. Standalone "99,4 kg"
  const standaloneWeightMatch = STANDALONE_WEIGHT_RE.exec(trimmed);
  if (standaloneWeightMatch) {
    const val = round1(Number(standaloneWeightMatch[1].replace(",", ".")));
    if (Number.isFinite(val) && val >= 35 && val <= 260) {
      return {
        weight_kg: val,
        waist_cm: null,
        blood_pressure_sys: null,
        blood_pressure_dia: null,
        pulse_bpm: null,
        remainingText: "",
      };
    }
  }

  // 2. Standalone "120/80" or "tlak 120/80"
  const standaloneBpMatch = STANDALONE_BP_RE.exec(trimmed);
  if (standaloneBpMatch) {
    const sys = Number(standaloneBpMatch[1]);
    const dia = Number(standaloneBpMatch[2]);
    if (sys >= 60 && sys <= 260 && dia >= 40 && dia <= 160 && sys > dia) {
      return {
        weight_kg: null,
        waist_cm: null,
        blood_pressure_sys: sys,
        blood_pressure_dia: dia,
        pulse_bpm: null,
        remainingText: "",
      };
    }
  }

  let weightKg: number | null = null;
  let waistCm: number | null = null;
  let bpSys: number | null = null;
  let bpDia: number | null = null;
  let pulseBpm: number | null = null;

  let working = trimmed;

  working = working.replace(
    EXPLICIT_WEIGHT_CLAUSE_RE,
    (fullMatch, numStr: string) => {
      const val = round1(Number(numStr.replace(",", ".")));
      if (Number.isFinite(val) && val >= 35 && val <= 260) {
        weightKg = val;
        return ", ";
      }
      return fullMatch;
    }
  );

  working = working.replace(
    EXPLICIT_WAIST_CLAUSE_RE,
    (fullMatch, numStr: string) => {
      const val = round1(Number(numStr.replace(",", ".")));
      if (Number.isFinite(val) && val >= 45 && val <= 190) {
        waistCm = val;
        return ", ";
      }
      return fullMatch;
    }
  );

  working = working.replace(
    EXPLICIT_BP_CLAUSE_RE,
    (fullMatch, sysStr: string, diaStr: string) => {
      const sys = Number(sysStr);
      const dia = Number(diaStr);
      if (sys >= 60 && sys <= 260 && dia >= 40 && dia <= 160 && sys > dia) {
        bpSys = sys;
        bpDia = dia;
        return ", ";
      }
      return fullMatch;
    }
  );

  working = working.replace(
    EXPLICIT_PULSE_CLAUSE_RE,
    (fullMatch, pulseStr: string) => {
      const pulse = Number(pulseStr);
      if (pulse >= 35 && pulse <= 220) {
        pulseBpm = pulse;
        return ", ";
      }
      return fullMatch;
    }
  );

  if (
    weightKg === null &&
    waistCm === null &&
    bpSys === null &&
    bpDia === null &&
    pulseBpm === null
  ) {
    return null;
  }

  const remainingText = cleanRemainingFoodOrActivityText(working);

  return {
    weight_kg: weightKg,
    waist_cm: waistCm,
    blood_pressure_sys: bpSys,
    blood_pressure_dia: bpDia,
    pulse_bpm: pulseBpm,
    remainingText,
  };
}

/**
 * Convenience helper returning non-null ONLY when the text is purely a body measurement
 * (no food or sport items mixed in).
 */
export function tryParseBodyMeasurementText(
  rawText: string
): {
  weight_kg: number | null;
  waist_cm: number | null;
  blood_pressure_sys: number | null;
  blood_pressure_dia: number | null;
  pulse_bpm: number | null;
} | null {
  const extracted = extractBodyMeasurementFromText(rawText);
  if (!extracted || extracted.remainingText.length > 0) {
    return null;
  }
  return {
    weight_kg: extracted.weight_kg,
    waist_cm: extracted.waist_cm,
    blood_pressure_sys: extracted.blood_pressure_sys,
    blood_pressure_dia: extracted.blood_pressure_dia,
    pulse_bpm: extracted.pulse_bpm,
  };
}
