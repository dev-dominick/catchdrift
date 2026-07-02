CREATE TYPE "public"."campaign_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."connector_state" AS ENUM('healthy', 'stale', 'failed');--> statement-breakpoint
CREATE TYPE "public"."incident_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('detected', 'acknowledged', 'investigating', 'recovered', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."observation_maturity" AS ENUM('provisional', 'mature');--> statement-breakpoint
CREATE TYPE "public"."rule_evaluation_result" AS ENUM('suppressed', 'normal', 'triggered');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"internal_key" varchar(120) NOT NULL,
	"name" varchar(240) NOT NULL,
	"status" "campaign_status" DEFAULT 'active' NOT NULL,
	"currency" varchar(8) NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_workspace_internal_key_unique" UNIQUE("workspace_id","internal_key")
);
--> statement-breakpoint
CREATE TABLE "deployment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source" varchar(80) NOT NULL,
	"external_deployment_id" varchar(200) NOT NULL,
	"version" varchar(80) NOT NULL,
	"deployed_at" timestamp with time zone NOT NULL,
	"deployed_by" varchar(120),
	"changes_json" jsonb NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_workspace_external_deployment_unique" UNIQUE("workspace_id","source","external_deployment_id")
);
--> statement-breakpoint
CREATE TABLE "external_campaign_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source" varchar(80) NOT NULL,
	"external_campaign_id" varchar(200) NOT NULL,
	"external_account_id" varchar(200),
	"landing_page_slug" varchar(120),
	"affiliate_sub_id" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_mapping_workspace_source_campaign_unique" UNIQUE("workspace_id","source","external_campaign_id")
);
--> statement-breakpoint
CREATE TABLE "incident_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"actor_type" varchar(30) NOT NULL,
	"actor_id" varchar(100),
	"details_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"evidence_type" varchar(80) NOT NULL,
	"evidence_json" jsonb NOT NULL,
	"immutable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"rule_id" varchar(120) NOT NULL,
	"rule_version" integer NOT NULL,
	"deduplication_key" varchar(220) NOT NULL,
	"severity" "incident_severity" NOT NULL,
	"confidence" "incident_confidence" NOT NULL,
	"status" "incident_status" DEFAULT 'detected' NOT NULL,
	"exposure_low_minor" bigint,
	"exposure_high_minor" bigint,
	"exposure_unit" varchar(16),
	"currency" varchar(8) NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"recovered_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" varchar(120) NOT NULL,
	"dedupe_key" varchar(240),
	"payload_json" jsonb NOT NULL,
	"state" "job_state" DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(120),
	"last_error_redacted" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_dedupe_key_unique" UNIQUE("workspace_id","type","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "metric_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source" varchar(80) NOT NULL,
	"metric" varchar(80) NOT NULL,
	"value_decimal" numeric(18, 6) NOT NULL,
	"currency" varchar(8),
	"interval_start" timestamp with time zone NOT NULL,
	"interval_end" timestamp with time zone NOT NULL,
	"source_record_id" varchar(255) NOT NULL,
	"source_revision" integer NOT NULL,
	"maturity" "observation_maturity" NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_obs_workspace_source_record_revision_unique" UNIQUE("workspace_id","source","source_record_id","source_revision")
);
--> statement-breakpoint
CREATE TABLE "rule_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"rule_id" varchar(120) NOT NULL,
	"rule_version" integer NOT NULL,
	"evaluation_window_start" timestamp with time zone NOT NULL,
	"evaluation_window_end" timestamp with time zone NOT NULL,
	"result" "rule_evaluation_result" NOT NULL,
	"inputs_json" jsonb NOT NULL,
	"baseline_json" jsonb NOT NULL,
	"output_json" jsonb NOT NULL,
	"suppression_reason" varchar(160),
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" varchar(80) NOT NULL,
	"expected_delay_minutes" integer NOT NULL,
	"last_successful_event_at" timestamp with time zone,
	"latest_mature_interval_end" timestamp with time zone,
	"freshness_state" "connector_state" DEFAULT 'stale' NOT NULL,
	"connector_state" "connector_state" DEFAULT 'healthy' NOT NULL,
	"last_error_redacted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_health_workspace_source_unique" UNIQUE("workspace_id","source")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_events" ADD CONSTRAINT "deployment_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_events" ADD CONSTRAINT "deployment_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_campaign_mappings" ADD CONSTRAINT "external_campaign_mappings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_campaign_mappings" ADD CONSTRAINT "external_campaign_mappings_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_evaluations" ADD CONSTRAINT "rule_evaluations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_evaluations" ADD CONSTRAINT "rule_evaluations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_health" ADD CONSTRAINT "source_health_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_campaign_deployed_at_idx" ON "deployment_events" USING btree ("campaign_id","deployed_at");--> statement-breakpoint
CREATE INDEX "incidents_campaign_status_idx" ON "incidents" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "jobs_state_available_idx" ON "jobs" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "metric_obs_campaign_interval_idx" ON "metric_observations" USING btree ("campaign_id","interval_end");--> statement-breakpoint
CREATE INDEX "rule_eval_campaign_time_idx" ON "rule_evaluations" USING btree ("campaign_id","evaluated_at");