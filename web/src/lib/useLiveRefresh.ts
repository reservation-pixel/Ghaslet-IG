"use client";

import { useEffect, useRef } from "react";

/**
 * Periodically re-run a loader to keep the view fresh.
 *
 * This replaces Supabase Realtime. Plain Postgres has no equivalent push
 * channel a browser can subscribe to — reaching the database directly from the
 * client would mean exposing it to the internet — so the dashboard polls its
 * own authenticated API instead.
 *
 * Polling pauses while the tab is hidden and fires once immediately on return,
 * so a backgrounded dashboard costs nothing and is current the moment it is
 * looked at again.
 */
export function useLiveRefresh(load: () => void | Promise<void>, intervalMs = 10_000) {
  // Held in a ref so a caller passing an inline arrow doesn't restart the timer
  // on every render.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadRef.current();
    };

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(tick, intervalMs);
    };

    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadRef.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);
}
