const { readTapeEntries, tapePath } = require("../src/conversationTape");
const { readRuntimeEvents, runtimeLogPath } = require("../src/runtimeLog");

const limit = Number(process.argv[2] || 50);
const entries = readTapeEntries(limit);
const runtimeEvents = readRuntimeEvents(limit);

console.log(`Conversation tape: ${tapePath}`);
console.log(`Showing ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.`);

for (const entry of entries) {
  console.log("");
  console.log(`[${entry.createdAt}] ${entry.type} (${entry.threadId})`);
  console.log(JSON.stringify(entry.payload, null, 2));
}

console.log("");
console.log(`Runtime log: ${runtimeLogPath}`);
console.log(`Showing ${runtimeEvents.length} event${runtimeEvents.length === 1 ? "" : "s"}.`);

for (const event of runtimeEvents) {
  console.log("");
  console.log(`[${event.createdAt}] ${event.type}`);
  console.log(JSON.stringify(event.payload, null, 2));
}
