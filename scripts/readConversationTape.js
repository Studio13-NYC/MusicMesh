const {
  getRuntimeLogPathLabel,
  getTapePathLabel,
  readRuntimeEvents,
  readTapeEntries
} = require("../src/activityStore");

async function main() {
  const limit = Number(process.argv[2] || 50);
  const entries = await readTapeEntries(limit);
  const runtimeEvents = await readRuntimeEvents(limit);

  console.log(`Conversation tape: ${getTapePathLabel()}`);
  console.log(`Showing ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.`);

  for (const entry of entries) {
    console.log("");
    console.log(`[${entry.createdAt}] ${entry.type} (${entry.threadId})`);
    console.log(JSON.stringify(entry.payload, null, 2));
  }

  console.log("");
  console.log(`Runtime log: ${getRuntimeLogPathLabel()}`);
  console.log(`Showing ${runtimeEvents.length} event${runtimeEvents.length === 1 ? "" : "s"}.`);

  for (const event of runtimeEvents) {
    console.log("");
    console.log(`[${event.createdAt}] ${event.type}`);
    console.log(JSON.stringify(event.payload, null, 2));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
