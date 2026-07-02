import { describe, expect, it } from "vitest";
import { scoreDeploymentCandidate } from "@/domain/correlation";

describe("deployment correlation scoring", () => {
  it("scores strong candidate when all components match", () => {
    const now = new Date();

    const result = scoreDeploymentCandidate({
      candidate: {
        id: "dep-1",
        campaignId: "campaign-1",
        deployedAt: now,
        changes: [
          {
            path: "redirectUrl",
            previousValue: "/apply?click_id={{click_id}}",
            nextValue: "/apply",
          },
        ],
      },
      degradationStartedAt: new Date(now.getTime() + 10 * 60_000),
      campaignMapped: true,
      campaignHealthyBefore: true,
      competingDeploymentsNearby: 0,
    });

    expect(result.total).toBe(100);
    expect(result.band).toBe("strong");
  });
});
