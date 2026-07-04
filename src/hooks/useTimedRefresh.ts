"use client";

import { useEffect, useEffectEvent } from "react";

type UseTimedRefreshOptions = {
  intervalMs: number;
  timeoutMs?: number;
};

export function useTimedRefresh(enabled: boolean, onRefresh: () => void, options: UseTimedRefreshOptions) {
  const { intervalMs, timeoutMs } = options;
  const handleRefresh = useEffectEvent(onRefresh);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refreshInterval = setInterval(() => {
      handleRefresh();
    }, intervalMs);

    const stopTimer =
      typeof timeoutMs === "number"
        ? setTimeout(() => {
            clearInterval(refreshInterval);
          }, timeoutMs)
        : null;

    return () => {
      clearInterval(refreshInterval);

      if (stopTimer !== null) {
        clearTimeout(stopTimer);
      }
    };
  }, [enabled, intervalMs, timeoutMs]);
}