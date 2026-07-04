import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { ensureDemoWorkspaceAndCampaign, resetDemoWorkspace } from "../../src/domain/engine";
import { query, queryOne } from "../../src/db/sql";
import { DEMO_WORKSPACE_SLUG } from "../../src/lib/constants";

async function resetDemoViaApi(page: Page) {
  void page;
  await resetDemoWorkspace();
  await ensureDemoWorkspaceAndCampaign();
  await query(`delete from demo_runs`);
}

async function forceStaleRevenueSource(): Promise<void> {
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
}

async function startReplayWithRetry(page: Page, maxAttempts = 12): Promise<{ runId: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await page.request.post("/api/demo/replay");

    if (response.status() === 202) {
      return (await response.json()) as { runId: string };
    }

    if ([409, 429].includes(response.status())) {
      await page.waitForTimeout(3_000);
      continue;
    }

    expect(response.status()).toBe(202);
  }

  throw new Error("Replay could not be started after retry attempts.");
}

async function waitForIncidentUrl(page: Page, runId: string, timeoutMs = 90_000): Promise<string> {
  const maxAttempts = Math.ceil(timeoutMs / 1_000);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const runStatus = await page.request.get(`/api/demo/runs/${runId}`);
    const body = (await runStatus.json()) as {
      status: "running" | "completed" | "failed";
      incidentUrl: string | null;
    };

    if (body.incidentUrl) {
      return body.incidentUrl;
    }

    if (body.status === "failed") {
      throw new Error(`Replay run failed for ${runId}`);
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error(`Replay run ${runId} did not produce an incident URL in time.`);
}

async function startReplayUntilIncident(
  page: Page,
  options?: { maxRuns?: number; incidentTimeoutMs?: number },
): Promise<{ runId: string; incidentUrl: string }> {
  const maxRuns = options?.maxRuns ?? 3;
  const incidentTimeoutMs = options?.incidentTimeoutMs ?? 90_000;

  for (let attempt = 0; attempt < maxRuns; attempt += 1) {
    const run = await startReplayWithRetry(page);

    try {
      const incidentUrl = await waitForIncidentUrl(page, run.runId, incidentTimeoutMs);
      return { runId: run.runId, incidentUrl };
    } catch {
      if (attempt === maxRuns - 1) {
        throw new Error("Replay did not reach an incident after retry attempts.");
      }

      await resetDemoViaApi(page);
    }
  }

  throw new Error("Replay did not reach an incident after retry attempts.");
}

async function waitForRunToProgress(page: Page, runId: string, timeoutMs = 90_000): Promise<{ status: "running" | "completed" | "failed"; incidentUrl: string | null }> {
  const maxAttempts = Math.ceil(timeoutMs / 1_000);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const run = await page.request.get(`/api/demo/runs/${runId}`);
    const body = (await run.json()) as { status: "running" | "completed" | "failed"; incidentUrl: string | null };

    if (body.status === "failed") {
      return body;
    }

    if (body.incidentUrl || body.status === "completed") {
      return body;
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error(`Replay run ${runId} did not progress in time.`);
}

async function waitForInboxEvidenceLink(page: Page, timeoutMs = 45_000): Promise<string | null> {
  const maxAttempts = Math.ceil(timeoutMs / 1_500);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await page.goto("/incidents", { waitUntil: "domcontentloaded" });
    const evidenceLink = page.getByRole("link", { name: "View evidence" }).first();

    if ((await evidenceLink.count()) > 0) {
      const href = await evidenceLink.getAttribute("href");
      if (href) {
        return href;
      }
    }

    await page.waitForTimeout(1_500);
  }

  return null;
}

async function ensureIncidentInInbox(page: Page, maxCycles = 3): Promise<string> {
  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await startReplayWithRetry(page);

    const href = await waitForInboxEvidenceLink(page, 45_000);
    if (href) {
      return href;
    }

    if (cycle < maxCycles - 1) {
      await resetDemoViaApi(page);
    }
  }

  throw new Error("Replay did not produce an incident in the inbox after retry attempts.");
}

test("replay reaches active incident then recovered within bounded runtime", async ({ page }) => {
  test.skip(test.info().project.name === "mobile-chrome", "Lifecycle timing assertions run in desktop project.");

  const consoleErrors: string[] = [];
  const unexpectedFailures: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        /status of (409|429) \((Conflict|Too Many Requests)\)/i.test(text)
        || /Failed to load resource: the server responded with a status of (409|429)/i.test(text)
      ) {
        return;
      }
      consoleErrors.push(text);
    }
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400 && ![409, 429].includes(status)) {
      unexpectedFailures.push(`${status} ${response.url()}`);
    }
  });

  await page.goto("/");
  await resetDemoViaApi(page);

  let startedAt = 0;
  let incidentUrl: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    startedAt = Date.now();
    const startPayload = await startReplayWithRetry(page);

    await expect.poll(async () => {
      const run = await page.request.get(`/api/demo/runs/${startPayload.runId}`);
      const body = (await run.json()) as {
        status: "running" | "completed" | "failed";
        incidentUrl: string | null;
      };
      if (body.incidentUrl) {
        return body.incidentUrl;
      }
      if (body.status === "failed") {
        return "FAILED";
      }
      return null;
    }, { timeout: 90_000 }).not.toBeNull();

    const runWithIncident = await page.request.get(`/api/demo/runs/${startPayload.runId}`);
    const runBody = (await runWithIncident.json()) as {
      status: "running" | "completed" | "failed";
      incidentUrl: string | null;
    };

    if (runBody.incidentUrl) {
      incidentUrl = runBody.incidentUrl;
      break;
    }

    if (attempt === 0) {
      await resetDemoViaApi(page);
      continue;
    }
  }

  expect(incidentUrl).toBeTruthy();
  await page.goto(String(incidentUrl));
  const activeReachedAt = Date.now();

  await expect(page.getByRole("heading", { name: /Tracking (failure detected|dropped) after deployment/i })).toBeVisible();
  await expect(page.getByText(/Why CatchDrift flagged it/i)).toBeVisible();

  const incidentId = (() => {
    try {
      const parsed = new URL(String(incidentUrl), "http://127.0.0.1:3000");
      const match = parsed.pathname.match(/\/incidents\/([0-9a-f\-]+)$/i);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  })();
  expect(incidentId).toBeTruthy();

  const persisted = await queryOne<{
    campaign_id: string;
    detected_at: string;
    recovered_at: string | null;
  }>(
    `select campaign_id, detected_at, recovered_at
     from incidents
     where id = $1`,
    [String(incidentId)],
  );

  expect(persisted).toBeTruthy();

  await expect.poll(async () => {
    const row = await queryOne<{ recovered_at: string | null }>(
      `select recovered_at from incidents where id = $1`,
      [String(incidentId)],
    );

    return row?.recovered_at ?? null;
  }, { timeout: 90_000 }).not.toBeNull();

  const recoveredAfterPoll = await queryOne<{ recovered_at: string | null }>(
    `select recovered_at from incidents where id = $1`,
    [String(incidentId)],
  );

  const recoveredAtIso = recoveredAfterPoll?.recovered_at;
  expect(recoveredAtIso).toBeTruthy();
  const recoveredAt = Date.now();

  const startInvestigationButton = page.getByRole("button", { name: "Start investigation" });
  if ((await startInvestigationButton.count()) > 0) {
    await startInvestigationButton.click();
  }

  await page.getByRole("button", { name: "Mark resolved" }).click();
  await expect(page.getByText(/^Resolved$/).first()).toBeVisible();

  const deployments = await query<{ version: string; deployed_at: string }>(
    `select version, deployed_at
     from deployment_events
     where campaign_id = $1 and version in ('v42', 'v43')
     order by deployed_at asc`,
    [String(persisted?.campaign_id)],
  );

  const deployedAt = new Date(deployments.find((item) => item.version === "v42")?.deployed_at ?? 0).getTime();
  const detectedAt = new Date(String(persisted?.detected_at)).getTime();
  const fixedAt = new Date(deployments.find((item) => item.version === "v43")?.deployed_at ?? 0).getTime();
  const recoveredAtEvent = new Date(String(recoveredAtIso)).getTime();

  expect(Number.isNaN(deployedAt)).toBe(false);
  expect(Number.isNaN(detectedAt)).toBe(false);
  expect(Number.isNaN(fixedAt)).toBe(false);
  expect(Number.isNaN(recoveredAtEvent)).toBe(false);
  expect(deployedAt < detectedAt).toBe(true);
  expect(detectedAt < fixedAt).toBe(true);
  expect(fixedAt < recoveredAtEvent).toBe(true);
  expect(Math.round((detectedAt - deployedAt) / 60_000)).toBe(15);
  expect(Math.round((recoveredAtEvent - detectedAt) / 60_000)).toBe(20);

  expect(activeReachedAt - startedAt).toBeLessThan(30_000);
  expect(recoveredAt - startedAt).toBeLessThan(45_000);
  expect(consoleErrors).toEqual([]);
  expect(unexpectedFailures).toEqual([]);
});

test("navigation and page refresh do not abort async replay", async ({ page }) => {
  test.skip(test.info().project.name === "mobile-chrome", "Navigation resilience is covered in desktop project.");

  await page.goto("/");
  await resetDemoViaApi(page);

  await startReplayUntilIncident(page);

  await page.goto("/incidents");
  const openIncidentLink = page.getByRole("link", { name: "View evidence" }).first();
  await expect(openIncidentLink).toBeVisible({ timeout: 90_000 });
  const incidentUrl = await openIncidentLink.getAttribute("href");
  expect(incidentUrl).toBeTruthy();
  await openIncidentLink.click();
  await expect(page).toHaveURL(/\/incidents\/[0-9a-f\-]+$/i, { timeout: 90_000 });

  await page.goto("/");
  await page.goto(String(incidentUrl));
  await page.reload();

  await expect(page.getByText(/Recovery timestamp:/i)).toBeVisible({
    timeout: 90_000,
  });
});

test("concurrent replay and reset semantics are enforced", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto("/");
  await resetDemoViaApi(pageA);

  const replayA = await pageA.request.post("/api/demo/replay");
  expect(replayA.status()).toBe(202);

  await pageB.goto("/");
  const replayB = await pageB.request.post("/api/demo/replay");
  expect([409, 429]).toContain(replayB.status());

  const resetDuringReplay = await pageB.request.post("/api/demo/reset");
  expect(resetDuringReplay.status()).toBe(409);

  await contextA.close();
  await contextB.close();
});

test("safe public replay failure hides internals", async ({ page }) => {
  await page.goto("/");
  await resetDemoViaApi(page);

  const start = await page.request.post("/api/demo/replay?forceFailure=1");
  expect(start.status()).toBe(202);
  const payload = (await start.json()) as { runId: string };

  await expect.poll(async () => {
    const run = await page.request.get(`/api/demo/runs/${payload.runId}`);
    const body = await run.json();
    return body.status as string;
  }).toBe("failed");

  const runFinal = await page.request.get(`/api/demo/runs/${payload.runId}`);
  const body = (await runFinal.json()) as { publicMessage?: string; publicReference?: string };
  const joined = `${body.publicMessage ?? ""} ${body.publicReference ?? ""}`;

  expect(joined).toContain("CD-");
  expect(joined).not.toMatch(/select |insert |update |from |\.ts|\/Users\/|DATABASE_URL|postgres|stack/i);
});

test("stale source suppression is visible", async ({ page }) => {
  await page.goto("/");
  await resetDemoViaApi(page);

  await forceStaleRevenueSource();
  await page.goto("/sources");
  await expect(page.getByText(/Detection paused\./i)).toBeVisible();
  await page.getByText("View technical source details").click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Revenue" })).toBeVisible();
});

test("homepage has one primary simulation CTA and no campaigns monitored metric", async ({ page }) => {
  await page.goto("/");

  const ctas = page.getByRole("button", { name: "Run incident simulation" });
  await expect(ctas).toHaveCount(1);
  await expect(page.getByText("Campaigns monitored")).toHaveCount(0);
});

test("integration status summaries render and technical source details are collapsible", async ({ page }) => {
  await page.goto("/sources");

  await expect(page.getByRole("heading", { name: "Integration status" })).toBeVisible();
  await expect(page.getByText("Simulation environment")).toBeVisible();
  await expect(page.getByText("Live integrations")).toBeVisible();

  const technicalDetails = page.locator("details").first();
  const detailsSummary = page.getByText("View technical source details");
  await expect(detailsSummary).toBeVisible();
  await expect(technicalDetails).not.toHaveAttribute("open", "");
  await detailsSummary.click();
  await expect(technicalDetails).toHaveAttribute("open", "");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("Data mode", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Simulation status", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Live connector", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Simulated evidence fresh", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Not connected", { exact: true }).first()).toBeVisible();
});

test("canonical business values stay consistent across homepage, inbox, and incident detail", async ({ page }) => {
  await page.goto("/");
  await resetDemoViaApi(page);

  await expect(page.getByText("Potential full-day exposure", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$5,520-$7,440", { exact: true })).toBeVisible();
  await expect(page.getByText("Exposure before detection", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$57-$77", { exact: true })).toBeVisible();
  await expect(page.getByText("Detection duration")).toBeVisible();
  await expect(page.getByText("15 min", { exact: true })).toBeVisible();
  await expect(page.getByText("Attribution drop", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("25%", { exact: true })).toBeVisible();

  const payload = await startReplayWithRetry(page);

  const runState = await waitForRunToProgress(page, payload.runId, 180_000);
  expect(runState.status).not.toBe("failed");

  await page.goto("/incidents");
  await expect(page.getByText("Exposure before detection: $57-$77")).toBeVisible();
  await expect(page.getByText("Measured window: deployment to detection (15 min)")).toBeVisible();

  await page.getByRole("link", { name: "View evidence" }).first().click();
  await expect(page.getByRole("heading", { name: /Tracking failure detected after deployment/i })).toBeVisible();
  await page.getByText("View technical evidence").click();
  await expect(page.getByText("Potential full-day exposure", { exact: true })).toBeVisible();
  await expect(page.getByText("Exposure before detection", { exact: true })).toBeVisible();
  await expect(page.getByText("Detection duration", { exact: true })).toBeVisible();
  await expect(page.getByText(/Timeline invariant:/i)).toBeVisible();
  await expect(page.getByText("Attribution drop", { exact: true })).toBeVisible();
});

test("simulation stages drive exposure progression and incident/recovery banners", async ({ page }) => {
  await page.goto("/");
  await resetDemoViaApi(page);

  await expect(page.getByText("Exposure progression: $0")).toBeVisible();
  await page.getByRole("button", { name: "Run incident simulation" }).click();

  await expect(page.getByText("Exposure progression: $57-$77")).toBeVisible({ timeout: 90_000 });
});

test("incident inbox link remains resolvable across refresh, new tab, and replay restart", async ({ page, browser }) => {
  test.skip(test.info().project.name === "mobile-chrome", "Reliability path validation runs in desktop project.");

  await page.goto("/");
  await resetDemoViaApi(page);

  const firstIncidentPath = await ensureIncidentInInbox(page);
  await page.reload();
  const firstInboxLink = page.getByRole("link", { name: "View evidence" }).first();
  await expect(firstInboxLink).toBeVisible();
  expect(firstIncidentPath).toBeTruthy();

  await firstInboxLink.click();
  await expect(page).toHaveURL(/\/incidents\/[0-9a-f\-]+$/i);
  await expect(page.getByRole("heading", { name: /Tracking failure detected after deployment/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: /Tracking failure detected after deployment/i })).toBeVisible();

  await page.goto("/incidents");
  await page.goBack();
  await expect(page.getByRole("heading", { name: /Tracking failure detected after deployment/i })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: /Operational Incident Inbox/i })).toBeVisible();

  const secondaryContext = await browser.newContext();
  const secondaryPage = await secondaryContext.newPage();
  await secondaryPage.goto(`http://127.0.0.1:3000${String(firstIncidentPath)}`);
  await expect(secondaryPage.getByRole("heading", { name: /Tracking failure detected after deployment/i })).toBeVisible();
  await secondaryContext.close();

  await page.goto("/");
  await startReplayWithRetry(page);
  await waitForInboxEvidenceLink(page, 45_000);

  await page.goto("/incidents");
  await page.reload();
  const restartedInboxLink = page.getByRole("link", { name: "View evidence" }).first();
  await expect(restartedInboxLink).toBeVisible();
  await restartedInboxLink.click();
  await expect(page).toHaveURL(/\/incidents\/[0-9a-f\-]+$/i);
  await expect(page.getByRole("heading", { name: /Tracking failure detected after deployment/i })).toBeVisible();

  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto("http://127.0.0.1:3000/incidents");
  const freshInboxLink = freshPage.getByRole("link", { name: "View evidence" }).first();
  await expect(freshInboxLink).toBeVisible();
  await freshInboxLink.click();
  await expect(freshPage.getByRole("heading", { name: /Tracking failure detected after deployment/i })).toBeVisible();
  await freshContext.close();
});

test("mobile viewport layout remains usable", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile-chrome", "Mobile-specific layout check.");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Catch tracking failures/i })).toBeVisible();

  const noHorizontalOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 2;
  });

  expect(noHorizontalOverflow).toBe(true);
  await expect(page.getByRole("button", { name: "Run incident simulation" })).toBeVisible();
});
