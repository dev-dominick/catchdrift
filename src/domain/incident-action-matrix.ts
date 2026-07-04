export type IncidentStatus =
  | "detected"
  | "acknowledged"
  | "investigating"
  | "recovered"
  | "resolved"
  | "dismissed";

export type IncidentAction = "acknowledge" | "investigate" | "dismiss" | "resolve";

const ACTIONS_BY_STATUS: Record<IncidentStatus, IncidentAction[]> = {
  detected: ["investigate"],
  acknowledged: ["investigate"],
  investigating: [],
  recovered: ["resolve"],
  resolved: [],
  dismissed: [],
};

const UI_LABELS: Record<IncidentAction, string> = {
  acknowledge: "Acknowledge",
  investigate: "Start investigation",
  dismiss: "Dismiss incident",
  resolve: "Mark resolved",
};

export function normalizeIncidentStatus(status: string): IncidentStatus {
  const value = status.toLowerCase();
  if (
    value === "detected" ||
    value === "acknowledged" ||
    value === "investigating" ||
    value === "recovered" ||
    value === "resolved" ||
    value === "dismissed"
  ) {
    return value;
  }

  return "detected";
}

export function allowedIncidentActions(status: string): IncidentAction[] {
  const normalized = normalizeIncidentStatus(status);
  return ACTIONS_BY_STATUS[normalized];
}

export function isIncidentActionAllowed(status: string, action: IncidentAction): boolean {
  return allowedIncidentActions(status).includes(action);
}

export function uiActionsForIncidentStatus(status: string): Array<{ label: string; value: IncidentAction }> {
  return allowedIncidentActions(status).map((action) => ({
    label: UI_LABELS[action],
    value: action,
  }));
}
