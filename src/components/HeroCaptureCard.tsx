"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Activity,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Heart,
  Loader2,
  Plus,
  Ruler,
  Scale,
  Sparkles,
  X,
} from "lucide-react";
import type { BodyMeasurementRow } from "@/lib/types";
import { getBloodPressureCategory } from "@/lib/types";
import { WaistMeasurementGuide } from "./WaistMeasurementGuide";
import { compressImageFile, type CompressedImageResult } from "@/lib/image-utils";

interface HeroCaptureCardProps {
  selectedDateLabel: string;
  isToday: boolean;
  submitting: boolean;
  savingMeasurement: boolean;
  dayMeasurement: BodyMeasurementRow | null;
  lastKnownWeightKg: number | null;
  lastKnownWaistCm: number | null;
  feedbackBanner: string | null;
  onDismissFeedback: () => void;
  onInputFocus?: () => void;
  onSubmitEntry: (
    rawText: string,
    imagePayload?: { base64: string; mimeType: string }
  ) => Promise<boolean>;
  onSaveMeasurement: (payload: {
    weight_kg: number | null;
    waist_cm: number | null;
    blood_pressure_sys?: number | null;
    blood_pressure_dia?: number | null;
    pulse_bpm?: number | null;
  }) => Promise<boolean>;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function formatNumCs(val: number): string {
  return val.toFixed(1).replace(".", ",").replace(/,0$/, "");
}

export function HeroCaptureCard({
  selectedDateLabel,
  isToday,
  submitting,
  savingMeasurement,
  dayMeasurement,
  lastKnownWeightKg,
  lastKnownWaistCm,
  feedbackBanner,
  onDismissFeedback,
  onInputFocus,
  onSubmitEntry,
  onSaveMeasurement,
}: HeroCaptureCardProps) {
  const [text, setText] = useState("");
  const [bodyDrawerOpen, setBodyDrawerOpen] = useState(false);
  const [selectedImage, setSelectedImage] =
    useState<CompressedImageResult | null>(null);
  const [imageCompressing, setImageCompressing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const defaultWeightStr =
    dayMeasurement?.weight_kg != null
      ? String(dayMeasurement.weight_kg)
      : lastKnownWeightKg != null
        ? String(lastKnownWeightKg)
        : "";

  const defaultWaistStr =
    dayMeasurement?.waist_cm != null ? String(dayMeasurement.waist_cm) : "";

  const [weightInput, setWeightInput] = useState<string>(defaultWeightStr);
  const [waistInput, setWaistInput] = useState<string>(defaultWaistStr);
  const [bpSysInput, setBpSysInput] = useState<string>(
    dayMeasurement?.blood_pressure_sys != null
      ? String(dayMeasurement.blood_pressure_sys)
      : ""
  );
  const [bpDiaInput, setBpDiaInput] = useState<string>(
    dayMeasurement?.blood_pressure_dia != null
      ? String(dayMeasurement.blood_pressure_dia)
      : ""
  );
  const [pulseInput, setPulseInput] = useState<string>(
    dayMeasurement?.pulse_bpm != null ? String(dayMeasurement.pulse_bpm) : ""
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync drawer inputs when selected day or recorded measurement changes
  useEffect(() => {
    setWeightInput(
      dayMeasurement?.weight_kg != null
        ? String(dayMeasurement.weight_kg)
        : lastKnownWeightKg != null
          ? String(lastKnownWeightKg)
          : ""
    );
    setWaistInput(
      dayMeasurement?.waist_cm != null ? String(dayMeasurement.waist_cm) : ""
    );
    setBpSysInput(
      dayMeasurement?.blood_pressure_sys != null
        ? String(dayMeasurement.blood_pressure_sys)
        : ""
    );
    setBpDiaInput(
      dayMeasurement?.blood_pressure_dia != null
        ? String(dayMeasurement.blood_pressure_dia)
        : ""
    );
    setPulseInput(
      dayMeasurement?.pulse_bpm != null ? String(dayMeasurement.pulse_bpm) : ""
    );
  }, [
    dayMeasurement?.id,
    dayMeasurement?.weight_kg,
    dayMeasurement?.waist_cm,
    dayMeasurement?.blood_pressure_sys,
    dayMeasurement?.blood_pressure_dia,
    dayMeasurement?.pulse_bpm,
    lastKnownWeightKg,
  ]);

  // Auto-focus on desktop / fine-pointer devices so user can type immediately upon opening
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: fine)").matches
    ) {
      textareaRef.current?.focus();
    }
  }, []);

  async function handleFileSelect(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageCompressing(true);
    setImageError(null);
    try {
      const result = await compressImageFile(file);
      setSelectedImage(result);
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : "Nepodařilo se zpracovat fotku."
      );
    } finally {
      setImageCompressing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function clearSelectedImage() {
    setSelectedImage(null);
    setImageError(null);
  }

  async function submitCurrentText() {
    const trimmed = text.trim();
    if (
      (trimmed.length < 2 && !selectedImage) ||
      submitting ||
      imageCompressing
    ) {
      return;
    }

    const ok = await onSubmitEntry(
      trimmed,
      selectedImage
        ? {
            base64: selectedImage.base64,
            mimeType: selectedImage.mimeType,
          }
        : undefined
    );
    if (ok) {
      setText("");
      setSelectedImage(null);
      setImageError(null);
    }
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCurrentText();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitCurrentText();
    }
  }

  function stepWeight(delta: number) {
    const current = Number.parseFloat(weightInput.replace(",", "."));
    const base =
      Number.isFinite(current) && current >= 30
        ? current
        : (lastKnownWeightKg ?? 90);
    const next = Math.min(260, Math.max(35, round1(base + delta)));
    setWeightInput(String(next));
  }

  function stepWaist(delta: number) {
    const current = Number.parseFloat(waistInput.replace(",", "."));
    const base =
      Number.isFinite(current) && current >= 40
        ? current
        : (lastKnownWaistCm ?? 95);
    const next = Math.min(190, Math.max(45, round1(base + delta)));
    setWaistInput(String(next));
  }

  function stepSys(delta: number) {
    const cur = parseInt(bpSysInput, 10);
    const base = Number.isFinite(cur) && cur >= 60 ? cur : 120;
    const next = Math.min(240, Math.max(70, base + delta));
    setBpSysInput(String(next));
  }

  function stepDia(delta: number) {
    const cur = parseInt(bpDiaInput, 10);
    const base = Number.isFinite(cur) && cur >= 40 ? cur : 80;
    const next = Math.min(150, Math.max(45, base + delta));
    setBpDiaInput(String(next));
  }

  function stepPulse(delta: number) {
    const cur = parseInt(pulseInput, 10);
    const base = Number.isFinite(cur) && cur >= 35 ? cur : 70;
    const next = Math.min(200, Math.max(40, base + delta));
    setPulseInput(String(next));
  }

  const liveBpCategory = (() => {
    const sys = parseInt(bpSysInput, 10);
    const dia = parseInt(bpDiaInput, 10);
    if (
      Number.isFinite(sys) &&
      sys >= 60 &&
      sys <= 260 &&
      Number.isFinite(dia) &&
      dia >= 40 &&
      dia <= 160
    ) {
      return getBloodPressureCategory(sys, dia);
    }
    return null;
  })();

  async function handleMeasurementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedWeight = weightInput.trim()
      ? Number.parseFloat(weightInput.replace(",", "."))
      : null;
    const parsedWaist = waistInput.trim()
      ? Number.parseFloat(waistInput.replace(",", "."))
      : null;
    const parsedSys = bpSysInput.trim() ? parseInt(bpSysInput, 10) : null;
    const parsedDia = bpDiaInput.trim() ? parseInt(bpDiaInput, 10) : null;
    const parsedPulse = pulseInput.trim() ? parseInt(pulseInput, 10) : null;

    const validWeight =
      parsedWeight !== null &&
      Number.isFinite(parsedWeight) &&
      parsedWeight >= 35 &&
      parsedWeight <= 260
        ? round1(parsedWeight)
        : null;

    const validWaist =
      parsedWaist !== null &&
      Number.isFinite(parsedWaist) &&
      parsedWaist >= 45 &&
      parsedWaist <= 190
        ? round1(parsedWaist)
        : null;

    const validSys =
      parsedSys !== null &&
      Number.isFinite(parsedSys) &&
      parsedSys >= 60 &&
      parsedSys <= 260
        ? parsedSys
        : null;

    const validDia =
      parsedDia !== null &&
      Number.isFinite(parsedDia) &&
      parsedDia >= 40 &&
      parsedDia <= 160
        ? parsedDia
        : null;

    const validPulse =
      parsedPulse !== null &&
      Number.isFinite(parsedPulse) &&
      parsedPulse >= 35 &&
      parsedPulse <= 220
        ? parsedPulse
        : null;

    const hasBp = validSys !== null && validDia !== null;

    if (
      validWeight === null &&
      validWaist === null &&
      !hasBp &&
      validPulse === null
    ) {
      return;
    }

    const ok = await onSaveMeasurement({
      weight_kg: validWeight,
      waist_cm: validWaist,
      blood_pressure_sys: hasBp ? validSys : null,
      blood_pressure_dia: hasBp ? validDia : null,
      pulse_bpm: validPulse,
    });
    if (ok) {
      setBodyDrawerOpen(false);
    }
  }

  const hasTodayMeasurement =
    dayMeasurement !== null &&
    (dayMeasurement.weight_kg !== null ||
      dayMeasurement.waist_cm !== null ||
      dayMeasurement.blood_pressure_sys !== null);

  return (
    <section className="relative rounded-3xl border border-slate-200/90 bg-white/95 p-3.5 shadow-md shadow-slate-900/5 backdrop-blur-xl sm:p-4 dark:border-slate-800/90 dark:bg-slate-900/90">
      {!isToday && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
          <span>Zapisuješ do dne: {selectedDateLabel}</span>
        </div>
      )}

      {/* Main Capture Form */}
      <form onSubmit={handleFormSubmit}>
        {/* Hidden File / Camera Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Selected Image Thumbnail Preview Card */}
        {selectedImage && (
          <div className="mb-2.5 flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50/80 p-2.5 dark:border-emerald-500/25 dark:bg-emerald-950/30">
            <img
              src={selectedImage.dataUrl}
              alt="Náhled štítku"
              className="h-14 w-14 rounded-xl border border-emerald-500/40 object-cover shadow-sm"
            />
            <div className="min-w-0 flex-1 text-xs">
              <p className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-200">
                <Camera className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Fotka štítku / jídla připojena</span>
              </p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                Model vyčte přesné nutriční hodnoty přímo z etikety
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelectedImage}
              aria-label="Odebrat fotku"
              className="rounded-xl p-1.5 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500 dark:hover:bg-rose-500/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {imageError && (
          <div className="mb-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
            {imageError}
          </div>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={2}
            value={text}
            onFocus={onInputFocus}
            onChange={(e) => {
              setText(e.target.value);
              if (feedbackBanner) {
                onDismissFeedback();
              }
            }}
            onKeyDown={handleKeyDown}
            maxLength={600}
            aria-label="Zápis jídla, pohybu nebo váhy"
            placeholder={
              selectedImage
                ? "Volitelně doplň poznámku (např. „vypil jsem jen půlku“ nebo nech prázdné)…"
                : "Napiš co jsi snědl nebo dělal — např. „2 vejce, chléb“, „tlak 125/82 tep 70“, nebo vyfoť štítek / tlakoměr 📷…"
            }
            className="w-full resize-none rounded-2xl border-2 border-slate-200/90 bg-slate-50/90 px-3.5 py-2.5 text-base font-medium leading-snug text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/15 dark:border-slate-700/90 dark:bg-slate-950/80 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:bg-slate-950"
          />
        </div>

        {/* Bottom Bar inside Hero Card: Weight/Waist Toggle + Camera Button + Submit CTA */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={submitting || imageCompressing}
              onClick={() => fileInputRef.current?.click()}
              title="Vyfotit výživový štítek nebo displej tlakoměru/váhy"
              aria-label="Vyfotit výživový štítek nebo displej tlakoměru/váhy"
              className={`inline-flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-semibold transition active:scale-95 ${
                selectedImage
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:border-emerald-400 dark:text-emerald-200"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-500/40 hover:bg-emerald-500/5 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200"
              }`}
            >
              {imageCompressing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
              ) : (
                <Camera className="h-3.5 w-3.5 text-emerald-500" />
              )}
              <span>{selectedImage ? "Fotka připojena" : "Vyfotit štítek / tlak"}</span>
            </button>

            <button
              type="button"
              onClick={() => setBodyDrawerOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-semibold transition active:scale-95 ${
                bodyDrawerOpen
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:border-emerald-400 dark:text-emerald-200"
                  : hasTodayMeasurement
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-500/40 hover:bg-emerald-500/5 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200"
              }`}
            >
              <Scale className="h-3.5 w-3.5 text-emerald-500" />
              {hasTodayMeasurement ? (
                <span className="inline-flex items-center gap-1.5">
                  {dayMeasurement?.weight_kg != null && (
                    <span>{formatNumCs(dayMeasurement.weight_kg)} kg</span>
                  )}
                  {dayMeasurement?.weight_kg != null &&
                    dayMeasurement?.waist_cm != null && (
                      <span className="opacity-50">·</span>
                    )}
                  {dayMeasurement?.waist_cm != null && (
                    <span>{formatNumCs(dayMeasurement.waist_cm)} cm</span>
                  )}
                  {(dayMeasurement?.weight_kg != null ||
                    dayMeasurement?.waist_cm != null) &&
                    dayMeasurement?.blood_pressure_sys != null && (
                      <span className="opacity-50">·</span>
                    )}
                  {dayMeasurement?.blood_pressure_sys != null &&
                    dayMeasurement?.blood_pressure_dia != null && (
                      <span className="inline-flex items-center gap-1 font-bold">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor: getBloodPressureCategory(
                              dayMeasurement.blood_pressure_sys,
                              dayMeasurement.blood_pressure_dia
                            ).dotColor,
                          }}
                        />
                        {dayMeasurement.blood_pressure_sys}/
                        {dayMeasurement.blood_pressure_dia}
                      </span>
                    )}
                </span>
              ) : (
                <span>Míry a tlak</span>
              )}
              {bodyDrawerOpen ? (
                <ChevronUp className="h-3.5 w-3.5 opacity-70" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              )}
            </button>

            <span className="hidden text-[11px] text-slate-400 sm:inline dark:text-slate-500">
              Enter = odeslat
            </span>
          </div>

          <button
            type="submit"
            disabled={
              submitting ||
              imageCompressing ||
              (!selectedImage && text.trim().length < 2)
            }
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-teal-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{selectedImage ? "Analyzuji štítek…" : "Ukládám…"}</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 stroke-[2.75]" />
                <span>Zapsat</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Instant Confirmation Toast (e.g. after saving weight/waist) */}
      {feedbackBanner && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/12 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 shrink-0 text-emerald-500 stroke-[2.5]" />
            {feedbackBanner}
          </span>
          <button
            type="button"
            onClick={onDismissFeedback}
            className="text-[11px] font-bold opacity-75 hover:opacity-100"
          >
            OK
          </button>
        </div>
      )}

      {/* Expandable Inline Weight & Waist Quick-Stepper Drawer */}
      {bodyDrawerOpen && (
        <form
          onSubmit={handleMeasurementSubmit}
          className="mt-3.5 space-y-3 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-950/70"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Weight Stepper */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="hero-weight-input"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  <Scale className="h-3.5 w-3.5 text-emerald-500" />
                  Váha (kg)
                </label>
                {lastKnownWeightKg !== null && (
                  <span className="text-[11px] text-slate-400">
                    minule {formatNumCs(lastKnownWeightKg)} kg
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input
                  id="hero-weight-input"
                  type="text"
                  inputMode="decimal"
                  placeholder={
                    lastKnownWeightKg ? formatNumCs(lastKnownWeightKg) : "99,5"
                  }
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-base font-extrabold tabular-nums text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <div className="grid flex-1 grid-cols-4 gap-1">
                  {[-0.5, -0.1, 0.1, 0.5].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => stepWeight(delta)}
                      className="rounded-xl border border-slate-200/80 bg-slate-100/80 py-2 text-xs font-bold tabular-nums text-slate-700 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {delta > 0
                        ? `+${String(delta).replace(".", ",")}`
                        : String(delta).replace(".", ",")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Waist Stepper (Optional so yesterday's waist isn't accidentally duplicated) */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="hero-waist-input"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  <Ruler className="h-3.5 w-3.5 text-violet-500" />
                  Obvod pasu (cm)
                  <span className="font-normal text-slate-400">volitelné</span>
                </label>
                {lastKnownWaistCm !== null && !waistInput && (
                  <button
                    type="button"
                    onClick={() => setWaistInput(String(lastKnownWaistCm))}
                    className="text-[11px] font-semibold text-violet-600 hover:underline dark:text-violet-400"
                  >
                    minule {formatNumCs(lastKnownWaistCm)} cm
                  </button>
                )}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input
                  id="hero-waist-input"
                  type="text"
                  inputMode="decimal"
                  placeholder={
                    lastKnownWaistCm
                      ? `např. ${formatNumCs(lastKnownWaistCm)}`
                      : "např. 96"
                  }
                  value={waistInput}
                  onChange={(e) => setWaistInput(e.target.value)}
                  className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-base font-extrabold tabular-nums text-slate-900 placeholder:text-xs placeholder:font-normal outline-none focus:border-violet-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <div className="grid flex-1 grid-cols-4 gap-1">
                  {[-1, -0.5, 0.5, 1].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => stepWaist(delta)}
                      className="rounded-xl border border-slate-200/80 bg-slate-100/80 py-2 text-xs font-bold tabular-nums text-slate-700 transition hover:border-violet-500/40 hover:bg-violet-500/10 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {delta > 0
                        ? `+${String(delta).replace(".", ",")}`
                        : String(delta).replace(".", ",")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Blood Pressure & Pulse Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:col-span-2 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <Heart className="h-3.5 w-3.5 text-rose-500" />
                  Krevní tlak a tep
                  <span className="font-normal text-slate-400">volitelné</span>
                </label>
                {liveBpCategory && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${liveBpCategory.badgeClass}`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: liveBpCategory.dotColor }}
                    />
                    {liveBpCategory.label}
                  </span>
                )}
              </div>

              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Tlak SYS / DIA (mmHg)
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="120"
                      value={bpSysInput}
                      onChange={(e) => setBpSysInput(e.target.value)}
                      className="w-16 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-center text-sm font-extrabold tabular-nums text-slate-900 outline-none focus:border-rose-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <span className="text-base font-bold text-slate-400">/</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="80"
                      value={bpDiaInput}
                      onChange={(e) => setBpDiaInput(e.target.value)}
                      className="w-16 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-center text-sm font-extrabold tabular-nums text-slate-900 outline-none focus:border-rose-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <div className="flex gap-1">
                      {[-5, 5].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            stepSys(d);
                            stepDia(Math.sign(d) * (Math.abs(d) === 5 ? 3 : 5));
                          }}
                          className="rounded-xl border border-slate-200/80 bg-slate-100/80 px-2 py-1.5 text-xs font-bold tabular-nums text-slate-700 transition hover:border-rose-500/40 hover:bg-rose-500/10 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {d > 0 ? `+${d}` : d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Tepová frekvence (bpm)
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="např. 70"
                      value={pulseInput}
                      onChange={(e) => setPulseInput(e.target.value)}
                      className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-center text-sm font-extrabold tabular-nums text-slate-900 outline-none focus:border-rose-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <div className="flex gap-1">
                      {[-5, 5].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => stepPulse(d)}
                          className="rounded-xl border border-slate-200/80 bg-slate-100/80 px-2 py-1.5 text-xs font-bold tabular-nums text-slate-700 transition hover:border-rose-500/40 hover:bg-rose-500/10 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {d > 0 ? `+${d}` : d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <WaistMeasurementGuide />

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Při změně váhy se automaticky přepočítá tvé BMR i cíle maker.
            </span>
            <button
              type="submit"
              disabled={
                savingMeasurement ||
                (!weightInput.trim() &&
                  !waistInput.trim() &&
                  (!bpSysInput.trim() || !bpDiaInput.trim()) &&
                  !pulseInput.trim())
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
            >
              {savingMeasurement ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              )}
              Uložit měření
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
