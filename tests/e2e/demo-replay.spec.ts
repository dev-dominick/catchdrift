import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { ensureDemoWorkspaceAndCampaign, resetDemoWorkspace } from "../../src/domain/engine";
import { query } from "../../src/db/sql";
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

test("replay reaches active incident then recovered within bounded runtime", async ({ page }) => {
  test.skip(test.info().project.name === "mobile-chrome", "Lifecycle timing assertions run in desktop project.");

  const consoleErrors: string[] = [];
  const unexpectedFailures: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
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
    const start = await page.request.post("/api/demo/replay");
    expect(start.status()).toBe(202);
    const startPayload = (await start.json()) as { runId: string };

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

  await expect(page.getByRole("heading", { name: /Tracking dropped after deployment/i })).toBeVisible();
  await expect(page.getByText(/Why CatchDrift flagged it/i)).toBeVisible();

  await expect(page.getByText(/Recovery timestamp:/i)).toBeVisible({
    timeout: 90_000,
  });
  const recoveredAt = Date.now();

  await page.getByRole("button", { name: "Start investigation" }).click();
  await expect(page.getByText(/^Investigating$/).first()).toBeVisible();

  await page.getByRole("button", { name: "Mark resolved" }).click();
  await expect(page.getByText(/^Resolved$/).first()).toBeVisible();

  expect(activeReachedAt - startedAt).toBeLessThan(30_000);
  expect(recoveredAt - startedAt).toBeLessThan(45_000);
  expect(consoleErrors).toEqual([]);
  expect(unexpectedFailures).toEqual([]);
});

test("navigation and page refresh do not abort async replay", async ({ page }) => {
  test.skip(test.info().project.name === "mobile-chrome", "Navigation resilience is covered in desktop project.");

  await page.goto("/");
  await resetDemoViaApi(page);

  await page.getByRole("button", { name: "Start replay" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 90_000 });
  await expect(page.getByRole("button", { name: /Campaign healthy|A landing-page change just went live|Traffic is arriving/i })).toBeVisible();

  const openIncidentLink = page.getByRole("link", { name: /Open incident|Open recovered incident/i });
  await expect(openIncidentLink).toBeVisible({ timeout: 90_000 });
  await expect(openIncidentLink).toHaveCount(1);

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
  await expect(page.getByRole("cell", { name: "Revenue" })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Start replay" })).toBeVisible();
});
