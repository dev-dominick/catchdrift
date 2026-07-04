import { describe, expect, it } from "vitest";
import { allowedIncidentActions, isIncidentActionAllowed } from "@/domain/incident-action-matrix";

describe("incident action matrix", () => {
  it("allows investigation for detected and acknowledged states", () => {
    expect(allowedIncidentActions("detected")).toEqual(["investigate"]);
    expect(allowedIncidentActions("acknowledged")).toEqual(["investigate"]);
    expect(isIncidentActionAllowed("detected", "investigate")).toBe(true);
  });

  it("allows resolve only after recovery is verified", () => {
    expect(allowedIncidentActions("investigating")).toEqual([]);
    expect(allowedIncidentActions("recovered")).toEqual(["resolve"]);
    expect(isIncidentActionAllowed("investigating", "resolve")).toBe(false);
    expect(isIncidentActionAllowed("recovered", "resolve")).toBe(true);
  });

  it("keeps resolved and dismissed states read-only", () => {
    expect(allowedIncidentActions("resolved")).toEqual([]);
    expect(allowedIncidentActions("dismissed")).toEqual([]);
    expect(isIncidentActionAllowed("resolved", "resolve")).toBe(false);
    expect(isIncidentActionAllowed("dismissed", "investigate")).toBe(false);
  });
});
