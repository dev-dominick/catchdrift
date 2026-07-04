import { expect, test } from "@playwright/test";

test.describe("local production runtime", () => {
  test("desktop and mobile route smoke with console/network checks", async ({ page }) => {
    const consoleErrors: string[] = [];
    const requestFailures: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("requestfailed", (request) => {
      const url = request.url();
      const errorText = request.failure()?.errorText ?? "unknown";

      if (errorText.includes("ERR_ABORTED") && url.includes("_rsc=")) {
        return;
      }

      requestFailures.push(`${request.method()} ${url} -> ${errorText}`);
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Catch tracking failures before they become wasted media spend." })).toBeVisible();

    await page.goto("/incidents", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Operational Incident Inbox" })).toBeVisible();

    await page.goto("/sources", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Integration status" })).toBeVisible();

    expect(consoleErrors, `Console errors:\n${consoleErrors.join("\n")}`).toHaveLength(0);
    expect(requestFailures, `Request failures:\n${requestFailures.join("\n")}`).toHaveLength(0);
  });
});
