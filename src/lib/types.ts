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

export const CreateEntryInputSchema = z.object({
  raw_text: z.string().trim().min(2, "Zadej prosím alespoň 2 znaky").max(600),
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_slot: z.enum(["morning", "lunch", "snack", "evening", "anytime"]).optional(),
});

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
    notes: z.string().trim().max(240).nullable().optional(),
  })
  .refine(
    (data) =>
      (typeof data.weight_kg === "number" && Number.isFinite(data.weight_kg)) ||
      (typeof data.waist_cm === "number" && Number.isFinite(data.waist_cm)),
    {
      message: "Zadej prosím váhu (kg) nebo obvod pasu (cm).",
    }
  );

export type BodyMeasurementInput = z.infer<typeof BodyMeasurementInputSchema>;

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

export const ParsedEntryResultSchema = z.object({
  summary_title: z.string(),
  canonical_meal_name: z.string().nullable().optional(),
  typical_time_slot: z.enum(["morning", "lunch", "snack", "evening", "anytime"]),
  ai_notes: z.string().nullable().optional(),
  items: z.array(ParsedItemSchema).min(1),
});

export type ParsedItem = z.infer<typeof ParsedItemSchema>;
export type ParsedEntryResult = z.infer<typeof ParsedEntryResultSchema>;
