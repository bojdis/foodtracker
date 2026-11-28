"use client";

import { useEffect, useRef } from "react";

/**
 * Integrates in-app overlays, lightboxes, modals, and secondary tabs with
 * the mobile PWA hardware/gesture Back button (`popstate`) and `Escape` key.
 *
 * When `isOpen` becomes true, pushes a synthetic history entry so pressing the
 * OS Back button closes the overlay instead of exiting the standalone PWA.
 * When closed via UI buttons (`← Zpět` / `X`), cleanly pops the synthetic entry.
 */
export function usePwaBackHandler(
  isOpen: boolean,
  onClose: () => void,
  layerKey: string
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const pushedRef = useRef(false);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    const currentState =
      window.history.state && typeof window.history.state === "object"
        ? (window.history.state as Record<string, unknown>)
        : {};

    window.history.pushState(
      { ...currentState, __pwaLayer: layerKey },
      ""
    );
    pushedRef.current = true;

    const handlePopState = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        onCloseRef.current();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    window.addEventListener("popstate", handlePopState);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("keydown", handleKeyDown);

      // If closed programmatically via UI button (not via popstate), pop the synthetic state
      if (pushedRef.current) {
        pushedRef.current = false;
        const stateObj = window.history.state as Record<string, unknown> | null;
        if (stateObj?.__pwaLayer === layerKey) {
          window.history.back();
        }
      }
    };
  }, [isOpen, layerKey]);
}
