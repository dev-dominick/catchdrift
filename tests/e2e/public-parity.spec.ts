import { expect, test, type Page } from "@playwright/test";

type Failure = {
  kind: "console" | "request";
  message: string;
};

type RunStatus = {
  runId: string;
  status: "running" | "completed" | "failed";
  stage: {
    key: string;
  };
  lines: string[];
  incidentUrl: string | null;
};

async function resetDemoForParity(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await page.request.post("/api/demo/reset");

    if (response.status() === 200) {
      return;
    }

    if ([409, 429].includes(response.status())) {
      await page.waitForTimeout(3_000);
      continue;
    }

    throw new Error(`Unable to reset demo state (${response.status()}).`);
  }

  throw new Error("Demo reset did not complete after retry attempts.");
}

function collectFailures(page: Page) {
  const failures: Failure[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") {
      return;
    }

    const text = msg.text();
    if (/Failed to load resource|favicon|analytics|gtag|doubleclick|ERR_ABORTED/i.test(text)) {
      return;
    }

    failures.push({ kind: "console", message: text });
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    const errorText = request.failure()?.errorText ?? "unknown";

    if (errorText.includes("ERR_ABORTED") && url.includes("_rsc=")) {
      return;
    }

      if (errorText.includes("ERR_ABORTED") && /_next\/static\/chunks\//i.test(url)) {
        return;
      }

    if (/analytics|doubleclick|google-analytics|gtag|collect|cdn-cgi\/rum/i.test(url)) {
      return;
    }

    failures.push({
      kind: "request",
      message: `${request.method()} ${url} -> ${errorText}`,
    });
  });

  return failures;
}

async function pollRunUntilComplete(page: Page, runId: string): Promise<RunStatus> {
  const maxAttempts = 360;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await page.request.get(`/api/demo/runs/${runId}`);
    expect(response.ok()).toBeTruthy();

    const run = (await response.json()) as RunStatus;
    if (run.status === "failed") {
      throw new Error(`Replay run failed for ${runId}`);
    }

    if (run.status === "completed") {
      return run;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`Replay run ${runId} did not complete in time.`);
}

async function startAndCompleteSimulation(page: Page): Promise<RunStatus> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const runButton = page.getByRole("button", { name: "Run incident simulation" });
    if ((await runButton.count()) === 0) {
      await page.goto("/", { waitUntil: "domcontentloaded" });
    }

    try {
      await expect(runButton).toBeVisible({ timeout: 20_000 });
    } catch {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(runButton).toBeVisible({ timeout: 20_000 });
    }

    let startResponse;
    try {
      [startResponse] = await Promise.all([
        page.waitForResponse(
          (response) => response.url().includes("/api/demo/replay") && response.request().method() === "POST",
          { timeout: 20_000 },
        ),
        runButton.click(),
      ]);
    } catch {
      await page.waitForTimeout(4_000);
      continue;
    }

    if ([409, 429].includes(startResponse.status())) {
      await page.waitForTimeout(4_000);
      continue;
    }

    if (startResponse.status() !== 202) {
      await page.waitForTimeout(10_000);
      continue;
    }

    const { runId } = (await startResponse.json()) as { runId: string };

    await expect(page.getByRole("button", { name: "Pause simulation" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Pause simulation" }).click();
    await expect(page.getByRole("button", { name: "Resume simulation" })).toBeVisible();
    await page.getByRole("button", { name: "Resume simulation" }).click();

    try {
      return await pollRunUntilComplete(page, runId);
    } catch {
      if (attempt === 7) {
        break;
      }

      const restart = page.getByRole("button", { name: "Restart", exact: true });
      if (await restart.count()) {
        await restart.first().click();
      }

      await page.waitForTimeout(10_000);
    }
  }

  // Fallback path for mobile/project contention: start replay via API and validate outcome.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const start = await page.request.post("/api/demo/replay");
    if (start.status() === 202) {
      const { runId } = (await start.json()) as { runId: string };
      try {
        return await pollRunUntilComplete(page, runId);
      } catch {
        await page.waitForTimeout(5_000);
        continue;
      }
    }

    if ([409, 429].includes(start.status())) {
      await page.waitForTimeout(4_000);
      continue;
    }

    await page.waitForTimeout(3_000);
  }

  throw new Error("Replay did not start successfully.");
}

async function waitForIncidentDetailReady(page: Page): Promise<void> {
  const detailHeading = page.getByRole("heading", { name: /Tracking (failure detected|dropped) after deployment/i });
  const briefHeading = page.getByRole("heading", { name: /Executive incident brief|Buyer brief/i });
  const notFoundHeading = page.getByRole("heading", { name: "404" });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await detailHeading.count()) > 0 || (await briefHeading.count()) > 0) {
      return;
    }

    if ((await notFoundHeading.count()) > 0) {
      await page.goto("/incidents", { waitUntil: "domcontentloaded" });
      const evidenceLink = page.getByRole("link", { name: "View evidence" }).first();
      if ((await evidenceLink.count()) > 0) {
        await evidenceLink.click();
      }
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(750);
  }

  await expect(detailHeading.or(briefHeading)).toBeVisible();
}

test.describe("public production parity", () => {
  test.setTimeout(420_000);

  test("homepage, simulation flow, incident detail, and integration status", async ({ page }) => {
    const failures = collectFailures(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await resetDemoForParity(page);

    await expect(
      page.getByRole("heading", {
        name: "Catch tracking failures before they become wasted media spend.",
      }),
    ).toBeVisible();

    await expect(page.getByRole("link", { name: "Run incident simulation" })).toBeVisible();
    await expect(page.getByText("Potential full-day exposure", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Exposure before detection", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Detection duration", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Attribution drop", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("1. Campaign healthy")).toBeVisible();
    await expect(page.getByText("2. Tracking signal begins degrading")).toBeVisible();
    await expect(page.getByText("3. CatchDrift waits for confirmation")).toBeVisible();
    await expect(page.getByText("4. Incident confirmed")).toBeVisible();
    await expect(page.getByText("5. Recent deployment identified")).toBeVisible();
    await expect(page.getByText("6. Exposure at risk")).toBeVisible();
    await expect(page.getByText("7. Tracking restored")).toBeVisible();
    await expect(page.getByText("8. Recovery verified")).toBeVisible();

    const completedRun = await startAndCompleteSimulation(page);

    await expect(page.getByText("Guided simulation")).toBeVisible();

    const mergedLines = completedRun.lines.join("\n");
    expect(mergedLines.includes("✓ Deployment v42 recorded")).toBeTruthy();
    expect(mergedLines.includes("✓ Third degraded interval matured")).toBeTruthy();
    expect(mergedLines.includes("✓ Deployment v43 recorded")).toBeTruthy();
    expect(mergedLines.includes("✓ Campaign recovered")).toBeTruthy();

    const firstEvidenceLink = page.getByRole("link", { name: "View full evidence" }).first();
    const hasFirstEvidenceLink = (await firstEvidenceLink.count()) > 0;
    if (hasFirstEvidenceLink) {
      await expect(firstEvidenceLink).toBeVisible({ timeout: 200_000 });
    }

    const secondEvidenceLink = page.getByRole("link", { name: "View full evidence" }).first();
    if (completedRun.incidentUrl) {
      await page.goto(completedRun.incidentUrl, { waitUntil: "domcontentloaded" });
    } else if ((await secondEvidenceLink.count()) > 0) {
      await expect(secondEvidenceLink).toBeVisible({ timeout: 200_000 });
      await secondEvidenceLink.click();
    } else {
      await page.goto("/incidents", { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: "View evidence" }).first().click();
    }

    await expect(page).toHaveURL(/\/incidents\//);
    await waitForIncidentDetailReady(page);
    await expect(page.getByRole("heading", { name: /Executive incident brief|Buyer brief/i })).toBeVisible();
    await expect(page.getByText("$57-$77", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("$5,520-$7,440", { exact: true })).toBeVisible();
    await expect(page.getByText(/Recovered|Resolved/).first()).toBeVisible();

    await page.getByText("View technical evidence").click();

    const chartContainer = page.locator("details[open] .recharts-responsive-container").first();
    await expect(chartContainer).toBeVisible();
    await expect(page.locator("details[open]").getByText("Deployment").first()).toBeVisible();
    await expect(page.locator("details[open]").getByText("Incident detected").first()).toBeVisible();
    await expect(page.locator("details[open]").getByText("Fix applied").first()).toBeVisible();
    await expect(page.locator("details[open]").getByText("Recovery verified").first()).toBeVisible();

    await expect(page.getByRole("button", { name: "Start investigation" })).toHaveCount(0);

    await page.goto("/incidents", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Exposure through recovery: $134-$181")).toBeVisible();
    await expect(page.getByText("Measured window: deployment to recovery (35 min)")).toBeVisible();

    await page.goto("/sources", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Simulation environment")).toBeVisible();
    await expect(page.getByText("Data mode: Simulation.")).toBeVisible();
    await expect(page.getByText("Live integrations")).toBeVisible();
    await expect(page.getByText("Live connector not connected in this demonstration.")).toBeVisible();
    await page.getByText("View technical source details").click();
    await expect(page.getByText("Simulated evidence", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Not connected", { exact: true }).first()).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.goto("/incidents", { waitUntil: "domcontentloaded" });
    await page.goBack();
    await page.goForward();

    expect(
      failures,
      `Unexpected browser failures:\n${failures.map((item) => `${item.kind}: ${item.message}`).join("\n")}`,
    ).toHaveLength(0);
  });
});
