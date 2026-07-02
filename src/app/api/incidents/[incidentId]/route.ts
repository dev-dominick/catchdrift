import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateIncidentStatus } from "@/domain/engine";

const actionSchema = z.object({
  action: z.enum(["acknowledge", "investigate", "dismiss", "resolve"]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ incidentId: string }> },
) {
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid incident action.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { incidentId } = await context.params;

  await updateIncidentStatus({
    incidentId,
    action: parsed.data.action,
  });

  return NextResponse.json({ ok: true });
}
