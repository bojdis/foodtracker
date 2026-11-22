"use client";

import { ArrowRight, Heart, Sparkles } from "lucide-react";
import { getBloodPressureCategory } from "@/lib/types";
import type { BloodPressureStatsSummary } from "@/lib/progress-stats";
import { daysBetweenUtc, formatShortDateCs } from "./chart-utils";

interface BloodPressureChartCardProps {
  stats: BloodPressureStatsSummary;
  activeIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
  onOpenLogTab: () => void;
}

export function BloodPressureChartCard({
  stats,
  activeIndex,
  onSelectIndex,
  onOpenLogTab,
}: BloodPressureChartCardProps) {
  const { points } = stats;

  if (points.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300/80 bg-white/70 p-5 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <Heart className="mx-auto h-6 w-6 text-rose-500" />
        <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
          Krevní tlak a puls
        </h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
          Zapiš své první měření tlaku (textem „tlak 125/82 tep 70“, fotkou tlakoměru nebo přes tlačítko Míry a tlak).
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-800 dark:text-emerald-200">
            &lt; 120/80 Optimální
          </span>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
            120–129 / 80–84 Normální
          </span>
          <span className="rounded-full bg-yellow-500/15 px-2.5 py-0.5 font-bold text-yellow-800 dark:text-yellow-200">
            130–139 / 85–89 Vyšší normální
          </span>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 font-bold text-amber-800 dark:text-amber-200">
            ≥ 140/90 Hypertenze
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenLogTab}
          className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-500/20 dark:text-rose-300"
        >
          <span>Zapsat tlak na stránce Zápis</span>
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

  const sysVals = points.map((p) => p.sys);
  const diaVals = points.map((p) => p.dia);
  const rawMin = Math.min(...diaVals);
  const rawMax = Math.max(...sysVals);

  const minBase = Math.min(rawMin, 70);
  const maxBase = Math.max(rawMax, 135);
  const spread = Math.max(20, maxBase - minBase);
  const minY = Math.floor(minBase - spread * 0.15);
  const maxY = Math.ceil(maxBase + spread * 0.15);
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

  const sysLinePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.sys).toFixed(1)}`
    )
    .join(" ");

  const diaLinePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.dia).toFixed(1)}`
    )
    .join(" ");

  const inspected =
    activeIndex !== null && points[activeIndex]
      ? points[activeIndex]
      : points[points.length - 1];

  const inspectedCategory = getBloodPressureCategory(
    inspected.sys,
    inspected.dia
  );

  const yTicks = [
    Math.round(minY / 10) * 10,
    80,
    120,
    140,
    Math.round(maxY / 10) * 10,
  ].filter((v, i, arr) => v >= minY && v <= maxY && arr.indexOf(v) === i);

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
      {/* Header + Inspection Pill */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <Heart className="h-3.5 w-3.5 fill-rose-500/20" />
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Krevní tlak a puls
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Červená = SYS · Fialová = DIA · Zelené pásmo = optimální (&lt; 120/80)
          </p>
        </div>

        <div className="rounded-2xl bg-slate-100 px-3 py-1.5 text-right text-xs tabular-nums dark:bg-slate-800/90">
          <div className="flex items-center justify-end gap-1.5 font-bold text-slate-900 dark:text-white">
            <span>{formatShortDateCs(inspected.date)}:</span>
            <span className="font-extrabold text-rose-600 dark:text-rose-400">
              {inspected.sys}
            </span>
            <span className="text-slate-400">/</span>
            <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
              {inspected.dia}
            </span>
            <span className="text-[11px] font-normal text-slate-400">mmHg</span>
            {inspected.pulse !== null && (
              <span className="ml-1 font-semibold text-slate-500 dark:text-slate-400">
                · {inspected.pulse} bpm
              </span>
            )}
          </div>
          <div className="mt-0.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${inspectedCategory.badgeClass}`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: inspectedCategory.dotColor }}
              />
              {inspectedCategory.label}
            </span>
          </div>
        </div>
      </div>

      {/* Harmonized Compact KPI Strip */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-slate-200/70 py-2.5 sm:grid-cols-4 dark:border-slate-800">
        <div>
          <div className="text-[11px] font-medium text-slate-400">Poslední</div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
            {stats.latestSys}/{stats.latestDia}{" "}
            <span className="text-[10px] font-normal text-slate-400">mmHg</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-400">7d průměr</div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
            {stats.avg7dSys}/{stats.avg7dDia}{" "}
            <span className="text-[10px] font-normal text-slate-400">mmHg</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-400">Tep (7d)</div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
            {stats.avg7dPulse !== null ? `${stats.avg7dPulse} bpm` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-400">
            Změna od startu
          </div>
          <div className="mt-0.5 text-xs font-bold tabular-nums text-slate-800 dark:text-slate-200">
            {stats.deltaFromStartSys !== null ? (
              <span>
                SYS {stats.deltaFromStartSys <= 0 ? "" : "+"}
                {stats.deltaFromStartSys} · DIA{" "}
                {stats.deltaFromStartDia !== null && stats.deltaFromStartDia <= 0
                  ? ""
                  : "+"}
                {stats.deltaFromStartDia}
              </span>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>

      {/* Weight correlation insight */}
      {stats.weightCorrelationInsight && (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-950 dark:text-emerald-200">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="leading-relaxed">{stats.weightCorrelationInsight}</p>
        </div>
      )}

      {/* SVG Chart */}
      <div className="mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-52 w-full overflow-visible select-none"
          onMouseLeave={() => onSelectIndex(null)}
        >
          {/* Optimal Healthy Shaded Band (< 120 / < 80) */}
          {minY < 120 && (
            <rect
              x={pad.left}
              y={getY(Math.min(120, maxY))}
              width={PW}
              height={Math.max(
                0,
                getY(Math.max(80, minY)) - getY(Math.min(120, maxY))
              )}
              fill="#10b981"
              opacity="0.08"
            />
          )}

          {/* Reference Line for Hypertension SYS = 140 */}
          {maxY >= 140 && minY <= 140 && (
            <g>
              <line
                x1={pad.left}
                y1={getY(140)}
                x2={W - pad.right}
                y2={getY(140)}
                stroke="#f43f5e"
                strokeWidth="1"
                strokeDasharray="4 3"
                opacity="0.6"
              />
              <text
                x={W - pad.right}
                y={getY(140) - 3}
                textAnchor="end"
                className="fill-rose-500 text-[9px] font-bold"
              >
                Hranice hypertenze (140)
              </text>
            </g>
          )}

          {/* Y ticks & grid lines */}
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
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Diastolic Line (Indigo) */}
          {points.length >= 2 && (
            <path
              d={diaLinePath}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Systolic Line (Rose) */}
          {points.length >= 2 && (
            <path
              d={sysLinePath}
              fill="none"
              stroke="#f43f5e"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive Dots & Crosshair */}
          {points.map((p, idx) => {
            const cx = getX(idx);
            const cySys = getY(p.sys);
            const cyDia = getY(p.dia);
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
                  cy={cySys}
                  r={isSelected ? 5.5 : 4}
                  fill="#f43f5e"
                  stroke="white"
                  strokeWidth="2"
                />
                <circle
                  cx={cx}
                  cy={cyDia}
                  r={isSelected ? 5.5 : 4}
                  fill="#6366f1"
                  stroke="white"
                  strokeWidth="2"
                />
                <circle
                  cx={cx}
                  cy={(cySys + cyDia) / 2}
                  r={18}
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
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          Systolický (SYS)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          Diastolický (DIA)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-emerald-500/20" />
          Optimální pásmo (&lt; 120/80)
        </span>
      </div>
    </section>
  );
}
