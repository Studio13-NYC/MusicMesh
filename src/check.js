const { spawnSync } = require("child_process");
const { validateEnv } = require("./env");
const { resolveOpenAiModel } = require("./reasoningConfig");

const OPENAI_API_URL = "https://api.openai.com/v1/models";
const REQUIRED_DOCKER_MCP_TOOLS = ["read_neo4j_cypher", "browser_navigate"];

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

function checkGraphViaMcp() {
  printSection("graph");

  const result = spawnSync('docker mcp tools call read_neo4j_cypher query="RETURN 1 AS ok"', {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
    shell: true
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    fail(`Neo4j MCP connectivity check failed${detail ? `: ${detail}` : "."}`);
  }

  const output = (result.stdout || "").trim();

  if (!output.includes('"ok": 1') && !output.includes('"ok":1')) {
    fail(`Unexpected Neo4j MCP query result: ${output}`);
  }

  console.log("Neo4j MCP query passed: read_neo4j_cypher query=\"RETURN 1 AS ok\"");
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

function checkDockerMcpGateway() {
  printSection("docker-mcp");

  const result = spawnSync("docker mcp tools ls", {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
    shell: true
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    fail(`Docker MCP gateway check failed${detail ? `: ${detail}` : "."}`);
  }

  const output = result.stdout || "";
  const missingTools = REQUIRED_DOCKER_MCP_TOOLS.filter((toolName) => !output.includes(toolName));

  if (missingTools.length > 0) {
    fail(
      `Docker MCP gateway is reachable but missing expected tools: ${missingTools.join(", ")}`
    );
  }

  console.log("Docker MCP gateway is available.");
  console.log(`Required MCP tools found: ${REQUIRED_DOCKER_MCP_TOOLS.join(", ")}`);
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
  checkDockerMcpGateway();
  checkGraphViaMcp();
  await checkOpenAI();
  checkPlaywright();
  console.log("\nMusicMesh startup check passed.");
}

module.exports = {
  runCheck
};
