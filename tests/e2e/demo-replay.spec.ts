import { expect, test } from "@playwright/test";

test("demo replay incident to recovery flow", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText(/Demo workspace reset/)).toBeVisible();

  await page.getByRole("button", { name: "Run failure simulation" }).click();
  await expect(page.getByRole("button", { name: "Run failure simulation" })).toBeEnabled({
    timeout: 120_000,
  });

  await page.getByRole("link", { name: "Open exception queue" }).click();

  await expect(page.getByText("tracking_integrity_failure@1")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "tracking_integrity_failure@1" }).first().click();

  await expect(page.getByText("Deployment candidate and score")).toBeVisible();
  await expect(page.getByText("Exposure calculation breakdown")).toBeVisible();

  await page.getByRole("button", { name: "Replay Demo" }).click();
  await expect(page).toHaveURL(/\/incidents$/);
  await expect(page.getByText("recovered").first()).toBeVisible({ timeout: 90_000 });
});
