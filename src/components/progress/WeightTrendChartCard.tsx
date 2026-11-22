"use client";

import {
  ArrowRight,
  Droplets,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { WeightStatsSummary } from "@/lib/progress-stats";
import {
  daysBetweenUtc,
  formatNumCs,
  formatShortDateCs,
  formatSignedNumCs,
  round1,
} from "./chart-utils";

interface WeightTrendChartCardProps {
  stats: WeightStatsSummary;
  isWeightLossGoal: boolean;
  targetWeightKg: number | null;
  activeIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
  onOpenProfileSettings: () => void;
  onOpenLogTab: () => void;
}

export function WeightTrendChartCard({
  stats,
  isWeightLossGoal,
  targetWeightKg,
  activeIndex,
  onSelectIndex,
  onOpenProfileSettings,
  onOpenLogTab,
}: WeightTrendChartCardProps) {
  const { points } = stats;

  if (points.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300/80 bg-white/70 p-5 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <Scale className="mx-auto h-6 w-6 text-emerald-500" />
        <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
          Vývoj váhy a 7denní trend
        </h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
          Zapiš první vážení a začne se vykreslovat tvůj 7denní klouzavý průměr bez výkyvů vody.
        </p>
        <button
          type="button"
          onClick={onOpenLogTab}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
        >
          <span>Zapsat váhu na stránce Zápis</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>
    );
  }

  const W = 600;
  const H = 220;
  const pad = { left: 46, right: 18, top: 18, bottom: 28 };
  const PW = W - pad.left - pad.right;
  const PH = H - pad.top - pad.bottom;

  const allVals = points.flatMap((p) => [p.weightKg, p.movingAvg7d]);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);

  const showTargetLine =
    targetWeightKg !== null &&
    targetWeightKg >= rawMin - 4 &&
    targetWeightKg <= rawMax + 4;

  const domainMinBase = showTargetLine
    ? Math.min(rawMin, targetWeightKg)
    : rawMin;
  const domainMaxBase = showTargetLine
    ? Math.max(rawMax, targetWeightKg)
    : rawMax;

  const spread = Math.max(1.6, domainMaxBase - domainMinBase);
  const minY = Math.floor((domainMinBase - spread * 0.22) * 2) / 2;
  const maxY = Math.ceil((domainMaxBase + spread * 0.22) * 2) / 2;
  const spanY = Math.max(1, maxY - minY);

  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const totalDays = Math.max(1, daysBetweenUtc(firstDate, lastDate));

  const getX = (idx: number) => {
    if (points.length === 1) return pad.left + PW / 2;
    const d = daysBetweenUtc(firstDate, points[idx].date);
    return pad.left + (d / totalDays) * PW;
  };

  const getY = (val: number) => pad.top + PH - ((val - minY) / spanY) * PH;

  const rawPolyline = points
    .map((p, i) => `${getX(i).toFixed(1)},${getY(p.weightKg).toFixed(1)}`)
    .join(" ");

  const avgPath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.movingAvg7d).toFixed(1)}`
    )
    .join(" ");

  const areaPath =
    points.length >= 2
      ? `${avgPath} L ${getX(points.length - 1).toFixed(1)} ${(pad.top + PH).toFixed(1)} L ${getX(0).toFixed(1)} ${(pad.top + PH).toFixed(1)} Z`
      : "";

  const inspected =
    activeIndex !== null && points[activeIndex]
      ? points[activeIndex]
      : points[points.length - 1];

  const yTicks = [minY, round1(minY + spanY / 2), maxY];

  const deltaIsGood =
    stats.deltaFromStartKg !== null &&
    ((isWeightLossGoal && stats.deltaFromStartKg <= 0) ||
      (!isWeightLossGoal && stats.deltaFromStartKg >= 0));

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
      {/* Header + Inspection Pill */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Scale className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Vývoj váhy a 7denní trend
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Tečky = denní vážení · Silná křivka = čistý trend bez výkyvů vody
          </p>
        </div>

        <div className="rounded-2xl bg-emerald-500/10 px-3 py-1.5 text-right text-xs tabular-nums">
          <div className="font-bold text-slate-900 dark:text-white">
            {formatShortDateCs(inspected.date)}:{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              {formatNumCs(inspected.weightKg)} kg
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            7d průměr: {formatNumCs(inspected.movingAvg7d)} kg
          </div>
        </div>
      </div>

      {/* Integrated Compact KPI Strip */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-slate-200/70 py-2.5 sm:grid-cols-3 dark:border-slate-800">
        <div>
          <div className="text-[11px] font-medium text-slate-400">Aktuální váha</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
              {stats.latestWeightKg !== null
                ? `${formatNumCs(stats.latestWeightKg)} kg`
                : "—"}
            </span>
            {stats.deltaFromStartKg !== null && points.length >= 2 && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  deltaIsGood
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                }`}
              >
                {stats.deltaFromStartKg <= 0 ? (
                  <TrendingDown className="h-2.5 w-2.5" />
                ) : (
                  <TrendingUp className="h-2.5 w-2.5" />
                )}
                {formatSignedNumCs(stats.deltaFromStartKg, "kg")}
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-400">7denní průměr</div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
            {stats.latestMovingAvgKg !== null
              ? `${formatNumCs(stats.latestMovingAvgKg)} kg`
              : "—"}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <div className="text-[11px] font-medium text-slate-400">Cílová váha</div>
          {targetWeightKg !== null && stats.latestWeightKg !== null ? (
            <div className="mt-0.5 flex items-center gap-1 text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
              <Target className="h-3.5 w-3.5 text-teal-500" />
              <span>{formatNumCs(targetWeightKg)} kg</span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                (zbývá{" "}
                {formatNumCs(
                  Math.max(0, round1(stats.latestWeightKg - targetWeightKg))
                )}{" "}
                kg)
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenProfileSettings}
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              <Target className="h-3 w-3" />
              Nastavit cíl →
            </button>
          )}
        </div>
      </div>

      {/* Water-Fluctuation Anti-Frustration Banner embedded inside Weight card */}
      {stats.waterFluctuationUpKg !== null && (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-emerald-500/8 to-teal-500/10 p-3 text-xs text-slate-800 dark:text-slate-200">
          <Droplets className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" />
          <div className="leading-relaxed">
            <strong className="font-bold text-slate-900 dark:text-white">
              Klid — 7denní trend dál klesá!
            </strong>{" "}
            Poslední vážení sice poskočilo o{" "}
            <strong>+{formatNumCs(stats.waterFluctuationUpKg)} kg</strong>{" "}
            (běžné kolísání vody, soli nebo glykogenu po jídle či sportu), ale tvůj{" "}
            <strong className="text-emerald-700 dark:text-emerald-300">
              7denní průměr ({formatNumCs(stats.latestMovingAvgKg ?? 0)} kg)
            </strong>{" "}
            jde pořád správným směrem dolů.
          </div>
        </div>
      )}

      {/* SVG Chart */}
      <div className="mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-52 w-full overflow-visible select-none"
          onMouseLeave={() => onSelectIndex(null)}
        >
          <defs>
            <linearGradient id="weightTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={W - pad.right}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="1"
                />
                <text
                  x={pad.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[11px] font-medium tabular-nums"
                >
                  {formatNumCs(tick)}
                </text>
              </g>
            );
          })}

          {showTargetLine && targetWeightKg !== null && (
            <g>
              <line
                x1={pad.left}
                y1={getY(targetWeightKg)}
                x2={W - pad.right}
                y2={getY(targetWeightKg)}
                stroke="#0d9488"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              <text
                x={W - pad.right}
                y={getY(targetWeightKg) - 5}
                textAnchor="end"
                className="fill-teal-600 text-[10px] font-bold dark:fill-teal-400"
              >
                Cíl {formatNumCs(targetWeightKg)} kg
              </text>
            </g>
          )}

          {areaPath && <path d={areaPath} fill="url(#weightTrendFill)" />}

          {points.length >= 2 && (
            <polyline
              fill="none"
              points={rawPolyline}
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.65"
            />
          )}

          {points.length >= 2 && (
            <path
              d={avgPath}
              fill="none"
              stroke="#10b981"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((p, idx) => {
            const cx = getX(idx);
            const cyRaw = getY(p.weightKg);
            const cyAvg = getY(p.movingAvg7d);
            const isSelected =
              activeIndex === idx ||
              (activeIndex === null && idx === points.length - 1);

            return (
              <g
                key={p.date}
                className="cursor-pointer"
                onMouseEnter={() => onSelectIndex(idx)}
                onClick={() => onSelectIndex(idx)}
              >
                {isSelected && (
                  <line
                    x1={cx}
                    y1={pad.top}
                    x2={cx}
                    y2={pad.top + PH}
                    stroke="currentColor"
                    className="text-slate-400/50 dark:text-slate-600/50"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cyRaw}
                  r={isSelected ? 5 : 3.5}
                  className={
                    isSelected
                      ? "fill-emerald-500 stroke-white dark:stroke-slate-900"
                      : "fill-slate-400/80 stroke-white dark:stroke-slate-900"
                  }
                  strokeWidth="1.5"
                />
                {isSelected && points.length >= 2 && (
                  <circle
                    cx={cx}
                    cy={cyAvg}
                    r={5.5}
                    fill="#10b981"
                    stroke="white"
                    strokeWidth="2"
                  />
                )}
                <circle cx={cx} cy={cyRaw} r={16} fill="transparent" />
              </g>
            );
          })}

          {points.length === 1 ? (
            <text
              x={getX(0)}
              y={H - 6}
              textAnchor="middle"
              className="fill-slate-400 text-[11px] font-medium"
            >
              {formatShortDateCs(points[0].date)} (výchozí bod)
            </text>
          ) : (
            <>
              <text
                x={pad.left}
                y={H - 6}
                textAnchor="start"
                className="fill-slate-400 text-[11px] font-medium"
              >
                {formatShortDateCs(firstDate)}
              </text>
              <text
                x={W - pad.right}
                y={H - 6}
                textAnchor="end"
                className="fill-slate-400 text-[11px] font-medium"
              >
                {formatShortDateCs(lastDate)}
              </text>
            </>
          )}
        </svg>
      </div>

      {points.length === 1 && (
        <p className="mt-1 text-center text-xs text-emerald-700 dark:text-emerald-300">
          Výchozí váha ({formatNumCs(points[0].weightKg)} kg) je zaznamenána.
          Jakmile přidáš další vážení, vykreslí se křivka směru!
        </p>
      )}
    </section>
  );
}
