"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CircleHelp, Ruler } from "lucide-react";

interface WaistMeasurementGuideProps {
  compact?: boolean;
}

export function WaistMeasurementGuide({
  compact = false,
}: WaistMeasurementGuideProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-xl text-left font-semibold text-violet-700 transition hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200 ${
          compact
            ? "px-1.5 py-0.5 text-[11px] hover:bg-violet-500/10"
            : "border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-xs hover:bg-violet-500/15"
        }`}
      >
        <CircleHelp className="h-3.5 w-3.5 shrink-0 text-violet-500" />
        <span>Kde a jak správně měřit pas?</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 opacity-75" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 opacity-75" />
        )}
      </button>

      {open && (
        <div className="mt-2.5 rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-3.5 text-xs text-slate-700 dark:border-violet-500/20 dark:bg-violet-950/25 dark:text-slate-200">
          <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center">
            {/* Minimalist Anatomical Torso Diagram */}
            <div className="mx-auto flex shrink-0 flex-col items-center rounded-2xl border border-violet-500/20 bg-white/90 px-3 py-2.5 shadow-2xs sm:mx-0 dark:border-slate-800 dark:bg-slate-900/90">
              <svg
                viewBox="0 0 150 156"
                className="h-32 w-32 text-slate-500 dark:text-slate-400"
                role="img"
                aria-label="Nákres měření obvodu pasu mezi žebry a kyčelní kostí v úrovni pupíku"
              >
                {/* Torso silhouette */}
                <path
                  d="M40 16 C35 38, 43 60, 46 82 C48 98, 41 118, 39 142"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M110 16 C115 38, 107 60, 104 82 C102 98, 109 118, 111 142"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Lower ribcage arch */}
                <path
                  d="M50 56 Q75 40 100 56"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeDasharray="3 3"
                  opacity="0.7"
                />
                <text
                  x="75"
                  y="36"
                  textAnchor="middle"
                  className="fill-slate-400 text-[8.5px] font-semibold dark:fill-slate-500"
                >
                  spodní žebra
                </text>

                {/* Iliac crest / hip bones */}
                <path
                  d="M45 106 Q56 114 63 116"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeDasharray="3 3"
                  opacity="0.7"
                />
                <path
                  d="M105 106 Q94 114 87 116"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeDasharray="3 3"
                  opacity="0.7"
                />
                <text
                  x="75"
                  y="130"
                  textAnchor="middle"
                  className="fill-slate-400 text-[8.5px] font-semibold dark:fill-slate-500"
                >
                  kyčelní kost (pásek kalhot = moc nízko)
                </text>

                {/* Horizontal Measuring Tape across Midpoint / Navel */}
                <rect
                  x="42"
                  y="78"
                  width="66"
                  height="9"
                  rx="4"
                  className="fill-violet-500/20 stroke-violet-600 dark:fill-violet-400/25 dark:stroke-violet-400"
                  strokeWidth="2"
                />
                {/* Tape tick marks */}
                {[50, 58, 66, 74, 82, 90, 98].map((x) => (
                  <line
                    key={x}
                    x1={x}
                    y1="78.5"
                    x2={x}
                    y2="82.5"
                    className="stroke-violet-600 dark:stroke-violet-300"
                    strokeWidth="1.2"
                  />
                ))}

                {/* Navel (pupík) */}
                <circle
                  cx="75"
                  cy="85"
                  r="2.4"
                  className="fill-violet-700 dark:fill-violet-300"
                />
                <text
                  x="75"
                  y="73"
                  textAnchor="middle"
                  className="fill-violet-700 text-[9px] font-extrabold dark:fill-violet-300"
                >
                  MĚŘ ZDE (přes pupík)
                </text>
              </svg>
            </div>

            {/* Step-by-step instructions */}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-1.5 font-extrabold text-violet-900 dark:text-violet-200">
                <Ruler className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                <span>4 pravidla pro přesné a porovnatelné měření</span>
              </div>

              <ol className="space-y-1.5 leading-relaxed text-slate-700 dark:text-slate-300">
                <li>
                  <strong className="font-bold text-slate-900 dark:text-white">
                    1. Kde přiložit metr:
                  </strong>{" "}
                  V polovině mezi spodním okrajem posledního žebra a horní hranou
                  kyčelní kosti — u většiny mužů to vychází{" "}
                  <strong className="font-semibold text-violet-700 dark:text-violet-300">
                    vodorovně přímo přes pupík
                  </strong>{" "}
                  (neměř nízko v místě pásku kalhot pod břichem). Hlavní je měřit{" "}
                  <strong>pokaždé na stejném bodě</strong>.
                </li>
                <li>
                  <strong className="font-bold text-slate-900 dark:text-white">
                    2. Kdy měřit:
                  </strong>{" "}
                  <strong>Ráno nalačno</strong> po toaletě a před snídaní — večer
                  bývá břicho přirozeně o 2–4 cm větší kvůli jídlu a vodě.
                </li>
                <li>
                  <strong className="font-bold text-slate-900 dark:text-white">
                    3. Postoj a dech:
                  </strong>{" "}
                  Stůj rovně s chodidly u sebe, břicho uvolni (nezatahuj ani
                  nevytlačuj) a číslo odečti{" "}
                  <strong>na konci klidného normálního výdechu</strong>.
                </li>
                <li>
                  <strong className="font-bold text-slate-900 dark:text-white">
                    4. Přítlak metru:
                  </strong>{" "}
                  Měř na holé kůži, zkontroluj v zrcadle, že je metr vodorovně i
                  na zádech, a přilož ho hladce <strong>bez zařezávání</strong>.
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
