const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(process.cwd(), ".env");

const requiredEnvKeys = [
  "OPENAI_API_KEY",
  "NEO4J_URI",
  "NEO4J_USERNAME",
  "NEO4J_PASSWORD",
  "NEO4J_DATABASE"
];

const optionalEnvKeys = [
  "BRAVE_API_KEY",
  "DISCOGS_TOKEN",
  "MUSICMESH_HTTP_USER_AGENT",
  "MUSICMESH_BLOB_CONNECTION_STRING",
  "MUSICMESH_BLOB_CONTAINER",
  "AURA_INSTANCEID",
  "AURA_INSTANCENAME"
];

function stripWrappingQuotes(value) {
  if (!value) {
    return value;
  }

  const startsWithQuote = value.startsWith("\"") || value.startsWith("'");
  const endsWithQuote = value.endsWith("\"") || value.endsWith("'");

  if (startsWithQuote && endsWithQuote) {
    return value.slice(1, -1);
  }

  return value;
}

function parseDotEnv(contents) {
  const values = {};
  const lines = contents.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    values[key] = stripWrappingQuotes(rawValue);
  }

  return values;
}

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    return {
      envPath: ENV_PATH,
      values: {},
      exists: false
    };
  }

  const contents = fs.readFileSync(ENV_PATH, "utf8");
  const values = parseDotEnv(contents);

  for (const [key, value] of Object.entries(values)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  return {
    envPath: ENV_PATH,
    values,
    exists: true
  };
}

function validateEnv() {
  const envFile = loadEnvFile();
  const missingRequired = requiredEnvKeys.filter((key) => !process.env[key]);
  const presentOptional = optionalEnvKeys.filter((key) => Boolean(process.env[key]));
  const missingOptional = optionalEnvKeys.filter((key) => !process.env[key]);

  return {
    ...envFile,
    requiredEnvKeys,
    optionalEnvKeys,
    missingRequired,
    presentOptional,
    missingOptional,
    // Allow injected process.env (Azure SWA app settings, CI) without a repo-root .env file.
    isValid: missingRequired.length === 0
  };
}

module.exports = {
  ENV_PATH,
  requiredEnvKeys,
  optionalEnvKeys,
  validateEnv
};
