import { expect, test } from "@playwright/test";

test("demo replay incident to recovery flow", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("Demo workspace reset.")).toBeVisible();

  await page.getByRole("button", { name: "Run the 90-second protection demo" }).click();
  await expect(page).toHaveURL(/\/incidents\/[0-9a-f\-]+$/i, { timeout: 120_000 });

  await expect(page.getByText("Why CatchDrift fired this incident")).toBeVisible();
  await expect(page.getByText("Healthy vs degraded comparison")).toBeVisible();

  await page.getByRole("button", { name: "Replay Demo" }).click();
  await expect(page).toHaveURL(/\/incidents\/[0-9a-f\-]+$/i, { timeout: 120_000 });
  await expect(page.getByText("recovered").first()).toBeVisible({ timeout: 90_000 });
});
