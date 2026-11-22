"use client";

import { ArrowRight, Ruler } from "lucide-react";
import type { WaistStatsSummary } from "@/lib/progress-stats";
import {
  daysBetweenUtc,
  formatNumCs,
  formatShortDateCs,
  formatSignedNumCs,
  round1,
} from "./chart-utils";

interface WaistTrendChartCardProps {
  stats: WaistStatsSummary;
  healthyThresholdCm: number | null;
  activeIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
  onOpenLogTab: () => void;
}

export function WaistTrendChartCard({
  stats,
  healthyThresholdCm,
  activeIndex,
  onSelectIndex,
  onOpenLogTab,
}: WaistTrendChartCardProps) {
  const { points } = stats;

  if (points.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300/80 bg-white/70 p-5 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <Ruler className="mx-auto h-6 w-6 text-violet-500" />
        <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
          Obvod pasu (cm)
        </h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
          Obvod pasu v úrovni pupíku je nejlepší ukazatel úbytku viscerálního tuku
          {healthyThresholdCm
            ? ` (zdravá hranice pro tvou výšku je pod ${formatNumCs(healthyThresholdCm)} cm)`
            : ""}
          .
        </p>
        <button
          type="button"
          onClick={onOpenLogTab}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/35 bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-700 transition hover:bg-violet-500/20 dark:text-violet-300"
        >
          <span>Zapsat pas na stránce Zápis</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>
    );
  }

  const W = 600;
  const H = 200;
  const pad = { left: 46, right: 18, top: 18, bottom: 28 };
  const PW = W - pad.left - pad.right;
  const PH = H - pad.top - pad.bottom;

  const vals = points.map((p) => p.waistCm);
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);

  const showHealthyLine =
    healthyThresholdCm !== null &&
    healthyThresholdCm >= rawMin - 5 &&
    healthyThresholdCm <= rawMax + 5;

  const minBase = showHealthyLine
    ? Math.min(rawMin, healthyThresholdCm)
    : rawMin;
  const maxBase = showHealthyLine
    ? Math.max(rawMax, healthyThresholdCm)
    : rawMax;

  const spread = Math.max(2, maxBase - minBase);
  const minY = Math.floor(minBase - spread * 0.25);
  const maxY = Math.ceil(maxBase + spread * 0.25);
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

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.waistCm).toFixed(1)}`
    )
    .join(" ");

  const areaPath =
    points.length >= 2
      ? `${linePath} L ${getX(points.length - 1).toFixed(1)} ${(pad.top + PH).toFixed(1)} L ${getX(0).toFixed(1)} ${(pad.top + PH).toFixed(1)} Z`
      : "";

  const inspected =
    activeIndex !== null && points[activeIndex]
      ? points[activeIndex]
      : points[points.length - 1];

  const yTicks = [minY, round1(minY + spanY / 2), maxY];

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
      {/* Header + Inspection Pill */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <Ruler className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Obvod pasu (cm)
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Přímý ukazatel úbytku viscerálního tuku
            {healthyThresholdCm !== null
              ? ` · zdravé pásmo pod ${formatNumCs(healthyThresholdCm)} cm`
              : ""}
          </p>
        </div>

        <div className="rounded-2xl bg-violet-500/10 px-3 py-1.5 text-right text-xs tabular-nums">
          <div className="font-bold text-slate-900 dark:text-white">
            {formatShortDateCs(inspected.date)}:{" "}
            <span className="text-violet-600 dark:text-violet-400">
              {formatNumCs(inspected.waistCm)} cm
            </span>
          </div>
        </div>
      </div>

      {/* Integrated Compact KPI Strip */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-slate-200/70 py-2.5 dark:border-slate-800">
        <div>
          <div className="text-[11px] font-medium text-slate-400">Aktuální pas</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
              {stats.latestWaistCm !== null
                ? `${formatNumCs(stats.latestWaistCm)} cm`
                : "—"}
            </span>
            {stats.deltaFromStartCm !== null && points.length >= 2 && (
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  stats.deltaFromStartCm <= 0
                    ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                }`}
              >
                {formatSignedNumCs(stats.deltaFromStartCm, "cm")}
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-400">
            Poměr pas / výška (WHtR)
          </div>
          {stats.whtr !== null ? (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
              <span
                className={`text-sm font-extrabold tabular-nums ${
                  stats.whtrZone === "healthy"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : stats.whtrZone === "elevated"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {stats.whtr.toFixed(2).replace(".", ",")}
              </span>
              {stats.whtrLabelCs && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {stats.whtrLabelCs}
                </span>
              )}
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-slate-400">
              Doplň výšku v profilu
            </div>
          )}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-48 w-full overflow-visible select-none"
          onMouseLeave={() => onSelectIndex(null)}
        >
          <defs>
            <linearGradient id="waistTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.01" />
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

          {showHealthyLine && healthyThresholdCm !== null && (
            <g>
              <line
                x1={pad.left}
                y1={getY(healthyThresholdCm)}
                x2={W - pad.right}
                y2={getY(healthyThresholdCm)}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              <text
                x={W - pad.right}
                y={getY(healthyThresholdCm) - 5}
                textAnchor="end"
                className="fill-emerald-600 text-[10px] font-bold dark:fill-emerald-400"
              >
                Zdravý pas {formatNumCs(healthyThresholdCm)} cm
              </text>
            </g>
          )}

          {areaPath && <path d={areaPath} fill="url(#waistTrendFill)" />}

          {points.length >= 2 && (
            <path
              d={linePath}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((p, idx) => {
            const cx = getX(idx);
            const cy = getY(p.waistCm);
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
                  cy={cy}
                  r={isSelected ? 5.5 : 4}
                  fill="#8b5cf6"
                  stroke="white"
                  strokeWidth="2"
                />
                <circle cx={cx} cy={cy} r={16} fill="transparent" />
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
              {formatShortDateCs(points[0].date)}
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
    </section>
  );
}
