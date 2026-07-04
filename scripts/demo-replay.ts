import "dotenv/config";

type DemoRunStatus = {
  runId: string;
  status: "running" | "completed" | "failed";
  lines: string[];
  incidentUrl: string | null;
  publicReference: string | null;
  publicMessage: string | null;
};

function sessionCookieFrom(response: Response): string | undefined {
  const setCookie = response.headers.get("set-cookie");
  return setCookie?.split(";")[0];
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
  const response = await fetch(`${baseUrl}/api/demo/replay`, {
    method: "POST",
  });

  if (response.status !== 202) {
    const errorBody = await response.text();
    throw new Error(`Demo replay failed to start (${response.status}): ${errorBody}`);
  }

  const cookie = sessionCookieFrom(response);
  const payload = (await response.json()) as { runId: string };
  let printedLines = 0;
  const startedAt = Date.now();
  const timeoutMs = 180_000;

  while (Date.now() - startedAt <= timeoutMs) {
    const headers: Record<string, string> = cookie ? { cookie } : {};
    const statusResponse = await fetch(`${baseUrl}/api/demo/runs/${payload.runId}`, {
      method: "GET",
      headers,
    });

    if (!statusResponse.ok) {
      const errorBody = await statusResponse.text();
      throw new Error(`Demo replay status failed (${statusResponse.status}): ${errorBody}`);
    }

    const run = (await statusResponse.json()) as DemoRunStatus;
    for (const line of run.lines.slice(printedLines)) {
      console.log(line);
    }
    printedLines = run.lines.length;

    if (run.status === "failed") {
      const reference = run.publicReference ? ` Reference: ${run.publicReference}.` : "";
      throw new Error(`${run.publicMessage ?? "Demo replay failed before completion."}${reference}`);
    }

    if (run.status === "completed") {
      if (run.incidentUrl && !run.lines.includes(`INCIDENT_URL:${run.incidentUrl}`)) {
        console.log(`INCIDENT_URL:${run.incidentUrl}`);
      }
      console.log("✓ Demo replay completed");
      return;
    }

    await wait(1000);
  }

  throw new Error(`Demo replay did not complete within ${timeoutMs / 1000} seconds.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
