import type {
  ActivityIntensity,
  ActivityTemplateRow,
  EntryItemRow,
  LogEntryWithItems,
  MealTemplateRow,
} from "./types";

export interface MealTemplateDayCount {
  /** Total portions detected across all entries on the selected day (quick-tap + exact text). */
  totalCount: number;
  /** Number of standalone entries directly removable by the quick `-` button. */
  removableCount: number;
}

export interface DaySportExistingState {
  hasStandaloneEntry: boolean;
  entryCount: number;
  totalMinutes: number;
  latestIntensity: ActivityIntensity | null;
}

interface ParsedTemplateItemRef {
  canonicalAscii: string;
  kcal: number;
}

function stripAscii(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[„“"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripParenthetical(input: string): string {
  return input.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function stripLeadingMultiplierAndTrailingWeight(ascii: string): string {
  return ascii
    .replace(/^\d+(?:[.,]\d+)?\s*(?:x|×|ks\b|kus\w*|porc\w*)?\s+/, "")
    .replace(
      /\s+\d+(?:[.,]\d+)?\s*(?:g|gr|gram\w*|ml|l|cl|dl|ks|kus\w*)$/,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

const WORD_MULTIPLIERS: Record<string, number> = {
  jeden: 1,
  jedna: 1,
  jedno: 1,
  jednu: 1,
  dva: 2,
  dve: 2,
  dvojit: 2,
  dvojita: 2,
  dvojite: 2,
  tri: 3,
  ctyri: 4,
};

/**
 * Extracts integer portion count prefix such as "2x kafe", "2× Kafe", "dva toasty", "3 kafe".
 * Defaults to 1 when no explicit count >= 1 is present.
 */
export function extractPortionCountPrefix(rawText: string): number {
  const ascii = stripAscii(rawText);
  const numMatch = ascii.match(
    /^(\d+(?:[.,]\d+)?)\s*(?:x|×|ks\b|kus\w*|porc\w*|davk\w*|salk\w*|hrnk\w*)?\s+\S+/
  );
  if (numMatch) {
    // Avoid treating gram/ml weights like "150 ml mleka" or "40 g musli" as portion multipliers!
    const unitCheck = ascii.match(
      /^\d+(?:[.,]\d+)?\s*(?:g|gr|gram\w*|ml|l|cl|dl|kg|min\w*|hod\w*|h)\b/
    );
    if (!unitCheck) {
      const val = Number(numMatch[1].replace(",", "."));
      if (Number.isFinite(val) && val >= 1 && val <= 10) {
        return Math.max(1, Math.round(val));
      }
    }
  }

  for (const [word, mult] of Object.entries(WORD_MULTIPLIERS)) {
    if (new RegExp(`^${word}\\b\\s+\\S+`).test(ascii)) {
      return mult;
    }
  }

  return 1;
}

function extractTemplateItemRefs(tpl: MealTemplateRow): ParsedTemplateItemRef[] {
  if (!Array.isArray(tpl.template_items)) {
    return [];
  }
  const refs: ParsedTemplateItemRef[] = [];
  for (const raw of tpl.template_items) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const rec = raw as Record<string, unknown>;
    const name =
      typeof rec.canonical_name === "string" && rec.canonical_name.trim()
        ? rec.canonical_name
        : typeof rec.item_name === "string"
          ? rec.item_name
          : "";
    const ascii = stripLeadingMultiplierAndTrailingWeight(
      stripAscii(stripParenthetical(name))
    );
    if (!ascii) continue;
    refs.push({
      canonicalAscii: ascii,
      kcal: typeof rec.kcal === "number" ? rec.kcal : 0,
    });
  }
  return refs;
}

function buildTemplatePhrases(tpl: MealTemplateRow): string[] {
  const rawList: string[] = [
    tpl.canonical_name,
    stripParenthetical(tpl.canonical_name),
    ...(Array.isArray(tpl.shortcut_aliases) ? tpl.shortcut_aliases : []),
  ];

  const seen = new Set<string>();
  const clean: string[] = [];
  for (const r of rawList) {
    const a = stripAscii(r);
    if (a.length >= 2 && !seen.has(a)) {
      seen.add(a);
      clean.push(a);
    }
  }
  return clean;
}

function splitRawTextClausesAscii(rawText: string): string[] {
  const asciiRaw = stripAscii(rawText).replace(
    /\b(protein(?:\s+shake)?|shake)\s*(?:\+|s|se|a|plus)\s*(?:10\s*g\s*)?(inulin\w*)\b/g,
    "$1_WITH_$2"
  );

  return asciiRaw
    .split(/(?:,|;|\.|!|\+|\n|\s+(?:a|i|plus)\s+)/)
    .map((c) => c.replace(/_WITH_/g, " + ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function stripClauseMultiplierPrefix(clause: string): string {
  return clause
    .replace(/^\d+(?:[.,]\d+)?\s*(?:x|×|ks\b|kus\w*|porc\w*)?\s+/, "")
    .replace(
      /^(?:jeden|jedna|jedno|jednu|dva|dve|dvojit\w*|tri|ctyri)\s+/,
      ""
    )
    .replace(
      /\s+\d+(?:[.,]\d+)?\s*(?:g|gr|gram\w*|ml|l|cl|dl|ks|kus\w*)$/,
      ""
    )
    .trim();
}

/**
 * Strict exact-identity check for a single food item against a template phrase.
 * Never matches prefixes or substrings (so "Mullermilch zero čokoládový" or
 * "Mullermilch čokoládový" will NEVER match "Mullermilch Protein čokoládový",
 * and "Chleba se šunkou a sýrem" will NEVER match "Chleba se šunkou").
 */
function itemMatchesPhraseExact(
  itemHeadlineAscii: string,
  itemCanonAscii: string,
  phraseAscii: string
): boolean {
  const DISQUALIFYING_COFFEE_MODIFIERS =
    /\b(?:vietnam\w*|salk\w*|tureck\w*|turk\w*|alzir\w*|irsk\w*)\b/i;
  if (
    (phraseAscii === "kafe" ||
      phraseAscii.includes("latte") ||
      phraseAscii.includes("ledov")) &&
    (DISQUALIFYING_COFFEE_MODIFIERS.test(itemHeadlineAscii) ||
      DISQUALIFYING_COFFEE_MODIFIERS.test(itemCanonAscii))
  ) {
    return false;
  }

  const cleanHeadline = stripLeadingMultiplierAndTrailingWeight(itemHeadlineAscii);
  const cleanCanon = stripLeadingMultiplierAndTrailingWeight(itemCanonAscii);

  return (
    itemHeadlineAscii === phraseAscii ||
    itemCanonAscii === phraseAscii ||
    cleanHeadline === phraseAscii ||
    cleanCanon === phraseAscii
  );
}

const VARIANT_MODIFIER_TOKENS = [
  "zero",
  "light",
  "protein",
  "cokolad",
  "vanilk",
  "jahod",
  "banan",
  "karamel",
  "kokos",
  "pistac",
  "malin",
  "chleb",
  "rohlik",
  "housk",
  "toast",
  "toust",
  "syr",
  "goud",
  "eidam",
  "cheddar",
  "mozzarell",
  "sunk",
];

function hasConflictingVariantModifier(aAscii: string, bAscii: string): boolean {
  for (const mod of VARIANT_MODIFIER_TOKENS) {
    const re = new RegExp(`\\b${mod}\\w*\\b`);
    if (re.test(aAscii) !== re.test(bAscii)) {
      return true;
    }
  }
  return false;
}

function ingredientMatchesItem(
  refCanonicalAscii: string,
  foodItem: EntryItemRow
): boolean {
  const itemCanon = stripLeadingMultiplierAndTrailingWeight(
    stripAscii(stripParenthetical(foodItem.canonical_name))
  );
  const itemName = stripLeadingMultiplierAndTrailingWeight(
    stripAscii(stripParenthetical(foodItem.item_name))
  );

  if (itemCanon === refCanonicalAscii || itemName === refCanonicalAscii) {
    return true;
  }

  // Prevent conflating distinct branded/flavored variants (e.g. Mullermilch zero vs Protein)
  if (hasConflictingVariantModifier(refCanonicalAscii, `${itemCanon} ${itemName}`)) {
    return false;
  }

  if (
    itemCanon.includes(refCanonicalAscii) ||
    refCanonicalAscii.includes(itemCanon)
  ) {
    return itemCanon.length >= 4 && refCanonicalAscii.length >= 4;
  }
  return false;
}

function isKcalCloseToTemplate(
  actualKcal: number,
  templateKcal: number,
  multiplier = 1
): boolean {
  const expected = templateKcal * Math.max(1, multiplier);
  if (expected <= 0 || actualKcal <= 0) return true;
  const ratio = actualKcal / expected;
  return ratio >= 0.78 && ratio <= 1.25;
}

/**
 * Computes accurate, strict per-day counts for every pinned/active meal template:
 * - One-tap `quick_check` entries (`entry.entry_type === "quick_check"`)
 * - Exact standalone text entries matching the template's items & calories
 * - Multi-preset combinations where all items/clauses match explicit templates (e.g. "toast a kafe")
 * - Never checks off a favorite meal when extra ingredients were added (e.g. "chleba, šunka, sýr" != "Chleba se šunkou")
 *   or when a different product variant was logged (e.g. "Mullermilch Protein zero" != "Mullermilch Protein čokoládový").
 */
export function computeMealTemplateDayCounts(
  templates: MealTemplateRow[],
  entries: LogEntryWithItems[]
): Map<number, MealTemplateDayCount> {
  const result = new Map<number, MealTemplateDayCount>();
  const activeTemplates = templates.filter(
    (t) => t.is_quick_check && !t.is_hidden
  );
  if (activeTemplates.length === 0 || entries.length === 0) {
    return result;
  }

  const templateById = new Map<number, MealTemplateRow>();
  const templateRefsById = new Map<number, ParsedTemplateItemRef[]>();

  const phraseEntries: Array<{ phraseAscii: string; tpl: MealTemplateRow }> = [];

  for (const tpl of activeTemplates) {
    const phrases = buildTemplatePhrases(tpl);
    templateById.set(tpl.id, tpl);
    templateRefsById.set(tpl.id, extractTemplateItemRefs(tpl));
    result.set(tpl.id, { totalCount: 0, removableCount: 0 });

    for (const phraseAscii of phrases) {
      phraseEntries.push({ phraseAscii, tpl });
    }
  }

  phraseEntries.sort((a, b) => b.phraseAscii.length - a.phraseAscii.length);

  const multiItemTemplates = activeTemplates
    .filter((t) => (templateRefsById.get(t.id)?.length ?? 0) >= 2)
    .sort((a, b) => {
      const lenDiff =
        (templateRefsById.get(b.id)?.length ?? 0) -
        (templateRefsById.get(a.id)?.length ?? 0);
      if (lenDiff !== 0) return lenDiff;
      return b.avg_kcal - a.avg_kcal;
    });

  const addCount = (tplId: number, count: number, removable: number) => {
    const cur = result.get(tplId);
    if (!cur) return;
    cur.totalCount += count;
    cur.removableCount += removable;
  };

  for (const entry of entries) {
    if (entry.status === "error") continue;

    const foodItems = entry.entry_items.filter((i) => i.item_kind === "food");

    // 1. One-tap `quick_check` entry — always an exact 1× match for its template
    if (entry.entry_type === "quick_check" && entry.meal_template_id != null) {
      const directTpl = templateById.get(entry.meal_template_id);
      if (directTpl) {
        addCount(directTpl.id, 1, 1);
        continue;
      }
    }

    // 1B. Standalone free-text entry with `meal_template_id` — verify ingredients & kcal truly match!
    if (entry.meal_template_id != null) {
      const directTpl = templateById.get(entry.meal_template_id);
      if (directTpl && foodItems.length > 0) {
        const refs = templateRefsById.get(directTpl.id) ?? [];
        const qty = extractPortionCountPrefix(
          entry.summary_title || entry.raw_text
        );
        const entryKcal =
          entry.total_intake_kcal ||
          foodItems.reduce((s, fi) => s + fi.kcal, 0);

        const sameItemCount = refs.length > 0 && foodItems.length === refs.length;
        const usedIdx = new Set<number>();
        const allItemsMatchRefs =
          sameItemCount &&
          refs.every((ref) => {
            const idx = foodItems.findIndex(
              (fi, i) => !usedIdx.has(i) && ingredientMatchesItem(ref.canonicalAscii, fi)
            );
            if (idx === -1) return false;
            usedIdx.add(idx);
            return true;
          });

        if (
          allItemsMatchRefs &&
          isKcalCloseToTemplate(entryKcal, directTpl.avg_kcal, qty)
        ) {
          addCount(directTpl.id, qty, 1);
          continue;
        }
      }
    }

    // 2. Pending / processing entry: match whole raw_text, or multi-clause ONLY when
    // every clause is a known template/shortcut (e.g. "2 kafe a protein") so "Chleba se šunkou a sýrem"
    // never splits on "a" to falsely match "Chleba se šunkou"!
    if (
      entry.status === "pending" ||
      entry.status === "processing" ||
      foodItems.length === 0
    ) {
      if (entry.entry_type === "activity") continue;

      const wholeAscii = stripAscii(entry.raw_text);
      if (!/\b(?:vietnam\w*|salk\w*)\b/.test(wholeAscii)) {
        const wholeQty = extractPortionCountPrefix(wholeAscii);
        const wholeStripped = stripClauseMultiplierPrefix(wholeAscii);
        const wholeMatch = phraseEntries.find(
          ({ phraseAscii }) => wholeStripped === phraseAscii
        );
        if (wholeMatch) {
          addCount(wholeMatch.tpl.id, wholeQty, 0);
          continue;
        }
      }

      const clauses = splitRawTextClausesAscii(entry.raw_text);
      if (clauses.length >= 2) {
        const matchedClauses: Array<{ tplId: number; qty: number }> = [];
        let allClausesMatched = true;

        for (const clause of clauses) {
          if (/\b(?:vietnam\w*|salk\w*)\b/.test(clause)) {
            allClausesMatched = false;
            break;
          }
          const qty = extractPortionCountPrefix(clause);
          const strippedClause = stripClauseMultiplierPrefix(clause);
          const hit = phraseEntries.find(
            ({ phraseAscii }) => strippedClause === phraseAscii
          );
          if (!hit) {
            allClausesMatched = false;
            break;
          }
          matchedClauses.push({ tplId: hit.tpl.id, qty });
        }

        if (allClausesMatched) {
          for (const mc of matchedClauses) {
            addCount(mc.tplId, mc.qty, 0);
          }
        }
      }
      continue;
    }

    // 3. Completed entry (`status === "done"`) with `foodItems`
    // Only treat a multi-item template as explicitly invoked inside a larger meal log
    // if it has explicit `shortcut_aliases` appearing as a standalone clause.
    const rawClausesStripped = splitRawTextClausesAscii(entry.raw_text).map(
      stripClauseMultiplierPrefix
    );

    // Pass 3A: Multi-ingredient templates
    // To prevent false subset matches (like "Chleba + Šunka" inside "Chleba + Šunka + Tvrdý sýr"),
    // we collect candidate multi-item matches first and ONLY commit them if:
    // - ALL foodItems in the entry are cleanly partitioned with 0 leftover items, OR
    // - the matched template was explicitly named as its own clause in `entry.raw_text`.
    const tentativeClaimed = new Set<number>();
    const tentativeMatches: Array<{
      tpl: MealTemplateRow;
      mult: number;
      indices: number[];
      explicitInRawText: boolean;
    }> = [];

    for (const tpl of multiItemTemplates) {
      const refs = templateRefsById.get(tpl.id) ?? [];
      if (refs.length < 2) continue;

      let safety = 0;
      while (safety++ < 5) {
        const candidateIndices: number[] = [];
        let allMatched = true;

        for (const ref of refs) {
          const foundIdx = foodItems.findIndex(
            (fi, idx) =>
              !tentativeClaimed.has(idx) &&
              !candidateIndices.includes(idx) &&
              ingredientMatchesItem(ref.canonicalAscii, fi)
          );
          if (foundIdx === -1) {
            allMatched = false;
            break;
          }
          candidateIndices.push(foundIdx);
        }

        if (!allMatched) break;

        const matchedKcal = candidateIndices.reduce(
          (s, idx) => s + foodItems[idx].kcal,
          0
        );
        const siblingWithSameRefs = multiItemTemplates.find((other) => {
          if (other.id === tpl.id) return false;
          const otherRefs = templateRefsById.get(other.id) ?? [];
          if (otherRefs.length !== refs.length) return false;
          return refs.every(
            (r, i) => r.canonicalAscii === otherRefs[i]?.canonicalAscii
          );
        });

        let targetTpl = tpl;
        if (siblingWithSameRefs) {
          const distSelf = Math.abs(matchedKcal - tpl.avg_kcal);
          const distSibling = Math.abs(
            matchedKcal - siblingWithSameRefs.avg_kcal
          );
          if (distSibling < distSelf) {
            targetTpl = siblingWithSameRefs;
          }
        }

        const ratio =
          targetTpl.avg_kcal > 40 ? matchedKcal / targetTpl.avg_kcal : 1;
        const mult = ratio >= 1.65 && ratio <= 10 ? Math.round(ratio) : 1;

        if (!isKcalCloseToTemplate(matchedKcal, targetTpl.avg_kcal, mult)) {
          break;
        }

        for (const idx of candidateIndices) {
          tentativeClaimed.add(idx);
        }

        const explicitAliases = Array.isArray(targetTpl.shortcut_aliases)
          ? targetTpl.shortcut_aliases.map(stripAscii)
          : [];
        const explicitInRawText =
          explicitAliases.length > 0 &&
          rawClausesStripped.some((c) => explicitAliases.includes(c));

        tentativeMatches.push({
          tpl: targetTpl,
          mult,
          indices: candidateIndices,
          explicitInRawText,
        });
      }
    }

    const claimedIndices = new Set<number>();
    const allEntryItemsPartitioned =
      tentativeMatches.length > 0 && tentativeClaimed.size === foodItems.length;

    for (const m of tentativeMatches) {
      if (allEntryItemsPartitioned || m.explicitInRawText) {
        for (const idx of m.indices) {
          claimedIndices.add(idx);
        }
        addCount(m.tpl.id, m.mult, 0);
      }
    }

    // Pass 3B: Single-item exact headline/canonical match on remaining unclaimed items
    // Only matches templates that represent a single food/drink item (or explicit shortcut alias like "ice latte")
    // AND whose calories match closely.
    foodItems.forEach((item, idx) => {
      if (claimedIndices.has(idx)) return;
      const itemHeadlineAscii = stripAscii(stripParenthetical(item.item_name));
      const itemCanonAscii = stripAscii(stripParenthetical(item.canonical_name));
      const qty = extractPortionCountPrefix(item.item_name);

      for (const { phraseAscii, tpl } of phraseEntries) {
        const refs = templateRefsById.get(tpl.id) ?? [];
        const hasAliases =
          Array.isArray(tpl.shortcut_aliases) && tpl.shortcut_aliases.length > 0;
        // Multi-ingredient templates without explicit aliases (like "Chleba se šunkou") must NEVER match a single item!
        if (refs.length >= 2 && !hasAliases) {
          continue;
        }

        if (!isKcalCloseToTemplate(item.kcal, tpl.avg_kcal, qty)) {
          continue;
        }

        if (itemMatchesPhraseExact(itemHeadlineAscii, itemCanonAscii, phraseAscii)) {
          claimedIndices.add(idx);
          addCount(tpl.id, qty, 0);
          break;
        }
      }
    });
  }

  return result;
}

function detectSportSignatureFromText(text: string): string | null {
  const ascii = stripAscii(text);
  if (/\b(?:kol\w*|mtb|cyklist\w*|rotoped\w*)\b/.test(ascii)) return "kol";
  if (/\b(?:lezen\w*|boulder\w*|sten[aeu]\w*|skal\w*)\b/.test(ascii))
    return "lezen";
  if (/\b(?:posilov\w*|fitk\w*|silov\w*)\b/.test(ascii)) return "posilovn";
  if (/\b(?:plav\w*|bazen\w*)\b/.test(ascii)) return "bazen";
  if (/\b(?:chuz\w*|prochaz\w*|turist\w*)\b/.test(ascii)) return "chuz";
  if (/\b(?:beh\b|behan\w*|jogging\w*)\b/.test(ascii)) return "beh";
  return null;
}

function extractDurationMinutesFromText(
  text: string,
  fallbackMinutes: number
): number {
  const ascii = stripAscii(text);
  const hourMatch = ascii.match(/(\d+(?:[.,]\d+)?)\s*(?:hod\w*|h\b)/);
  if (hourMatch) {
    const h = Number(hourMatch[1].replace(",", "."));
    if (Number.isFinite(h) && h > 0 && h <= 12) {
      return Math.round(h * 60);
    }
  }
  const minMatch = ascii.match(/(\d+)\s*(?:min\w*|m\b)/);
  if (minMatch) {
    const m = Number(minMatch[1]);
    if (Number.isFinite(m) && m > 0 && m <= 600) {
      return m;
    }
  }
  return fallbackMinutes;
}

function detectIntensityFromText(text: string): ActivityIntensity | null {
  const ascii = stripAscii(text);
  if (ascii.includes("lehka intenzita")) return "light";
  if (ascii.includes("ostra intenzita")) return "high";
  if (ascii.includes("stredni intenzita")) return "medium";
  return null;
}

/**
 * Inspects standalone activity entries on the current day for a specific `ActivityTemplateRow`
 * so QuickCheckBar can pre-fill today's logged duration/intensity and offer in-place update
 * instead of accidentally stacking duplicate entries (e.g. 60m + 60m = 120m).
 */
export function findDaySportExistingState(
  sport: ActivityTemplateRow,
  entries: LogEntryWithItems[]
): DaySportExistingState {
  let entryCount = 0;
  let totalMinutes = 0;
  let latestIntensity: ActivityIntensity | null = null;

  for (const entry of entries) {
    if (entry.status === "error" || entry.entry_type !== "activity") continue;
    if (entry.activity_template_id !== sport.id) continue;

    entryCount++;
    const actItems = entry.entry_items.filter((i) => i.item_kind === "activity");
    const mins =
      actItems.length > 0
        ? actItems.reduce(
            (s, i) => s + (i.duration_minutes ?? sport.default_minutes),
            0
          )
        : extractDurationMinutesFromText(entry.raw_text, sport.default_minutes);
    totalMinutes += mins;

    if (latestIntensity === null) {
      latestIntensity = detectIntensityFromText(
        entry.summary_title || entry.raw_text
      );
    }
  }

  return {
    hasStandaloneEntry: entryCount > 0,
    entryCount,
    totalMinutes,
    latestIntensity,
  };
}

/**
 * Computes accurate per-day logged minutes for every quick activity template across
 * quick-logged sports, mixed text entries, multi-sport entries, and pending entries.
 */
export function computeActivityTemplateDayMinutes(
  activityTemplates: ActivityTemplateRow[],
  entries: LogEntryWithItems[]
): Map<number, number> {
  const map = new Map<number, number>();
  const activeSports = activityTemplates.filter((a) => !a.is_hidden);
  if (activeSports.length === 0 || entries.length === 0) {
    return map;
  }

  const sportById = new Map<number, ActivityTemplateRow>();
  const sportBySig = new Map<string, ActivityTemplateRow>();
  for (const act of activeSports) {
    sportById.set(act.id, act);
    sportBySig.set(act.normalized_signature, act);
  }

  const addMins = (id: number, mins: number) => {
    if (mins <= 0) return;
    map.set(id, (map.get(id) ?? 0) + mins);
  };

  for (const entry of entries) {
    if (entry.status === "error") continue;

    const actItems = entry.entry_items.filter((i) => i.item_kind === "activity");

    if (actItems.length > 0) {
      let matchedAnyItem = false;
      for (const item of actItems) {
        const sig =
          detectSportSignatureFromText(
            `${item.canonical_name} ${item.item_name}`
          ) ?? null;
        const matchedSport =
          (entry.activity_template_id != null
            ? sportById.get(entry.activity_template_id)
            : undefined) ?? (sig ? sportBySig.get(sig) : undefined);
        if (matchedSport) {
          matchedAnyItem = true;
          addMins(
            matchedSport.id,
            item.duration_minutes ?? matchedSport.default_minutes
          );
        }
      }
      if (matchedAnyItem) continue;
    }

    if (entry.activity_template_id != null) {
      const directSport = sportById.get(entry.activity_template_id);
      if (directSport) {
        addMins(
          directSport.id,
          extractDurationMinutesFromText(
            entry.raw_text,
            directSport.default_minutes
          )
        );
        continue;
      }
    }

    // Pending / processing text entry containing a sport (e.g. "60 min lezení")
    if (entry.status === "pending" || entry.status === "processing") {
      const sig = detectSportSignatureFromText(entry.raw_text);
      if (sig) {
        const matchedSport = sportBySig.get(sig);
        if (matchedSport) {
          addMins(
            matchedSport.id,
            extractDurationMinutesFromText(
              entry.raw_text,
              matchedSport.default_minutes
            )
          );
        }
      }
    }
  }

  return map;
}
