import { GoogleGenAI } from "@google/genai";
import { calculateActivityBurnedKcal } from "@/lib/calculations";
import {
  buildPersonalPresetsSystemSection,
  tryResolvePersonalPresetEntry,
} from "@/lib/presets";
import {
  ParsedEntryResultSchema,
  type ParsedEntryResult,
  type ParsedItem,
  type TimeSlot,
} from "@/lib/types";

const PARSER_MODEL = "gemini-3.5-flash-lite";
const GEMINI_TIMEOUT_MS = 35_000;

export const FALLBACK_AI_NOTE =
  "Odhadnuto lokálním záložním parserem (pro plný AI rozbor doplň GEMINI_API_KEY do .env.local)";

export const INVALID_GEMINI_KEY_NOTE =
  "V .env.local je neplatný formát GEMINI_API_KEY (očekáván klíč AQ.… nebo AIza… z Google AI Studia) — prozatím odhadnuto lokálním parserem.";

export type GeminiKeyStatus = "valid" | "missing" | "invalid_format";

const UUID_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NON_GEMINI_TOKEN_RE = /^(?:eyJ|sb_publishable_|sb_secret_|sbp_)/;
const PLACEHOLDER_KEY_RE = /^(?:your_|vloz|sem_|xxx|placeholder)/i;

export function getGeminiKeyStatus(
  rawKey: string | undefined = process.env.GEMINI_API_KEY
): GeminiKeyStatus {
  const trimmed = rawKey?.trim() ?? "";
  if (!trimmed) {
    return "missing";
  }
  if (
    trimmed.length < 25 ||
    /\s/.test(trimmed) ||
    UUID_KEY_RE.test(trimmed) ||
    NON_GEMINI_TOKEN_RE.test(trimmed) ||
    PLACEHOLDER_KEY_RE.test(trimmed)
  ) {
    return "invalid_format";
  }
  return "valid";
}

function buildGeminiFallbackNoteFromError(err: unknown): string {
  const status =
    typeof (err as { statusCode?: unknown })?.statusCode === "number"
      ? ((err as { statusCode: number }).statusCode)
      : null;
  const bodyStr =
    typeof (err as { body?: unknown })?.body === "string"
      ? (err as { body: string }).body
      : "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const combined = `${status ?? ""} ${msg} ${bodyStr}`;

  if (/GEMINI_TIMEOUT/.test(combined)) {
    return "Rozbor v Gemini API trval déle než 35 s — záznam byl okamžitě spočítán lokálním parserem.";
  }
  if (
    /API_KEY_INVALID|API key not valid/i.test(combined) ||
    status === 400 ||
    status === 401
  ) {
    return "Gemini API odmítlo klíč GEMINI_API_KEY (zkontroluj klíč v Google AI Studiu) — záznam byl prozatím odhadnut lokálním parserem.";
  }
  if (status === 403 || /PERMISSION_DENIED/i.test(combined)) {
    return "Gemini API klíč nemá oprávnění nebo projekt vyžaduje aktivní Billing v Google AI Studiu — prozatím odhadnuto lokálním parserem.";
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(combined)) {
    return "Byl dosažen limit volání Gemini Free Tieru — záznam byl prozatím odhadnut lokálním parserem.";
  }
  return "Gemini API bylo dočasně nedostupné — záznam byl prozatím odhadnut lokálním parserem.";
}

const TIME_SLOTS: readonly TimeSlot[] = [
  "morning",
  "lunch",
  "snack",
  "evening",
  "anytime",
];

const PARSED_ENTRY_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary_title: {
      type: "string",
      description:
        "Stručný český název celého záznamu (např. 'Míchaná vejce s chlebem a běh 30 min').",
    },
    canonical_meal_name: {
      type: "string",
      description:
        "Kanonický český název pouze pro jídlo/nápoje bez sportu a bez gramáží (např. 'Ovesná kaše s banánem', 'Rohlík se šunkou'). Pokud záznam obsahuje pouze aktivitu, vynech.",
    },
    typical_time_slot: {
      type: "string",
      enum: ["morning", "lunch", "snack", "evening", "anytime"],
      description:
        "Typická denní doba pro daný záznam: morning (snídaně), lunch (oběd), snack (svačina), evening (večeře), anytime (kdykoliv / čistý sport).",
    },
    ai_notes: {
      type: "string",
      description:
        "Krátká užitečná poznámka v češtině o použitých odhadech porcí nebo makrech (1 věta).",
    },
    items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          item_kind: {
            type: "string",
            enum: ["food", "activity"],
            description: "'food' pro jídlo a nápoje, 'activity' pro pohyb a sport.",
          },
          item_name: {
            type: "string",
            description:
              "Konkrétní český popis položky včetně množství/doby (např. '2× rohlík', 'Běh 30 min').",
          },
          canonical_name: {
            type: "string",
            description:
              "Standardizovaný kanonický název položky v 1. pádě jednotného/základního tvaru bez množství (např. 'Rohlík bílý', 'Šunka dušená', 'Běh').",
          },
          portion_grams: {
            type: "number",
            description:
              "Celková hmotnost/objem porce v gramech (nebo ml u nápojů) pouze pro item_kind='food'.",
          },
          duration_minutes: {
            type: "number",
            description:
              "Délka trvání v minutách pouze pro item_kind='activity'.",
          },
          met_value: {
            type: "number",
            description:
              "MET hodnota aktivity pouze pro item_kind='activity' (např. chůze 3.8, běh 9.0, posilovna 5.5, kolo 7.5, plavání 8.0, jóga 3.0).",
          },
          kcal: {
            type: "number",
            description: "Přijaté kalorie (kcal) pro 'food', 0 pro 'activity'.",
          },
          burned_kcal: {
            type: "number",
            description: "Spálené kalorie (kcal) pro 'activity', 0 pro 'food'.",
          },
          protein_g: {
            type: "number",
            description: "Bílkoviny v gramech (0 pro 'activity').",
          },
          carbs_g: {
            type: "number",
            description: "Sacharidy v gramech (0 pro 'activity').",
          },
          fat_g: {
            type: "number",
            description: "Tuky v gramech (0 pro 'activity').",
          },
          fiber_g: {
            type: "number",
            description: "Vláknina v gramech (0 pro 'activity').",
          },
          confidence: {
            type: "number",
            description: "Jistota odhadu v intervalu 0.0 až 1.0.",
          },
        },
        required: [
          "item_kind",
          "item_name",
          "canonical_name",
          "kcal",
          "burned_kcal",
          "protein_g",
          "carbs_g",
          "fat_g",
          "fiber_g",
          "confidence",
        ],
      },
    },
  },
  required: ["summary_title", "typical_time_slot", "items"],
};

function round1(val: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  if (!Number.isFinite(val)) return 0.8;
  return Math.round(Math.min(1, Math.max(0, val)) * 100) / 100;
}

export function computeActivityBurnedKcal(
  metValue: number,
  userWeightKg: number,
  durationMinutes: number,
  userBmrKcal?: number
): number {
  if (
    !Number.isFinite(metValue) ||
    !Number.isFinite(userWeightKg) ||
    !Number.isFinite(durationMinutes) ||
    metValue <= 0 ||
    userWeightKg <= 0 ||
    durationMinutes <= 0
  ) {
    return 0;
  }
  return calculateActivityBurnedKcal({
    metValue,
    weightKg: userWeightKg,
    durationMinutes,
    bmrKcal: userBmrKcal,
  });
}

function buildSystemInstruction(
  userWeightKg: number,
  fallbackTimeSlot: TimeSlot,
  userBmrKcal?: number
): string {
  const bmrInfo =
    userBmrKcal && userBmrKcal > 0
      ? ` Klidové BMR uživatele: ${Math.round(userBmrKcal)} kcal/den.`
      : "";
  return [
    "Jsi expertní český nutriční a sportovní analytik pro aplikaci FoodTracker.",
    "Tvým úkolem je rozložit přirozeně napsaný český záznam na jednotlivé položky jídla/pití ('food') a pohybových aktivit ('activity').",
    `Aktuální hmotnost uživatele: ${userWeightKg} kg.${bmrInfo} Výchozí časový slot: ${fallbackTimeSlot}.`,
    "",
    buildPersonalPresetsSystemSection(),
    "",
    "PRAVIDLA PRO OSTATNÍ ČESKÉ PORCE (pokud nejde o osobní zkratku výše a uživatel neuvede přesnou gramáž):",
    "- 1 rohlík = 43 g (~130 kcal), 1 houska/aiserka = 55 g",
    "- 1 krajíc chleba (kváskový/šumava) = 60 g (~145 kcal)",
    "- 1 vejce (velikost M) = 55 g (~82 kcal); máslo na smažení/namazání = 10 g (~74 kcal)",
    "- šunka 1 porce na pečivo = 50 g, tvrdý sýr 1 porce = 40 g",
    "- běžná příloha vařená rýže / vařené brambory / těstoviny = 200 g vařeného stavu",
    "- běžná porce syrového masa před úpravou / hotová porce masa = 150 g",
    "- česká klasika: svíčková se šesti = 450 g (~780 kcal; pozor: 'se šesti' znamená 6 knedlíků v 1 porci, nikoliv 6 porcí!), hovězí guláš s knedlíkem = 420 g (~690 kcal), smažený řízek = 160 g (~430 kcal), polévka/vývar = 300 ml",
    "- nápoje: pivo 0,5 l = 500 ml (~215 kcal), flat white / cappuccino = 200 ml (~95 kcal), espresso bez mléka = 30 ml (~5 kcal)",
    "- Makroživiny musí být konzistentní s energií: kcal ≈ 4*protein_g + 4*carbs_g + 9*fat_g + 2*fiber_g (s výjimkou alkoholu, kde etanol má 7 kcal/g).",
    "- DŮLEŽITÉ PRO JEDNOTKY kJ: Pokud uživatel v textu výslovně uvede energii v kilojoulech (kJ, např. 'tyčinka 950 kJ' nebo 'kolo 2h 3200 kJ'), PŘEPOČÍTEJ ji přesně do kcal vzorcem kcal = round(kJ / 4.184)!",
    "",
    "PRAVIDLA PRO AKTIVITY ('activity'):",
    "- Vždy vyplň duration_minutes (pokud není uvedeno, odhadni realisticky např. 30–45 min) a realistické met_value pro běžného rekreačního sportovce (započítej jízdu setrvačností z kopce u kola i pauzy mezi sériemi v posilovně — NEPOUŽÍVEJ laboratorní závodní MET!).",
    "- Realistické referenční MET hodnoty: chůze/procházka = 3.5, silový trénink/posilovna = 4.5, lezení/bouldering/stěna = 5.6, pohodové kolo/cyklostezka/rotoped = 5.2, horské kolo v terénu (rekreačně výjezdy + sjezdy) = 6.5 (pouze výslovně závodní/ostré tempo = 8.0), plavání/bazén rekreační = 6.5, běh rekreační = 8.5, jóga/strečink = 2.5.",
    "- DŮLEŽITÉ: Aplikace počítá ČISTÝ AKTIVNÍ VÝDEJ nad běžný klidový režim vzorcem (MET - 1.2) * (BMR / 24) * hodiny, aby se nezapočítával dvakrát klidový metabolismus. V ai_notes proto neuváděj hrubý součin MET * váha.",
    "- U aktivity nastav kcal=0, protein_g=0, carbs_g=0, fat_g=0, fiber_g=0.",
    "- U jídla nastav burned_kcal=0.",
    "- Pole canonical_meal_name vyplň pouze názvem samotného jídla (bez sportu a bez gramů), např. 'Míchaná vejce s chlebem' nebo 'Ovesná kaše s banánem'.",
    "",
    "PRAVIDLA PRO FOTKY ŠTÍTKŮ A OBALŮ POTRAVIN:",
    "- Pokud je přiložena fotka výživového štítku nebo obalu potraviny, vyčti z ní přesné nutriční hodnoty (energie v kJ/kcal, bílkoviny, sacharidy, tuky, vláknina).",
    "- POZOR NA 100 G vs. CELÁ PORCE/BALENÍ: Výrobci často uvádí hodnoty na 100 g i na celou porci/balení (např. 1 láhev = 330 ml / 400 kcal, sendvič = 185 g). Pokud uživatel v doplňujícím textu neuvede jinak (např. 'vypil jsem jen půlku'), VŽDY propočítej a ulož hodnoty pro CELÉ spotřebované balení/porci!",
    "- V canonical_name a item_name uveď přesný český název výrobku (např. 'Mana Drink', 'Krůtí sendvič').",
    "- V ai_notes stručně uveď, že hodnoty byly vyčteny z etikety výrobku.",
  ].join("\n");
}

function normalizeAgentResult(
  raw: Record<string, unknown>,
  userWeightKg: number,
  fallbackTimeSlot: TimeSlot,
  userBmrKcal?: number,
  rawText?: string
): ParsedEntryResult {
  const safeWeight = Number.isFinite(userWeightKg) && userWeightKg > 0 ? userWeightKg : 80;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const hasExplicitEnergyInText =
    typeof rawText === "string" && /\b\d+(?:[.,]\d+)?\s*(?:kj|kcal)\b/i.test(rawText);

  const normalizedItems: ParsedItem[] = rawItems.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const kind = item.item_kind === "activity" ? "activity" : "food";
    const itemName = String(item.item_name ?? "Položka").trim() || "Položka";
    const canonicalName =
      String(item.canonical_name ?? itemName).trim() || itemName;
    const confidence = round2(
      typeof item.confidence === "number" ? item.confidence : 0.85
    );

    if (kind === "activity") {
      const rawDuration = Number(item.duration_minutes);
      const durationMinutes =
        Number.isFinite(rawDuration) && rawDuration > 0
          ? Math.max(1, Math.round(rawDuration))
          : 30;
      const rawMet = Number(item.met_value);
      const metValue =
        Number.isFinite(rawMet) && rawMet > 0 ? round1(rawMet) : 4.5;
      const agentBurned = Math.round(Number(item.burned_kcal) || 0);
      const burnedKcal =
        hasExplicitEnergyInText && rawItems.length === 1 && agentBurned > 0
          ? agentBurned
          : computeActivityBurnedKcal(
              metValue,
              safeWeight,
              durationMinutes,
              userBmrKcal
            );

      return {
        item_kind: "activity",
        item_name: itemName,
        canonical_name: canonicalName,
        portion_grams: null,
        duration_minutes: durationMinutes,
        met_value: metValue,
        kcal: 0,
        burned_kcal: burnedKcal,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        confidence,
      };
    }

    const rawPortion = Number(item.portion_grams);
    const portionGrams =
      Number.isFinite(rawPortion) && rawPortion > 0
        ? Math.round(rawPortion)
        : null;

    return {
      item_kind: "food",
      item_name: itemName,
      canonical_name: canonicalName,
      portion_grams: portionGrams,
      duration_minutes: null,
      met_value: null,
      kcal: Math.max(0, Math.round(Number(item.kcal) || 0)),
      burned_kcal: 0,
      protein_g: round1(Number(item.protein_g) || 0),
      carbs_g: round1(Number(item.carbs_g) || 0),
      fat_g: round1(Number(item.fat_g) || 0),
      fiber_g: round1(Number(item.fiber_g) || 0),
      confidence,
    };
  });

  const rawSlot = String(raw.typical_time_slot ?? "");
  const typicalTimeSlot: TimeSlot =
    fallbackTimeSlot !== "anytime"
      ? fallbackTimeSlot
      : (TIME_SLOTS.find((s) => s === rawSlot) ?? "anytime");

  const hasFood = normalizedItems.some((i) => i.item_kind === "food");
  const rawCanonicalMeal =
    typeof raw.canonical_meal_name === "string"
      ? raw.canonical_meal_name.trim()
      : "";

  const resultCandidate = {
    summary_title:
      String(raw.summary_title ?? "").trim() ||
      normalizedItems.map((i) => i.item_name).slice(0, 3).join(", "),
    canonical_meal_name: hasFood
      ? rawCanonicalMeal ||
        normalizedItems
          .filter((i) => i.item_kind === "food")
          .map((i) => i.canonical_name)
          .join(" + ")
      : null,
    typical_time_slot: typicalTimeSlot,
    ai_notes:
      typeof raw.ai_notes === "string" && raw.ai_notes.trim().length > 0
        ? raw.ai_notes.trim()
        : null,
    items: normalizedItems,
  };

  return ParsedEntryResultSchema.parse(resultCandidate);
}

export async function parseEntryWithAgent(params: {
  rawText: string;
  imageBase64?: string;
  imageMimeType?: string;
  userWeightKg: number;
  userBmrKcal?: number;
  fallbackTimeSlot: TimeSlot;
}): Promise<ParsedEntryResult> {
  // 1. Exact deterministic match for Radek's personal meal shortcuts (0 latency, 100% label accuracy, 0 API tokens)
  if (!params.imageBase64) {
    const presetMatch = tryResolvePersonalPresetEntry(
      params.rawText,
      params.fallbackTimeSlot
    );
    if (presetMatch) {
      return presetMatch;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const keyStatus = getGeminiKeyStatus(apiKey);
  if (keyStatus === "missing" || !apiKey) {
    if (params.imageBase64) {
      throw new Error(
        "Pro analýzu fotek výživových štítků je vyžadován platný GEMINI_API_KEY a připojení k internetu."
      );
    }
    return parseEntryFallback(params);
  }
  if (keyStatus === "invalid_format") {
    if (params.imageBase64) {
      throw new Error(INVALID_GEMINI_KEY_NOTE);
    }
    return parseEntryFallback(params, INVALID_GEMINI_KEY_NOTE);
  }

  const safeWeight =
    Number.isFinite(params.userWeightKg) && params.userWeightKg > 0
      ? params.userWeightKg
      : 80;

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    const client = new GoogleGenAI({ apiKey });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("GEMINI_TIMEOUT"));
      }, GEMINI_TIMEOUT_MS);
    });

    const cleanBase64 = params.imageBase64
      ? params.imageBase64.replace(
          /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
          ""
        )
      : undefined;

    const inputPayload = cleanBase64
      ? [
          {
            type: "text" as const,
            text:
              params.rawText.trim() ||
              "Analyzuj tento výživový štítek nebo obal potraviny na fotce a rozpadni ho na položky, gramáže a makroživiny.",
          },
          {
            type: "image" as const,
            data: cleanBase64,
            mime_type: (params.imageMimeType || "image/jpeg") as "image/jpeg",
          },
        ]
      : params.rawText.trim();

    const interaction = await Promise.race([
      client.interactions.create({
        model: PARSER_MODEL,
        system_instruction: buildSystemInstruction(
          safeWeight,
          params.fallbackTimeSlot,
          params.userBmrKcal
        ),
        input: inputPayload,
        generation_config: {
          thinking_level: "minimal",
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: PARSED_ENTRY_JSON_SCHEMA,
        },
      }),
      timeoutPromise,
    ]);

    const interactionObj = interaction as { output_text?: string };
    const rawJson = interactionObj.output_text?.trim();
    if (!rawJson) {
      throw new Error("Gemini nevrátil žádný strukturovaný JSON výstup.");
    }

    const parsedObject = JSON.parse(rawJson) as Record<string, unknown>;
    return normalizeAgentResult(
      parsedObject,
      safeWeight,
      params.fallbackTimeSlot,
      params.userBmrKcal,
      params.rawText
    );
  } catch (err) {
    console.warn("Gemini API fallback triggered:", err);
    return parseEntryFallback(params, buildGeminiFallbackNoteFromError(err));
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

// ============================================================================
// Local Deterministic Czech Fallback Parser (when GEMINI_API_KEY is missing)
// ============================================================================

interface FoodDictEntry {
  patterns: RegExp[];
  canonicalName: string;
  defaultPortionGrams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  slot: TimeSlot;
}

interface ActivityDictEntry {
  patterns: RegExp[];
  canonicalName: string;
  defaultMinutes: number;
  metValue: number;
}

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Patterns operate on lowercase ASCII (diacritics stripped) while preserving string length 1:1
const CZECH_FOOD_DICTIONARY: FoodDictEntry[] = [
  {
    patterns: [/\b(?:mensi|mal[ae])\s+(?:porce\s+)?(?:musli|mysli)\b/g],
    canonicalName: "Menší porce müsli",
    defaultPortionGrams: 127,
    kcal: 161,
    proteinG: 7.4,
    carbsG: 19.3,
    fatG: 5.4,
    fiberG: 1.9,
    slot: "morning",
  },
  {
    patterns: [/\b(?:emco\s+)?(?:musli|mysli)\b/g],
    canonicalName: "Müsli",
    defaultPortionGrams: 193,
    kcal: 251,
    proteinG: 11.6,
    carbsG: 30.3,
    fatG: 8.4,
    fiberG: 3.0,
    slot: "morning",
  },
  {
    patterns: [/\b(?:zapekan\w*\s+)?(?:toast|toust|toasty|tousty)\b/g],
    canonicalName: "Toast",
    defaultPortionGrams: 120,
    kcal: 292,
    proteinG: 17.8,
    carbsG: 21.2,
    fatG: 14.3,
    fiberG: 3.0,
    slot: "evening",
  },
  {
    patterns: [
      /\bkafe\b|\bice\s+latte(?:\s+\d+(?:\.\d+)?\s*ml\s+mlek\w*)?\b|\bledov[ea]\s+kav\w*\b/g,
    ],
    canonicalName: "Kafe (ice latté)",
    defaultPortionGrams: 188,
    kcal: 101,
    proteinG: 5.0,
    carbsG: 15.1,
    fatG: 2.3,
    fiberG: 0.0,
    slot: "morning",
  },
  {
    patterns: [/\bvietnamsk\w*\s+kav\w*(?:\s*\([^)]*\))?/g],
    canonicalName: "Vietnamská káva se salkem",
    defaultPortionGrams: 180,
    kcal: 265,
    proteinG: 6.0,
    carbsG: 44.0,
    fatG: 7.0,
    fiberG: 0.0,
    slot: "snack",
  },
  {
    patterns: [/\bsalk\w*\b|\bkondenzovan\w*\s+mlek\w*\b/g],
    canonicalName: "Kondenzované slazené mléko (Salko)",
    defaultPortionGrams: 40,
    kcal: 130,
    proteinG: 3.2,
    carbsG: 22.0,
    fatG: 3.4,
    fiberG: 0.0,
    slot: "snack",
  },
  {
    patterns: [/\b(?:hork\w*\s+)+cokolad\w*\b/g],
    canonicalName: "Horká čokoláda",
    defaultPortionGrams: 150,
    kcal: 195,
    proteinG: 5.2,
    carbsG: 24.0,
    fatG: 8.5,
    fiberG: 1.8,
    slot: "snack",
  },
  {
    patterns: [/\bkakao\b|\bgranko\b/g],
    canonicalName: "Kakao",
    defaultPortionGrams: 215,
    kcal: 150,
    proteinG: 7.5,
    carbsG: 21.3,
    fatG: 3.5,
    fiberG: 1.0,
    slot: "morning",
  },
  {
    patterns: [/\binulin\w*\b/g],
    canonicalName: "Inulin",
    defaultPortionGrams: 10,
    kcal: 14,
    proteinG: 0.0,
    carbsG: 0.0,
    fatG: 0.0,
    fiberG: 10.0,
    slot: "snack",
  },
  {
    patterns: [/\bsvickov\w*(?:\s+na\s+smetan\w*)?(?:\s+se?\s+sesti)?\b/g],
    canonicalName: "Svíčková na smetaně s knedlíkem",
    defaultPortionGrams: 450,
    kcal: 780,
    proteinG: 34.0,
    carbsG: 82.0,
    fatG: 33.0,
    fiberG: 4.2,
    slot: "lunch",
  },
  {
    patterns: [/\b(?:kurec\w*\s+|veprov\w*\s+|smazen\w*\s+)?rizek\b|\brizky\b|\brizk\w*\b/g],
    canonicalName: "Smažený řízek",
    defaultPortionGrams: 160,
    kcal: 430,
    proteinG: 30.0,
    carbsG: 22.0,
    fatG: 24.5,
    fiberG: 1.2,
    slot: "lunch",
  },
  {
    patterns: [/\b(?:hovez\w*\s+|veprov\w*\s+)?gulas\w*\b/g],
    canonicalName: "Hovězí guláš s knedlíkem",
    defaultPortionGrams: 420,
    kcal: 690,
    proteinG: 33.0,
    carbsG: 74.0,
    fatG: 27.0,
    fiberG: 3.8,
    slot: "lunch",
  },
  {
    patterns: [/\bovesn\w*\s+kas\w*\b|\bovesn\w*\s+vlock\w*\b/g],
    canonicalName: "Ovesná kaše",
    defaultPortionGrams: 250,
    kcal: 285,
    proteinG: 10.5,
    carbsG: 43.0,
    fatG: 6.5,
    fiberG: 5.8,
    slot: "morning",
  },
  {
    patterns: [/\bflat\s*white\b|\bcappuccin\w*\b|\bcafe\s+latte\b|\blatte\b/g],
    canonicalName: "Flat White / Cappuccino",
    defaultPortionGrams: 200,
    kcal: 95,
    proteinG: 5.0,
    carbsG: 7.5,
    fatG: 5.0,
    fiberG: 0,
    slot: "morning",
  },
  {
    patterns: [
      /\b(?:asijsk\w*\s+|kurec\w*\s+|veprov\w*\s+|zeleninov\w*\s+|houbov\w*\s+)?rizot\w*(?:\s+s\s+kurec\w*(?:\s+mas\w*)?)?\b/g,
    ],
    canonicalName: "Rizoto s masem a zeleninou",
    defaultPortionGrams: 350,
    kcal: 520,
    proteinG: 28.0,
    carbsG: 68.0,
    fatG: 14.0,
    fiberG: 3.5,
    slot: "lunch",
  },
  {
    patterns: [
      /\b(?:hrachov\w*|cockov\w*|fazolov\w*|gulasov\w*|bramborack\w*|kulajd\w*|zelnack\w*)(?:\s+polevk\w*)?\b/g,
    ],
    canonicalName: "Hustá luštěninová / sytá polévka",
    defaultPortionGrams: 330,
    kcal: 240,
    proteinG: 13.0,
    carbsG: 30.0,
    fatG: 7.0,
    fiberG: 6.0,
    slot: "lunch",
  },
  {
    patterns: [/\b(?:kurec\w*\s+|hovez\w*\s+|zeleninov\w*\s+)?(?:polevk\w*|vyvar\w*)\b/g],
    canonicalName: "Polévka / vývar",
    defaultPortionGrams: 300,
    kcal: 115,
    proteinG: 7.5,
    carbsG: 11.0,
    fatG: 4.2,
    fiberG: 1.5,
    slot: "lunch",
  },
  {
    patterns: [
      /\b(?:vajecn\w*\s+)?omelet\w*(?:\s+ze?\s+\d+\s*(?:vajec|vajick\w*|vejc\w*))?\b/g,
    ],
    canonicalName: "Vaječná omeleta",
    defaultPortionGrams: 170,
    kcal: 270,
    proteinG: 20.5,
    carbsG: 1.8,
    fatG: 20.0,
    fiberG: 0,
    slot: "morning",
  },
  {
    patterns: [
      /\b(?:michan\w*\s+|varen\w*\s+|sazen\w*\s+)?(?:vajick\w*|vejc\w*|vajec|vejce)\b|\bvolsk\w*\s+ok\w*\b/g,
    ],
    canonicalName: "Vejce",
    defaultPortionGrams: 55,
    kcal: 82,
    proteinG: 6.9,
    carbsG: 0.6,
    fatG: 5.8,
    fiberG: 0,
    slot: "morning",
  },
  {
    patterns: [/\b(?:krajic\w*\s+)?(?:kvaskov\w*\s+|žitn\w*\s+|zitn\w*\s+)?chleb\w*\b/g],
    canonicalName: "Chléb",
    defaultPortionGrams: 60,
    kcal: 145,
    proteinG: 4.8,
    carbsG: 28.0,
    fatG: 1.1,
    fiberG: 2.8,
    slot: "morning",
  },
  {
    patterns: [/\brohlik\w*\b/g],
    canonicalName: "Rohlík bílý",
    defaultPortionGrams: 43,
    kcal: 130,
    proteinG: 4.0,
    carbsG: 25.0,
    fatG: 1.3,
    fiberG: 1.2,
    slot: "morning",
  },
  {
    patterns: [/\bsunk\w*\b/g],
    canonicalName: "Šunka dušená",
    defaultPortionGrams: 50,
    kcal: 52,
    proteinG: 9.5,
    carbsG: 0.5,
    fatG: 1.2,
    fiberG: 0,
    slot: "morning",
  },
  {
    patterns: [/\bsyr\w*\b|\beidam\w*\b|\bgoud\w*\b|\bmozzarell\w*\b/g],
    canonicalName: "Sýr tvrdý",
    defaultPortionGrams: 40,
    kcal: 132,
    proteinG: 10.8,
    carbsG: 0.6,
    fatG: 9.6,
    fiberG: 0,
    slot: "morning",
  },
  {
    patterns: [/\bmasl\w*\b/g],
    canonicalName: "Máslo",
    defaultPortionGrams: 10,
    kcal: 74,
    proteinG: 0.1,
    carbsG: 0.1,
    fatG: 8.2,
    fiberG: 0,
    slot: "morning",
  },
  {
    patterns: [/\bbanan\w*\b/g],
    canonicalName: "Banán",
    defaultPortionGrams: 120,
    kcal: 108,
    proteinG: 1.3,
    carbsG: 25.0,
    fatG: 0.4,
    fiberG: 3.0,
    slot: "snack",
  },
  {
    patterns: [/\bjablk\w*\b/g],
    canonicalName: "Jablko",
    defaultPortionGrams: 150,
    kcal: 78,
    proteinG: 0.5,
    carbsG: 19.5,
    fatG: 0.3,
    fiberG: 3.6,
    slot: "snack",
  },
  {
    patterns: [/\b(?:reck\w*\s+|bil\w*\s+|proteinov\w*\s+)?jogurt\w*\b/g],
    canonicalName: "Jogurt bílý",
    defaultPortionGrams: 150,
    kcal: 98,
    proteinG: 6.8,
    carbsG: 6.5,
    fatG: 4.8,
    fiberG: 0,
    slot: "snack",
  },
  {
    patterns: [/\btvaroh\w*\b/g],
    canonicalName: "Tvaroh polotučný",
    defaultPortionGrams: 150,
    kcal: 158,
    proteinG: 18.0,
    carbsG: 6.0,
    fatG: 6.8,
    fiberG: 0,
    slot: "snack",
  },
  {
    patterns: [
      /\b(?:protein\w*(?:\s+napoj\w*|\s+shake)?|shake|whey)(?:\s*(?:\+|s|se|a|plus)\s*(?:10\s*g\s*)?inulin\w*)?\b/g,
    ],
    canonicalName: "Protein + inulin",
    defaultPortionGrams: 258,
    kcal: 277,
    proteinG: 46.0,
    carbsG: 10.4,
    fatG: 3.8,
    fiberG: 10.0,
    slot: "snack",
  },
  {
    patterns: [/\bkurec\w*(?:\s+prs\w*|\s+mas\w*|\s+stehn\w*)?\b/g],
    canonicalName: "Kuřecí prsa",
    defaultPortionGrams: 150,
    kcal: 220,
    proteinG: 43.5,
    carbsG: 0,
    fatG: 4.5,
    fiberG: 0,
    slot: "lunch",
  },
  {
    patterns: [/\b(?:varen\w*\s+|basmati\s+|jasminov\w*\s+)?ryz\w*\b/g],
    canonicalName: "Vařená rýže",
    defaultPortionGrams: 200,
    kcal: 260,
    proteinG: 5.4,
    carbsG: 56.0,
    fatG: 0.6,
    fiberG: 1.0,
    slot: "lunch",
  },
  {
    patterns: [/\b(?:varen\w*\s+|pecen\w*\s+)?brambor\w*\b/g],
    canonicalName: "Vařené brambory",
    defaultPortionGrams: 200,
    kcal: 154,
    proteinG: 4.0,
    carbsG: 34.0,
    fatG: 0.2,
    fiberG: 3.2,
    slot: "lunch",
  },
  {
    patterns: [/\btestovin\w*\b|\bspaget\w*\b|\bpenne\b/g],
    canonicalName: "Vařené těstoviny",
    defaultPortionGrams: 200,
    kcal: 310,
    proteinG: 11.0,
    carbsG: 61.0,
    fatG: 1.8,
    fiberG: 3.4,
    slot: "lunch",
  },
  {
    patterns: [/\bkav\w*\b|\bespress\w*\b/g],
    canonicalName: "Káva",
    defaultPortionGrams: 150,
    kcal: 15,
    proteinG: 0.5,
    carbsG: 1.5,
    fatG: 0.5,
    fiberG: 0,
    slot: "morning",
  },
  {
    patterns: [/\bpiv\w*\b|\bplzen\b/g],
    canonicalName: "Pivo světlý ležák",
    defaultPortionGrams: 500,
    kcal: 215,
    proteinG: 2.5,
    carbsG: 18.0,
    fatG: 0,
    fiberG: 0,
    slot: "evening",
  },
  {
    patterns: [/\b(?:polotucn\w*\s+|plnotucn\w*\s+)?mlek\w*\b/g],
    canonicalName: "Mléko polotučné",
    defaultPortionGrams: 200,
    kcal: 94,
    proteinG: 6.6,
    carbsG: 9.6,
    fatG: 3.0,
    fiberG: 0,
    slot: "morning",
  },
  {
    patterns: [/\bcukr\w*\b/g],
    canonicalName: "Cukr",
    defaultPortionGrams: 5,
    kcal: 20,
    proteinG: 0,
    carbsG: 5.0,
    fatG: 0,
    fiberG: 0,
    slot: "morning",
  },
];

const CZECH_ACTIVITY_DICTIONARY: ActivityDictEntry[] = [
  {
    patterns: [/\bbeh\b|\bbehan\w*\b|\bbezel\w*\b|\bjogging\w*\b/g],
    canonicalName: "Běh",
    defaultMinutes: 30,
    metValue: 8.5,
  },
  {
    patterns: [/\bchuz\w*\b|\bprochazk\w*\b|\bturistik\w*\b/g],
    canonicalName: "Chůze",
    defaultMinutes: 45,
    metValue: 3.5,
  },
  {
    patterns: [/\bposilovn\w*\b|\bfitk\w*\b|\bposilovan\w*\b|\bsilov\w*\s+trenink\w*\b/g],
    canonicalName: "Posilovna",
    defaultMinutes: 60,
    metValue: 4.5,
  },
  {
    patterns: [/\blezen\w*\b|\bboulder\w*\b|\blezeck\w*\s+sten\w*\b|\bsten[aeu]\b/g],
    canonicalName: "Lezení",
    defaultMinutes: 75,
    metValue: 5.6,
  },
  {
    patterns: [/\bhorsk\w*\s+kol\w*\b|\bmtb\b/g],
    canonicalName: "Horské kolo",
    defaultMinutes: 60,
    metValue: 6.5,
  },
  {
    patterns: [/\b(?:jizd\w*\s+na\s+)?kol[eo]\b|\bcyklistik\w*\b|\brotoped\w*\b/g],
    canonicalName: "Jízda na kole",
    defaultMinutes: 45,
    metValue: 5.2,
  },
  {
    patterns: [/\bplavan\w*\b|\bbazen\w*\b/g],
    canonicalName: "Plavání",
    defaultMinutes: 45,
    metValue: 6.5,
  },
  {
    patterns: [/\bjog[aeu]\b|\bjogou\b|\bpilates\b|\bstrecink\w*\b|\bprotahovan\w*\b/g],
    canonicalName: "Jóga",
    defaultMinutes: 45,
    metValue: 2.5,
  },
  {
    patterns: [/\bcvicen\w*\b|\btrenink\w*\b|\bkardi\w*\b|\bhiit\b/g],
    canonicalName: "Cvičení",
    defaultMinutes: 30,
    metValue: 5.0,
  },
];

const WORD_QUANTITIES: Record<string, number> = {
  pul: 0.5,
  jeden: 1,
  jedna: 1,
  jedno: 1,
  jednu: 1,
  dva: 2,
  dve: 2,
  tri: 3,
  ctyri: 4,
  pet: 5,
};

interface SpanMatch {
  start: number;
  end: number;
  kind: "food" | "activity";
  food?: FoodDictEntry;
  activity?: ActivityDictEntry;
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function extractDurationMinutes(windowAscii: string, defaultMinutes: number): number {
  const hourMinMatch = windowAscii.match(
    /(\d+(?:\.\d+)?)\s*(?:hodin\w*|hod\b|h\b)\s*(?:a\s*)?(\d+)\s*(?:minut\w*|min\b|m\b)/
  );
  if (hourMinMatch) {
    return Math.max(
      1,
      Math.round(Number(hourMinMatch[1]) * 60 + Number(hourMinMatch[2]))
    );
  }

  const hourMatch = windowAscii.match(/(\d+(?:\.\d+)?)\s*(?:hodin\w*|hod\b|h\b)/);
  if (hourMatch) {
    return Math.max(1, Math.round(Number(hourMatch[1]) * 60));
  }

  if (/\bpul\s+hodin\w*\b/.test(windowAscii)) {
    return 30;
  }
  if (/\bhodin[auy]\b/.test(windowAscii)) {
    return 60;
  }

  const minMatch = windowAscii.match(/(\d+(?:\.\d+)?)\s*(?:minut\w*|min\b|m\b)/);
  if (minMatch) {
    return Math.max(1, Math.round(Number(minMatch[1])));
  }

  return defaultMinutes;
}

function extractFoodAmount(
  windowAscii: string,
  defaultPortionGrams: number
): { portionGrams: number; multiplier: number; displayPrefix: string | null } {
  const omeletEggMatch = windowAscii.match(
    /\bze?\s+(\d+|jedn\w*|dv\w*|tri|ctyr\w*|pet)\s*(?:vajec|vajick\w*|vejc\w*)\b/
  );
  if (omeletEggMatch) {
    const rawCount = omeletEggMatch[1];
    const eggCount =
      WORD_QUANTITIES[rawCount] ?? (Number.isFinite(Number(rawCount)) ? Number(rawCount) : 0);
    if (eggCount > 0 && eggCount <= 12) {
      const portionGrams = Math.round(eggCount * 55 + 10);
      const multiplier = (eggCount * 82 + 25) / 270;
      return {
        portionGrams,
        multiplier,
        displayPrefix: null,
      };
    }
  }

  const cleaned = windowAscii.replace(/\bse?\s+sesti\b/g, " ");

  const gramsMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:gram\w*|gr\b|g\b|ml\b)/);
  if (gramsMatch) {
    const grams = Math.max(1, Math.round(Number(gramsMatch[1])));
    return {
      portionGrams: grams,
      multiplier: grams / defaultPortionGrams,
      displayPrefix: null,
    };
  }

  const litersMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:litr\w*|l\b)/);
  if (litersMatch) {
    const ml = Math.max(1, Math.round(Number(litersMatch[1]) * 1000));
    return {
      portionGrams: ml,
      multiplier: ml / defaultPortionGrams,
      displayPrefix: null,
    };
  }

  const countMatch = cleaned.match(
    /(?:^|\s)(\d+(?:\.\d+)?)\s*(?:x|ks\b|kus\w*|krajic\w*|platk\w*|platek\b|porc\w*|talir\w*|lzick\w*|lzic\w*)?(?=\s|$)/
  );
  if (countMatch) {
    const qty = Number(countMatch[1]);
    if (Number.isFinite(qty) && qty > 0 && qty <= 20) {
      return {
        portionGrams: Math.max(1, Math.round(defaultPortionGrams * qty)),
        multiplier: qty,
        displayPrefix: qty !== 1 ? `${qty}×` : null,
      };
    }
  }

  for (const [word, qty] of Object.entries(WORD_QUANTITIES)) {
    const wordRegex = new RegExp(`\\b${word}\\b`);
    if (wordRegex.test(cleaned)) {
      return {
        portionGrams: Math.max(1, Math.round(defaultPortionGrams * qty)),
        multiplier: qty,
        displayPrefix: qty !== 1 ? `${qty}×` : null,
      };
    }
  }

  return {
    portionGrams: defaultPortionGrams,
    multiplier: 1,
    displayPrefix: null,
  };
}

function partitionMatchWindows(clauseAscii: string, matches: SpanMatch[]): string[] {
  if (matches.length === 0) return [];
  if (matches.length === 1) return [clauseAscii];

  const boundaries: number[] = [0];
  for (let i = 0; i < matches.length - 1; i++) {
    const leftEnd = matches[i].end;
    const rightStart = matches[i + 1].start;
    const between = clauseAscii.slice(leftEnd, rightStart);

    const prepMatch = between.match(/\s+(?:se|s|na|v|ve|do|k|ke|plus)\s+/);
    if (prepMatch && prepMatch.index !== undefined) {
      boundaries.push(leftEnd + prepMatch.index);
      continue;
    }

    const trailingQtyMatch = between.match(
      /^\s*\d+(?:\.\d+)?\s*(?:gram\w*|gr|g|ml|l|ks|kus\w*|min\w*|hod\w*|h|m)?\b/
    );
    if (trailingQtyMatch) {
      boundaries.push(leftEnd + trailingQtyMatch[0].length);
      continue;
    }

    boundaries.push(leftEnd);
  }
  boundaries.push(clauseAscii.length);

  return matches.map((_, idx) => clauseAscii.slice(boundaries[idx], boundaries[idx + 1]));
}

function splitClausesOutsideParens(input: string): string[] {
  // Temporarily mask separators inside (...) so parenthetical notes stay attached
  const masked = input.replace(/\([^)]*\)/g, (paren) =>
    paren
      .replace(/[,;+\n.]/g, " ")
      .replace(/\b(?:a|i|plus)\b/gi, " ")
  );

  const sepRe = /(?:\.\s+|,|;|\+|\n|\s+(?:a|i|plus)\s+)/gi;
  const clauses: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sepRe.exec(masked)) !== null) {
    const slice = input.slice(lastIndex, match.index).trim();
    if (slice.length > 0) {
      clauses.push(slice);
    }
    lastIndex = match.index + match[0].length;
  }

  const tail = input.slice(lastIndex).trim().replace(/\.$/, "");
  if (tail.length > 0) {
    clauses.push(tail);
  }
  return clauses;
}

export function parseEntryFallback(
  params: {
    rawText: string;
    userWeightKg: number;
    userBmrKcal?: number;
    fallbackTimeSlot: TimeSlot;
  },
  customAiNote: string = FALLBACK_AI_NOTE
): ParsedEntryResult {
  const presetMatch = tryResolvePersonalPresetEntry(
    params.rawText,
    params.fallbackTimeSlot
  );
  if (presetMatch) {
    return presetMatch;
  }

  const safeWeight =
    Number.isFinite(params.userWeightKg) && params.userWeightKg > 0
      ? params.userWeightKg
      : 80;

  const normalizedDecimalText = params.rawText
    .trim()
    .replace(/(\d),(\d)/g, "$1.$2");

  const clauses = splitClausesOutsideParens(normalizedDecimalText);

  const parsedItems: ParsedItem[] = [];
  const inferredSlots: TimeSlot[] = [];

  for (const clause of clauses) {
    const clauseAscii = stripDiacritics(clause).toLowerCase();
    const candidateMatches: SpanMatch[] = [];

    for (const act of CZECH_ACTIVITY_DICTIONARY) {
      for (const pattern of act.patterns) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(clauseAscii)) !== null) {
          candidateMatches.push({
            start: m.index,
            end: m.index + m[0].length,
            kind: "activity",
            activity: act,
          });
        }
      }
    }

    for (const food of CZECH_FOOD_DICTIONARY) {
      for (const pattern of food.patterns) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(clauseAscii)) !== null) {
          candidateMatches.push({
            start: m.index,
            end: m.index + m[0].length,
            kind: "food",
            food,
          });
        }
      }
    }

    // Prefer longer span first, then earlier start index, filtering overlaps
    candidateMatches.sort(
      (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start
    );
    const chosen: SpanMatch[] = [];
    for (const cand of candidateMatches) {
      if (!chosen.some((existing) => overlaps(existing, cand))) {
        chosen.push(cand);
      }
    }
    chosen.sort((a, b) => a.start - b.start);

    const windows = partitionMatchWindows(clauseAscii, chosen);

    for (let idx = 0; idx < chosen.length; idx++) {
      const match = chosen[idx];
      const windowAscii = windows[idx] ?? clauseAscii;

      if (match.kind === "activity" && match.activity) {
        const durationMinutes = extractDurationMinutes(
          windowAscii,
          match.activity.defaultMinutes
        );
        const burnedKcal = computeActivityBurnedKcal(
          match.activity.metValue,
          safeWeight,
          durationMinutes,
          params.userBmrKcal
        );
        parsedItems.push({
          item_kind: "activity",
          item_name: `${match.activity.canonicalName} (${durationMinutes} min)`,
          canonical_name: match.activity.canonicalName,
          portion_grams: null,
          duration_minutes: durationMinutes,
          met_value: match.activity.metValue,
          kcal: 0,
          burned_kcal: burnedKcal,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
          confidence: 0.78,
        });
      } else if (match.kind === "food" && match.food) {
        const { portionGrams, multiplier, displayPrefix } = extractFoodAmount(
          windowAscii,
          match.food.defaultPortionGrams
        );
        inferredSlots.push(match.food.slot);
        const itemLabel = displayPrefix
          ? `${displayPrefix} ${match.food.canonicalName}`
          : `${match.food.canonicalName} (${portionGrams} g)`;

        parsedItems.push({
          item_kind: "food",
          item_name: itemLabel,
          canonical_name: match.food.canonicalName,
          portion_grams: portionGrams,
          duration_minutes: null,
          met_value: null,
          kcal: Math.max(0, Math.round(match.food.kcal * multiplier)),
          burned_kcal: 0,
          protein_g: round1(match.food.proteinG * multiplier),
          carbs_g: round1(match.food.carbsG * multiplier),
          fat_g: round1(match.food.fatG * multiplier),
          fiber_g: round1(match.food.fiberG * multiplier),
          confidence: 0.75,
        });
      }
    }
  }

  // Sensible default fallback when no dictionary entry matched at all
  if (parsedItems.length === 0) {
    const fullAscii = stripDiacritics(normalizedDecimalText).toLowerCase();
    const cleanTitle =
      params.rawText.trim().slice(0, 80) || "Neznámý záznam";
    const looksLikeSport =
      /\b(?:\d+\s*(?:min\w*|hod\w*)\s+)?(?:sport\w*|pohyb\w*|hokej\w*|fotbal\w*|tenis\w*|badminton\w*|lyz\w*|brusl\w*)\b/.test(
        fullAscii
      );

    if (looksLikeSport) {
      const durationMinutes = extractDurationMinutes(fullAscii, 45);
      const metValue = 6.0;
      parsedItems.push({
        item_kind: "activity",
        item_name: `${cleanTitle} (${durationMinutes} min)`,
        canonical_name: cleanTitle,
        portion_grams: null,
        duration_minutes: durationMinutes,
        met_value: metValue,
        kcal: 0,
        burned_kcal: computeActivityBurnedKcal(
          metValue,
          safeWeight,
          durationMinutes,
          params.userBmrKcal
        ),
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        confidence: 0.45,
      });
    } else {
      const explicitKjMatch = fullAscii.match(/(\d+(?:\.\d+)?)\s*kj\b/);
      const explicitKcalMatch = fullAscii.match(/(\d+(?:\.\d+)?)\s*kcal\b/);

      if (explicitKjMatch || explicitKcalMatch) {
        const { portionGrams } = extractFoodAmount(fullAscii, 100);
        const resolvedKcal = explicitKjMatch
          ? Math.max(0, Math.round(Number(explicitKjMatch[1]) / 4.184))
          : Math.max(0, Math.round(Number(explicitKcalMatch![1])));

        parsedItems.push({
          item_kind: "food",
          item_name: cleanTitle,
          canonical_name: cleanTitle,
          portion_grams: portionGrams > 0 ? portionGrams : null,
          duration_minutes: null,
          met_value: null,
          kcal: resolvedKcal,
          burned_kcal: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
          confidence: 0.9,
        });
      } else {
        throw new Error(
          "Jídlo nebylo rozpoznáno v lokálním offline slovníku a AI model byl nedostupný. Až budeš na signálu, klikni na „Zkusit znovu“, nebo doplň kalorickou hodnotu (např. 250 kcal)."
        );
      }
    }
  }

  const foodItems = parsedItems.filter((i) => i.item_kind === "food");
  const typicalTimeSlot: TimeSlot =
    params.fallbackTimeSlot !== "anytime"
      ? params.fallbackTimeSlot
      : (inferredSlots[0] ?? "anytime");

  const summaryTitle = parsedItems
    .map((i) => i.item_name)
    .slice(0, 3)
    .join(", ");

  const canonicalMealName =
    foodItems.length > 0
      ? Array.from(new Set(foodItems.map((i) => i.canonical_name))).join(" + ")
      : null;

  return ParsedEntryResultSchema.parse({
    summary_title: summaryTitle,
    canonical_meal_name: canonicalMealName,
    typical_time_slot: typicalTimeSlot,
    ai_notes: customAiNote,
    items: parsedItems,
  });
}
