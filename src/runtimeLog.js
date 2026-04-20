const fs = require("fs");
const path = require("path");

const outputDir = path.join(process.cwd(), "output", "chat");
const runtimeLogPath = path.join(outputDir, "runtime-events.ndjson");

function ensureRuntimeDir() {
  fs.mkdirSync(outputDir, { recursive: true });
}

function appendRuntimeEvent(event) {
  ensureRuntimeDir();

  const normalizedEvent = {
    id: event.id,
    type: event.type,
    createdAt: event.createdAt || new Date().toISOString(),
    payload: event.payload || {}
  };

  fs.appendFileSync(runtimeLogPath, `${JSON.stringify(normalizedEvent)}\n`, "utf8");
  return normalizedEvent;
}

function readRuntimeEvents(limit = 100) {
  if (!fs.existsSync(runtimeLogPath)) {
    return [];
  }

  const contents = fs.readFileSync(runtimeLogPath, "utf8");
  const events = contents
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (!Number.isFinite(limit) || limit <= 0) {
    return events;
  }

  return events.slice(-limit);
}

module.exports = {
  appendRuntimeEvent,
  readRuntimeEvents,
  runtimeLogPath
};
