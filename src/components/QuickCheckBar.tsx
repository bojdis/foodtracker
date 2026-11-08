"use client";

import { useMemo, useState } from "react";
import {
  Bike,
  Check,
  ChevronDown,
  Dumbbell,
  Flame,
  Footprints,
  Loader2,
  Minus,
  Mountain,
  Pin,
  PinOff,
  Plus,
  Sparkles,
  Trash2,
  Utensils,
  Waves,
  X,
  Zap,
} from "lucide-react";
import type {
  ActivityIntensity,
  ActivityTemplateRow,
  EnergyUnit,
  LogEntryWithItems,
  MealTemplateRow,
  TimeSlot,
  UserProfileRow,
} from "@/lib/types";
import {
  calculateActivityBurnedKcal,
  detectTimeSlotForDate,
  formatEnergy,
  TIME_SLOT_LABELS_CS,
} from "@/lib/calculations";
import {
  computeActivityTemplateDayMinutes,
  computeMealTemplateDayCounts,
} from "@/lib/template-counter";

interface QuickCheckBarProps {
  templates: MealTemplateRow[];
  activityTemplates: ActivityTemplateRow[];
  entries: LogEntryWithItems[];
  profile: UserProfileRow | null;
  energyUnit: EnergyUnit;
  togglingTemplateId: number | null;
  patchingTemplateId: number | null;
  deletingTemplateId: number | null;
  loggingActivityId: number | null;
  patchingActivityId: number | null;
  deletingActivityId: number | null;
  onQuickMealAction: (
    template: MealTemplateRow,
    action: "add" | "remove_one"
  ) => void;
  onPatchTemplate: (
    templateId: number,
    patch: { is_quick_check?: boolean; is_hidden?: boolean }
  ) => void;
  onDeleteTemplate: (templateId: number) => void;
  onLogQuickActivity: (payload: {
    activity_template_id: number;
    duration_minutes: number;
    intensity: ActivityIntensity;
  }) => Promise<boolean>;
  onPatchActivityTemplate: (
    activityTemplateId: number,
    patch: { is_quick_check?: boolean; is_hidden?: boolean }
  ) => void;
  onDeleteActivityTemplate: (activityTemplateId: number) => void;
}

function toTimeSlot(raw: string): TimeSlot {
  if (
    raw === "morning" ||
    raw === "lunch" ||
    raw === "snack" ||
    raw === "evening" ||
    raw === "anytime"
  ) {
    return raw;
  }
  return "anytime";
}

function toIntensity(raw?: string | null): ActivityIntensity {
  if (raw === "light" || raw === "medium" || raw === "high") {
    return raw;
  }
  return "medium";
}

function formatCompactMealName(canonicalName: string): string {
  return canonicalName
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/^Menší porce müsli$/i, "Menší müsli")
    .trim();
}

function renderActivityIcon(iconKey: string, className = "h-3.5 w-3.5") {
  switch (iconKey) {
    case "bike":
      return <Bike className={className} />;
    case "climb":
      return <Mountain className={className} />;
    case "gym":
      return <Dumbbell className={className} />;
    case "swim":
      return <Waves className={className} />;
    case "walk":
    case "run":
      return <Footprints className={className} />;
    default:
      return <Flame className={className} />;
  }
}

function formatMinutesHumanCs(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) {
    return h === 1 ? "1 hod (60 min)" : `${h} hod (${minutes} min)`;
  }
  return `${h} h ${rem} min (${minutes} min)`;
}

const INTENSITY_OPTIONS: Array<{
  value: ActivityIntensity;
  label: string;
  hint: string;
}> = [
  { value: "light", label: "Lehká", hint: "pohoda / rovina" },
  { value: "medium", label: "Střední", hint: "běžné tempo" },
  { value: "high", label: "Ostrá", hint: "naplno / kopce" },
];

export function QuickCheckBar({
  templates,
  activityTemplates,
  entries,
  profile,
  energyUnit,
  togglingTemplateId,
  patchingTemplateId,
  deletingTemplateId,
  loggingActivityId,
  patchingActivityId,
  deletingActivityId,
  onQuickMealAction,
  onPatchTemplate,
  onDeleteTemplate,
  onLogQuickActivity,
  onPatchActivityTemplate,
  onDeleteActivityTemplate,
}: QuickCheckBarProps) {
  const [showHabitsDrawer, setShowHabitsDrawer] = useState(false);
  const [manageMode, setManageMode] = useState(false);

  // Active expanded sport tuner state
  const [selectedSportId, setSelectedSportId] = useState<number | null>(null);
  const [sportMinutes, setSportMinutes] = useState<number>(60);
  const [sportIntensity, setSportIntensity] =
    useState<ActivityIntensity>("medium");

  const currentSlot = useMemo(() => detectTimeSlotForDate(), []);

  const { quickCheckMeals, learningMeals } = useMemo(() => {
    const quick: MealTemplateRow[] = [];
    const learning: MealTemplateRow[] = [];

    for (const tpl of templates) {
      if (tpl.is_hidden) continue;
      if (tpl.is_quick_check) {
        quick.push(tpl);
      } else if (tpl.occurrence_count >= 1) {
        learning.push(tpl);
      }
    }

    quick.sort((a, b) => {
      const aMatches = a.typical_time_slot === currentSlot ? 1 : 0;
      const bMatches = b.typical_time_slot === currentSlot ? 1 : 0;
      if (aMatches !== bMatches) {
        return bMatches - aMatches;
      }
      return b.occurrence_count - a.occurrence_count;
    });

    learning.sort((a, b) => b.occurrence_count - a.occurrence_count);

    return { quickCheckMeals: quick, learningMeals: learning };
  }, [templates, currentSlot]);

  const { quickActivities, learningActivities } = useMemo(() => {
    const quick: ActivityTemplateRow[] = [];
    const learning: ActivityTemplateRow[] = [];

    for (const act of activityTemplates) {
      if (act.is_hidden) continue;
      if (act.is_quick_check) {
        quick.push(act);
      } else if (act.occurrence_count >= 1) {
        learning.push(act);
      }
    }

    return { quickActivities: quick, learningActivities: learning };
  }, [activityTemplates]);

  // Count how many times each meal template was logged today (both 1-tap AND inside free-text entries!)
  const todayCountByMealId = useMemo(
    () => computeMealTemplateDayCounts(templates, entries),
    [templates, entries]
  );

  // Sum today's logged minutes per sport (both quick-logged AND free-text entries!)
  const todayMinutesBySportId = useMemo(
    () => computeActivityTemplateDayMinutes(activityTemplates, entries),
    [activityTemplates, entries]
  );

  const selectedSport = useMemo(
    () => quickActivities.find((a) => a.id === selectedSportId) ?? null,
    [quickActivities, selectedSportId]
  );

  const totalCandidatesCount = learningMeals.length + learningActivities.length;

  if (
    quickCheckMeals.length === 0 &&
    quickActivities.length === 0 &&
    totalCandidatesCount === 0
  ) {
    return null;
  }

  function handleSelectSport(act: ActivityTemplateRow) {
    if (selectedSportId === act.id) {
      setSelectedSportId(null);
      return;
    }
    setSelectedSportId(act.id);
    setSportMinutes(act.default_minutes);
    setSportIntensity(toIntensity(act.default_intensity));
  }

  const userWeightKg = profile?.weight_kg ?? 100;
  const userBmrKcal = profile?.bmr_kcal ?? undefined;

  const selectedMet = selectedSport
    ? sportIntensity === "light"
      ? Number(selectedSport.met_light)
      : sportIntensity === "high"
        ? Number(selectedSport.met_high)
        : Number(selectedSport.met_medium)
    : 5.0;

  const previewBurnedKcal = selectedSport
    ? calculateActivityBurnedKcal({
        metValue: selectedMet,
        weightKg: userWeightKg,
        durationMinutes: sportMinutes,
        bmrKcal: userBmrKcal,
      })
    : 0;

  const sliderMax = selectedSport
    ? Math.max(selectedSport.max_minutes, sportMinutes)
    : 180;

  const quickDurationPresets =
    selectedSport &&
    (selectedSport.icon_key === "bike" || selectedSport.icon_key === "walk")
      ? [30, 60, 90, 120, 180]
      : [30, 45, 60, 90, 120];

  async function handleConfirmQuickActivity() {
    if (!selectedSport) return;
    const ok = await onLogQuickActivity({
      activity_template_id: selectedSport.id,
      duration_minutes: sportMinutes,
      intensity: sportIntensity,
    });
    if (ok) {
      setSelectedSportId(null);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm backdrop-blur-xl sm:px-3.5 sm:py-3 dark:border-slate-800/90 dark:bg-slate-900/85">
      {/* Slim Single-Line Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            Rychlé přidání
          </h2>
          <span className="truncate text-[11px] text-slate-400 dark:text-slate-500">
            {manageMode
              ? "· odepni nebo trvale smaž"
              : "· každé klepnutí přidá +1 kus"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {totalCandidatesCount > 0 && (
            <button
              type="button"
              onClick={() => setShowHabitsDrawer((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-[11px] font-semibold transition ${
                showHabitsDrawer
                  ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <Sparkles className="h-3 w-3 text-violet-500" />
              <span>Zvyky ({totalCandidatesCount})</span>
            </button>
          )}

          {(quickCheckMeals.length > 0 || quickActivities.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setManageMode((prev) => !prev);
                setSelectedSportId(null);
              }}
              className={`rounded-xl px-2 py-0.5 text-[11px] font-semibold transition ${
                manageMode
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {manageMode ? "Hotovo" : "Upravit"}
            </button>
          )}
        </div>
      </div>

      {/* 1. Single-Row Flowing +1 Meal Pills (No Bingo Checkboxes!) */}
      {quickCheckMeals.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <Utensils className="h-3 w-3" />
            Jídlo:
          </span>

          {quickCheckMeals.map((tpl) => {
            const countInfo = todayCountByMealId.get(tpl.id);
            const todayCount = countInfo?.totalCount ?? 0;
            const removableCount = countInfo?.removableCount ?? 0;
            const isBusy = togglingTemplateId === tpl.id;
            const isPatching = patchingTemplateId === tpl.id;
            const isDeleting = deletingTemplateId === tpl.id;
            const shortName = formatCompactMealName(tpl.canonical_name);
            const energyText = formatEnergy(tpl.avg_kcal, energyUnit);
            const countHint =
              todayCount > 0 && removableCount === 0
                ? " · započteno z tvého textového zápisu dne"
                : "";
            const hoverDetails = `${tpl.canonical_name} · ${energyText} · ${Math.round(tpl.avg_protein_g * 10) / 10} g bílkovin${countHint} (klepnutím přidáš další porci)`;

            return (
              <div
                key={tpl.id}
                className={`inline-flex items-center rounded-2xl border transition ${
                  todayCount > 0
                    ? "border-emerald-500 bg-emerald-500/14 text-emerald-950 shadow-xs ring-1 ring-emerald-500/25 dark:border-emerald-400 dark:bg-emerald-500/22 dark:text-emerald-50 dark:ring-emerald-400/25"
                    : "border-slate-200/90 bg-slate-50/90 text-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/8 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-emerald-500/40"
                }`}
              >
                {/* Main Action Area: ALWAYS +1 */}
                <button
                  type="button"
                  disabled={isBusy || isDeleting || isPatching}
                  title={hoverDetails}
                  onClick={() => {
                    if (!manageMode) {
                      onQuickMealAction(tpl, "add");
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold active:scale-[0.97] disabled:opacity-60"
                >
                  {isBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />
                  ) : (
                    <Plus className="h-3 w-3 stroke-[2.75] text-emerald-600 dark:text-emerald-300" />
                  )}

                  <span>{shortName}</span>

                  <span
                    className={`text-[11px] font-medium tabular-nums ${
                      todayCount > 0
                        ? "text-emerald-800/85 dark:text-emerald-200/85"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {energyText}
                  </span>

                  {todayCount > 0 && (
                    <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold leading-none tabular-nums text-white shadow-2xs dark:bg-emerald-400 dark:text-slate-950">
                      {todayCount}×
                    </span>
                  )}
                </button>

                {/* Micro -1 Undo Button (shown only when there is a standalone removable entry and not in manageMode) */}
                {removableCount > 0 && !manageMode && (
                  <button
                    type="button"
                    disabled={isBusy || isDeleting}
                    title={`Odebrat poslední „${shortName}“ z dneška`}
                    aria-label={`Odebrat 1× ${shortName}`}
                    onClick={() => onQuickMealAction(tpl, "remove_one")}
                    className="flex h-full items-center rounded-r-2xl border-l border-emerald-500/30 px-2 py-1.5 text-emerald-700 transition hover:bg-rose-500/15 hover:text-rose-600 active:scale-95 disabled:opacity-50 dark:border-emerald-400/30 dark:text-emerald-300 dark:hover:text-rose-300"
                  >
                    <Minus className="h-3 w-3 stroke-[2.5]" />
                  </button>
                )}

                {/* Manage Mode Controls: Unpin or Permanently Delete */}
                {manageMode && (
                  <div className="flex items-center gap-0.5 border-l border-slate-200/80 px-1.5 py-1 dark:border-slate-800">
                    <button
                      type="button"
                      disabled={isPatching || isDeleting}
                      title="Odepnout z rychlého výběru"
                      onClick={() =>
                        onPatchTemplate(tpl.id, { is_quick_check: false })
                      }
                      className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <PinOff className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting || isPatching}
                      title="Trvale smazat oblíbené jídlo"
                      onClick={() => onDeleteTemplate(tpl.id)}
                      className="rounded-lg bg-rose-500/10 p-1 text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-400"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 2. Single-Row Recurring Sport Pills + On-Demand Duration Slider & Intensity Switcher */}
      {quickActivities.length > 0 && (
        <div
          className={
            quickCheckMeals.length > 0
              ? "mt-2 border-t border-slate-200/60 pt-2 dark:border-slate-800/80"
              : "mt-2"
          }
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <Flame className="h-3 w-3" />
              Pohyb:
            </span>

            {quickActivities.map((act) => {
              const isSelected = selectedSportId === act.id;
              const todayMins = todayMinutesBySportId.get(act.id) ?? 0;
              const isPatching = patchingActivityId === act.id;
              const isDeleting = deletingActivityId === act.id;

              return (
                <div
                  key={act.id}
                  className={`inline-flex items-center rounded-2xl border transition ${
                    isSelected
                      ? "border-amber-600 bg-amber-500 text-white shadow-sm ring-2 ring-amber-500/35 dark:border-amber-300 dark:bg-amber-400 dark:text-slate-950"
                      : todayMins > 0
                        ? "border-amber-500 bg-amber-500/18 text-amber-950 shadow-xs ring-1 ring-amber-500/35 hover:bg-amber-500/25 dark:border-amber-400 dark:bg-amber-500/25 dark:text-amber-50 dark:ring-amber-400/30"
                        : "border-slate-200/90 bg-slate-50/90 text-slate-700 hover:border-amber-500/50 hover:bg-amber-500/10 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200"
                  }`}
                >
                  <button
                    type="button"
                    disabled={isDeleting || isPatching}
                    onClick={() => {
                      if (!manageMode) {
                        handleSelectSport(act);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold active:scale-[0.97]"
                  >
                    <span
                      className={
                        isSelected
                          ? "text-white dark:text-slate-950"
                          : "text-amber-600 dark:text-amber-300"
                      }
                    >
                      {renderActivityIcon(act.icon_key, "h-3.5 w-3.5")}
                    </span>
                    <span>{act.canonical_name}</span>
                    {todayMins > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none tabular-nums shadow-2xs ${
                          isSelected
                            ? "bg-white/25 text-white dark:bg-slate-950/20 dark:text-slate-950"
                            : "bg-amber-500 text-white dark:bg-amber-400 dark:text-slate-950"
                        }`}
                      >
                        {todayMins}m
                      </span>
                    )}
                    {!manageMode && (
                      <ChevronDown
                        className={`h-3 w-3 opacity-65 transition-transform ${
                          isSelected ? "rotate-180" : ""
                        }`}
                      />
                    )}
                  </button>

                  {manageMode && (
                    <div className="flex items-center gap-0.5 border-l border-slate-200/80 px-1.5 py-1 dark:border-slate-800">
                      <button
                        type="button"
                        disabled={isPatching || isDeleting}
                        title="Odepnout aktivitu z rychlého výběru"
                        onClick={() =>
                          onPatchActivityTemplate(act.id, {
                            is_quick_check: false,
                          })
                        }
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <PinOff className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting || isPatching}
                        title="Trvale smazat aktivitu"
                        onClick={() => onDeleteActivityTemplate(act.id)}
                        className="rounded-lg bg-rose-500/10 p-1 text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-400"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Expandable Sport Duration Slider & Intensity Switcher */}
          {selectedSport && !manageMode && (
            <div className="mt-2.5 rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/10 via-white to-emerald-500/5 p-3 shadow-xs dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-300">
                    {renderActivityIcon(selectedSport.icon_key, "h-4 w-4")}
                  </span>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {selectedSport.canonical_name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Čistý aktivní výdej nad klidový režim (MET{" "}
                      {String(selectedMet).replace(".", ",")})
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-amber-500/15 px-3 py-1 text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      Spáleno
                    </span>
                    <span className="text-base font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
                      {formatEnergy(-previewBurnedKcal, energyUnit)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSportId(null)}
                    aria-label="Zavřít panel pohybu"
                    className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Duration Slider + Quick Minute Presets */}
              <div className="mt-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Délka:{" "}
                    <strong className="text-amber-700 dark:text-amber-300">
                      {formatMinutesHumanCs(sportMinutes)}
                    </strong>
                  </span>

                  <div className="flex items-center gap-1">
                    {quickDurationPresets.map((presetMin) => {
                      const active = sportMinutes === presetMin;
                      return (
                        <button
                          key={presetMin}
                          type="button"
                          onClick={() => setSportMinutes(presetMin)}
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-bold tabular-nums transition ${
                            active
                              ? "bg-amber-500 text-white shadow-xs"
                              : "bg-white/80 text-slate-600 ring-1 ring-slate-200 hover:bg-amber-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                          }`}
                        >
                          {presetMin}m
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Ubrat 5 minut"
                    onClick={() =>
                      setSportMinutes((m) => Math.max(10, m - 5))
                    }
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>

                  <input
                    type="range"
                    min={10}
                    max={sliderMax}
                    step={5}
                    value={sportMinutes}
                    onChange={(e) => setSportMinutes(Number(e.target.value))}
                    aria-label="Délka aktivity v minutách"
                    className="h-2 flex-1 cursor-pointer accent-amber-500"
                  />

                  <button
                    type="button"
                    aria-label="Přidat 5 minut"
                    onClick={() =>
                      setSportMinutes((m) => Math.min(360, m + 5))
                    }
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* 3-State Intensity Switcher */}
              <div className="mt-2.5">
                <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-100/90 p-1 dark:bg-slate-800/80">
                  {INTENSITY_OPTIONS.map((opt) => {
                    const active = sportIntensity === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSportIntensity(opt.value)}
                        className={`rounded-xl px-2 py-1.5 text-center transition ${
                          active
                            ? "bg-white text-amber-700 shadow-xs ring-1 ring-amber-500/40 dark:bg-slate-950 dark:text-amber-300"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                        }`}
                      >
                        <span className="block text-xs font-extrabold">
                          {opt.label}
                        </span>
                        <span className="block truncate text-[10px] opacity-75">
                          {opt.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Minuty i intenzitu si aplikace zapamatuje pro příště.
                </span>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSportId(null)}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Zrušit
                  </button>

                  <button
                    type="button"
                    disabled={loggingActivityId === selectedSport.id}
                    onClick={() => void handleConfirmQuickActivity()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-1.5 text-xs font-extrabold text-white shadow-md shadow-amber-500/20 transition hover:from-amber-600 hover:to-orange-600 active:scale-95 disabled:opacity-60"
                  >
                    {loggingActivityId === selectedSport.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5 stroke-[2.75]" />
                    )}
                    <span>
                      Zapsat ({formatEnergy(-previewBurnedKcal, energyUnit)})
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Expandable Habit Candidates Drawer (toggled via compact "Zvyky" button in header) */}
      {showHabitsDrawer && totalCandidatesCount > 0 && (
        <div className="mt-2.5 space-y-1.5 border-t border-slate-200/70 pt-2.5 dark:border-slate-800">
          {learningActivities.map((act) => {
            const progressCount = Math.min(3, act.occurrence_count);
            const isPatching = patchingActivityId === act.id;
            const isDeleting = deletingActivityId === act.id;
            return (
              <div
                key={`act-${act.id}`}
                className="flex items-center justify-between gap-2 rounded-2xl bg-amber-500/5 px-3 py-1.5 text-xs dark:bg-amber-950/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500">
                      {renderActivityIcon(act.icon_key, "h-3.5 w-3.5")}
                    </span>
                    <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
                      {act.canonical_name}
                    </span>
                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                      Pohyb · {progressCount}/3
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Obvykle ~{act.default_minutes} min · po 3. záznamu se připne
                    automaticky
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={isPatching || isDeleting}
                    onClick={() =>
                      onPatchActivityTemplate(act.id, {
                        is_quick_check: true,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-xl bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-500/25 disabled:opacity-50 dark:text-amber-300"
                  >
                    {isPatching ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Pin className="h-3 w-3" />
                    )}
                    Připnout
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting || isPatching}
                    title="Trvale smazat"
                    onClick={() => onDeleteActivityTemplate(act.id)}
                    className="rounded-xl p-1 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          {learningMeals.map((tpl) => {
            const progressCount = Math.min(3, tpl.occurrence_count);
            const isPatching = patchingTemplateId === tpl.id;
            const isDeleting = deletingTemplateId === tpl.id;
            return (
              <div
                key={`meal-${tpl.id}`}
                className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50/90 px-3 py-1.5 text-xs dark:bg-slate-950/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
                      {tpl.canonical_name}
                    </span>
                    <span className="shrink-0 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                      {progressCount}/3
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    ~{formatEnergy(tpl.avg_kcal, energyUnit)} ·{" "}
                    {TIME_SLOT_LABELS_CS[toTimeSlot(tpl.typical_time_slot)]}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={isPatching || isDeleting}
                    onClick={() =>
                      onPatchTemplate(tpl.id, { is_quick_check: true })
                    }
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-500/25 disabled:opacity-50 dark:text-emerald-300"
                  >
                    {isPatching ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Pin className="h-3 w-3" />
                    )}
                    Připnout
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting || isPatching}
                    title="Trvale smazat"
                    onClick={() => onDeleteTemplate(tpl.id)}
                    className="rounded-xl p-1 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
