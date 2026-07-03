"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type IncidentLiveRefreshProps = {
  status: string;
};

const ACTIVE_STATUSES = new Set(["detected", "acknowledged", "investigating"]);

export function IncidentLiveRefresh({ status }: IncidentLiveRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!ACTIVE_STATUSES.has(status)) {
      return;
    }

    const refreshInterval = setInterval(() => {
      router.refresh();
    }, 2000);

    const stopTimer = setTimeout(() => {
      clearInterval(refreshInterval);
    }, 90_000);

    return () => {
      clearInterval(refreshInterval);
      clearTimeout(stopTimer);
    };
  }, [router, status]);

  return null;
}
