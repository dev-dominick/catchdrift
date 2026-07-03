import { addMinutes } from "date-fns";
import { describe, expect, it } from "vitest";
import { deriveSourceFreshness } from "@/domain/freshness";

describe("source freshness derivation", () => {
  const now = new Date("2026-07-03T15:00:00.000Z");

  it("returns Fresh inside expected delay", () => {
    const result = deriveSourceFreshness(
      {
        source: "spend_feed",
        expectedDelayMinutes: 5,
        lastSuccessfulEventAt: addMinutes(now, -4),
        latestMatureIntervalEnd: addMinutes(now, -4),
        connectorState: "healthy",
      },
      now,
    );

    expect(result.state).toBe("fresh");
    expect(result.label).toBe("Fresh");
    expect(result.suppressesDecisions).toBe(false);
  });

  it("returns Stale after expected delay", () => {
    const result = deriveSourceFreshness(
      {
        source: "spend_feed",
        expectedDelayMinutes: 5,
        lastSuccessfulEventAt: addMinutes(now, -12),
        latestMatureIntervalEnd: addMinutes(now, -12),
        connectorState: "healthy",
      },
      now,
    );

    expect(result.state).toBe("stale");
    expect(result.label).toBe("Stale");
    expect(result.overdueMinutes).toBe(7);
    expect(result.suppressesDecisions).toBe(true);
  });

  it("treats boundary age as Fresh", () => {
    const result = deriveSourceFreshness(
      {
        source: "attribution",
        expectedDelayMinutes: 5,
        lastSuccessfulEventAt: addMinutes(now, -5),
        latestMatureIntervalEnd: addMinutes(now, -5),
        connectorState: "healthy",
      },
      now,
    );

    expect(result.state).toBe("fresh");
  });

  it("returns Connector unavailable when connector is failed", () => {
    const result = deriveSourceFreshness(
      {
        source: "attribution",
        expectedDelayMinutes: 5,
        lastSuccessfulEventAt: addMinutes(now, -2),
        latestMatureIntervalEnd: addMinutes(now, -2),
        connectorState: "failed",
      },
      now,
    );

    expect(result.state).toBe("connector_unavailable");
    expect(result.label).toBe("Connector unavailable");
    expect(result.suppressesDecisions).toBe(true);
  });

  it("returns Stale with missing timestamp", () => {
    const result = deriveSourceFreshness(
      {
        source: "revenue",
        expectedDelayMinutes: 20,
        lastSuccessfulEventAt: null,
        latestMatureIntervalEnd: null,
        connectorState: "healthy",
      },
      now,
    );

    expect(result.state).toBe("stale");
    expect(result.overdueMinutes).toBeNull();
    expect(result.suppressesDecisions).toBe(true);
  });

  it("returns Delayed when last event is late but mature interval is current", () => {
    const result = deriveSourceFreshness(
      {
        source: "revenue",
        expectedDelayMinutes: 20,
        lastSuccessfulEventAt: addMinutes(now, -25),
        latestMatureIntervalEnd: addMinutes(now, -15),
        connectorState: "healthy",
      },
      now,
    );

    expect(result.state).toBe("delayed");
    expect(result.label).toBe("Delayed");
    expect(result.suppressesDecisions).toBe(false);
  });

  it("supports different delay windows by source", () => {
    const telemetry = deriveSourceFreshness(
      {
        source: "landing_telemetry",
        expectedDelayMinutes: 2,
        lastSuccessfulEventAt: addMinutes(now, -3),
        latestMatureIntervalEnd: addMinutes(now, -3),
        connectorState: "healthy",
      },
      now,
    );

    const revenue = deriveSourceFreshness(
      {
        source: "revenue",
        expectedDelayMinutes: 20,
        lastSuccessfulEventAt: addMinutes(now, -3),
        latestMatureIntervalEnd: addMinutes(now, -3),
        connectorState: "healthy",
      },
      now,
    );

    expect(telemetry.state).toBe("stale");
    expect(revenue.state).toBe("fresh");
  });
});
