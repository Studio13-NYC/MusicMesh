const { validateEnv } = require("./env");
const { runCheck } = require("./check");
const { startServer } = require("./server");

const mode = process.argv[2] || "start";

function printEnvStatus(result) {
  console.log(`Env file: ${result.envPath}`);
  console.log(`Required keys: ${result.requiredEnvKeys.join(", ")}`);
  console.log(`Optional keys: ${result.optionalEnvKeys.join(", ")}`);

  if (!result.exists) {
    console.error("Missing .env file in the repo root.");
    process.exitCode = 1;
    return;
  }

  if (result.missingRequired.length > 0) {
    console.error(`Missing required env keys: ${result.missingRequired.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log("Required env keys are present.");

  if (result.presentOptional.length > 0) {
    console.log(`Optional env keys present: ${result.presentOptional.join(", ")}`);
  }

  if (result.missingOptional.length > 0) {
    console.log(`Optional env keys missing: ${result.missingOptional.join(", ")}`);
  }
}

if (mode === "--check") {
  runCheck().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else if (mode === "--smoke") {
  const envResult = validateEnv();

  if (!envResult.isValid) {
    printEnvStatus(envResult);
  } else {
    console.log("MusicMesh smoke passed: runtime booted and required env is present.");
  }
} else if (mode === "--test") {
  console.log("MusicMesh test placeholder: no tests are implemented yet.");
} else if (mode === "start") {
  startServer();
} else {
  console.log(`MusicMesh bootstrap received mode: ${mode}`);
}
