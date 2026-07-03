import { NextRequest, NextResponse } from "next/server";
import { query } from "@/db/sql";
import { DEMO_WORKSPACE_SLUG } from "@/lib/constants";

export async function POST(request: NextRequest) {
  void request;

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await query(
    `insert into source_health (
       workspace_id,
       source,
       expected_delay_minutes,
       last_successful_event_at,
       latest_mature_interval_end,
       freshness_state,
       connector_state
     )
     values (
       (select id from workspaces where slug = $1),
       'revenue',
       20,
       now() - interval '90 minutes',
       now() - interval '90 minutes',
       'stale',
       'healthy'
     )
     on conflict (workspace_id, source)
     do update set
       last_successful_event_at = excluded.last_successful_event_at,
       latest_mature_interval_end = excluded.latest_mature_interval_end,
       freshness_state = excluded.freshness_state,
       connector_state = excluded.connector_state,
       updated_at = now()`,
    [DEMO_WORKSPACE_SLUG],
  );

  return NextResponse.json({ ok: true });
}
