"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

interface MetricTooltipProps {
  /** Trigger content (label or value) */
  children: ReactNode;
  /** Bold heading inside tooltip */
  title: string;
  /** Main human-friendly explanation */
  description: string;
  /** Optional formula or concrete breakdown line */
  formula?: string;
  /** Horizontal alignment of popover relative to trigger */
  align?: "left" | "center" | "right";
  /** Show subtle question-mark icon next to trigger */
  showIcon?: boolean;
  /** Extra classes on wrapper */
  className?: string;
}

interface PopoverCoords {
  top: number;
  left: number;
  width: number;
}

export function MetricTooltip({
  children,
  title,
  description,
  formula,
  align = "left",
  showIcon = true,
  className = "",
}: MetricTooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, 90);
  }, [clearCloseTimer]);

  const updatePosition = useCallback(() => {
    const el = rootRef.current;
    if (!el || typeof window === "undefined") return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const desiredWidth = Math.min(288, vw - margin * 2);

    let left = rect.left;
    if (align === "right") {
      left = rect.right - desiredWidth;
    } else if (align === "center") {
      left = rect.left + rect.width / 2 - desiredWidth / 2;
    }
    left = Math.max(margin, Math.min(left, vw - desiredWidth - margin));

    const popHeight = popoverRef.current?.offsetHeight ?? 140;
    let top = rect.bottom + 8;
    if (top + popHeight > vh - margin && rect.top - popHeight - 8 > margin) {
      top = rect.top - popHeight - 8;
    }

    setCoords({ top, left, width: desiredWidth });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function handleViewportChange() {
      updatePosition();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  return (
    <span
      ref={rootRef}
      onMouseEnter={() => {
        clearCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      className={`relative inline-flex items-center ${className}`}
    >
      <span
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          clearCloseTimer();
          setOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            clearCloseTimer();
            setOpen((prev) => !prev);
          }
        }}
        className="inline-flex cursor-help items-center gap-1 decoration-slate-400/70 decoration-dotted underline-offset-3 hover:underline focus:outline-none"
      >
        <span>{children}</span>
        {showIcon && (
          <HelpCircle className="h-3 w-3 shrink-0 text-slate-400/90 transition hover:text-emerald-500 dark:text-slate-500" />
        )}
      </span>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            id={tooltipId}
            role="tooltip"
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            style={{
              position: "fixed",
              top: coords ? `${coords.top}px` : "-9999px",
              left: coords ? `${coords.left}px` : "-9999px",
              width: coords ? `${coords.width}px` : "288px",
            }}
            className="z-[9999] rounded-2xl border border-slate-200 bg-white p-3 text-left text-xs leading-relaxed font-normal normal-case tracking-normal text-slate-700 shadow-2xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:ring-white/10"
          >
            <div className="font-bold text-slate-900 dark:text-white">
              {title}
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              {description}
            </div>
            {formula && (
              <div className="mt-1.5 rounded-xl bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                {formula}
              </div>
            )}
          </div>,
          document.body
        )}
    </span>
  );
}
