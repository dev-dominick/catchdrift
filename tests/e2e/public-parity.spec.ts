import { expect, test, type Page } from "@playwright/test";

type Failure = {
  kind: "console" | "request";
  message: string;
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

    if (/analytics|doubleclick|google-analytics|gtag|collect/i.test(url)) {
      return;
    }

    failures.push({
      kind: "request",
      message: `${request.method()} ${url} -> ${errorText}`,
    });
  });

  return failures;
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

    const progress = page.locator("#incident-demo div.h-2 > div").first();
    const startWidth = parseFloat((await progress.getAttribute("style"))?.replace(/[^0-9.]/g, "") || "0");

    await page.getByRole("button", { name: "Run live incident simulation" }).click();

    await expect(page.getByRole("button", { name: "Pause simulation" })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(4_000);

    const nextWidth = parseFloat((await progress.getAttribute("style"))?.replace(/[^0-9.]/g, "") || "0");
    expect(nextWidth).toBeGreaterThan(startWidth);

    await page.getByRole("button", { name: "Pause simulation" }).click();
    await expect(page.getByRole("button", { name: "Resume simulation" })).toBeVisible();
    await page.getByRole("button", { name: "Resume simulation" }).click();

    await expect(page.getByText("Campaign healthy")).toBeVisible();
    await expect(page.getByText("Tracking signal begins degrading")).toBeVisible();
    await expect(page.getByText("CatchDrift waits for confirmation")).toBeVisible();
    await expect(page.getByText("Incident confirmed")).toBeVisible();
    await expect(page.getByText("Recent deployment identified")).toBeVisible();
    await expect(page.getByText("$640 of spend now at risk")).toBeVisible();
    await expect(page.getByText("Tracking restored")).toBeVisible();
    await expect(page.getByText("Recovery verified")).toBeVisible();

    await expect(page.getByRole("link", { name: "View full evidence" })).toBeVisible({ timeout: 200_000 });

    await page.getByRole("button", { name: "Restart" }).click();
    await expect(page.getByRole("button", { name: "Pause simulation" })).toBeVisible({ timeout: 20_000 });

    await expect(page.getByRole("heading", { name: "Incident resolved" })).toBeVisible({ timeout: 220_000 });
    await page.getByRole("button", { name: "Restart simulation" }).click();
    await expect(page.getByRole("button", { name: "Pause simulation" })).toBeVisible({ timeout: 20_000 });

    await expect(page.getByRole("link", { name: "View full evidence" })).toBeVisible({ timeout: 200_000 });
    await page.getByRole("link", { name: "View full evidence" }).click();

    await expect(page).toHaveURL(/\/incidents\//);
    await expect(page.getByRole("heading", { name: "Executive incident brief" })).toBeVisible();
    await expect(page.getByText("$640")).toBeVisible();
    await expect(page.getByText("$3,840")).toBeVisible();

    const chartSvg = page.locator(".recharts-wrapper svg, .recharts-surface").first();
    await expect(chartSvg).toBeVisible();
    await expect(page.getByText("Deployment")).toBeVisible();
    await expect(page.getByText("Incident detected")).toBeVisible();
    await expect(page.getByText("Fix applied")).toBeVisible();
    await expect(page.getByText("Recovery verified")).toBeVisible();

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
