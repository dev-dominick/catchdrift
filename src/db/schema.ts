import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const campaignStatusEnum = pgEnum("campaign_status", ["active", "paused", "archived"]);
export const observationMaturityEnum = pgEnum("observation_maturity", ["provisional", "mature"]);
export const ruleEvaluationResultEnum = pgEnum("rule_evaluation_result", ["suppressed", "normal", "triggered"]);
export const incidentStatusEnum = pgEnum("incident_status", [
  "detected",
  "acknowledged",
  "investigating",
  "recovered",
  "resolved",
  "dismissed",
]);
export const incidentSeverityEnum = pgEnum("incident_severity", ["critical", "high", "medium", "low"]);
export const incidentConfidenceEnum = pgEnum("incident_confidence", ["high", "medium", "low"]);
export const connectorStateEnum = pgEnum("connector_state", ["healthy", "stale", "failed"]);
export const jobStateEnum = pgEnum("job_state", ["pending", "running", "completed", "failed"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    internalKey: varchar("internal_key", { length: 120 }).notNull(),
    name: varchar("name", { length: 240 }).notNull(),
    status: campaignStatusEnum("status").notNull().default("active"),
    currency: varchar("currency", { length: 8 }).notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("campaign_workspace_internal_key_unique").on(table.workspaceId, table.internalKey)],
);

export const externalCampaignMappings = pgTable(
  "external_campaign_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
    source: varchar("source", { length: 80 }).notNull(),
    externalCampaignId: varchar("external_campaign_id", { length: 200 }).notNull(),
    externalAccountId: varchar("external_account_id", { length: 200 }),
    landingPageSlug: varchar("landing_page_slug", { length: 120 }),
    affiliateSubId: varchar("affiliate_sub_id", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("external_mapping_workspace_source_campaign_unique").on(
      table.workspaceId,
      table.source,
      table.externalCampaignId,
    ),
  ],
);

export const metricObservations = pgTable(
  "metric_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
    source: varchar("source", { length: 80 }).notNull(),
    metric: varchar("metric", { length: 80 }).notNull(),
    valueDecimal: numeric("value_decimal", { precision: 18, scale: 6 }).notNull(),
    currency: varchar("currency", { length: 8 }),
    intervalStart: timestamp("interval_start", { withTimezone: true }).notNull(),
    intervalEnd: timestamp("interval_end", { withTimezone: true }).notNull(),
    sourceRecordId: varchar("source_record_id", { length: 255 }).notNull(),
    sourceRevision: integer("source_revision").notNull(),
    maturity: observationMaturityEnum("maturity").notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("metric_obs_workspace_source_record_revision_unique").on(
      table.workspaceId,
      table.source,
      table.sourceRecordId,
      table.sourceRevision,
    ),
    index("metric_obs_campaign_interval_idx").on(table.campaignId, table.intervalEnd),
  ],
);

export const deploymentEvents = pgTable(
  "deployment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
    source: varchar("source", { length: 80 }).notNull(),
    externalDeploymentId: varchar("external_deployment_id", { length: 200 }).notNull(),
    version: varchar("version", { length: 80 }).notNull(),
    deployedAt: timestamp("deployed_at", { withTimezone: true }).notNull(),
    deployedBy: varchar("deployed_by", { length: 120 }),
    changesJson: jsonb("changes_json").notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("deployment_workspace_external_deployment_unique").on(
      table.workspaceId,
      table.source,
      table.externalDeploymentId,
    ),
    index("deployment_campaign_deployed_at_idx").on(table.campaignId, table.deployedAt),
  ],
);

export const sourceHealth = pgTable(
  "source_health",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    source: varchar("source", { length: 80 }).notNull(),
    expectedDelayMinutes: integer("expected_delay_minutes").notNull(),
    lastSuccessfulEventAt: timestamp("last_successful_event_at", { withTimezone: true }),
    latestMatureIntervalEnd: timestamp("latest_mature_interval_end", { withTimezone: true }),
    freshnessState: connectorStateEnum("freshness_state").notNull().default("stale"),
    connectorState: connectorStateEnum("connector_state").notNull().default("healthy"),
    lastErrorRedacted: text("last_error_redacted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("source_health_workspace_source_unique").on(table.workspaceId, table.source)],
);

export const ruleEvaluations = pgTable(
  "rule_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
    ruleId: varchar("rule_id", { length: 120 }).notNull(),
    ruleVersion: integer("rule_version").notNull(),
    evaluationWindowStart: timestamp("evaluation_window_start", { withTimezone: true }).notNull(),
    evaluationWindowEnd: timestamp("evaluation_window_end", { withTimezone: true }).notNull(),
    result: ruleEvaluationResultEnum("result").notNull(),
    inputsJson: jsonb("inputs_json").notNull(),
    baselineJson: jsonb("baseline_json").notNull(),
    outputJson: jsonb("output_json").notNull(),
    suppressionReason: varchar("suppression_reason", { length: 160 }),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("rule_eval_campaign_time_idx").on(table.campaignId, table.evaluatedAt)],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
    ruleId: varchar("rule_id", { length: 120 }).notNull(),
    ruleVersion: integer("rule_version").notNull(),
    deduplicationKey: varchar("deduplication_key", { length: 220 }).notNull(),
    severity: incidentSeverityEnum("severity").notNull(),
    confidence: incidentConfidenceEnum("confidence").notNull(),
    status: incidentStatusEnum("status").notNull().default("detected"),
    exposureLowMinor: bigint("exposure_low_minor", { mode: "number" }),
    exposureHighMinor: bigint("exposure_high_minor", { mode: "number" }),
    exposureUnit: varchar("exposure_unit", { length: 16 }),
    currency: varchar("currency", { length: 8 }).notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    recoveredAt: timestamp("recovered_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("incidents_campaign_status_idx").on(table.campaignId, table.status)],
);

export const incidentEvidence = pgTable("incident_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  incidentId: uuid("incident_id").notNull().references(() => incidents.id),
  evidenceType: varchar("evidence_type", { length: 80 }).notNull(),
  evidenceJson: jsonb("evidence_json").notNull(),
  immutable: boolean("immutable").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const incidentEvents = pgTable("incident_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  incidentId: uuid("incident_id").notNull().references(() => incidents.id),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  actorType: varchar("actor_type", { length: 30 }).notNull(),
  actorId: varchar("actor_id", { length: 100 }),
  detailsJson: jsonb("details_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    type: varchar("type", { length: 120 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 240 }),
    payloadJson: jsonb("payload_json").notNull(),
    state: jobStateEnum("state").notNull().default("pending"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 120 }),
    lastErrorRedacted: text("last_error_redacted"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("jobs_state_available_idx").on(table.state, table.availableAt),
    unique("jobs_dedupe_key_unique").on(table.workspaceId, table.type, table.dedupeKey),
  ],
);
