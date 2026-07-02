import { z } from "zod";
import { METRICS } from "@/domain/types";

export const metricIngestSchema = z.object({
  source: z.string().min(1),
  externalCampaignId: z.string().min(1),
  metric: z.enum(METRICS),
  value: z.union([z.string(), z.number()]),
  intervalStart: z.string().datetime({ offset: true }),
  intervalEnd: z.string().datetime({ offset: true }),
  sourceRecordId: z.string().min(1),
  revision: z.number().int().positive(),
  maturity: z.enum(["provisional", "mature"]),
  currency: z.string().length(3).optional(),
});

export type MetricIngestPayload = z.infer<typeof metricIngestSchema>;

export const deploymentChangeSchema = z.object({
  path: z.string().min(1),
  previousValue: z.string(),
  nextValue: z.string(),
});

export const deploymentIngestSchema = z.object({
  source: z.string().min(1),
  externalCampaignId: z.string().min(1),
  externalDeploymentId: z.string().min(1),
  version: z.string().min(1),
  deployedAt: z.string().datetime({ offset: true }),
  changedFields: z.array(deploymentChangeSchema).optional(),
  changes: z.array(deploymentChangeSchema).optional(),
}).transform((payload) => ({
  ...payload,
  changes: payload.changedFields ?? payload.changes ?? [],
}));

export type DeploymentIngestPayload = z.infer<typeof deploymentIngestSchema>;
