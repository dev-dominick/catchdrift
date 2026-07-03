CREATE TABLE "demo_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(80) NOT NULL,
	"operation" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"stage_key" varchar(60) NOT NULL,
	"stage_label" varchar(120) NOT NULL,
	"stage_index" integer DEFAULT 0 NOT NULL,
	"stage_total" integer DEFAULT 0 NOT NULL,
	"incident_id" uuid,
	"incident_url" varchar(220),
	"log_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"public_reference" varchar(24),
	"public_message" varchar(180),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "demo_runs_session_started_idx" ON "demo_runs" USING btree ("session_id","started_at");
--> statement-breakpoint
CREATE INDEX "demo_runs_status_idx" ON "demo_runs" USING btree ("operation","status","started_at");
--> statement-breakpoint
CREATE INDEX "demo_runs_expires_idx" ON "demo_runs" USING btree ("expires_at");