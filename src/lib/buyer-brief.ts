import { z } from "zod";

const modelResponseSchema = z.object({
  summary: z.string().min(1),
  competingInterpretations: z.array(z.string().min(1)).min(1).max(3),
  prioritizedSteps: z.array(z.string().min(1)).min(3).max(6),
  caution: z.string().min(1),
});

export type BuyerBriefEvidencePayload = {
  campaignName: string;
  incidentStatus: string;
  severity: string;
  confidence: string;
  exposure: {
    lowMinor: number | null;
    highMinor: number | null;
    currency: string;
  };
  baseline: {
    hourlySpend: number;
    hourlyRevenue: number;
    attributionRatePct: number;
    clickToSessionLossPct: number;
  } | null;
  metric: {
    current: {
      hourlySpend: number;
      hourlyRevenue: number;
      attributionRatePct: number;
      clickToSessionLossPct: number;
      clickLossIncreasePoints: number;
      attributionDeclinePercent: number;
    };
    degradedStreakCount: number;
    evaluationWindowStart: string;
    evaluationWindowEnd: string;
  } | null;
  deployment: {
    version: string | null;
    deployedAt: string | null;
    scoreBand: string | null;
    scoreTotal: number | null;
    changedPaths: string[];
  } | null;
  threshold: {
    clickLossIncreasePoints: number;
    attributionDeclinePercent: number;
    persistenceIntervals: number;
  } | null;
};

export type BuyerBriefResult = {
  label: "AI-generated investigation brief" | "Deterministic investigation brief";
  mode: "ai" | "fallback";
  summary: string;
  competingInterpretations: string[];
  prioritizedSteps: string[];
  caution: string;
  reason?: string;
};

function fallbackBrief(evidence: BuyerBriefEvidencePayload, reason?: string): BuyerBriefResult {
  const deploymentVersion = evidence.deployment?.version ?? "the strongest correlated deployment";
  const attributionDecline = evidence.metric?.current.attributionDeclinePercent;

  return {
    label: "Deterministic investigation brief",
    mode: "fallback",
    summary:
      `Spend remains active while attribution performance declined after ${deploymentVersion}. ` +
      `Internal submissions remain near baseline, which reduces the likelihood of a full form outage.`,
    competingInterpretations: [
      "Tracking parameter forwarding or attribution payload integrity regressed after deployment.",
      "Attribution pipeline lag could contribute to lower attributed conversions despite stable submissions.",
    ],
    prioritizedSteps: [
      "Verify click-ID forwarding and campaign identifier propagation in redirect responses.",
      "Compare attribution payload fields before and after the correlated deployment.",
      "Validate attributed conversions against internal submissions and then apply rollback or fix if confirmed.",
    ],
    caution:
      `Deployment correlation is evidence-backed but not proof of causation${
        typeof attributionDecline === "number" ? `; observed attribution decline is ${attributionDecline.toFixed(1)}%.` : "."
      }`,
    reason,
  };
}

function extractJsonString(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }

  for (const part of content) {
    const parsed = z
      .object({
        type: z.string(),
        text: z.string().optional(),
      })
      .safeParse(part);

    if (!parsed.success) {
      continue;
    }

    if (parsed.data.type === "text" && parsed.data.text) {
      return parsed.data.text;
    }
  }

  return null;
}

export async function generateBuyerBrief(
  evidence: BuyerBriefEvidencePayload,
  options?: { timeoutMs?: number },
): Promise<BuyerBriefResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackBrief(evidence, "OPENAI_API_KEY missing");
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "buyer_brief",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                summary: { type: "string" },
                competingInterpretations: {
                  type: "array",
                  minItems: 1,
                  maxItems: 3,
                  items: { type: "string" },
                },
                prioritizedSteps: {
                  type: "array",
                  minItems: 3,
                  maxItems: 6,
                  items: { type: "string" },
                },
                caution: { type: "string" },
              },
              required: ["summary", "competingInterpretations", "prioritizedSteps", "caution"],
            },
          },
        },
        messages: [
          {
            role: "system",
            content:
              "Generate a concise incident investigation brief for a media buyer. Use only facts in the provided JSON evidence. Never claim causation. Never invent values, systems, or actions not present in evidence. Return only JSON matching the schema.",
          },
          {
            role: "user",
            content: JSON.stringify(evidence),
          },
        ],
      }),
    });

    if (!response.ok) {
      return fallbackBrief(evidence, `Model request failed (${response.status})`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    let jsonText: string | null = null;
    if (typeof content === "string") {
      jsonText = content;
    } else {
      jsonText = extractJsonString(content);
    }

    if (!jsonText) {
      return fallbackBrief(evidence, "Model output missing JSON content");
    }

    const parsed = modelResponseSchema.safeParse(JSON.parse(jsonText));
    if (!parsed.success) {
      return fallbackBrief(evidence, "Model output failed schema validation");
    }

    return {
      label: "AI-generated investigation brief",
      mode: "ai",
      ...parsed.data,
    };
  } catch {
    return fallbackBrief(evidence, "Model request timed out or failed");
  } finally {
    clearTimeout(timeoutId);
  }
}
