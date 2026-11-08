"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  LineChart,
  Loader2,
  PenSquare,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  ActivityIntensity,
  ActivityTemplateRow,
  BodyMeasurementRow,
  DailySummaryRow,
  EnergyUnit,
  LogEntryWithItems,
  MealTemplateRow,
  UserProfileRow,
} from "@/lib/types";
import {
  formatEnergy,
  getTodayDateString,
  normalizeEnergyUnit,
  shiftDateString,
} from "@/lib/calculations";
import { computeWeightTrendSeries } from "@/lib/progress-stats";
import { safeFetchJson } from "@/lib/safe-fetch";
import { HeroCaptureCard } from "./HeroCaptureCard";
import { QuickCheckBar } from "./QuickCheckBar";
import { DailyBalanceCard } from "./DailyBalanceCard";
import { EntryFeed } from "./EntryFeed";
import { BodyProgressView } from "./BodyProgressView";
import { ProfileModal } from "./ProfileModal";

type ActiveTab = "log" | "progress";

interface TrackerAppProps {
  userId: string;
  userEmail?: string;
  initialProfile: UserProfileRow | null;
}

interface EntriesApiResponse {
  summary: DailySummaryRow;
  entries: LogEntryWithItems[];
  templates: MealTemplateRow[];
  activityTemplates?: ActivityTemplateRow[];
  dayMeasurement?: BodyMeasurementRow | null;
  recentMeasurements?: BodyMeasurementRow[];
  hasGeminiKey: boolean;
  geminiKeyStatus?: "valid" | "missing" | "invalid_format";
  error?: string;
}

function buildEmptySummary(
  userId: string,
  dateStr: string,
  baseExpenditureKcal: number
): DailySummaryRow {
  return {
    id: 0,
    user_id: userId,
    log_date: dateStr,
    intake_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    base_expenditure_kcal: baseExpenditureKcal,
    burned_activity_kcal: 0,
    burned_total_kcal: baseExpenditureKcal,
    net_kcal: -baseExpenditureKcal,
    entries_count: 0,
    pending_count: 0,
    updated_at: new Date().toISOString(),
  };
}

function formatCzechDateHeader(
  dateStr: string,
  todayStr: string
): { primary: string; secondary: string } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const shortDm = `${day}. ${month}.`;

  if (dateStr === todayStr) {
    return { primary: "Dnes", secondary: shortDm };
  }
  if (dateStr === shiftDateString(todayStr, -1)) {
    return { primary: "Včera", secondary: shortDm };
  }
  if (dateStr === shiftDateString(todayStr, 1)) {
    return { primary: "Zítra", secondary: shortDm };
  }

  const utcDate = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  const weekday = new Intl.DateTimeFormat("cs-CZ", {
    weekday: "short",
    timeZone: "UTC",
  }).format(utcDate);

  return {
    primary: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${shortDm}`,
    secondary: String(year),
  };
}

function formatNumCs(val: number): string {
  return val
    .toFixed(1)
    .replace(".", ",")
    .replace(/,0$/, "");
}

export function TrackerApp({
  userId,
  userEmail,
  initialProfile,
}: TrackerAppProps) {
  const [profile, setProfile] = useState<UserProfileRow | null>(initialProfile);
  const [energyUnit, setEnergyUnit] = useState<EnergyUnit>(() =>
    normalizeEnergyUnit(initialProfile?.energy_unit)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("log");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "progress") {
        setActiveTab("progress");
      }
    }
  }, []);

  const todayDate = useMemo(() => getTodayDateString(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayDate);
  const selectedDateRef = useRef<string>(selectedDate);
  selectedDateRef.current = selectedDate;

  const [summary, setSummary] = useState<DailySummaryRow>(() =>
    buildEmptySummary(
      userId,
      todayDate,
      initialProfile?.base_expenditure_kcal ?? 0
    )
  );
  const [entries, setEntries] = useState<LogEntryWithItems[]>([]);
  const [templates, setTemplates] = useState<MealTemplateRow[]>([]);
  const [activityTemplates, setActivityTemplates] = useState<
    ActivityTemplateRow[]
  >([]);
  const [dayMeasurement, setDayMeasurement] =
    useState<BodyMeasurementRow | null>(null);
  const [recentMeasurements, setRecentMeasurements] = useState<
    BodyMeasurementRow[]
  >([]);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);
  const [geminiKeyStatus, setGeminiKeyStatus] = useState<
    "valid" | "missing" | "invalid_format" | null
  >(null);
  const [dismissedGeminiBanner, setDismissedGeminiBanner] = useState(false);

  const [loadingDay, setLoadingDay] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingMeasurement, setSavingMeasurement] = useState(false);
  const [heroFeedback, setHeroFeedback] = useState<string | null>(null);
  const [progressRefreshSignal, setProgressRefreshSignal] = useState(0);
  const [compassCollapseSignal, setCompassCollapseSignal] = useState(0);

  const [togglingTemplateId, setTogglingTemplateId] = useState<number | null>(
    null
  );
  const [patchingTemplateId, setPatchingTemplateId] = useState<number | null>(
    null
  );
  const [deletingTemplateId, setDeletingTemplateId] = useState<number | null>(
    null
  );
  const [loggingActivityId, setLoggingActivityId] = useState<number | null>(
    null
  );
  const [patchingActivityId, setPatchingActivityId] = useState<number | null>(
    null
  );
  const [deletingActivityId, setDeletingActivityId] = useState<number | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTemporaryFeedback = useCallback((msg: string) => {
    setHeroFeedback(msg);
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = setTimeout(() => {
      setHeroFeedback(null);
    }, 4500);
  }, []);

  const fetchDayData = useCallback(
    async (dateToFetch: string, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoadingDay(true);
      }

      try {
        const res = await safeFetchJson<EntriesApiResponse>(
          `/api/entries?date=${encodeURIComponent(dateToFetch)}`,
          {
            cache: "no-store",
          }
        );

        if (!res.ok || !res.data) {
          if (!options?.silent) {
            setActionError(
              res.errorMessage ?? "Nepodařilo se načíst záznamy dne."
            );
          }
          return;
        }

        if (selectedDateRef.current !== dateToFetch) {
          return;
        }

        setSummary(res.data.summary);
        setEntries(res.data.entries);
        setTemplates(res.data.templates);
        setActivityTemplates(res.data.activityTemplates ?? []);
        setDayMeasurement(res.data.dayMeasurement ?? null);
        setRecentMeasurements(res.data.recentMeasurements ?? []);
        setHasGeminiKey(res.data.hasGeminiKey);
        setGeminiKeyStatus(
          res.data.geminiKeyStatus ??
            (res.data.hasGeminiKey ? "valid" : "missing")
        );
      } finally {
        if (!options?.silent && selectedDateRef.current === dateToFetch) {
          setLoadingDay(false);
        }
      }
    },
    []
  );

  // Initial & date-change fetch
  useEffect(() => {
    void fetchDayData(selectedDate);
  }, [selectedDate, fetchDayData]);

  // Supabase Realtime subscription — guarded against WebSocket Event rejections
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
      null;
    let supabase: ReturnType<typeof createClient> | null = null;

    const scheduleSilentRefresh = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        void fetchDayData(selectedDateRef.current, { silent: true });
      }, 250);
    };

    try {
      supabase = createClient();
      channel = supabase
        .channel(`foodtracker-realtime-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "log_entries",
            filter: `user_id=eq.${userId}`,
          },
          scheduleSilentRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "daily_summaries",
            filter: `user_id=eq.${userId}`,
          },
          scheduleSilentRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "meal_templates",
            filter: `user_id=eq.${userId}`,
          },
          scheduleSilentRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "activity_templates",
            filter: `user_id=eq.${userId}`,
          },
          scheduleSilentRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "body_measurements",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            scheduleSilentRefresh();
            setProgressRefreshSignal((n) => n + 1);
          }
        )
        .subscribe();
    } catch {
      // Realtime is strictly an enhancement; fallback polling handles pending AI jobs.
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
      if (supabase && channel) {
        supabase.removeChannel(channel).catch(() => {
          // Swallow WebSocket closing Event rejections during React StrictMode / page navigation
        });
      }
    };
  }, [userId, fetchDayData]);

  // Smart fallback poll every 2.5s ONLY while any entry is pending/processing
  const activePendingCount = useMemo(() => {
    const fromEntries = entries.filter(
      (entry) => entry.status === "pending" || entry.status === "processing"
    ).length;
    return Math.max(fromEntries, summary.pending_count);
  }, [entries, summary.pending_count]);

  useEffect(() => {
    if (activePendingCount <= 0) {
      return;
    }

    const intervalId = setInterval(() => {
      void fetchDayData(selectedDateRef.current, { silent: true });
    }, 2500);

    return () => {
      clearInterval(intervalId);
    };
  }, [activePendingCount, fetchDayData]);

  const { lastKnownWeightKg, lastKnownWaistCm, headerWeightDeltaKg } =
    useMemo(() => {
      const latestWithWeight = recentMeasurements.find(
        (m) => typeof m.weight_kg === "number"
      );
      const latestWithWaist = recentMeasurements.find(
        (m) => typeof m.waist_cm === "number"
      );
      const trend = computeWeightTrendSeries(recentMeasurements);

      return {
        lastKnownWeightKg:
          latestWithWeight?.weight_kg ?? profile?.weight_kg ?? null,
        lastKnownWaistCm: latestWithWaist?.waist_cm ?? null,
        headerWeightDeltaKg:
          trend.points.length >= 2 ? trend.deltaFromStartKg : null,
      };
    }, [recentMeasurements, profile?.weight_kg]);

  function applyUpdatedProfile(savedProfile: UserProfileRow) {
    setProfile(savedProfile);
    setEnergyUnit(normalizeEnergyUnit(savedProfile.energy_unit));
    setSummary((prev) => {
      const burnedTotal =
        savedProfile.base_expenditure_kcal + prev.burned_activity_kcal;
      return {
        ...prev,
        base_expenditure_kcal: savedProfile.base_expenditure_kcal,
        burned_total_kcal: burnedTotal,
        net_kcal: prev.intake_kcal - burnedTotal,
      };
    });
  }

  async function handleToggleEnergyUnit(nextUnit: EnergyUnit) {
    if (nextUnit === energyUnit) return;
    setEnergyUnit(nextUnit);
    setProfile((prev) => (prev ? { ...prev, energy_unit: nextUnit } : prev));

    if (profile) {
      const res = await safeFetchJson<{
        ok?: boolean;
        profile?: UserProfileRow | null;
      }>("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ energy_unit: nextUnit }),
      });
      if (res.ok && res.data?.profile) {
        setProfile(res.data.profile);
      }
    }
  }

  function handleSelectDate(nextDate: string) {
    setActionError(null);
    setHeroFeedback(null);
    setSelectedDate(nextDate);
    setSummary((prev) =>
      prev.log_date === nextDate
        ? prev
        : buildEmptySummary(
            userId,
            nextDate,
            profile?.base_expenditure_kcal ?? 0
          )
    );
  }

  async function handleCreateEntry(
    rawText: string,
    imagePayload?: { base64: string; mimeType: string }
  ): Promise<boolean> {
    setActionError(null);
    setSubmitting(true);

    try {
      const res = await safeFetchJson<{
        entry?: LogEntryWithItems | null;
        summary?: DailySummaryRow | null;
        measurementSaved?: BodyMeasurementRow | null;
        updatedProfile?: UserProfileRow | null;
        error?: string;
      }>("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_text: rawText,
          image_base64: imagePayload?.base64,
          image_mime_type: imagePayload?.mimeType,
          log_date: selectedDate,
        }),
      });

      if (!res.ok || !res.data) {
        setActionError(res.errorMessage ?? "Záznam se nepodařilo uložit.");
        return false;
      }

      if (res.data.updatedProfile) {
        applyUpdatedProfile(res.data.updatedProfile);
      }

      if (res.data.measurementSaved) {
        const m = res.data.measurementSaved;
        if (m.measured_date === selectedDate) {
          setDayMeasurement(m);
        }
        setProgressRefreshSignal((n) => n + 1);

        const parts: string[] = [];
        if (m.weight_kg !== null) {
          parts.push(`váha ${formatNumCs(m.weight_kg)} kg`);
        }
        if (m.waist_cm !== null) {
          parts.push(`pas ${formatNumCs(m.waist_cm)} cm`);
        }
        if (parts.length > 0) {
          showTemporaryFeedback(
            `Měření uloženo (${parts.join(" · ")}) — najdeš ho v záložce Progres.`
          );
        }
        void fetchDayData(selectedDate, { silent: true });
      }

      if (res.data.entry) {
        const created = res.data.entry;
        setEntries((prev) => [
          created,
          ...prev.filter((item) => item.id !== created.id),
        ]);

        if (created.status === "done") {
          if (res.data.summary) {
            setSummary(res.data.summary);
          } else {
            void fetchDayData(selectedDate, { silent: true });
          }
          showTemporaryFeedback(
            imagePayload
              ? "Štítek byl úspěšně analyzován a zapsán!"
              : "Záznam byl zapsán!"
          );
        } else {
          setSummary((prev) => ({
            ...prev,
            pending_count: prev.pending_count + 1,
          }));
        }
      }

      return true;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveQuickMeasurement(payload: {
    weight_kg: number | null;
    waist_cm: number | null;
  }): Promise<boolean> {
    setActionError(null);
    setSavingMeasurement(true);

    try {
      const res = await safeFetchJson<{
        measurement?: BodyMeasurementRow;
        updatedProfile?: UserProfileRow | null;
        error?: string;
      }>("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measured_date: selectedDate,
          weight_kg: payload.weight_kg ?? undefined,
          waist_cm: payload.waist_cm ?? undefined,
        }),
      });

      if (!res.ok || !res.data?.measurement) {
        setActionError(res.errorMessage ?? "Měření se nepodařilo uložit.");
        return false;
      }

      const m = res.data.measurement;
      setDayMeasurement(m);
      if (res.data.updatedProfile) {
        applyUpdatedProfile(res.data.updatedProfile);
      }

      const parts: string[] = [];
      if (m.weight_kg !== null) {
        parts.push(`${formatNumCs(m.weight_kg)} kg`);
      }
      if (m.waist_cm !== null) {
        parts.push(`pas ${formatNumCs(m.waist_cm)} cm`);
      }
      showTemporaryFeedback(`Uloženo: ${parts.join(" · ")}`);
      setProgressRefreshSignal((n) => n + 1);
      void fetchDayData(selectedDate, { silent: true });
      return true;
    } finally {
      setSavingMeasurement(false);
    }
  }

  async function handleQuickMealAction(
    template: MealTemplateRow,
    action: "add" | "remove_one"
  ) {
    setActionError(null);
    setTogglingTemplateId(template.id);
    const checked = action === "add";

    try {
      const res = await safeFetchJson<{
        ok?: boolean;
        entry?: LogEntryWithItems;
        removedEntryId?: number | null;
        summary?: DailySummaryRow;
        error?: string;
      }>("/api/entries/quick-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: template.id,
          log_date: selectedDate,
          checked,
        }),
      });

      if (!res.ok) {
        setActionError(res.errorMessage ?? "Změna rychlého záznamu selhala.");
        return;
      }

      if (action === "add" && res.data?.entry) {
        const created = res.data.entry;
        setEntries((prev) => [
          created,
          ...prev.filter((item) => item.id !== created.id),
        ]);
        showTemporaryFeedback(
          `Přidáno: ${template.canonical_name} (+${formatEnergy(template.avg_kcal, energyUnit)})`
        );
      } else if (action === "remove_one" && res.data?.removedEntryId) {
        const removedId = res.data.removedEntryId;
        setEntries((prev) => prev.filter((item) => item.id !== removedId));
        showTemporaryFeedback(`Odebrán 1× záznam: ${template.canonical_name}`);
      }

      if (res.data?.summary) {
        setSummary(res.data.summary);
      }

      void fetchDayData(selectedDate, { silent: true });
    } finally {
      setTogglingTemplateId(null);
    }
  }

  async function handlePatchTemplate(
    templateId: number,
    patch: { is_quick_check?: boolean; is_hidden?: boolean }
  ) {
    setActionError(null);
    setPatchingTemplateId(templateId);

    setTemplates((prev) =>
      prev
        .map((tpl) => (tpl.id === templateId ? { ...tpl, ...patch } : tpl))
        .filter((tpl) => !tpl.is_hidden)
    );

    try {
      const res = await safeFetchJson<{
        ok?: boolean;
        template?: MealTemplateRow;
        error?: string;
      }>(`/api/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        setActionError(res.errorMessage ?? "Úprava šablony se nezdařila.");
        await fetchDayData(selectedDate, { silent: true });
        return;
      }

      if (res.data?.template) {
        const updated = res.data.template;
        setTemplates((prev) =>
          updated.is_hidden
            ? prev.filter((tpl) => tpl.id !== updated.id)
            : prev.map((tpl) => (tpl.id === updated.id ? updated : tpl))
        );
      }
    } finally {
      setPatchingTemplateId(null);
    }
  }

  async function handleDeleteTemplate(templateId: number) {
    setActionError(null);
    setDeletingTemplateId(templateId);

    // Optimistically remove from list
    setTemplates((prev) => prev.filter((tpl) => tpl.id !== templateId));

    try {
      const res = await safeFetchJson<{ ok?: boolean; error?: string }>(
        `/api/templates/${templateId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        setActionError(
          res.errorMessage ?? "Oblíbené jídlo se nepodařilo smazat."
        );
        await fetchDayData(selectedDate, { silent: true });
      }
    } finally {
      setDeletingTemplateId(null);
    }
  }

  async function handleLogQuickActivity(payload: {
    activity_template_id: number;
    duration_minutes: number;
    intensity: ActivityIntensity;
  }): Promise<boolean> {
    setActionError(null);
    setLoggingActivityId(payload.activity_template_id);

    try {
      const res = await safeFetchJson<{
        ok?: boolean;
        entry?: LogEntryWithItems;
        summary?: DailySummaryRow;
        updatedTemplate?: ActivityTemplateRow | null;
        error?: string;
      }>("/api/entries/quick-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_template_id: payload.activity_template_id,
          log_date: selectedDate,
          duration_minutes: payload.duration_minutes,
          intensity: payload.intensity,
        }),
      });

      if (!res.ok || !res.data) {
        setActionError(res.errorMessage ?? "Aktivitu se nepodařilo zapsat.");
        return false;
      }

      if (res.data.entry) {
        const created = res.data.entry;
        setEntries((prev) => [
          created,
          ...prev.filter((item) => item.id !== created.id),
        ]);
      }

      if (res.data.summary) {
        setSummary(res.data.summary);
      }

      if (res.data.updatedTemplate) {
        const updated = res.data.updatedTemplate;
        setActivityTemplates((prev) =>
          prev.map((tpl) => (tpl.id === updated.id ? updated : tpl))
        );
      }

      const burnedLabel = res.data.entry
        ? ` (−${formatEnergy(res.data.entry.total_burned_kcal, energyUnit)})`
        : "";
      showTemporaryFeedback(
        `Pohyb zapsán: ${res.data.entry?.summary_title ?? "Aktivita"}${burnedLabel}`
      );
      void fetchDayData(selectedDate, { silent: true });
      return true;
    } finally {
      setLoggingActivityId(null);
    }
  }

  async function handlePatchActivityTemplate(
    activityTemplateId: number,
    patch: { is_quick_check?: boolean; is_hidden?: boolean }
  ) {
    setActionError(null);
    setPatchingActivityId(activityTemplateId);

    setActivityTemplates((prev) =>
      prev
        .map((tpl) =>
          tpl.id === activityTemplateId ? { ...tpl, ...patch } : tpl
        )
        .filter((tpl) => !tpl.is_hidden)
    );

    try {
      const res = await safeFetchJson<{
        ok?: boolean;
        activityTemplate?: ActivityTemplateRow;
        error?: string;
      }>(`/api/activity-templates/${activityTemplateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        setActionError(
          res.errorMessage ?? "Úprava šablony aktivity se nezdařila."
        );
        await fetchDayData(selectedDate, { silent: true });
        return;
      }

      if (res.data?.activityTemplate) {
        const updated = res.data.activityTemplate;
        setActivityTemplates((prev) =>
          updated.is_hidden
            ? prev.filter((tpl) => tpl.id !== updated.id)
            : prev.map((tpl) => (tpl.id === updated.id ? updated : tpl))
        );
      }
    } finally {
      setPatchingActivityId(null);
    }
  }

  async function handleDeleteActivityTemplate(activityTemplateId: number) {
    setActionError(null);
    setDeletingActivityId(activityTemplateId);

    setActivityTemplates((prev) =>
      prev.filter((tpl) => tpl.id !== activityTemplateId)
    );

    try {
      const res = await safeFetchJson<{ ok?: boolean; error?: string }>(
        `/api/activity-templates/${activityTemplateId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        setActionError(
          res.errorMessage ?? "Aktivitu se nepodařilo trvale smazat."
        );
        await fetchDayData(selectedDate, { silent: true });
      }
    } finally {
      setDeletingActivityId(null);
    }
  }

  async function handleDeleteEntry(entryId: number) {
    setActionError(null);
    setDeletingId(entryId);

    try {
      const res = await safeFetchJson<{
        ok?: boolean;
        summary?: DailySummaryRow;
        error?: string;
      }>(`/api/entries/${entryId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setActionError(res.errorMessage ?? "Záznam se nepodařilo smazat.");
        return;
      }

      setEntries((prev) => prev.filter((item) => item.id !== entryId));
      if (res.data?.summary) {
        setSummary(res.data.summary);
      } else {
        await fetchDayData(selectedDate, { silent: true });
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRetryEntry(entryId: number) {
    setActionError(null);
    setRetryingId(entryId);

    const nowIso = new Date().toISOString();
    setEntries((prev) =>
      prev.map((item) =>
        item.id === entryId
          ? {
              ...item,
              status: "pending",
              processed_at: nowIso,
              error_message: null,
            }
          : item
      )
    );

    try {
      const res = await safeFetchJson<{ ok?: boolean; error?: string }>(
        `/api/entries/${entryId}`,
        { method: "POST" }
      );

      if (!res.ok) {
        setActionError(res.errorMessage ?? "Opakování zpracování se nezdařilo.");
        await fetchDayData(selectedDate, { silent: true });
      }
    } finally {
      setRetryingId(null);
    }
  }

  function handleProfileSaved(savedProfile: UserProfileRow) {
    applyUpdatedProfile(savedProfile);
    void fetchDayData(selectedDate, { silent: true });
  }

  const dateHeader = formatCzechDateHeader(selectedDate, todayDate);
  const isToday = selectedDate === todayDate;

  return (
    <div className="min-h-dvh pb-12">
      {/* Sticky Top App Bar with Segmented View Switch + kJ/kcal Switch + Date Bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/90 pt-safe backdrop-blur-xl dark:border-slate-800/80 dark:bg-[#090d16]/90">
        <div className="mx-auto max-w-2xl px-3 py-2.5 sm:px-4">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            {/* Brand */}
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/20">
                <Flame className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
                  FoodTracker
                </h1>
                {profile && (
                  <div className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">
                    {profile.display_name} · {formatNumCs(profile.weight_kg)} kg
                  </div>
                )}
              </div>
            </div>

            {/* Center/Right Controls: Mode Switcher + kJ/kcal Toggle + Settings */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Segmented Mode Switcher: Zápis vs Progres */}
              <div className="inline-flex items-center rounded-2xl border border-slate-200/90 bg-white p-0.5 shadow-xs sm:p-1 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setActiveTab("log")}
                  className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition sm:px-3 ${
                    activeTab === "log"
                      ? "bg-emerald-500 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  }`}
                >
                  <PenSquare className="h-3.5 w-3.5" />
                  <span>Zápis</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("progress")}
                  className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition sm:px-3 ${
                    activeTab === "progress"
                      ? "bg-emerald-500 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  }`}
                >
                  <LineChart className="h-3.5 w-3.5" />
                  <span>Progres</span>
                  {headerWeightDeltaKg !== null && headerWeightDeltaKg !== 0 && (
                    <span
                      className={`hidden rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums md:inline-block ${
                        activeTab === "progress"
                          ? "bg-white/25 text-white"
                          : headerWeightDeltaKg < 0
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {headerWeightDeltaKg < 0
                        ? `−${formatNumCs(Math.abs(headerWeightDeltaKg))}`
                        : `+${formatNumCs(headerWeightDeltaKg)}`}{" "}
                      kg
                    </span>
                  )}
                </button>
              </div>

              {/* Quick 1-Click kJ / kcal Switcher */}
              <div
                role="group"
                aria-label="Jednotka energie"
                className="inline-flex items-center rounded-2xl border border-slate-200/90 bg-white p-0.5 text-[11px] font-extrabold shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => void handleToggleEnergyUnit("kj")}
                  className={`rounded-xl px-2 py-1.5 transition ${
                    energyUnit === "kj"
                      ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  kJ
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleEnergyUnit("kcal")}
                  className={`rounded-xl px-2 py-1.5 transition ${
                    energyUnit === "kcal"
                      ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  kcal
                </button>
              </div>

              {/* Settings Button */}
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Profil a cíle"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-100 active:scale-95 sm:px-2.5 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Settings className="h-4 w-4 text-emerald-500" />
                <span className="hidden sm:inline">Profil</span>
              </button>
            </div>
          </div>

          {/* Slim Date Switcher Row (shown in Daily Log mode) */}
          {activeTab === "log" && (
            <div className="mt-2 flex items-center justify-between border-t border-slate-200/60 pt-2 dark:border-slate-800/70">
              <button
                type="button"
                onClick={() =>
                  handleSelectDate(shiftDateString(selectedDate, -1))
                }
                aria-label="Předchozí den"
                className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/60 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Předchozí</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {dateHeader.primary}{" "}
                  <span className="font-medium text-slate-500 dark:text-slate-400">
                    ({dateHeader.secondary})
                  </span>
                </span>
                {loadingDay && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                )}
                {!isToday && (
                  <button
                    type="button"
                    onClick={() => handleSelectDate(todayDate)}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-500/25 dark:text-emerald-300"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Dnes
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  handleSelectDate(shiftDateString(selectedDate, 1))
                }
                aria-label="Další den"
                className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/60 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <span>Další</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-2xl space-y-3.5 px-3 pt-3.5 sm:px-4">
        {/* Action Error Banner */}
        {actionError && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-200">
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              {actionError}
            </span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label="Zavřít chybu"
              className="rounded-lg p-1 hover:bg-rose-500/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {activeTab === "log" ? (
          <>
            {/* #1 HUD KOMPAS NAHOŘE: Zbývá do cíle (úzký přehled nad zápisem) */}
            <DailyBalanceCard
              summary={summary}
              profile={profile}
              energyUnit={energyUnit}
              pendingCount={activePendingCount}
              collapseSignal={compassCollapseSignal}
              onOpenProgressTab={() => setActiveTab("progress")}
              onOpenProfileSettings={() => setSettingsOpen(true)}
            />

            {/* #2 RYCHLÝ ZÁPIS + INLINE MĚŘENÍ VÁHY/PASU */}
            <HeroCaptureCard
              selectedDateLabel={`${dateHeader.primary} (${dateHeader.secondary})`}
              isToday={isToday}
              submitting={submitting}
              savingMeasurement={savingMeasurement}
              dayMeasurement={dayMeasurement}
              lastKnownWeightKg={lastKnownWeightKg}
              lastKnownWaistCm={lastKnownWaistCm}
              feedbackBanner={heroFeedback}
              onDismissFeedback={() => setHeroFeedback(null)}
              onInputFocus={() => setCompassCollapseSignal((n) => n + 1)}
              onSubmitEntry={handleCreateEntry}
              onSaveMeasurement={handleSaveQuickMeasurement}
            />

            {/* #3 RYCHLÉ PŘIDÁNÍ JÍDEL A POHYBU (1-tap jídla + posuvník minut a intenzita sportů) */}
            <QuickCheckBar
              templates={templates}
              activityTemplates={activityTemplates}
              entries={entries}
              profile={profile}
              energyUnit={energyUnit}
              togglingTemplateId={togglingTemplateId}
              patchingTemplateId={patchingTemplateId}
              deletingTemplateId={deletingTemplateId}
              loggingActivityId={loggingActivityId}
              patchingActivityId={patchingActivityId}
              deletingActivityId={deletingActivityId}
              onQuickMealAction={handleQuickMealAction}
              onPatchTemplate={handlePatchTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onLogQuickActivity={handleLogQuickActivity}
              onPatchActivityTemplate={handlePatchActivityTemplate}
              onDeleteActivityTemplate={handleDeleteActivityTemplate}
            />

            {/* Gemini Key Fallback Info Banner */}
            {hasGeminiKey === false && !dismissedGeminiBanner && (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  {geminiKeyStatus === "invalid_format" ? (
                    <p className="leading-relaxed">
                      <strong className="font-semibold">
                        Neplatný formát GEMINI_API_KEY v{" "}
                        <code className="font-mono">.env.local</code>:
                      </strong>{" "}
                      Aktuálně je tam uloženo UUID místo klíče z Google AI Studia
                      (začíná na <code className="font-mono">AIza…</code>).
                      Zápisy mezitím bezpečně zpracovává lokální český parser;
                      po vložení klíče a restartu serveru je můžeš jedním klikem{" "}
                      <strong>Přepočítat AI</strong>.
                    </p>
                  ) : (
                    <p className="leading-relaxed">
                      <strong className="font-semibold">
                        Lokální český parser:
                      </strong>{" "}
                      Tvé osobní zkratky fungují naplno; pro AI rozbor
                      libovolných nových jídel doplň v{" "}
                      <code className="font-mono">.env.local</code> klíč{" "}
                      <code className="font-mono">GEMINI_API_KEY</code> (začíná
                      na <code className="font-mono">AIza…</code>).
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedGeminiBanner(true)}
                  aria-label="Skrýt upozornění"
                  className="rounded-lg p-1 text-amber-700/70 transition hover:bg-amber-500/20 hover:text-amber-900 dark:text-amber-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* #4 CHRONOLOGICAL ENTRY FEED */}
            <EntryFeed
              entries={entries}
              energyUnit={energyUnit}
              deletingId={deletingId}
              retryingId={retryingId}
              onDeleteEntry={handleDeleteEntry}
              onRetryEntry={handleRetryEntry}
            />
          </>
        ) : (
          <BodyProgressView
            profile={profile}
            energyUnit={energyUnit}
            todayDate={todayDate}
            refreshSignal={progressRefreshSignal}
            onProfileUpdated={handleProfileSaved}
            onMeasurementChanged={() => {
              void fetchDayData(selectedDate, { silent: true });
            }}
            onOpenProfileSettings={() => setSettingsOpen(true)}
          />
        )}
      </main>

      {/* First-Time Onboarding or Settings Modal */}
      <ProfileModal
        isOpen={profile === null || settingsOpen}
        initialProfile={profile}
        userEmail={userEmail}
        onSaved={handleProfileSaved}
        onClose={profile !== null ? () => setSettingsOpen(false) : undefined}
      />
    </div>
  );
}
