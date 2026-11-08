"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  Flame,
  Heart,
  LineChart,
  Loader2,
  RefreshCw,
  Ruler,
  Scale,
  Sparkles,
  Trash2,
  Utensils,
  Zap,
} from "lucide-react";
import type {
  BodyMeasurementRow,
  EnergyUnit,
  LogEntryWithItems,
  TimeSlot,
} from "@/lib/types";
import { getBloodPressureCategory } from "@/lib/types";
import { formatEnergy, TIME_SLOT_LABELS_CS } from "@/lib/calculations";

interface EntryFeedProps {
  entries: LogEntryWithItems[];
  energyUnit: EnergyUnit;
  deletingId: number | null;
  retryingId: number | null;
  dayMeasurement?: BodyMeasurementRow | null;
  onOpenProgressTab?: () => void;
  onDeleteEntry: (entryId: number) => void;
  onRetryEntry: (entryId: number) => void;
}

function formatPragueTime(isoString: string): string {
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      timeZone: "Europe/Prague",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return "";
  }
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

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function formatNumCs(val: number): string {
  return val.toFixed(1).replace(".", ",").replace(/,0$/, "");
}

export function EntryFeed({
  entries,
  energyUnit,
  deletingId,
  retryingId,
  dayMeasurement,
  onOpenProgressTab,
  onDeleteEntry,
  onRetryEntry,
}: EntryFeedProps) {
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const hasPendingEntries = entries.some(
    (entry) => entry.status === "pending" || entry.status === "processing"
  );

  useEffect(() => {
    if (!hasPendingEntries) {
      return;
    }
    setNowMs(Date.now());
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [hasPendingEntries]);

  function toggleExpand(id: number) {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const hasDayMeasurement =
    dayMeasurement != null &&
    (dayMeasurement.weight_kg != null ||
      dayMeasurement.waist_cm != null ||
      (dayMeasurement.blood_pressure_sys != null &&
        dayMeasurement.blood_pressure_dia != null));

  const bpCategory =
    dayMeasurement?.blood_pressure_sys != null &&
    dayMeasurement?.blood_pressure_dia != null
      ? getBloodPressureCategory(
          dayMeasurement.blood_pressure_sys,
          dayMeasurement.blood_pressure_dia
        )
      : null;

  if (entries.length === 0 && !hasDayMeasurement) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300/80 bg-white/60 px-5 py-7 text-center dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Utensils className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          Dnes zatím žádný zapsaný pokrm ani aktivita
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Napiš hned nahoře do zeleného pole cokoliv, co jsi snědl nebo odcvičil,
          případně přidej jedním klepnutím své pravidelné jídlo nebo sport.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Časová osa záznamů ({entries.length + (hasDayMeasurement ? 1 : 0)})
        </h2>
      </div>

      {hasDayMeasurement && dayMeasurement && (
        <article className="rounded-3xl border border-rose-500/25 bg-gradient-to-r from-rose-500/5 via-white/95 to-emerald-500/5 p-4 shadow-sm dark:border-rose-500/20 dark:from-rose-950/20 dark:via-slate-900/90 dark:to-emerald-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <Heart className="h-3.5 w-3.5" />
              </span>
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Naměřené hodnoty dne
                </h3>
              </div>
            </div>

            {onOpenProgressTab && (
              <button
                type="button"
                onClick={onOpenProgressTab}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 transition hover:border-emerald-500/40 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <LineChart className="h-3 w-3 text-emerald-500" />
                <span>Grafy v Progresu →</span>
              </button>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {dayMeasurement.weight_kg != null && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-extrabold tabular-nums text-emerald-800 dark:text-emerald-200">
                <Scale className="h-3.5 w-3.5 text-emerald-500" />
                <span>Váha: {formatNumCs(dayMeasurement.weight_kg)} kg</span>
              </span>
            )}

            {dayMeasurement.waist_cm != null && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-xs font-extrabold tabular-nums text-violet-800 dark:text-violet-200">
                <Ruler className="h-3.5 w-3.5 text-violet-500" />
                <span>Pas: {formatNumCs(dayMeasurement.waist_cm)} cm</span>
              </span>
            )}

            {dayMeasurement.blood_pressure_sys != null &&
              dayMeasurement.blood_pressure_dia != null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-xs font-extrabold tabular-nums text-rose-800 dark:text-rose-200">
                  <Heart className="h-3.5 w-3.5 text-rose-500" />
                  <span>
                    Tlak: {dayMeasurement.blood_pressure_sys}/
                    {dayMeasurement.blood_pressure_dia} mmHg
                  </span>
                </span>
              )}

            {dayMeasurement.pulse_bpm != null && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-100/80 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Activity className="h-3.5 w-3.5 text-rose-500" />
                <span>Tep: {dayMeasurement.pulse_bpm} bpm</span>
              </span>
            )}

            {bpCategory && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${bpCategory.badgeClass}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: bpCategory.dotColor }}
                />
                {bpCategory.label}
              </span>
            )}
          </div>
        </article>
      )}

      {entries.map((entry) => {
        const isPending =
          entry.status === "pending" || entry.status === "processing";
        const isError = entry.status === "error";
        const isExpanded = Boolean(expandedIds[entry.id]);
        const isDeleting = deletingId === entry.id;
        const isRetrying = retryingId === entry.id;
        const slotLabel = TIME_SLOT_LABELS_CS[toTimeSlot(entry.time_slot)];
        const loggedTime = formatPragueTime(entry.logged_at);

        const intakeKcal = Math.round(entry.total_intake_kcal);
        const burnedKcal = Math.round(entry.total_burned_kcal);
        const isActivityOnly =
          entry.entry_type === "activity" ||
          (burnedKcal > 0 && intakeKcal === 0);
        const isQuickCheck = entry.entry_type === "quick_check";

        if (isPending) {
          const startedIso = entry.processed_at ?? entry.logged_at;
          const parsedStart = Date.parse(startedIso);
          const elapsedSec = Number.isFinite(parsedStart)
            ? Math.max(0, Math.floor((nowMs - parsedStart) / 1000))
            : 0;
          const isSlow = elapsedSec >= 25;
          const progressPct = Math.min(96, Math.max(12, Math.round((elapsedSec / 35) * 100)));
          const phaseText =
            entry.status === "pending"
              ? "Zařazeno do fronty…"
              : isSlow
                ? "Běží déle než obvykle (pojistka na 35 s)…"
                : "Gemini rozebírá jídla a počítá kJ…";

          return (
            <article
              key={entry.id}
              className="ai-shimmer rounded-3xl border border-emerald-500/30 bg-white/90 p-4 shadow-sm dark:bg-slate-900/85"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                      <span>{phaseText}</span>
                    </span>
                    <span className="rounded-lg bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold tabular-nums">
                      {elapsedSec} s / max 35 s
                    </span>
                  </div>

                  {/* Live progress bar up to 35s timeout ceiling */}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-500/15">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                    {entry.raw_text}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      <span>{loggedTime}</span>
                      <span>·</span>
                      <span>{slotLabel}</span>
                    </div>

                    {isSlow && (
                      <button
                        type="button"
                        disabled={isRetrying}
                        onClick={() => onRetryEntry(entry.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-800 transition hover:bg-amber-500/25 disabled:opacity-50 dark:text-amber-200"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`}
                        />
                        <span>Spustit znovu</span>
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => onDeleteEntry(entry.id)}
                  aria-label="Smazat záznam"
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </article>
          );
        }

        if (isError) {
          return (
            <article
              key={entry.id}
              className="rounded-3xl border border-rose-500/35 bg-rose-500/5 p-4 dark:bg-rose-950/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Zpracování záznamu selhalo</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {entry.raw_text}
                  </p>
                  {entry.error_message && (
                    <p className="mt-1 text-xs text-rose-600/90 dark:text-rose-300/90">
                      {entry.error_message}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isRetrying}
                      onClick={() => onRetryEntry(entry.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`}
                      />
                      Zkusit znovu
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => onDeleteEntry(entry.id)}
                  aria-label="Smazat záznam"
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </article>
          );
        }

        // status === "done"
        return (
          <article
            key={entry.id}
            className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition dark:border-slate-800/90 dark:bg-slate-900/85"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 font-medium">
                    {isActivityOnly ? (
                      <Dumbbell className="h-3 w-3 text-amber-500" />
                    ) : isQuickCheck ? (
                      <Zap className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Utensils className="h-3 w-3 text-emerald-500" />
                    )}
                    {loggedTime}
                  </span>
                  <span>·</span>
                  <span>{slotLabel}</span>
                  {isQuickCheck && (
                    <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      1-klik
                    </span>
                  )}
                </div>

                <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                  {entry.summary_title || entry.raw_text}
                </h3>

                {entry.summary_title &&
                  entry.summary_title.toLowerCase() !==
                    entry.raw_text.toLowerCase() && (
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      „{entry.raw_text}“
                    </p>
                  )}
              </div>

              {/* Right Energy Badges & Delete */}
              <div className="flex shrink-0 items-center gap-1.5">
                <div className="flex flex-col items-end gap-1">
                  {intakeKcal > 0 && (
                    <span className="rounded-xl bg-emerald-500/15 px-2.5 py-1 text-xs font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatEnergy(intakeKcal, energyUnit, { signed: true })}
                    </span>
                  )}
                  {burnedKcal > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-xl bg-amber-500/15 px-2.5 py-1 text-xs font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
                      <Flame className="h-3 w-3" />
                      {formatEnergy(-burnedKcal, energyUnit)}
                    </span>
                  )}
                  {intakeKcal === 0 && burnedKcal === 0 && (
                    <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {formatEnergy(0, energyUnit)}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => onDeleteEntry(entry.id)}
                  aria-label="Smazat záznam"
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Compact Macro Pills + Expand Button */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {!isActivityOnly ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold tabular-nums">
                  <span className="rounded-lg bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                    B {round1(entry.total_protein_g)} g
                  </span>
                  <span className="rounded-lg bg-sky-500/10 px-2 py-0.5 text-sky-700 dark:text-sky-300">
                    S {round1(entry.total_carbs_g)} g
                  </span>
                  <span className="rounded-lg bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                    T {round1(entry.total_fat_g)} g
                  </span>
                  <span className="rounded-lg bg-violet-500/10 px-2 py-0.5 text-violet-700 dark:text-violet-300">
                    Vl {round1(entry.total_fiber_g)} g
                  </span>
                </div>
              ) : (
                <span className="text-xs text-amber-700 dark:text-amber-300">
                  Aktivní výdej započítán do dnešní bilance
                </span>
              )}

              {(entry.entry_items.length > 0 || entry.ai_notes) && (
                <div className="flex items-center gap-1.5">
                  {entry.ai_notes && entry.ai_notes.includes("parserem") && (
                    <button
                      type="button"
                      disabled={isRetrying}
                      onClick={() => onRetryEntry(entry.id)}
                      title="Znovu rozebrat přes Gemini AI"
                      className="inline-flex items-center gap-1 rounded-xl border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`}
                      />
                      <span>Přepočítat AI</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleExpand(entry.id)}
                    className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <span>Detail ({entry.entry_items.length})</span>
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Expandable Breakdown */}
            {isExpanded && (
              <div className="mt-3 space-y-2 border-t border-slate-200/70 pt-3 text-xs dark:border-slate-800">
                {entry.entry_items.map((item) => {
                  const isSport = item.item_kind === "activity";
                  const confidencePct = Math.round(
                    Math.max(0, Math.min(1, item.confidence)) * 100
                  );

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50/90 px-3 py-2 dark:bg-slate-950/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                          <span className="truncate">{item.item_name}</span>
                          {item.portion_grams !== null && !isSport && (
                            <span className="shrink-0 text-[11px] font-normal text-slate-500">
                              ({Math.round(item.portion_grams)} g)
                            </span>
                          )}
                          {isSport && item.duration_minutes !== null && (
                            <span className="shrink-0 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                              ({Math.round(item.duration_minutes)} min
                              {item.met_value ? ` · MET ${item.met_value}` : ""}
                              )
                            </span>
                          )}
                        </div>

                        {!isSport ? (
                          <div className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                            B {round1(item.protein_g)}g · S{" "}
                            {round1(item.carbs_g)}g · T {round1(item.fat_g)}g ·
                            Vl {round1(item.fiber_g)}g · jistota {confidencePct}%
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Čistý aktivní výdej nad klidový režim · jistota{" "}
                            {confidencePct}%
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 font-bold tabular-nums">
                        {isSport ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {formatEnergy(-Math.round(item.burned_kcal), energyUnit)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {formatEnergy(Math.round(item.kcal), energyUnit, {
                              signed: true,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {entry.ai_notes && (
                  <p className="rounded-xl bg-slate-100/80 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                    💡 {entry.ai_notes}
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
