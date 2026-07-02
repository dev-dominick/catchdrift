import type { ExposureResult } from "@/domain/types";

export function deriveSeverity(exposure: ExposureResult): "critical" | "high" | "medium" | "low" {
  if (exposure.high >= 200) {
    return "critical";
  }

  if (exposure.high >= 75) {
    return "high";
  }

  if (exposure.high > 0) {
    return "medium";
  }

  return "low";
}
