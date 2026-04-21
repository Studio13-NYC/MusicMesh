const { test, expect } = require("@playwright/test");

test.describe("MusicMesh chat", () => {
  test("loads shell and returns an assistant reply", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Live operator chat" })).toBeVisible();

    const composer = page.locator("#musicmesh-composer");
    await composer.fill("Reply with exactly the word: pong");

    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText(/pong/i)).toBeVisible({ timeout: 90_000 });

    const errorBubble = page.getByText(/MusicMesh could not answer this request/i);
    await expect(errorBubble).toHaveCount(0);
  });
});
