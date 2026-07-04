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
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const startResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/demo/replay") && response.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Run live incident simulation" }).click();
    const startResponse = await startResponsePromise;

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
      if (attempt === 3) {
        throw new Error("Replay run failed after retry.");
      }

      const restart = page.getByRole("button", { name: "Restart", exact: true });
      if (await restart.count()) {
        await restart.first().click();
      }

      await page.waitForTimeout(10_000);
    }
  }

  throw new Error("Replay did not start successfully.");
}

test.describe("public production parity", () => {
  test.setTimeout(420_000);

  test("homepage, simulation flow, incident detail, and data health", async ({ page }) => {
    const failures = collectFailures(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", {
        name: "Catch tracking failures before they become wasted media spend.",
      }),
    ).toBeVisible();

    await expect(page.getByRole("link", { name: "Run incident simulation" })).toBeVisible();
    await expect(page.getByText("Spend protected")).toBeVisible();
    await expect(page.getByText("Time to detection")).toBeVisible();
    await expect(page.getByText("Estimated loss avoided")).toBeVisible();
    await expect(page.getByText("Incident cause")).toBeVisible();
    await expect(page.getByText("1. Campaign healthy")).toBeVisible();
    await expect(page.getByText("2. Tracking signal begins degrading")).toBeVisible();
    await expect(page.getByText("3. CatchDrift waits for confirmation")).toBeVisible();
    await expect(page.getByText("4. Incident confirmed")).toBeVisible();
    await expect(page.getByText("5. Recent deployment identified")).toBeVisible();
    await expect(page.getByText("6. $640 of spend now at risk")).toBeVisible();
    await expect(page.getByText("7. Tracking restored")).toBeVisible();
    await expect(page.getByText("8. Recovery verified")).toBeVisible();

    const completedRun = await startAndCompleteSimulation(page);

    await expect(page.getByText("Guided simulation")).toBeVisible();

    const mergedLines = completedRun.lines.join("\n");
    expect(mergedLines.includes("✓ Deployment v42 recorded")).toBeTruthy();
    expect(mergedLines.includes("✓ Third degraded interval matured")).toBeTruthy();
    expect(mergedLines.includes("✓ Deployment v43 recorded")).toBeTruthy();
    expect(mergedLines.includes("✓ Campaign recovered")).toBeTruthy();

    await expect(page.getByRole("link", { name: "View full evidence" }).first()).toBeVisible({ timeout: 200_000 });

    await page.getByRole("button", { name: "Restart", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause simulation" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Pause simulation" }).click();
    await expect(page.getByRole("button", { name: "Resume simulation" })).toBeVisible();
    await page.getByRole("button", { name: "Resume simulation" }).click();

    await expect(page.getByRole("link", { name: "View full evidence" }).first()).toBeVisible({ timeout: 200_000 });
    await page.getByRole("link", { name: "View full evidence" }).first().click();

    await expect(page).toHaveURL(/\/incidents\//);
    await expect(page.getByRole("heading", { name: "Executive incident brief" })).toBeVisible();
    await expect(page.getByText("$640", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("$3,840")).toBeVisible();
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
    await expect(page.getByText("Estimated exposure during detection: $640")).toBeVisible();

    await page.goto("/sources", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Demo dataset - replay completed.")).toBeVisible();
    await expect(page.getByText("Live third-party integrations are not connected")).toBeVisible();

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
