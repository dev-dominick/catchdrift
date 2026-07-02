import { differenceInMinutes } from "date-fns";
import { TRACKING_SENSITIVE_TERMS } from "@/lib/constants";
import type { CorrelationScore } from "@/domain/types";

export type DeploymentChange = {
  path: string;
  previousValue: string;
  nextValue: string;
};

export type DeploymentCandidate = {
  id: string;
  campaignId: string;
  deployedAt: Date;
  changes: DeploymentChange[];
};

export function hasTrackingSensitiveChange(changes: DeploymentChange[]): boolean {
  return changes.some((change) => {
    const normalized = `${change.path} ${change.previousValue} ${change.nextValue}`.toLowerCase();
    return TRACKING_SENSITIVE_TERMS.some((term) => normalized.includes(term));
  });
}

export function scoreDeploymentCandidate(params: {
  candidate: DeploymentCandidate;
  degradationStartedAt: Date;
  campaignMapped: boolean;
  campaignHealthyBefore: boolean;
  competingDeploymentsNearby: number;
}): CorrelationScore {
  const temporalDistance = Math.abs(
    differenceInMinutes(params.degradationStartedAt, params.candidate.deployedAt),
  );

  const components = {
    campaignMapped: params.campaignMapped ? 40 : 0,
    trackingSensitiveChanged: hasTrackingSensitiveChange(params.candidate.changes) ? 25 : 0,
    temporalProximity: temporalDistance <= 30 ? 20 : 0,
    healthyBeforeDeployment: params.campaignHealthyBefore ? 10 : 0,
    noCompetingDeployment: params.competingDeploymentsNearby === 0 ? 5 : 0,
  };

  const total =
    components.campaignMapped +
    components.trackingSensitiveChanged +
    components.temporalProximity +
    components.healthyBeforeDeployment +
    components.noCompetingDeployment;

  const band = total >= 80 ? "strong" : total >= 60 ? "plausible" : "weak";

  return { total, band, components };
}
