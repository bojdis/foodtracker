"use client";

import { Activity, ArrowRight } from "lucide-react";
import type { EnergyUnit } from "@/lib/types";
import {
  convertFromKcal,
  formatEnergy,
  formatEnergyValue,
} from "@/lib/calculations";
import type { CalorieBalanceStatsSummary } from "@/lib/progress-stats";
import { daysBetweenUtc, formatShortDateCs } from "./chart-utils";

interface EnergyIntakeVsBurnChartCardProps {
  stats: CalorieBalanceStatsSummary;
  energyUnit: EnergyUnit;
  activeIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
  onOpenLogTab: () => void;
}

export function EnergyIntakeVsBurnChartCard({
  stats,
  energyUnit,
  activeIndex,
  onSelectIndex,
  onOpenLogTab,
}: EnergyIntakeVsBurnChartCardProps) {
  const { points, avgIntakeKcal, avgBurnedKcal, avgNetKcal, loggedDaysCount } = stats;

  if (points.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300/80 bg-white/70 p-5 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <Activity className="mx-auto h-6 w-6 text-amber-500" />
        <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
          Příjem vs. výdej energie
        </h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
          Porovnání tvého denního příjmu z jídel proti celkovému výdeji (základní metabolismus + sport).
        </p>
        <button
          type="button"
          onClick={onOpenLogTab}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
        >
          <span>Zapsat na stránce Zápis</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>
    );
  }

  const W = 600;
  const H = 220;
  const pad = { left: 58, right: 18, top: 18, bottom: 28 };
  const PW = W - pad.left - pad.right;
  const PH = H - pad.top - pad.bottom;

  const inspected =
    activeIndex !== null && points[activeIndex]
      ? points[activeIndex]
      : points[points.length - 1];

  const intakeConverted = points.map((p) => convertFromKcal(p.intakeKcal, energyUnit));
  const burnedConverted = points.map((p) =>
    convertFromKcal(p.burnedTotalKcal, energyUnit)
  );
  const allVals = [...intakeConverted, ...burnedConverted];

  const stepRound = energyUnit === "kj" ? 1000 : 250;
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const spread = Math.max(stepRound, rawMax - rawMin);

  const minY = Math.max(0, Math.floor((rawMin - spread * 0.18) / stepRound) * stepRound);
  const maxY = Math.ceil((rawMax + spread * 0.16) / stepRound) * stepRound;
  const spanY = Math.max(stepRound, maxY - minY);

  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const totalDays = Math.max(1, daysBetweenUtc(firstDate, lastDate));

  const getX = (idx: number) => {
    if (points.length === 1) return pad.left + PW / 2;
    const d = daysBetweenUtc(firstDate, points[idx].date);
    return pad.left + (d / totalDays) * PW;
  };

  const getY = (valConverted: number) =>
    pad.top + PH - ((valConverted - minY) / spanY) * PH;

  const yTicks = [
    minY,
    Math.round((minY + spanY / 2) / (energyUnit === "kj" ? 500 : 100)) *
      (energyUnit === "kj" ? 500 : 100),
    maxY,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  // Build consecutive segments so unlogged calendar gaps (>1 day) render as subtle dashed connectors
  let hasGaps = false;
  const segments: Array<{
    fromIdx: number;
    toIdx: number;
    isGap: boolean;
    x1: number;
    x2: number;
    yIn1: number;
    yIn2: number;
    yOut1: number;
    yOut2: number;
    isDeficit: boolean;
  }> = [];

  for (let i = 0; i < points.length - 1; i++) {
    const gapDays = daysBetweenUtc(points[i].date, points[i + 1].date);
    const isGap = gapDays > 1;
    if (isGap) hasGaps = true;
    const avgNet = (points[i].netKcal + points[i + 1].netKcal) / 2;
    segments.push({
      fromIdx: i,
      toIdx: i + 1,
      isGap,
      x1: getX(i),
      x2: getX(i + 1),
      yIn1: getY(intakeConverted[i]),
      yIn2: getY(intakeConverted[i + 1]),
      yOut1: getY(burnedConverted[i]),
      yOut2: getY(burnedConverted[i + 1]),
      isDeficit: avgNet <= 0,
    });
  }

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
      {/* Header + Inspection Pill */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Activity className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Příjem vs. výdej energie
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Zelená = příjem z jídel · Oranžová = celkový výdej · {loggedDaysCount}{" "}
            {loggedDaysCount === 1
              ? "kompletní den"
              : loggedDaysCount < 5
                ? "kompletní dny"
                : "kompletních dnů"}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-100 px-3 py-1.5 text-right text-xs tabular-nums dark:bg-slate-800/90">
          <div className="font-bold text-slate-900 dark:text-white">
            {formatShortDateCs(inspected.date)}:{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              {formatEnergyValue(inspected.intakeKcal, energyUnit)}
            </span>{" "}
            <span className="font-normal text-slate-400">vs.</span>{" "}
            <span className="text-amber-600 dark:text-amber-400">
              {formatEnergy(inspected.burnedTotalKcal, energyUnit)}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Rozdíl{" "}
            <strong
              className={
                inspected.netKcal <= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }
            >
              {formatEnergy(inspected.netKcal, energyUnit, { signed: true })}
            </strong>
            {inspected.burnedActivityKcal > 0 && (
              <span>
                {" "}
                · sport {formatEnergy(inspected.burnedActivityKcal, energyUnit)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Integrated Compact KPI Strip */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-slate-200/70 py-2.5 sm:grid-cols-3 dark:border-slate-800">
        <div>
          <div className="text-[11px] font-medium text-slate-400">
            Průměrný příjem / den
          </div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
            {avgIntakeKcal !== null ? formatEnergy(avgIntakeKcal, energyUnit) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-400">
            Průměrný výdej / den
          </div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
            {avgBurnedKcal !== null ? formatEnergy(avgBurnedKcal, energyUnit) : "—"}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="text-[11px] font-medium text-slate-400">
            Průměrný rozdíl / den
          </div>
          <div
            className={`mt-0.5 text-sm font-extrabold tabular-nums ${
              avgNetKcal !== null && avgNetKcal <= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {avgNetKcal !== null
              ? formatEnergy(avgNetKcal, energyUnit, { signed: true })
              : "—"}
          </div>
        </div>
      </div>

      {/* SVG Dual-Line Chart */}
      <div className="mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-52 w-full overflow-visible select-none"
          onMouseLeave={() => onSelectIndex(null)}
        >
          {/* Y-axis ticks & grid lines */}
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
                  className="fill-slate-400 text-[10px] font-medium tabular-nums"
                >
                  {tick.toLocaleString("cs-CZ")}
                </text>
              </g>
            );
          })}

          {/* Subtle shaded area between intake and expenditure on consecutive days */}
          {segments.map((seg) =>
            !seg.isGap ? (
              <polygon
                key={`fill-${seg.fromIdx}`}
                points={`${seg.x1.toFixed(1)},${seg.yOut1.toFixed(1)} ${seg.x2.toFixed(1)},${seg.yOut2.toFixed(1)} ${seg.x2.toFixed(1)},${seg.yIn2.toFixed(1)} ${seg.x1.toFixed(1)},${seg.yIn1.toFixed(1)}`}
                fill={seg.isDeficit ? "#10b981" : "#f59e0b"}
                opacity={seg.isDeficit ? "0.10" : "0.14"}
              />
            ) : null
          )}

          {/* Expenditure line segments (Amber) */}
          {segments.map((seg) => (
            <line
              key={`out-${seg.fromIdx}`}
              x1={seg.x1}
              y1={seg.yOut1}
              x2={seg.x2}
              y2={seg.yOut2}
              stroke="#f59e0b"
              strokeWidth={seg.isGap ? "1.5" : "2.5"}
              strokeLinecap="round"
              strokeDasharray={seg.isGap ? "3 4" : undefined}
              opacity={seg.isGap ? "0.45" : "1"}
            />
          ))}

          {/* Intake line segments (Emerald) */}
          {segments.map((seg) => (
            <line
              key={`in-${seg.fromIdx}`}
              x1={seg.x1}
              y1={seg.yIn1}
              x2={seg.x2}
              y2={seg.yIn2}
              stroke="#10b981"
              strokeWidth={seg.isGap ? "1.5" : "2.5"}
              strokeLinecap="round"
              strokeDasharray={seg.isGap ? "3 4" : undefined}
              opacity={seg.isGap ? "0.45" : "1"}
            />
          ))}

          {/* Interactive dots & crosshair */}
          {points.map((p, idx) => {
            const cx = getX(idx);
            const cyIn = getY(intakeConverted[idx]);
            const cyOut = getY(burnedConverted[idx]);
            const isSelected =
              activeIndex === idx ||
              (activeIndex === null && idx === points.length - 1);
            const dotR = isSelected ? 5 : points.length > 40 ? 2.5 : 3.5;

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
                  cy={cyOut}
                  r={dotR}
                  fill="#f59e0b"
                  stroke="white"
                  strokeWidth={points.length > 40 && !isSelected ? "1" : "2"}
                />
                <circle
                  cx={cx}
                  cy={cyIn}
                  r={dotR}
                  fill="#10b981"
                  stroke="white"
                  strokeWidth={points.length > 40 && !isSelected ? "1" : "2"}
                />
                <rect
                  x={cx - 12}
                  y={pad.top}
                  width={24}
                  height={PH}
                  fill="transparent"
                />
              </g>
            );
          })}

          {/* Dates on X axis */}
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

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Příjem ({energyUnit})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Výdej celkem ({energyUnit})
        </span>
        {hasGaps && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-slate-400" />
            Nezapsané dny
          </span>
        )}
      </div>
    </section>
  );
}
