"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Flame,
  HelpCircle,
  Loader2,
  Settings,
  Sparkles,
  Target,
  TrendingDown,
  Utensils,
} from "lucide-react";
import type {
  ActivityLevel,
  DailySummaryRow,
  EnergyUnit,
  UserProfileRow,
} from "@/lib/types";
import {
  ACTIVITY_LABELS_CS,
  ACTIVITY_MULTIPLIERS,
  energyUnitLabel,
  formatEnergy,
  formatEnergyValue,
} from "@/lib/calculations";
import { MetricTooltip } from "./MetricTooltip";

interface DailyBalanceCardProps {
  summary: DailySummaryRow;
  profile: UserProfileRow | null;
  energyUnit: EnergyUnit;
  pendingCount: number;
  collapseSignal?: number;
  onOpenProgressTab?: () => void;
  onOpenProfileSettings?: () => void;
}

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  barClass: string;
  tooltipTitle: string;
  tooltipDesc: string;
  tooltipFormula?: string;
}

function MacroProgressBar({
  label,
  current,
  target,
  barClass,
  tooltipTitle,
  tooltipDesc,
  tooltipFormula,
}: MacroBarProps) {
  const safeTarget = Math.max(1, target);
  const roundedCurrent = Math.round(current * 10) / 10;
  const pct = Math.min(100, Math.max(0, (current / safeTarget) * 100));
  const isOver = current > safeTarget * 1.08;

  return (
    <div className="rounded-2xl bg-slate-50/90 p-2.5 dark:bg-slate-950/50">
      <div className="flex items-baseline justify-between gap-1">
        <MetricTooltip
          title={tooltipTitle}
          description={tooltipDesc}
          formula={tooltipFormula}
          className="text-xs font-semibold text-slate-600 dark:text-slate-300"
        >
          {label}
        </MetricTooltip>
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
          <strong
            className={
              isOver
                ? "font-bold text-amber-600 dark:text-amber-400"
                : "font-bold text-slate-900 dark:text-white"
            }
          >
            {roundedCurrent}
          </strong>{" "}
          / {Math.round(target)} g
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function toActivityLevel(raw?: string | null): ActivityLevel {
  if (
    raw === "sedentary" ||
    raw === "light" ||
    raw === "moderate" ||
    raw === "active"
  ) {
    return raw;
  }
  return "sedentary";
}

function formatWeeklyKgCs(weeklyDeltaKg: number): string {
  const abs = Math.abs(weeklyDeltaKg)
    .toFixed(2)
    .replace(/0$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
  if (weeklyDeltaKg < 0) return `−${abs} kg / týden`;
  if (weeklyDeltaKg > 0) return `+${abs} kg / týden`;
  return "0 kg / týden (udržování)";
}

export function DailyBalanceCard({
  summary,
  profile,
  energyUnit,
  pendingCount,
  collapseSignal,
  onOpenProgressTab,
  onOpenProfileSettings,
}: DailyBalanceCardProps) {
  const [activeDrawer, setActiveDrawer] = useState<
    "none" | "explainer" | "macros"
  >("none");
  const showExplainer = activeDrawer === "explainer";
  const expandedMacros = activeDrawer === "macros";

  useEffect(() => {
    if (collapseSignal && collapseSignal > 0) {
      setActiveDrawer("none");
    }
  }, [collapseSignal]);

  const intakeKcal = Math.round(summary.intake_kcal);
  const baseExpKcal = Math.round(
    summary.base_expenditure_kcal || profile?.base_expenditure_kcal || 0
  );
  const activityLevel = toActivityLevel(profile?.activity_level);
  const activityMultiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  const activityLabel = ACTIVITY_LABELS_CS[activityLevel].label.toLowerCase();
  const bmrKcal = Math.round(
    profile?.bmr_kcal || (baseExpKcal > 0 ? baseExpKcal / activityMultiplier : 0)
  );

  const activityBurnKcal = Math.round(summary.burned_activity_kcal);
  const totalBurnKcal = Math.round(
    summary.burned_total_kcal || baseExpKcal + activityBurnKcal
  );
  const netKcal = intakeKcal - totalBurnKcal;

  const targetDeficit = profile?.target_deficit_kcal ?? -500;

  // 1. PEVNÝ ZÁKLADNÍ CÍL (nikdy se nenafukuje sportem -> mentální kotva bez „povinnosti dojíst“):
  const baseTargetIntakeKcal = Math.max(
    1200,
    Math.round(baseExpKcal + targetDeficit)
  );

  // 2. DNEŠNÍ STROP PO SPORTU (+50 % spálené energie ze sportu jako regenerační polštář jen při hladu;
  //    druhých 50 % zůstává vždy jako čistý bonus do hubnutí + kryje pokles NEAT mimo trénink):
  const sportBufferKcal = Math.round(activityBurnKcal * 0.5);
  const sportBonusSavedKcal = Math.max(0, activityBurnKcal - sportBufferKcal);
  const dailyCeilingIntakeKcal = baseTargetIntakeKcal + sportBufferKcal;

  const remainingToBaseGoalKcal = baseTargetIntakeKcal - intakeKcal;
  const remainingToCeilingKcal = dailyCeilingIntakeKcal - intakeKcal;

  const hasSportBuffer = sportBufferKcal > 0;
  const isInSportBufferZone =
    hasSportBuffer &&
    intakeKcal > baseTargetIntakeKcal &&
    intakeKcal <= dailyCeilingIntakeKcal;
  const isOverCeiling = intakeKcal > dailyCeilingIntakeKcal;
  const isOverCeilingButStillDeficit = isOverCeiling && netKcal < 0;

  const progressReferenceMaxKcal = Math.max(1, dailyCeilingIntakeKcal);
  const intakeProgressPct = Math.min(
    100,
    Math.max(0, (intakeKcal / progressReferenceMaxKcal) * 100)
  );
  const baseGoalMarkerPct = hasSportBuffer
    ? Math.min(98, Math.max(10, (baseTargetIntakeKcal / progressReferenceMaxKcal) * 100))
    : 100;

  // 1 kg body fat ≈ 7 700 kcal (32 200 kJ)
  const expectedWeeklyKg = (targetDeficit * 7) / 7700;
  const weightKg = profile?.weight_kg ?? 100;

  const proteinTarget = profile?.protein_target_g ?? 140;
  const carbsTarget = profile?.carbs_target_g ?? 220;
  const fatTarget = profile?.fat_target_g ?? 70;
  const fiberTarget = profile?.fiber_target_g ?? 30;
  const proteinCurrent = Math.round(summary.protein_g * 10) / 10;
  const unit = energyUnitLabel(energyUnit);

  const goalNameCs =
    targetDeficit <= -400
      ? "Hubnutí"
      : targetDeficit < 0
        ? "Mírné hubnutí"
        : targetDeficit === 0
          ? "Udržování váhy"
          : "Nabírání";

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl sm:p-4 dark:border-slate-800/90 dark:bg-slate-900/85">
      {/* Pending AI Processing Badge */}
      {pendingCount > 0 && (
        <div className="ai-shimmer mb-3 flex items-center justify-between rounded-2xl border border-emerald-500/30 px-3 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-emerald-500" />
            AI agent právě dopočítává {pendingCount}{" "}
            {pendingCount === 1
              ? "záznam"
              : pendingCount < 5
                ? "záznamy"
                : "záznamů"}
            …
          </span>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
        </div>
      )}

      {/* Top Row: Two-Tier Compass Status (Pevný cíl + Dnešní strop po sportu) + Action Toggles */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {!isInSportBufferZone && !isOverCeiling ? (
              <>
                <MetricTooltip
                  title="Zbývá dnes do pevného základního cíle"
                  description={
                    hasSportBuffer
                      ? `Tvůj pevný cíl (${formatEnergy(baseTargetIntakeKcal, energyUnit)}) se sportem záměrně nenafukuje, aby tě to nesvádělo dojídat sladkosti bez hladu. Pokud bys měl po dnešním tréninku opravdu hlad, máš k dispozici ještě regenerační strop ${formatEnergy(dailyCeilingIntakeKcal, energyUnit)} (+50 % ze sportu).`
                      : "Kolik energie dnes ještě můžeš sníst do svého pevného denního cíle hubnutí."
                  }
                  formula={`Pevný cíl ${formatEnergy(baseTargetIntakeKcal, energyUnit)} − Příjem ${formatEnergy(intakeKcal, energyUnit)} = ${formatEnergy(remainingToBaseGoalKcal, energyUnit)}`}
                  className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                >
                  {remainingToBaseGoalKcal <= 25
                    ? "Denní cíl splněn"
                    : "Zbývá do cíle"}
                </MetricTooltip>

                <span className="text-xl font-extrabold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
                  {remainingToBaseGoalKcal <= 25
                    ? `✓ ${formatEnergy(remainingToBaseGoalKcal, energyUnit)}`
                    : formatEnergy(remainingToBaseGoalKcal, energyUnit)}
                </span>
              </>
            ) : isInSportBufferZone ? (
              <>
                <MetricTooltip
                  title="Pevný cíl splněn · Jsi v regenerační rezervě po sportu"
                  description={`Tvůj pevný cíl (${formatEnergy(baseTargetIntakeKcal, energyUnit)}) už je splněný — pokud nemáš hlad, nemusíš už jíst vůbec nic! Protože jsi ale dnes sportoval (−${formatEnergy(activityBurnKcal, energyUnit)}), jsi v bezpečném regeneračním pásmu pod dnešním stropem ${formatEnergy(dailyCeilingIntakeKcal, energyUnit)} a stále ve výrazném deficitu.`}
                  formula={`Dnešní strop ${formatEnergy(dailyCeilingIntakeKcal, energyUnit)} − Příjem ${formatEnergy(intakeKcal, energyUnit)} = do stropu ${formatEnergy(remainingToCeilingKcal, energyUnit)}`}
                  className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300"
                >
                  Základ splněn · Do stropu
                </MetricTooltip>

                <span className="text-xl font-extrabold tabular-nums tracking-tight text-teal-600 dark:text-teal-400">
                  {formatEnergy(remainingToCeilingKcal, energyUnit)}
                </span>

                <MetricTooltip
                  title="Výrazný čistý deficit i po jídle navíc"
                  description={`I když jsi snědl o ${formatEnergy(intakeKcal - baseTargetIntakeKcal, energyUnit)} víc než v netréninkový den, díky sportu jsi dnes v čistém deficitu ${formatEnergy(netKcal, energyUnit)} — hubnutí běží naplno.`}
                  formula={`Příjem ${formatEnergy(intakeKcal, energyUnit)} − Výdej ${formatEnergy(totalBurnKcal, energyUnit)} = ${formatEnergy(netKcal, energyUnit, { signed: true })}`}
                  showIcon={false}
                >
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    Deficit {formatEnergy(netKcal, energyUnit)}
                  </span>
                </MetricTooltip>
              </>
            ) : (
              <>
                <MetricTooltip
                  title={
                    hasSportBuffer
                      ? "Překročení dnešního stropu po sportu"
                      : "Překročení pevného denního cíle"
                  }
                  description={
                    isOverCeilingButStillDeficit
                      ? "Snědl jsi víc, než je dnešní doporučený strop pro plné tempo hubnutí, ale pořád méně, než dnes tělo celkem spálí — jsi tedy stále v kalorickém deficitu."
                      : "Dnešní příjem překročil jak cílový strop, tak tvůj odhadovaný celkový výdej."
                  }
                  formula={`${hasSportBuffer ? "Strop" : "Cíl"} ${formatEnergy(dailyCeilingIntakeKcal, energyUnit)} − Příjem ${formatEnergy(intakeKcal, energyUnit)} = ${formatEnergy(remainingToCeilingKcal, energyUnit, { signed: true })}`}
                  className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                >
                  {hasSportBuffer ? "Nad dnešní strop" : "Nad cílem příjmu"}
                </MetricTooltip>

                <span
                  className={`text-xl font-extrabold tabular-nums tracking-tight ${
                    isOverCeilingButStillDeficit
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {formatEnergy(Math.abs(remainingToCeilingKcal), energyUnit, {
                    signed: true,
                  })}
                </span>

                {isOverCeilingButStillDeficit && (
                  <MetricTooltip
                    title="Pořád hubneš (jsi pod svým celkovým výdejem)"
                    description="Tvůj dnešní příjem je nad doporučeným stropem, ale stále nižší než tvůj celkový denní výdej. Tělo tedy i dnes bere chybějící energii ze zásob."
                    formula={`Příjem ${formatEnergy(intakeKcal, energyUnit)} − Výdej ${formatEnergy(totalBurnKcal, energyUnit)} = ${formatEnergy(netKcal, energyUnit, { signed: true })}`}
                    showIcon={false}
                  >
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                      Stále v deficitu {formatEnergy(netKcal, energyUnit)}
                    </span>
                  </MetricTooltip>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Controls: Protein Pill + Explainer Toggle + Macros Toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          <MetricTooltip
            align="right"
            showIcon={false}
            title="Denní cíl bílkovin"
            description="Bílkoviny chrání svalovou hmotu při hubnutí a nejvíce zasytí. Cíl je nastaven na 1,8 g na každý kilogram tvé váhy."
            formula={`1,8 g × ${Math.round(weightKg)} kg = ${Math.round(proteinTarget)} g bílkovin / den`}
          >
            <span className="inline-block rounded-xl bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
              Bílkoviny{" "}
              <strong className="font-extrabold">{proteinCurrent}</strong> /{" "}
              {Math.round(proteinTarget)}g
            </span>
          </MetricTooltip>

          <button
            type="button"
            onClick={() =>
              setActiveDrawer((prev) =>
                prev === "explainer" ? "none" : "explainer"
              )
            }
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
              showExplainer
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                : "border-slate-200/80 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5 text-emerald-500" />
            <span>Cíl vs. strop</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveDrawer((prev) =>
                prev === "macros" ? "none" : "macros"
              )
            }
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
              expandedMacros
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                : "border-slate-200/80 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <span>{expandedMacros ? "Skrýt" : "Makra"}</span>
            {expandedMacros ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 3-Block Key Metrics Strip: Příjem · Cíl (strop) · Výdej (no duplicate BMR!) */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-slate-600 dark:text-slate-400">
        <MetricTooltip
          title="Dnešní příjem energie"
          description="Součet veškerého jídla a nápojů, které jsi pro tento den zapsal."
          formula={
            energyUnit === "kj"
              ? `${formatEnergy(intakeKcal, "kj")} (${formatEnergy(intakeKcal, "kcal")})`
              : `${formatEnergy(intakeKcal, "kcal")} (${formatEnergy(intakeKcal, "kj")})`
          }
        >
          <span>
            Příjem{" "}
            <strong className="font-bold text-slate-900 dark:text-white">
              {formatEnergy(intakeKcal, energyUnit)}
            </strong>
          </span>
        </MetricTooltip>

        <span className="text-slate-300 dark:text-slate-700">·</span>

        <MetricTooltip
          align="center"
          title={
            hasSportBuffer
              ? `Pevný cíl a dnešní strop po sportu (${goalNameCs})`
              : `Pevný denní cíl (${goalNameCs})`
          }
          description={
            hasSportBuffer
              ? `Cíl ${formatEnergy(baseTargetIntakeKcal, energyUnit)} je tvá pevná denní kotva (${formatWeeklyKgCs(expectedWeeklyKg)}) — nemáš-li hlad, končíš na ní. Strop ${formatEnergy(dailyCeilingIntakeKcal, energyUnit)} (+50 % z dnešního sportu) je regenerační rezerva jen pro případ reálného hladu; druhá polovina sportu (${formatEnergy(sportBonusSavedKcal, energyUnit)}) jde vždy jako čistý bonus do hubnutí.`
              : `Tvůj stabilní denní rozpočet pro běžný den (${formatWeeklyKgCs(expectedWeeklyKg)}). Záměrně se sportem nenafukuje, abys v hlavě držel stálou kotvu porcí a neměl nutkání dojídat večer sladkosti bez hladu.`
          }
          formula={
            hasSportBuffer
              ? `Cíl ${formatEnergy(baseTargetIntakeKcal, energyUnit)} + 50 % sportu (${formatEnergy(sportBufferKcal, energyUnit)}) = strop ${formatEnergy(dailyCeilingIntakeKcal, energyUnit)}`
              : `Základní výdej ${formatEnergy(baseExpKcal, energyUnit)} ${formatEnergyValue(targetDeficit, energyUnit, { signed: true })} ${unit} = ${formatEnergy(baseTargetIntakeKcal, energyUnit)}`
          }
        >
          <span>
            Cíl{" "}
            <strong className="font-bold text-emerald-700 dark:text-emerald-400">
              {formatEnergy(baseTargetIntakeKcal, energyUnit)}
            </strong>
            {hasSportBuffer && (
              <span className="ml-1 font-medium text-teal-700 dark:text-teal-400">
                (strop {formatEnergyValue(dailyCeilingIntakeKcal, energyUnit)})
              </span>
            )}
          </span>
        </MetricTooltip>

        <span className="text-slate-300 dark:text-slate-700">·</span>

        <MetricTooltip
          align="right"
          title="Celkový denní výdej (TDEE)"
          description={`Odhad energie, kterou tvé tělo za celý den spálí. Tvoří ho klidové BMR (${formatEnergy(bmrKcal, energyUnit)}) vynásobené běžným denním režimem (×${String(activityMultiplier).replace(".", ",")} – ${activityLabel}) plus zapsaný sport.`}
          formula={
            activityBurnKcal > 0
              ? `Základ ${formatEnergy(baseExpKcal, energyUnit)} + sport ${formatEnergy(activityBurnKcal, energyUnit)} = ${formatEnergy(totalBurnKcal, energyUnit)}`
              : `BMR ${formatEnergy(bmrKcal, energyUnit)} × ${String(activityMultiplier).replace(".", ",")} = ${formatEnergy(totalBurnKcal, energyUnit)}`
          }
        >
          <span>
            Výdej{" "}
            <strong className="font-bold text-amber-600 dark:text-amber-400">
              {formatEnergy(totalBurnKcal, energyUnit)}
            </strong>
          </span>
        </MetricTooltip>
      </div>

      {/* Two-Band Daily Progress Bar (Base Goal + Optional Post-Sport Ceiling Buffer) */}
      <div className="relative mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200/85 dark:bg-slate-800">
        {hasSportBuffer && (
          <div
            aria-hidden="true"
            style={{ left: `${baseGoalMarkerPct}%` }}
            className="pointer-events-none absolute inset-y-0 right-0 bg-teal-500/12 dark:bg-teal-400/10"
          />
        )}

        <div
          className={`h-full rounded-full transition-all duration-500 ${
            !isInSportBufferZone && !isOverCeiling
              ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
              : isInSportBufferZone
                ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400"
                : isOverCeilingButStillDeficit
                  ? "bg-gradient-to-r from-amber-400 to-amber-500"
                  : "bg-gradient-to-r from-amber-500 to-rose-500"
          }`}
          style={{ width: `${intakeProgressPct}%` }}
        />

        {hasSportBuffer && (
          <div
            title={`Hranice pevného cíle: ${formatEnergy(baseTargetIntakeKcal, energyUnit)}`}
            style={{ left: `${baseGoalMarkerPct}%` }}
            className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-slate-900/45 dark:bg-white/65"
          />
        )}
      </div>

      {/* Expandable Goal Rationale & Sports Nutritionist / Psychology Guide */}
      {showExplainer && (
        <div className="mt-3.5 space-y-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 text-xs leading-relaxed text-slate-700 dark:bg-emerald-950/20 dark:text-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              <Target className="h-4 w-4 text-emerald-500" />
              <span>Jak se počítá Cíl a proč existuje Strop po sportu</span>
            </div>
            {onOpenProfileSettings && (
              <button
                type="button"
                onClick={onOpenProfileSettings}
                className="inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 shadow-xs ring-1 ring-emerald-500/30 transition hover:bg-emerald-50 dark:bg-slate-900 dark:text-emerald-300"
              >
                <Settings className="h-3 w-3" />
                <span>Upravit v Profilu</span>
              </button>
            )}
          </div>

          <ol className="space-y-1.5 text-[11.5px]">
            <li>
              <strong className="text-slate-900 dark:text-white">
                1. Klidové BMR ({formatEnergy(bmrKcal, energyUnit)}):
              </strong>{" "}
              Bazální metabolismus (rovnice <em>Mifflin-St Jeor</em> podle věku,
              výšky a váhy {Math.round(weightKg)} kg) — spotřeba těla za 24 h
              v úplném klidu na chod orgánů.
            </li>
            <li>
              <strong className="text-amber-700 dark:text-amber-300">
                2. Základní denní výdej ({formatEnergy(baseExpKcal, energyUnit)}
                ):
              </strong>{" "}
              BMR × {String(activityMultiplier).replace(".", ",")} ({activityLabel}
              ) — pokrývá tvůj běžný den (práci, pochůzky, běžnou chůzi, úklid či
              rehabilitační cviky) bez započtení cíleného sportu.
            </li>
            <li>
              <strong className="text-emerald-700 dark:text-emerald-300">
                3. Pevný denní cíl ({formatEnergy(baseTargetIntakeKcal, energyUnit)}
                ):
              </strong>{" "}
              <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px] dark:bg-slate-900">
                {formatEnergy(baseExpKcal, energyUnit)}{" "}
                {formatEnergyValue(targetDeficit, energyUnit, { signed: true })}{" "}
                {unit} = {formatEnergy(baseTargetIntakeKcal, energyUnit)}
              </code>
              . Protože 1 kg tuku ≈{" "}
              <strong>{energyUnit === "kj" ? "32 200 kJ" : "7 700 kcal"}</strong>
              , odpovídá tento deficit udržitelnému tempu{" "}
              <strong>{formatWeeklyKgCs(expectedWeeklyKg)}</strong> bez ztráty
              svalů. Toto číslo se sportem <strong>nikdy nemění</strong> — je to
              tvá pevná denní kotva.
            </li>
            <li>
              <strong className="text-teal-700 dark:text-teal-300">
                4. Dnešní strop po sportu (
                {hasSportBuffer
                  ? formatEnergy(dailyCeilingIntakeKcal, energyUnit)
                  : "aktivuje se v tréninkový den"}
                ):
              </strong>{" "}
              Když zapíšeš skutečný sport
              {hasSportBuffer
                ? ` (dnes −${formatEnergy(activityBurnKcal, energyUnit)})`
                : ""}
              , přičte se <strong>50 % spálené energie</strong>
              {hasSportBuffer
                ? ` (+${formatEnergy(sportBufferKcal, energyUnit)})`
                : ""}{" "}
              do horní hranice dne (čárka na liště odděluje Pevný cíl od
              regenerační rezervy).
            </li>
          </ol>

          <div className="rounded-xl border border-teal-500/25 bg-white/80 p-3 text-[11.5px] leading-relaxed dark:bg-slate-900/70">
            <div className="font-bold text-slate-900 dark:text-white">
              Proč nepřičítáme 100 % sportu do cíle jídla? (Výživa & psychologie)
            </div>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-slate-600 dark:text-slate-300">
              <li>
                <strong>Žádná past „nevybraného kreditu“:</strong> Kdyby se po 2 h
                na kole zvedl cíl z {formatEnergy(baseTargetIntakeKcal, energyUnit)}{" "}
                na 12 500+ {unit}, mozek to čte jako výzvu dojíst večer čokoládu
                a zmrzlinu, i když nemáš hlad — a tím smazat celý trénink.
              </li>
              <li>
                <strong>Tělesná kompenzace (NEAT):</strong> Po těžkém výkonu tělo
                zbytek večera podvědomě šetří drobný pohyb (víc sedíš, méně
                přecházíš). Reálný celodenní výdej proto nestoupne o 100 %
                tréninku, ale typicky o 50–70 %.
              </li>
              <li>
                <strong>Jak se tím řídit v praxi:</strong> Nemáš-li hlad, skonči
                kolem <strong>Pevného cíle</strong> — celých 100 % sportu jde
                rovnou do hubnutí. Máš-li po dlouhém výkonu opravdu hlad, dej si
                bez výčitek normální jídlo/bílkoviny na regeneraci až do{" "}
                <strong>Dnešního stropu</strong> (druhých 50 % sportu i tak
                zůstane v deficitu!).
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* On-Demand Secondary Statistics & Macros Drawer */}
      {expandedMacros && (
        <div className="mt-3.5 space-y-3 border-t border-slate-200/70 pt-3.5 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {/* Intake */}
            <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <Utensils className="h-3.5 w-3.5" />
                <MetricTooltip
                  title="Příjem za dnešní den"
                  description="Součet energie ze všech dnes zapsaných jídel a nápojů."
                >
                  Příjem
                </MetricTooltip>
              </div>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                {formatEnergyValue(intakeKcal, energyUnit)}{" "}
                <span className="text-xs font-medium text-slate-500">
                  {unit}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Cíl {formatEnergy(baseTargetIntakeKcal, energyUnit)}
                {hasSportBuffer
                  ? ` · Strop ${formatEnergy(dailyCeilingIntakeKcal, energyUnit)}`
                  : ""}
              </div>
            </div>

            {/* Expenditure */}
            <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <Flame className="h-3.5 w-3.5" />
                <MetricTooltip
                  title="Výdej celkem"
                  description="Základní denní výdej (BMR × běžný denní režim) sečtený se spálenou energií ze zapsaných aktivit."
                >
                  Výdej celkem
                </MetricTooltip>
              </div>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                {formatEnergyValue(totalBurnKcal, energyUnit)}{" "}
                <span className="text-xs font-medium text-slate-500">
                  {unit}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Základ {formatEnergyValue(baseExpKcal, energyUnit)} + sport{" "}
                {formatEnergyValue(activityBurnKcal, energyUnit)}
              </div>
            </div>

            {/* Net Balance */}
            <div className="col-span-2 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 sm:col-span-1 sm:block dark:border-slate-800 dark:bg-slate-950/60">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                <MetricTooltip
                  align="right"
                  title="Čistá energetická bilance dne"
                  description="Rozdíl Příjem − Celkový výdej. Záporné číslo znamená kalorický deficit (tělo bere chybějící energii z tukových zásob). Kladné číslo znamená přebytek."
                  formula={`Cílová bilance: ${formatEnergyValue(targetDeficit, energyUnit, { signed: true })} ${unit}`}
                >
                  Čistá bilance
                </MetricTooltip>
              </div>
              <div>
                <div className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                  {formatEnergyValue(netKcal, energyUnit, { signed: true })}{" "}
                  <span className="text-xs font-medium text-slate-500">
                    {unit}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Cíl deficitu:{" "}
                  {formatEnergy(targetDeficit, energyUnit, { signed: true })}
                </div>
              </div>
            </div>
          </div>

          {/* 4 Macro Bars */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MacroProgressBar
              label="Bílkoviny"
              current={summary.protein_g}
              target={proteinTarget}
              barClass="bg-emerald-500"
              tooltipTitle="Bílkoviny (1,8 g / kg váhy)"
              tooltipDesc="Klíčové pro ochranu svalové hmoty v deficitu a dlouhý pocit sytosti."
              tooltipFormula={`1,8 g × ${Math.round(weightKg)} kg = ${Math.round(proteinTarget)} g`}
            />
            <MacroProgressBar
              label="Sacharidy"
              current={summary.carbs_g}
              target={carbsTarget}
              barClass="bg-sky-500"
              tooltipTitle="Sacharidy (zbývající energie)"
              tooltipDesc="Zdroj pohotové energie pro mozek a pohyb. Dopočítávají se ze zbytku cílového příjmu po odečtení bílkovin a tuků."
            />
            <MacroProgressBar
              label="Tuky"
              current={summary.fat_g}
              target={fatTarget}
              barClass="bg-amber-500"
              tooltipTitle="Tuky (0,9 g / kg váhy)"
              tooltipDesc="Nezbytné pro tvorbu hormonů (včetně testosteronu) a vstřebávání vitamínů A, D, E, K."
              tooltipFormula={`0,9 g × ${Math.round(weightKg)} kg = ${Math.round(fatTarget)} g`}
            />
            <MacroProgressBar
              label="Vláknina"
              current={summary.fiber_g}
              target={fiberTarget}
              barClass="bg-violet-500"
              tooltipTitle="Vláknina (doporučených 30 g)"
              tooltipDesc="Zpomaluje vstřebávání cukrů, prodlužuje sytost po jídle a podporuje zdravý mikrobiom."
            />
          </div>

          {onOpenProgressTab && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onOpenProgressTab}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
              >
                <TrendingDown className="h-3.5 w-3.5" />
                Zobrazit grafy váhy, pasu a dlouhodobého progresu →
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
