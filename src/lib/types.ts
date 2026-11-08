import { z } from "zod";
import type { Database } from "./database.types";

export type Sex = "male" | "female";
export type EnergyUnit = "kj" | "kcal";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";
export type ActivityIntensity = "light" | "medium" | "high";
export type TimeSlot = "morning" | "lunch" | "snack" | "evening" | "anytime";
export type EntryType = "food" | "activity" | "mixed" | "quick_check";
export type EntryStatus = "pending" | "processing" | "done" | "error";
export type ItemKind = "food" | "activity";

export type UserProfileRow = Database["public"]["Tables"]["user_profiles"]["Row"];
export type DailySummaryRow = Database["public"]["Tables"]["daily_summaries"]["Row"];
export type LogEntryRow = Database["public"]["Tables"]["log_entries"]["Row"];
export type EntryItemRow = Database["public"]["Tables"]["entry_items"]["Row"];
export type MealTemplateRow = Database["public"]["Tables"]["meal_templates"]["Row"];
export type ActivityTemplateRow = Database["public"]["Tables"]["activity_templates"]["Row"];
export type BodyMeasurementRow = Database["public"]["Tables"]["body_measurements"]["Row"];

export interface LogEntryWithItems extends LogEntryRow {
  entry_items: EntryItemRow[];
}

export interface TemplateItemSnapshot {
  item_name: string;
  canonical_name: string;
  portion_grams: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export const ProfileInputSchema = z.object({
  display_name: z.string().trim().min(1).max(60).default("Radek"),
  sex: z.enum(["male", "female"]),
  birth_year: z.coerce.number().int().min(1925).max(2020),
  height_cm: z.coerce.number().int().min(120).max(240),
  weight_kg: z.coerce.number().min(35).max(260),
  target_weight_kg: z.coerce.number().min(35).max(260).nullable().optional(),
  activity_level: z.enum(["sedentary", "light", "moderate", "active"]).default("sedentary"),
  target_deficit_kcal: z.coerce.number().int().min(-1500).max(1500).default(0),
  energy_unit: z.enum(["kj", "kcal"]).default("kj"),
});

export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export const CreateEntryInputSchema = z
  .object({
    raw_text: z.string().trim().max(600).default(""),
    image_base64: z.string().optional(),
    image_mime_type: z.string().optional(),
    log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time_slot: z.enum(["morning", "lunch", "snack", "evening", "anytime"]).optional(),
  })
  .refine(
    (data) =>
      data.raw_text.length >= 2 ||
      (typeof data.image_base64 === "string" && data.image_base64.length > 50),
    {
      message: "Zadej prosím text jídla nebo vyfoť štítek.",
    }
  );

export const QuickCheckToggleSchema = z.object({
  template_id: z.number().int().positive(),
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checked: z.boolean(),
});

export const QuickActivityLogSchema = z.object({
  activity_template_id: z.number().int().positive(),
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_minutes: z.coerce.number().int().min(5).max(600),
  intensity: z.enum(["light", "medium", "high"]),
});

export const BodyMeasurementInputSchema = z
  .object({
    measured_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weight_kg: z.coerce.number().min(30).max(300).nullable().optional(),
    waist_cm: z.coerce.number().min(40).max(200).nullable().optional(),
    blood_pressure_sys: z.coerce.number().int().min(60).max(260).nullable().optional(),
    blood_pressure_dia: z.coerce.number().int().min(40).max(160).nullable().optional(),
    pulse_bpm: z.coerce.number().int().min(35).max(220).nullable().optional(),
    notes: z.string().trim().max(240).nullable().optional(),
  })
  .refine(
    (data) =>
      (typeof data.weight_kg === "number" && Number.isFinite(data.weight_kg)) ||
      (typeof data.waist_cm === "number" && Number.isFinite(data.waist_cm)) ||
      (typeof data.blood_pressure_sys === "number" && Number.isFinite(data.blood_pressure_sys)) ||
      (typeof data.blood_pressure_dia === "number" && Number.isFinite(data.blood_pressure_dia)) ||
      (typeof data.pulse_bpm === "number" && Number.isFinite(data.pulse_bpm)),
    {
      message: "Zadej prosím váhu (kg), obvod pasu (cm) nebo krevní tlak.",
    }
  )
  .refine(
    (data) =>
      (data.blood_pressure_sys == null && data.blood_pressure_dia == null) ||
      (data.blood_pressure_sys != null && data.blood_pressure_dia != null),
    {
      message: "Pro krevní tlak zadej obě hodnoty (systolický i diastolický, např. 120/80).",
    }
  );

export type BodyMeasurementInput = z.infer<typeof BodyMeasurementInputSchema>;

export type BloodPressureCategory =
  | "optimal"
  | "normal"
  | "high_normal"
  | "grade_1"
  | "grade_2"
  | "grade_3";

export interface BloodPressureCategoryInfo {
  category: BloodPressureCategory;
  label: string;
  badgeClass: string;
  dotColor: string;
}

export function getBloodPressureCategory(
  sys: number,
  dia: number
): BloodPressureCategoryInfo {
  if (sys >= 180 || dia >= 110) {
    return {
      category: "grade_3",
      label: "Výrazně vysoký",
      badgeClass:
        "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
      dotColor: "#ef4444",
    };
  }
  if (sys >= 160 || dia >= 100) {
    return {
      category: "grade_2",
      label: "Vysoký tlak (st. 2)",
      badgeClass:
        "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
      dotColor: "#f43f5e",
    };
  }
  if (sys >= 140 || dia >= 90) {
    return {
      category: "grade_1",
      label: "Zvýšený tlak (st. 1)",
      badgeClass:
        "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
      dotColor: "#f59e0b",
    };
  }
  if (sys >= 130 || dia >= 85) {
    return {
      category: "high_normal",
      label: "Vyšší normální",
      badgeClass:
        "bg-yellow-500/15 text-yellow-800 dark:text-yellow-200 border-yellow-500/30",
      dotColor: "#eab308",
    };
  }
  if (sys >= 120 || dia >= 80) {
    return {
      category: "normal",
      label: "Normální tlak",
      badgeClass:
        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      dotColor: "#10b981",
    };
  }
  return {
    category: "optimal",
    label: "Optimální tlak",
    badgeClass:
      "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/40",
    dotColor: "#059669",
  };
}

export const ParsedItemSchema = z.object({
  item_kind: z.enum(["food", "activity"]),
  item_name: z.string(),
  canonical_name: z.string(),
  portion_grams: z.number().nullable().optional(),
  duration_minutes: z.number().nullable().optional(),
  met_value: z.number().nullable().optional(),
  kcal: z.number().min(0),
  burned_kcal: z.number().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  fiber_g: z.number().min(0),
  confidence: z.number().min(0).max(1),
});

export const DetectedMeasurementSchema = z.object({
  blood_pressure_sys: z.number().int().min(60).max(260).nullable().optional(),
  blood_pressure_dia: z.number().int().min(40).max(160).nullable().optional(),
  pulse_bpm: z.number().int().min(35).max(220).nullable().optional(),
  weight_kg: z.number().min(30).max(300).nullable().optional(),
});

export type DetectedMeasurement = z.infer<typeof DetectedMeasurementSchema>;

export const ParsedEntryResultSchema = z.object({
  summary_title: z.string(),
  canonical_meal_name: z.string().nullable().optional(),
  typical_time_slot: z.enum(["morning", "lunch", "snack", "evening", "anytime"]),
  ai_notes: z.string().nullable().optional(),
  items: z.array(ParsedItemSchema),
  detected_measurement: DetectedMeasurementSchema.nullable().optional(),
});

export type ParsedItem = z.infer<typeof ParsedItemSchema>;
export type ParsedEntryResult = z.infer<typeof ParsedEntryResultSchema>;
