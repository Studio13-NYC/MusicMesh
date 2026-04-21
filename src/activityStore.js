const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output", "chat");
const TAPE_FILE_PATH = path.join(OUTPUT_DIR, "conversation-tape.ndjson");
const RUNTIME_FILE_PATH = path.join(OUTPUT_DIR, "runtime-events.ndjson");
const DEFAULT_BLOB_CONTAINER = "musicmeshchat";
const TAPE_BLOB_NAME = "conversation-tape.ndjson";
const RUNTIME_BLOB_NAME = "runtime-events.ndjson";

function getBlobConfig() {
  const connectionString = process.env.MUSICMESH_BLOB_CONNECTION_STRING;
  const containerName =
    process.env.MUSICMESH_BLOB_CONTAINER || DEFAULT_BLOB_CONTAINER;

  if (!connectionString) {
    return null;
  }

  return {
    connectionString,
    containerName
  };
}

function usingBlobStorage() {
  return Boolean(getBlobConfig());
}

function getTapePathLabel() {
  const blobConfig = getBlobConfig();

  if (blobConfig) {
    return `azureblob://${blobConfig.containerName}/${TAPE_BLOB_NAME}`;
  }

  return TAPE_FILE_PATH;
}

function getRuntimeLogPathLabel() {
  const blobConfig = getBlobConfig();

  if (blobConfig) {
    return `azureblob://${blobConfig.containerName}/${RUNTIME_BLOB_NAME}`;
  }

  return RUNTIME_FILE_PATH;
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function normalizeRecord(record, fallbackThreadId = "default-thread") {
  return {
    id: record.id,
    type: record.type,
    threadId: record.threadId || fallbackThreadId,
    createdAt: record.createdAt || new Date().toISOString(),
    payload: record.payload || {}
  };
}

function normalizeRuntimeEvent(event) {
  return {
    id: event.id,
    type: event.type,
    createdAt: event.createdAt || new Date().toISOString(),
    payload: event.payload || {}
  };
}

async function getAppendBlobClient(blobName) {
  const blobConfig = getBlobConfig();

  if (!blobConfig) {
    throw new Error("Azure Blob storage is not configured.");
  }

  const { BlobServiceClient } = require("@azure/storage-blob");
  const serviceClient = BlobServiceClient.fromConnectionString(
    blobConfig.connectionString
  );
  const containerClient = serviceClient.getContainerClient(blobConfig.containerName);
  await containerClient.createIfNotExists();

  const appendBlobClient = containerClient.getAppendBlobClient(blobName);
  const exists = await appendBlobClient.exists();

  if (!exists) {
    await appendBlobClient.create();
  }

  return appendBlobClient;
}

async function appendBlobRecord(blobName, record) {
  const appendBlobClient = await getAppendBlobClient(blobName);
  const line = `${JSON.stringify(record)}\n`;
  const buffer = Buffer.from(line, "utf8");
  await appendBlobClient.appendBlock(buffer, buffer.length);
}

async function readBlobRecords(blobName, limit) {
  const appendBlobClient = await getAppendBlobClient(blobName);
  const download = await appendBlobClient.download();
  const contents = await streamToString(download.readableStreamBody);
  return parseNdjson(contents, limit);
}

function appendFileRecord(filePath, record) {
  ensureOutputDir();
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

function readFileRecords(filePath, limit) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const contents = fs.readFileSync(filePath, "utf8");
  return parseNdjson(contents, limit);
}

function parseNdjson(contents, limit) {
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

async function appendTapeEntry(entry) {
  const normalizedEntry = normalizeRecord(entry);

  if (usingBlobStorage()) {
    await appendBlobRecord(TAPE_BLOB_NAME, normalizedEntry);
  } else {
    appendFileRecord(TAPE_FILE_PATH, normalizedEntry);
  }

  return normalizedEntry;
}

async function readTapeEntries(limit = 100) {
  if (usingBlobStorage()) {
    return readBlobRecords(TAPE_BLOB_NAME, limit);
  }

  return readFileRecords(TAPE_FILE_PATH, limit);
}

async function appendRuntimeEvent(event) {
  const normalizedEvent = normalizeRuntimeEvent(event);

  if (usingBlobStorage()) {
    await appendBlobRecord(RUNTIME_BLOB_NAME, normalizedEvent);
  } else {
    appendFileRecord(RUNTIME_FILE_PATH, normalizedEvent);
  }

  return normalizedEvent;
}

async function readRuntimeEvents(limit = 100) {
  if (usingBlobStorage()) {
    return readBlobRecords(RUNTIME_BLOB_NAME, limit);
  }

  return readFileRecords(RUNTIME_FILE_PATH, limit);
}

async function streamToString(readable) {
  if (!readable) {
    return "";
  }

  const chunks = [];

  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

module.exports = {
  appendRuntimeEvent,
  appendTapeEntry,
  getRuntimeLogPathLabel,
  getTapePathLabel,
  readRuntimeEvents,
  readTapeEntries,
  usingBlobStorage
};
