import { NextRequest, NextResponse } from "next/server";
import { getIncident } from "@/domain/engine";
import { generateBuyerBrief, type BuyerBriefEvidencePayload } from "@/lib/buyer-brief";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ incidentId: string }> },
) {
  void request;
  const { incidentId } = await context.params;

  const data = await getIncident(incidentId);
  if (!data) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const baseline = asRecord(
    data.evidence.find((item) => String(item.evidence_type) === "baseline")?.evidence_json,
  );
  const metric = asRecord(
    data.evidence.find((item) => String(item.evidence_type) === "metric")?.evidence_json,
  );
  const deployment = asRecord(
    data.evidence.find((item) => String(item.evidence_type) === "deployment")?.evidence_json,
  );
  const threshold = asRecord(
    data.evidence.find((item) => String(item.evidence_type) === "threshold")?.evidence_json,
  );

  const metricCurrent = asRecord(metric.current);
  const deploymentCandidate = asRecord(deployment.candidate);
  const deploymentScore = asRecord(deployment.score);

  const payload: BuyerBriefEvidencePayload = {
    campaignName: String(data.incident.campaign_name),
    incidentStatus: String(data.incident.status),
    severity: String(data.incident.severity),
    confidence: String(data.incident.confidence),
    exposure: {
      lowMinor:
        data.incident.exposure_low_minor == null ? null : Number(data.incident.exposure_low_minor),
      highMinor:
        data.incident.exposure_high_minor == null ? null : Number(data.incident.exposure_high_minor),
      currency: String(data.incident.currency),
    },
    baseline:
      Object.keys(baseline).length === 0
        ? null
        : {
            hourlySpend: Number(baseline.hourlySpend),
            hourlyRevenue: Number(baseline.hourlyRevenue),
            attributionRatePct: Number(baseline.attributionRatePct),
            clickToSessionLossPct: Number(baseline.clickToSessionLossPct),
          },
    metric:
      Object.keys(metric).length === 0
        ? null
        : {
            current: {
              hourlySpend: Number(metricCurrent.hourlySpend),
              hourlyRevenue: Number(metricCurrent.hourlyRevenue),
              attributionRatePct: Number(metricCurrent.attributionRatePct),
              clickToSessionLossPct: Number(metricCurrent.clickToSessionLossPct),
              clickLossIncreasePoints: Number(metricCurrent.clickLossIncreasePoints),
              attributionDeclinePercent: Number(metricCurrent.attributionDeclinePercent),
            },
            degradedStreakCount: Number(metric.degradedStreakCount),
            evaluationWindowStart: String(metric.evaluationWindowStart),
            evaluationWindowEnd: String(metric.evaluationWindowEnd),
          },
    deployment:
      Object.keys(deployment).length === 0
        ? null
        : {
            version: deploymentCandidate.version ? String(deploymentCandidate.version) : null,
            deployedAt: deploymentCandidate.deployed_at ? String(deploymentCandidate.deployed_at) : null,
            scoreBand: deploymentScore.band ? String(deploymentScore.band) : null,
            scoreTotal:
              deploymentScore.total == null ? null : Number(deploymentScore.total),
            changedPaths: Array.isArray(deploymentCandidate.changes_json)
              ? deploymentCandidate.changes_json
                  .map((change) => asRecord(change).path)
                  .filter((value): value is string => typeof value === "string")
              : [],
          },
    threshold:
      Object.keys(threshold).length === 0
        ? null
        : {
            clickLossIncreasePoints: Number(threshold.clickLossIncreasePoints),
            attributionDeclinePercent: Number(threshold.attributionDeclinePercent),
            persistenceIntervals: Number(threshold.persistenceIntervals),
          },
  };

  const brief = await generateBuyerBrief(payload);

  return NextResponse.json({
    brief,
    evidence: payload,
  });
}
