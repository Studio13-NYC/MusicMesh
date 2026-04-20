const fs = require("fs");
const path = require("path");

const outputDir = path.join(process.cwd(), "output", "chat");
const tapePath = path.join(outputDir, "conversation-tape.ndjson");

function ensureTapeDir() {
  fs.mkdirSync(outputDir, { recursive: true });
}

function appendTapeEntry(entry) {
  ensureTapeDir();

  const normalizedEntry = {
    id: entry.id,
    type: entry.type,
    threadId: entry.threadId || "default-thread",
    createdAt: entry.createdAt || new Date().toISOString(),
    payload: entry.payload || {}
  };

  fs.appendFileSync(tapePath, `${JSON.stringify(normalizedEntry)}\n`, "utf8");
  return normalizedEntry;
}

function readTapeEntries(limit = 100) {
  if (!fs.existsSync(tapePath)) {
    return [];
  }

  const contents = fs.readFileSync(tapePath, "utf8");
  const entries = contents
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
    return entries;
  }

  return entries.slice(-limit);
}

module.exports = {
  appendTapeEntry,
  readTapeEntries,
  tapePath
};
