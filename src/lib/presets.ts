import {
  ParsedEntryResultSchema,
  type MealTemplateRow,
  type ParsedEntryResult,
  type ParsedItem,
  type TemplateItemSnapshot,
  type TimeSlot,
} from "@/lib/types";

export interface PersonalMealPreset {
  key: string;
  canonicalName: string;
  aliases: string[];
  /** Optional custom regex for unit tests or specialized matching */
  exactClauseRegex?: RegExp;
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

function stripDiacriticsAscii(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[„“"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripParenthetical(input: string): string {
  return input.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

const VALID_TIME_SLOTS: readonly TimeSlot[] = [
  "morning",
  "lunch",
  "snack",
  "evening",
  "anytime",
];

function toTimeSlot(raw: string | null | undefined): TimeSlot {
  return VALID_TIME_SLOTS.find((s) => s === raw) ?? "anytime";
}

function parseTemplateItemsFromRow(tpl: MealTemplateRow): TemplateItemSnapshot[] {
  if (Array.isArray(tpl.template_items)) {
    const parsed: TemplateItemSnapshot[] = [];
    for (const raw of tpl.template_items) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        continue;
      }
      const rec = raw as Record<string, unknown>;
      const itemName =
        typeof rec.item_name === "string" && rec.item_name.trim()
          ? rec.item_name.trim()
          : null;
      if (!itemName) continue;
      const canonicalName =
        typeof rec.canonical_name === "string" && rec.canonical_name.trim()
          ? rec.canonical_name.trim()
          : itemName;
      parsed.push({
        item_name: itemName,
        canonical_name: canonicalName,
        portion_grams:
          typeof rec.portion_grams === "number" ? rec.portion_grams : null,
        kcal: typeof rec.kcal === "number" ? Math.max(0, Math.round(rec.kcal)) : 0,
        protein_g: typeof rec.protein_g === "number" ? round1(rec.protein_g) : 0,
        carbs_g: typeof rec.carbs_g === "number" ? round1(rec.carbs_g) : 0,
        fat_g: typeof rec.fat_g === "number" ? round1(rec.fat_g) : 0,
        fiber_g: typeof rec.fiber_g === "number" ? round1(rec.fiber_g) : 0,
      });
    }
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [
    {
      item_name: tpl.canonical_name,
      canonical_name: tpl.canonical_name,
      portion_grams: tpl.avg_portion_grams,
      kcal: Math.max(0, Math.round(Number(tpl.avg_kcal) || 0)),
      protein_g: round1(Number(tpl.avg_protein_g) || 0),
      carbs_g: round1(Number(tpl.avg_carbs_g) || 0),
      fat_g: round1(Number(tpl.avg_fat_g) || 0),
      fiber_g: round1(Number(tpl.avg_fiber_g) || 0),
    },
  ];
}

/**
 * Converts a user's DB `meal_templates` rows into per-user shortcut presets.
 * Only active (`!is_hidden`) templates that are pinned (`is_quick_check`) or
 * define explicit `shortcut_aliases` are treated as deterministic shortcuts.
 */
export function buildPresetsFromMealTemplates(
  templates: MealTemplateRow[]
): PersonalMealPreset[] {
  const presets: PersonalMealPreset[] = [];

  for (const tpl of templates) {
    if (tpl.is_hidden) continue;
    const rawAliases = Array.isArray(tpl.shortcut_aliases)
      ? tpl.shortcut_aliases
      : [];
    if (!tpl.is_quick_check && rawAliases.length === 0) {
      continue;
    }

    const aliasSet = new Set<string>();
    const addAlias = (val: string) => {
      const cleaned = val.trim();
      if (cleaned.length >= 2) {
        aliasSet.add(cleaned);
      }
    };

    addAlias(tpl.canonical_name);
    const withoutParens = stripParenthetical(tpl.canonical_name);
    if (withoutParens && withoutParens !== tpl.canonical_name) {
      addAlias(withoutParens);
    }
    for (const alias of rawAliases) {
      addAlias(alias);
    }

    const kcal = Math.max(0, Math.round(Number(tpl.avg_kcal) || 0));
    const kjApprox = Math.round(kcal * 4.184);

    presets.push({
      key: `tpl_${tpl.id}`,
      canonicalName: tpl.canonical_name,
      aliases: Array.from(aliasSet),
      typicalTimeSlot: toTimeSlot(tpl.typical_time_slot),
      kjApprox,
      kcal,
      proteinG: round1(Number(tpl.avg_protein_g) || 0),
      carbsG: round1(Number(tpl.avg_carbs_g) || 0),
      fatG: round1(Number(tpl.avg_fat_g) || 0),
      fiberG: round1(Number(tpl.avg_fiber_g) || 0),
      notes:
        tpl.preset_notes?.trim() ||
        `Osobní oblíbené jídlo „${tpl.canonical_name}“ (~${kjApprox} kJ / ${kcal} kcal).`,
      items: parseTemplateItemsFromRow(tpl),
    });
  }

  return presets;
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

function matchPresetClause(
  presets: PersonalMealPreset[],
  clauseAscii: string
): PersonalMealPreset | undefined {
  // Prefer longest matching alias first so specific phrases (e.g. "menší müsli") beat shorter ones ("müsli")
  let bestPreset: PersonalMealPreset | undefined;
  let bestLen = -1;

  for (const preset of presets) {
    if (preset.exactClauseRegex && preset.exactClauseRegex.test(clauseAscii)) {
      const score = preset.canonicalName.length;
      if (score > bestLen) {
        bestLen = score;
        bestPreset = preset;
      }
      continue;
    }

    for (const alias of preset.aliases) {
      const aliasAscii = stripDiacriticsAscii(alias);
      if (aliasAscii && aliasAscii === clauseAscii && aliasAscii.length > bestLen) {
        bestLen = aliasAscii.length;
        bestPreset = preset;
      }
    }
  }

  return bestPreset;
}

function matchClauseOrScaled(
  presets: PersonalMealPreset[],
  clauseAscii: string
): { preset: PersonalMealPreset; multiplier: number } | null {
  const direct = matchPresetClause(presets, clauseAscii);
  if (direct) {
    return { preset: direct, multiplier: 1 };
  }

  const { multiplier, remainder } = extractMultiplierPrefix(clauseAscii);
  if (remainder && remainder !== clauseAscii) {
    const scaled = matchPresetClause(presets, remainder);
    if (scaled) {
      return { preset: scaled, multiplier };
    }
  }

  return null;
}

/**
 * Deterministically resolves raw text if EVERY clause matches one of the given
 * user-specific presets without custom modifications (like "bez šunky").
 */
export function tryResolvePersonalPresetEntry(
  rawText: string,
  fallbackTimeSlot: TimeSlot,
  presets: PersonalMealPreset[] = []
): ParsedEntryResult | null {
  if (presets.length === 0) return null;

  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const asciiFull = stripDiacriticsAscii(trimmed);

  // If user specifies modifications like "bez ...", "misto ...", "navic ...", let Gemini AI handle the adjustment
  if (/\b(?:bez|misto|ubrat|pridat)\b/.test(asciiFull)) {
    return null;
  }

  let matchedPresets: Array<{ preset: PersonalMealPreset; multiplier: number }> =
    [];

  // First try matching the entire input (allows compound names with "+" or "a" like "Protein + inulin")
  const wholeMatch = matchClauseOrScaled(presets, asciiFull);
  if (wholeMatch) {
    matchedPresets = [wholeMatch];
  } else {
    // Protect compound "protein + inulin" / "protein a 10g inulinu" when user has an inulin preset
    const hasInulinPreset = presets.some((p) =>
      p.aliases.some((a) => stripDiacriticsAscii(a).includes("inulin"))
    );
    const protectedText = hasInulinPreset
      ? asciiFull.replace(
          /\b(protein(?:\s+shake)?|shake)\s*(?:\+|s|se|a|plus)\s*(?:10\s*g\s*)?(inulin\w*)\b/g,
          "$1_WITH_$2"
        )
      : asciiFull;

    const rawClauses = protectedText
      .split(/(?:,|;|\+|\n|\s+(?:a|i|plus)\s+)/)
      .map((c) => c.replace(/_WITH_/g, " + ").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (rawClauses.length === 0) return null;

    for (const clause of rawClauses) {
      const m = matchClauseOrScaled(presets, clause);
      if (!m) {
        return null;
      }
      matchedPresets.push(m);
    }
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

export function resolveUserMealShortcutEntry(
  rawText: string,
  fallbackTimeSlot: TimeSlot,
  userTemplates: MealTemplateRow[]
): ParsedEntryResult | null {
  const presets = buildPresetsFromMealTemplates(userTemplates);
  return tryResolvePersonalPresetEntry(rawText, fallbackTimeSlot, presets);
}

/**
 * Generates system prompt instructions describing THIS user's personal meal shortcuts
 * and favorite meals so Gemini uses their exact ingredients/macros even in modified sentences.
 */
export function buildPersonalPresetsSystemSection(
  presets: PersonalMealPreset[] = []
): string {
  if (presets.length === 0) {
    return "";
  }

  const lines: string[] = [
    "OBLÍBENÁ JÍDLA A OSOBNÍ ZKRATKY TOHOTO UŽIVATELE – NEJVYŠŠÍ PRIORITA:",
    "Když uživatel v textu použije některou z těchto svých zkratek, myslí PŘESNĚ toto složení a nutriční hodnoty (pokud výslovně nenapíše úpravu jako 'bez ...' nebo jinou gramáž):",
  ];

  for (const preset of presets) {
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
