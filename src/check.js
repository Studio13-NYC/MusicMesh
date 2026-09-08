const { spawnSync } = require("child_process");
const { validateEnv } = require("./env");
const { resolveOpenAiModel } = require("./reasoningConfig");

const OPENAI_API_URL = "https://api.openai.com/v1/models";
const { getDatabase, closeDatabase } = require("./postgres");

function fail(message) {
  throw new Error(message);
}

function printSection(title) {
  console.log(`\n[${title}]`);
}

function checkEnv() {
  const result = validateEnv();

  printSection("env");
  console.log(`Env file: ${result.envPath}`);

  if (!result.exists) {
    fail("Missing .env file in the repo root.");
  }

  if (result.missingRequired.length > 0) {
    fail(`Missing required env keys: ${result.missingRequired.join(", ")}`);
  }

  console.log(`Required keys present: ${result.requiredEnvKeys.join(", ")}`);

  if (result.presentOptional.length > 0) {
    console.log(`Optional keys present: ${result.presentOptional.join(", ")}`);
  }

  if (result.missingOptional.length > 0) {
    console.log(`Optional keys missing: ${result.missingOptional.join(", ")}`);
  }
}

function checkPlaywright() {
  printSection("playwright");

  const result = spawnSync("npx playwright --version", {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
    shell: true
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    fail(`Playwright check failed${detail ? `: ${detail}` : "."}`);
  }

  console.log(result.stdout.trim());
}

async function checkOpenAI() {
  printSection("openai");

  const model = resolveOpenAiModel();
  const response = await fetch(`${OPENAI_API_URL}/${encodeURIComponent(model)}`, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    fail(
      `OpenAI connectivity check failed for model ${model}: ${response.status} ${response.statusText}${
        detail ? ` - ${detail}` : ""
      }`
    );
  }

  const payload = await response.json();
  console.log(`OpenAI connectivity passed for model: ${payload.id || model}`);
}

async function runCheck() {
  checkEnv();
  printSection("postgresql");
  try {
    const database = getDatabase();
    const [result] = await database.$queryRaw`SELECT current_database() AS database, version() AS version`;
    const nodes = await database.entity.count();
    const relationships = await database.relationship.count();
    console.log(`PostgreSQL connected: ${result.database}; ${nodes} nodes / ${relationships} relationships.`);
  } finally { await closeDatabase(); }
  await checkOpenAI();
  checkPlaywright();
  console.log("\nMusicMesh startup check passed.");
}

module.exports = {
  runCheck
};
