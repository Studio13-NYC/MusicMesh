const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const outputDir = path.join(root, "output", "playwright");
const outputPath = path.join(outputDir, "smoke.png");
const tempHtmlPath = path.join(os.tmpdir(), "musicmesh-playwright-smoke.html");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>MusicMesh Playwright Smoke</title>
    <style>
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: linear-gradient(135deg, #111827, #1f2937);
        color: #f9fafb;
        display: grid;
        place-items: center;
        min-height: 100vh;
      }

      main {
        padding: 32px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.08);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>MusicMesh Playwright Smoke</h1>
      <p>If you can read this in the screenshot, browser automation is working.</p>
    </main>
  </body>
</html>`;

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(tempHtmlPath, html, "utf8");

const pageUrl = `file:///${tempHtmlPath.replace(/\\/g, "/")}`;
const result =
  process.platform === "win32"
    ? spawnSync(
        `npx playwright screenshot --browser=chromium "${pageUrl}" "${outputPath}"`,
        {
          cwd: root,
          encoding: "utf8",
          stdio: "pipe",
          shell: true
        }
      )
    : spawnSync(
        "npx",
        ["playwright", "screenshot", "--browser=chromium", pageUrl, outputPath],
        {
          cwd: root,
          encoding: "utf8",
          stdio: "pipe"
        }
      );

if (result.error) {
  console.error(result.error.message);
  process.exit(result.status || 1);
}

if (result.status !== 0) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.exit(result.status || 1);
}

console.log(`Playwright smoke passed: ${outputPath}`);
