import {
  ParsedEntryResultSchema,
  type ParsedEntryResult,
  type ParsedItem,
  type TemplateItemSnapshot,
  type TimeSlot,
} from "@/lib/types";

export interface PersonalMealPreset {
  key: string;
  canonicalName: string;
  aliases: string[];
  /** Regex matching a single clean clause (ASCII, lowercase, diacritics stripped) */
  exactClauseRegex: RegExp;
  typicalTimeSlot: TimeSlot;
  kjApprox: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  notes: string;
  items: TemplateItemSnapshot[];
}

export const RADEK_PERSONAL_PRESETS: PersonalMealPreset[] = [
  {
    key: "protein_inulin",
    canonicalName: "Protein + inulin",
    aliases: [
      "protein",
      "protein + inulin",
      "protein s inulinem",
      "protein inulin",
      "protein a inulin",
      "protein + 10g inulinu",
      "protein shake",
      "shake",
    ],
    exactClauseRegex:
      /^(?:protein(?:\s+shake)?|shake)(?:\s*(?:\+|s|se|a|plus)?\s*(?:10\s*g\s*)?inulin\w*)?$/,
    typicalTimeSlot: "snack",
    kjApprox: 1160,
    kcal: 277,
    proteinG: 46.0,
    carbsG: 10.4,
    fatG: 3.8,
    fiberG: 10.0,
    notes:
      "Osobní zkratka „Protein“ (~1 160 kJ): 200 ml polotučné mléko + 43,75 g (1,25 dávky) AMIX IsoPrime CFM + 4 g kreatin + 10 g inulin.",
    items: [
      {
        item_name: "Mléko polotučné (200 ml)",
        canonical_name: "Mléko polotučné",
        portion_grams: 200,
        kcal: 93,
        protein_g: 6.6,
        carbs_g: 9.6,
        fat_g: 3.0,
        fiber_g: 0.0,
      },
      {
        item_name: "AMIX IsoPrime CFM 1,25 dávky (43,75 g)",
        canonical_name: "AMIX IsoPrime CFM",
        portion_grams: 44,
        kcal: 170,
        protein_g: 39.4,
        carbs_g: 0.8,
        fat_g: 0.8,
        fiber_g: 0.0,
      },
      {
        item_name: "Amix creatine monohydrate (4 g)",
        canonical_name: "Amix creatine monohydrate",
        portion_grams: 4,
        kcal: 0,
        protein_g: 0.0,
        carbs_g: 0.0,
        fat_g: 0.0,
        fiber_g: 0.0,
      },
      {
        item_name: "Inulin (10 g)",
        canonical_name: "Inulin",
        portion_grams: 10,
        kcal: 14,
        protein_g: 0.0,
        carbs_g: 0.0,
        fat_g: 0.0,
        fiber_g: 10.0,
      },
    ],
  },
  {
    key: "kafe",
    canonicalName: "Kafe (ice latté)",
    aliases: [
      "kafe",
      "latte",
      "latté",
      "ice latte",
      "ice latté",
      "ledové kafe",
      "ledová káva",
      "ledové latté",
      "caffe latte",
      "cafe latte",
    ],
    exactClauseRegex:
      /^(?:kafe|(?:ice\s+|caffe\s+|cafe\s+|ledov[ea]\s+)?latte|ledov[ea]\s+kav?e|ledov[ea]\s+kava)$/,
    typicalTimeSlot: "morning",
    kjApprox: 425,
    kcal: 101,
    proteinG: 5.0,
    carbsG: 15.1,
    fatG: 2.3,
    fiberG: 0.0,
    notes:
      "Osobní zkratka „Kafe“ (~425 kJ): 1 shot espresso + 1,5 lžičky cukru (7,5 g) + 150 ml polotučné mléko + led.",
    items: [
      {
        item_name: "Espresso (1 shot)",
        canonical_name: "Espresso",
        portion_grams: 30,
        kcal: 2,
        protein_g: 0.0,
        carbs_g: 0.4,
        fat_g: 0.0,
        fiber_g: 0.0,
      },
      {
        item_name: "Cukr 1,5 lžičky (7,5 g)",
        canonical_name: "Cukr",
        portion_grams: 8,
        kcal: 30,
        protein_g: 0.0,
        carbs_g: 7.5,
        fat_g: 0.0,
        fiber_g: 0.0,
      },
      {
        item_name: "Mléko polotučné (150 ml)",
        canonical_name: "Mléko polotučné",
        portion_grams: 150,
        kcal: 69,
        protein_g: 5.0,
        carbs_g: 7.2,
        fat_g: 2.3,
        fiber_g: 0.0,
      },
    ],
  },
  {
    key: "mensi_musli",
    canonicalName: "Menší porce müsli",
    aliases: [
      "menší porce müsli",
      "menší müsli",
      "malé müsli",
      "malá porce müsli",
      "mensi musli",
      "mensi porce musli",
    ],
    exactClauseRegex:
      /^(?:mensi|mal[ae])\s+(?:porce\s+)?(?:musli|mysli)$/,
    typicalTimeSlot: "morning",
    kjApprox: 670,
    kcal: 161,
    proteinG: 7.4,
    carbsG: 19.3,
    fatG: 5.4,
    fiberG: 1.9,
    notes:
      "Osobní zkratka „Menší porce müsli“ (~670 kJ): 25 g Emco Mysli Lehké a křehké + ~2 g Granko + 100 ml polotučné mléko.",
    items: [
      {
        item_name: "Emco Mysli Lehké a křehké – semínka a ořechy (25 g)",
        canonical_name: "Emco Mysli Lehké a křehké – semínka a ořechy",
        portion_grams: 25,
        kcal: 107,
        protein_g: 4.0,
        carbs_g: 13.0,
        fat_g: 3.8,
        fiber_g: 1.9,
      },
      {
        item_name: "Granko (2 g)",
        canonical_name: "Granko",
        portion_grams: 2,
        kcal: 7,
        protein_g: 0.1,
        carbs_g: 1.5,
        fat_g: 0.1,
        fiber_g: 0.0,
      },
      {
        item_name: "Mléko polotučné (100 ml)",
        canonical_name: "Mléko polotučné",
        portion_grams: 100,
        kcal: 47,
        protein_g: 3.3,
        carbs_g: 4.8,
        fat_g: 1.5,
        fiber_g: 0.0,
      },
    ],
  },
  {
    key: "musli",
    canonicalName: "Müsli",
    aliases: ["müsli", "musli", "mysli", "emco müsli"],
    exactClauseRegex: /^(?:emco\s+)?(?:musli|mysli)$/,
    typicalTimeSlot: "morning",
    kjApprox: 1050,
    kcal: 251,
    proteinG: 11.6,
    carbsG: 30.3,
    fatG: 8.4,
    fiberG: 3.0,
    notes:
      "Osobní zkratka „Müsli“ (~1 050 kJ): 40 g Emco Mysli Lehké a křehké (semínka a ořechy) + 3 g Granko + 150 ml polotučné mléko.",
    items: [
      {
        item_name: "Emco Mysli Lehké a křehké – semínka a ořechy (40 g)",
        canonical_name: "Emco Mysli Lehké a křehké – semínka a ořechy",
        portion_grams: 40,
        kcal: 171,
        protein_g: 6.4,
        carbs_g: 20.8,
        fat_g: 6.0,
        fiber_g: 3.0,
      },
      {
        item_name: "Granko (3 g)",
        canonical_name: "Granko",
        portion_grams: 3,
        kcal: 11,
        protein_g: 0.2,
        carbs_g: 2.3,
        fat_g: 0.1,
        fiber_g: 0.0,
      },
      {
        item_name: "Mléko polotučné (150 ml)",
        canonical_name: "Mléko polotučné",
        portion_grams: 150,
        kcal: 69,
        protein_g: 5.0,
        carbs_g: 7.2,
        fat_g: 2.3,
        fiber_g: 0.0,
      },
    ],
  },
  {
    key: "kakao",
    canonicalName: "Kakao",
    aliases: ["kakao", "granko"],
    exactClauseRegex: /^(?:kakao|granko)$/,
    typicalTimeSlot: "morning",
    kjApprox: 630,
    kcal: 150,
    proteinG: 7.5,
    carbsG: 21.3,
    fatG: 3.5,
    fiberG: 1.0,
    notes:
      "Osobní zkratka „Kakao“ (~630 kJ): 200 ml polotučné mléko + 3 lžičky Granka (15 g).",
    items: [
      {
        item_name: "Mléko polotučné (200 ml)",
        canonical_name: "Mléko polotučné",
        portion_grams: 200,
        kcal: 93,
        protein_g: 6.6,
        carbs_g: 9.6,
        fat_g: 3.0,
        fiber_g: 0.0,
      },
      {
        item_name: "Granko 3 lžičky (15 g)",
        canonical_name: "Granko",
        portion_grams: 15,
        kcal: 57,
        protein_g: 0.9,
        carbs_g: 11.7,
        fat_g: 0.5,
        fiber_g: 1.0,
      },
    ],
  },
  {
    key: "toast",
    canonicalName: "Toast",
    aliases: ["toast", "toust", "toasty", "tousty", "zapékaný toast"],
    exactClauseRegex: /^(?:zapekan\w*\s+)?(?:toast|toust|toasty|tousty)$/,
    typicalTimeSlot: "evening",
    kjApprox: 1220,
    kcal: 292,
    proteinG: 17.8,
    carbsG: 21.2,
    fatG: 14.3,
    fiberG: 3.0,
    notes:
      "Osobní zkratka „Toast“ (~1 220 kJ): 2 plátky celozrnného toastu (50 g) + 1 plátek Goudy (25 g) + 2 plátky šunky (40 g) + 1 lžička olivového oleje (5 ml).",
    items: [
      {
        item_name: "Toastový celozrnný chléb 2 plátky (50 g)",
        canonical_name: "Toastový celozrnný chléb",
        portion_grams: 50,
        kcal: 120,
        protein_g: 4.5,
        carbs_g: 20.5,
        fat_g: 1.6,
        fiber_g: 3.0,
      },
      {
        item_name: "Gouda 1 plátek (25 g)",
        canonical_name: "Gouda",
        portion_grams: 25,
        kcal: 88,
        protein_g: 6.3,
        carbs_g: 0.3,
        fat_g: 6.9,
        fiber_g: 0.0,
      },
      {
        item_name: "Šunka 2 plátky (40 g)",
        canonical_name: "Šunka",
        portion_grams: 40,
        kcal: 43,
        protein_g: 7.0,
        carbs_g: 0.4,
        fat_g: 1.2,
        fiber_g: 0.0,
      },
      {
        item_name: "Olivový olej 1 lžička (5 ml)",
        canonical_name: "Olivový olej",
        portion_grams: 5,
        kcal: 41,
        protein_g: 0.0,
        carbs_g: 0.0,
        fat_g: 4.6,
        fiber_g: 0.0,
      },
    ],
  },
];

function stripDiacriticsAscii(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[„“"']/g, "")
    .trim();
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

const MULTIPLIER_WORDS: Record<string, number> = {
  pul: 0.5,
  jeden: 1,
  jedna: 1,
  jedno: 1,
  jednu: 1,
  dva: 2,
  dve: 2,
  dvojit: 2,
  tri: 3,
};

function extractMultiplierPrefix(clauseAscii: string): {
  multiplier: number;
  remainder: string;
} {
  const numMatch = clauseAscii.match(
    /^(\d+(?:[.,]\d+)?)\s*(?:x|×|porc\w*|davk\w*)?\s+(.+)$/
  );
  if (numMatch) {
    const qty = Number(numMatch[1].replace(",", "."));
    if (Number.isFinite(qty) && qty > 0 && qty <= 10) {
      return { multiplier: qty, remainder: numMatch[2].trim() };
    }
  }

  for (const [prefix, qty] of Object.entries(MULTIPLIER_WORDS)) {
    const re = new RegExp(`^${prefix}\\w*\\s+(.+)$`);
    const m = clauseAscii.match(re);
    if (m) {
      return { multiplier: qty, remainder: m[1].trim() };
    }
  }

  return { multiplier: 1, remainder: clauseAscii };
}

/**
 * Deterministically resolves raw text if EVERY clause is one of Radek's personal shortcuts
 * without custom modifications (like "bez šunky"). Preserves compound shortcuts like
 * "protein + inulin" or "protein a 10g inulinu" before clause splitting.
 */
export function tryResolvePersonalPresetEntry(
  rawText: string,
  fallbackTimeSlot: TimeSlot
): ParsedEntryResult | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const asciiFull = stripDiacriticsAscii(trimmed);

  // If user specifies modifications like "bez ...", "misto ...", "navic ...", let Gemini AI handle the adjustment
  if (/\b(?:bez|misto|ubrat|pridat)\b/.test(asciiFull)) {
    return null;
  }

  // Protect compound "protein + inulin" / "protein a 10g inulinu" from splitting on "+" / "a"
  const protectedText = asciiFull.replace(
    /\b(protein(?:\s+shake)?|shake)\s*(?:\+|s|se|a|plus)\s*(?:10\s*g\s*)?(inulin\w*)\b/g,
    "$1_WITH_$2"
  );

  const rawClauses = protectedText
    .split(/(?:,|;|\+|\n|\s+(?:a|i|plus)\s+)/)
    .map((c) => c.replace(/_WITH_/g, " + ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (rawClauses.length === 0) return null;

  const matchedPresets: Array<{ preset: PersonalMealPreset; multiplier: number }> = [];

  for (const clause of rawClauses) {
    // First try full clause directly (handles "malá porce müsli", "protein + inulin", etc.)
    const directPreset = RADEK_PERSONAL_PRESETS.find((p) =>
      p.exactClauseRegex.test(clause)
    );
    if (directPreset) {
      matchedPresets.push({ preset: directPreset, multiplier: 1 });
      continue;
    }

    // Next try leading multiplier (e.g. "2x toast", "dva toasty", "2 kafe")
    const { multiplier, remainder } = extractMultiplierPrefix(clause);
    const scaledPreset = RADEK_PERSONAL_PRESETS.find((p) =>
      p.exactClauseRegex.test(remainder)
    );
    if (scaledPreset) {
      matchedPresets.push({ preset: scaledPreset, multiplier });
      continue;
    }

    // Any unrecognized clause means we delegate to the full AI / hybrid parser
    return null;
  }

  const allItems: ParsedItem[] = [];
  for (const { preset, multiplier } of matchedPresets) {
    for (const item of preset.items) {
      const scaledPortion =
        item.portion_grams !== null
          ? Math.max(1, Math.round(item.portion_grams * multiplier))
          : null;
      const prefix = multiplier !== 1 ? `${multiplier}× ` : "";
      allItems.push({
        item_kind: "food",
        item_name: `${prefix}${item.item_name}`,
        canonical_name: item.canonical_name,
        portion_grams: scaledPortion,
        duration_minutes: null,
        met_value: null,
        kcal: Math.max(0, Math.round(item.kcal * multiplier)),
        burned_kcal: 0,
        protein_g: round1(item.protein_g * multiplier),
        carbs_g: round1(item.carbs_g * multiplier),
        fat_g: round1(item.fat_g * multiplier),
        fiber_g: round1(item.fiber_g * multiplier),
        confidence: 1.0,
      });
    }
  }

  const titles = matchedPresets.map(({ preset, multiplier }) =>
    multiplier !== 1
      ? `${multiplier}× ${preset.canonicalName}`
      : preset.canonicalName
  );

  const canonicalMealName =
    matchedPresets.length === 1
      ? matchedPresets[0].preset.canonicalName
      : titles.join(" + ");

  const typicalTimeSlot: TimeSlot =
    fallbackTimeSlot !== "anytime"
      ? fallbackTimeSlot
      : matchedPresets[0].preset.typicalTimeSlot;

  const notes =
    matchedPresets.length === 1
      ? matchedPresets[0].preset.notes
      : `Složeno z osobních zkratek: ${titles.join(", ")}.`;

  return ParsedEntryResultSchema.parse({
    summary_title: titles.join(" + "),
    canonical_meal_name: canonicalMealName,
    typical_time_slot: typicalTimeSlot,
    ai_notes: notes,
    items: allItems,
  });
}

/**
 * Generates system prompt instructions describing Radek's personal meal shortcuts
 * so Gemini 3.8 Flash uses the exact ingredients even in complex/modified sentences.
 */
export function buildPersonalPresetsSystemSection(): string {
  const lines: string[] = [
    "OSOBNÍ ZKRATKY UŽIVATELE (RADEK) – NEJVYŠŠÍ PRIORITA:",
    "Když uživatel v textu použije některou z těchto zkratek, myslí PŘESNĚ toto složení a nutriční hodnoty (pokud výslovně nenapíše úpravu jako 'bez šunky' nebo jinou gramáž):",
  ];

  for (const preset of RADEK_PERSONAL_PRESETS) {
    const itemsDesc = preset.items
      .map(
        (i) =>
          `${i.item_name} [${i.kcal} kcal, B ${i.protein_g}g, S ${i.carbs_g}g, T ${i.fat_g}g, Vl ${i.fiber_g}g]`
      )
      .join(" + ");
    lines.push(
      `- Zkratky [${preset.aliases.map((a) => `"${a}"`).join(", ")}] -> canonical_meal_name="${preset.canonicalName}" (celkem ${preset.kcal} kcal / ~${preset.kjApprox} kJ, B ${preset.proteinG}g, S ${preset.carbsG}g, T ${preset.fatG}g, Vl ${preset.fiberG}g): rozlož na položky: ${itemsDesc}.`
    );
  }

  return lines.join("\n");
}
