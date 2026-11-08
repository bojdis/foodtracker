import type {
  ActivityTemplateRow,
  EntryItemRow,
  LogEntryWithItems,
  MealTemplateRow,
} from "./types";

export interface MealTemplateDayCount {
  /** Total portions detected across all entries on the selected day (quick-tap + text). */
  totalCount: number;
  /** Number of standalone entries directly removable by the quick `-` button. */
  removableCount: number;
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

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const ascii = stripAscii(stripParenthetical(name));
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
    if (a.length >= 3 && !seen.has(a)) {
      seen.add(a);
      clean.push(a);
    }
  }
  return clean;
}

/**
 * Checks if a single food item headline/canonical name represents the given phrase,
 * guarding against false positives like "Vietnamská káva" matching "kafe".
 */
function itemMatchesPhrase(
  itemHeadlineAscii: string,
  itemCanonAscii: string,
  phraseAscii: string
): boolean {
  if (
    itemHeadlineAscii === phraseAscii ||
    itemCanonAscii === phraseAscii
  ) {
    return true;
  }

  // Guard coffee styles that are NOT Radek's "Kafe (ice latté)"
  const DISQUALIFYING_COFFEE_MODIFIERS =
    /\b(?:vietnam\w*|salk\w*|tureck\w*|turk\w*| Alzir\w*|irsk\w*)\b/i;
  if (
    (phraseAscii === "kafe" ||
      phraseAscii.includes("latte") ||
      phraseAscii.includes("ledov")) &&
    (DISQUALIFYING_COFFEE_MODIFIERS.test(itemHeadlineAscii) ||
      DISQUALIFYING_COFFEE_MODIFIERS.test(itemCanonAscii))
  ) {
    return false;
  }

  const wordBoundaryRe = new RegExp(
    `(?:^|\\s)${escapeRegExp(phraseAscii)}(?:$|\\s)`
  );

  // Strip leading multiplier ("2x toast" -> "toast") before checking headline
  const strippedHeadline = itemHeadlineAscii.replace(
    /^\d+(?:[.,]\d+)?\s*(?:x|×)?\s+/,
    ""
  );

  if (
    strippedHeadline === phraseAscii ||
    strippedHeadline.startsWith(`${phraseAscii} `) ||
    itemCanonAscii.startsWith(`${phraseAscii} `)
  ) {
    return true;
  }

  // Multi-word aliases (e.g. "ice latte", "ledova kava", "protein + inulin", "mensi musli")
  // AND standalone coffee/latte keywords (already guarded by DISQUALIFYING_COFFEE_MODIFIERS + kcal floor)
  const allowAnywhereOnWordBoundary =
    phraseAscii.includes(" ") ||
    phraseAscii === "latte" ||
    phraseAscii === "kafe";

  if (allowAnywhereOnWordBoundary && wordBoundaryRe.test(strippedHeadline)) {
    return true;
  }
  if (allowAnywhereOnWordBoundary && wordBoundaryRe.test(itemCanonAscii)) {
    return true;
  }

  return false;
}

function ingredientMatchesItem(
  refCanonicalAscii: string,
  foodItem: EntryItemRow
): boolean {
  const itemCanon = stripAscii(stripParenthetical(foodItem.canonical_name));
  const itemName = stripAscii(stripParenthetical(foodItem.item_name));

  if (itemCanon === refCanonicalAscii || itemName === refCanonicalAscii) {
    return true;
  }
  if (
    itemCanon.includes(refCanonicalAscii) ||
    refCanonicalAscii.includes(itemCanon)
  ) {
    return itemCanon.length >= 4 && refCanonicalAscii.length >= 4;
  }
  return false;
}

/**
 * Computes accurate per-day counts for every pinned/active meal template across:
 * 1. One-tap `quick_check` entries (`entry.meal_template_id === tpl.id`)
 * 2. Standalone text entries (`"kafe"`, `"2× toast"`, `"protein"`)
 * 3. Multi-item / full-day text entries (`"toast a kafe"`, `"omeleta... Ice latte 150 ml..."`)
 * 4. Pending / processing entries immediately after pressing Enter (`0 ms` feedback)
 */
export function computeMealTemplateDayCounts(
  templates: MealTemplateRow[],
  entries: LogEntryWithItems[]
): Map<number, MealTemplateDayCount> {
  const result = new Map<number, MealTemplateDayCount>();
  // IMPORTANT: Only count pinned quick-check templates (`is_quick_check && !is_hidden`).
  // Unpinned candidate rows (`is_quick_check === false`) created from multi-meal diary entries
  // must NEVER claim `entry.meal_template_id` or `claimedIndices` and block quick-check pills!
  const activeTemplates = templates.filter(
    (t) => t.is_quick_check && !t.is_hidden
  );
  if (activeTemplates.length === 0 || entries.length === 0) {
    return result;
  }

  const templateById = new Map<number, MealTemplateRow>();
  const templateRefsById = new Map<number, ParsedTemplateItemRef[]>();

  // Phrase table sorted longest-first so "menší porce müsli" / "menší müsli" claims items before "müsli"
  const phraseEntries: Array<{ phraseAscii: string; tpl: MealTemplateRow }> = [];

  for (const tpl of activeTemplates) {
    templateById.set(tpl.id, tpl);
    templateRefsById.set(tpl.id, extractTemplateItemRefs(tpl));
    result.set(tpl.id, { totalCount: 0, removableCount: 0 });

    for (const phraseAscii of buildTemplatePhrases(tpl)) {
      phraseEntries.push({ phraseAscii, tpl });
    }
  }

  phraseEntries.sort((a, b) => b.phraseAscii.length - a.phraseAscii.length);

  // Multi-ingredient templates sorted by ingredient count DESC so supersets (Müsli: 3 items)
  // claim shared ingredients before subsets (Kakao: 2 items).
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

    // 1. Direct FK match when entry represents that specific template
    if (entry.meal_template_id != null) {
      const directTpl = templateById.get(entry.meal_template_id);
      if (directTpl) {
        const expectedItemsCount =
          templateRefsById.get(directTpl.id)?.length ?? 1;
        const foodItemsCount = entry.entry_items.filter(
          (i) => i.item_kind === "food"
        ).length;
        const isStandaloneTemplateEntry =
          entry.entry_type === "quick_check" ||
          foodItemsCount <= expectedItemsCount + 1;

        if (isStandaloneTemplateEntry) {
          const qty =
            entry.entry_type === "quick_check"
              ? 1
              : extractPortionCountPrefix(
                  entry.summary_title || entry.raw_text
                );
          addCount(directTpl.id, qty, 1);
          continue;
        }
      }
    }

    const foodItems = entry.entry_items.filter((i) => i.item_kind === "food");

    // 2. Pending / processing entry (or entry without items yet): parse raw_text clauses immediately!
    if (
      entry.status === "pending" ||
      entry.status === "processing" ||
      foodItems.length === 0
    ) {
      if (entry.entry_type === "activity") continue;

      const asciiRaw = stripAscii(entry.raw_text).replace(
        /\b(protein(?:\s+shake)?|shake)\s*(?:\+|s|se|a|plus)\s*(?:10\s*g\s*)?(inulin\w*)\b/g,
        "$1_WITH_$2"
      );

      const clauses = asciiRaw
        .split(/(?:,|;|\.|!|\+|\n|\s+(?:a|i|plus)\s+)/)
        .map((c) => c.replace(/_WITH_/g, " + ").replace(/\s+/g, " ").trim())
        .filter(Boolean);

      for (const clause of clauses) {
        // Ignore parenthetical explanation fragments such as "(80ml salko plus kafe)"
        if (/\b(?:vietnam\w*|salk\w*)\b/.test(clause)) continue;

        const qty = extractPortionCountPrefix(clause);
        const strippedClause = clause
          .replace(/^\d+(?:[.,]\d+)?\s*(?:x|×)?\s+/, "")
          .replace(/^(?:jeden|jedna|jedno|jednu|dva|dve|dvojit\w*|tri|ctyri)\s+/, "")
          .trim();

        for (const { phraseAscii, tpl } of phraseEntries) {
          if (
            strippedClause === phraseAscii ||
            strippedClause.startsWith(`${phraseAscii} `) ||
            (phraseAscii.includes(" ") && strippedClause.includes(phraseAscii))
          ) {
            addCount(tpl.id, qty, 0);
            break;
          }
        }
      }
      continue;
    }

    // 3. Completed entry (`status === "done"`) with `foodItems` (e.g. composite day log or "toast a kafe")
    const claimedIndices = new Set<number>();

    // Pass 3A: Multi-ingredient subset match FIRST (catches expanded presets like "toast a kafe"
    // or "menší müsli" so component ingredients like "Granko" aren't prematurely claimed as standalone "Kakao")
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
              !claimedIndices.has(idx) &&
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

        // Disambiguate templates that share identical ingredients in different portions
        // (e.g. "Müsli" 251 kcal vs "Menší porce müsli" 160 kcal):
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

        for (const idx of candidateIndices) {
          claimedIndices.add(idx);
        }
        const ratio =
          targetTpl.avg_kcal > 40 ? matchedKcal / targetTpl.avg_kcal : 1;
        const mult = ratio >= 1.65 && ratio <= 10 ? Math.round(ratio) : 1;
        addCount(targetTpl.id, mult, 0);
      }
    }

    // Pass 3B: Single-item headline/canonical match on remaining unclaimed items
    // (catches AI items kept as 1 row like "Ice latte (150 ml mléka, 2 lžičky cukru)" -> Kafe)
    foodItems.forEach((item, idx) => {
      if (claimedIndices.has(idx)) return;
      const itemHeadlineAscii = stripAscii(stripParenthetical(item.item_name));
      const itemCanonAscii = stripAscii(stripParenthetical(item.canonical_name));

      for (const { phraseAscii, tpl } of phraseEntries) {
        if (tpl.avg_kcal > 0 && item.kcal > 0 && item.kcal < tpl.avg_kcal * 0.45) {
          continue;
        }
        if (itemMatchesPhrase(itemHeadlineAscii, itemCanonAscii, phraseAscii)) {
          claimedIndices.add(idx);
          const qty = extractPortionCountPrefix(item.item_name);
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
          (sig ? sportBySig.get(sig) : undefined) ??
          (entry.activity_template_id != null
            ? sportById.get(entry.activity_template_id)
            : undefined);
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
