import { expect, test } from "@playwright/test";

test("demo replay incident to recovery flow", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("Demo workspace reset.")).toBeVisible();

  await page.getByRole("button", { name: "Run the 90-second protection demo" }).click();
  await expect(page).toHaveURL(/\/incidents\/[0-9a-f\-]+$/i, { timeout: 120_000 });
  const firstIncidentUrl = page.url();
  const firstIncidentId = firstIncidentUrl.split("/").pop() ?? "";
  expect(firstIncidentId).toMatch(/^[0-9a-f\-]+$/i);

  await expect(page.getByText("Why CatchDrift fired this incident")).toBeVisible();
  await expect(page.getByText("Healthy vs degraded comparison")).toBeVisible();

  await page.getByRole("button", { name: "Generate investigation brief" }).click();
  await expect(
    page
      .locator("text=AI-generated investigation brief")
      .or(page.locator("text=Deterministic investigation brief")),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Replay Demo" }).click();
  await expect(page).toHaveURL(/\/incidents$/i, { timeout: 120_000 });
  await expect(page.getByText("recovered").first()).toBeVisible({ timeout: 90_000 });

  const latestIncidentLink = page.locator("tbody a[href^='/incidents/']").first();
  await expect(latestIncidentLink).toBeVisible();
  const latestHref = await latestIncidentLink.getAttribute("href");
  const latestIncidentId = latestHref?.split("/").pop() ?? "";

  expect(latestIncidentId).toMatch(/^[0-9a-f\-]+$/i);
  expect(latestIncidentId).not.toBe(firstIncidentId);

  await latestIncidentLink.click();
  await expect(page).toHaveURL(new RegExp(`/incidents/${latestIncidentId}$`, "i"));
  await expect(page.getByRole("button", { name: "Generate investigation brief" })).toBeVisible();
});
