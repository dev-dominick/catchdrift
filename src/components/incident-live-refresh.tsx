"use client";

import { useRouter } from "next/navigation";
import { useTimedRefresh } from "@/hooks/useTimedRefresh";

type IncidentLiveRefreshProps = {
  status: string;
};

const ACTIVE_STATUSES = new Set(["detected", "acknowledged", "investigating"]);

export function IncidentLiveRefresh({ status }: IncidentLiveRefreshProps) {
  const router = useRouter();

  useTimedRefresh(ACTIVE_STATUSES.has(status), () => {
    router.refresh();
  }, { intervalMs: 2000, timeoutMs: 90_000 });

  return null;
}
