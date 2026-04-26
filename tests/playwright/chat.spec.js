const { test, expect } = require("@playwright/test");

test.describe("MusicMesh operator", () => {
  test("loads operator workbench and returns an assistant reply", async ({ page }) => {
    const marker = "PLAYWRIGHT_PONG_OK";

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Operator + graph workbench" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Live operator thread" })).toBeVisible();

    const composer = page.locator("#operator-demo-composer");
    await composer.fill(`Reply with exactly the word: ${marker}`);

    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".assistant-stream").last()).toContainText(marker, {
      timeout: 90_000
    });

    const errorBubble = page.getByText(/MusicMesh could not answer this request/i);
    await expect(errorBubble).toHaveCount(0);
  });
});
