import { expect, test, type Page } from "@playwright/test";

async function resetDemoViaApi(page: Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await page.request.post("/api/demo/test/hard-reset");
    if (response.status() === 200) {
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("Unable to reset demo after retries");
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

  await expect(page.getByText("A. What is happening?")).toBeVisible();
  await expect(page.getByText(/Current state/i)).toBeVisible();

  await expect(page.getByText(/Final status:/i)).toContainText(/recovered/i, {
    timeout: 90_000,
  });
  const recoveredAt = Date.now();

  expect(activeReachedAt - startedAt).toBeLessThan(30_000);
  expect(recoveredAt - startedAt).toBeLessThan(45_000);
  expect(consoleErrors).toEqual([]);
  expect(unexpectedFailures).toEqual([]);
});

test("navigation and page refresh do not abort async replay", async ({ page }) => {
  test.skip(test.info().project.name === "mobile-chrome", "Navigation resilience is covered in desktop project.");

  await page.goto("/");
  await resetDemoViaApi(page);

  await page.getByRole("button", { name: "Run the 25-second incident replay" }).click();
  await expect(page).toHaveURL(/\/incidents\/[0-9a-f\-]+$/i, { timeout: 90_000 });

  const incidentUrl = page.url();
  await page.goto("/");
  await page.goto(incidentUrl);
  await page.reload();

  await expect(page.getByText(/Final status:/i)).toContainText(/recovered/i, {
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

  await page.request.post("/api/demo/test/stale-source");
  await page.goto("/sources");
  await expect(page.getByText(/Automated incident decisions suppressed for safety/i)).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Run the 25-second incident replay" })).toBeVisible();
});
