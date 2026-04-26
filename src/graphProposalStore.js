const fs = require("fs");
const path = require("path");

const PROPOSAL_DIR = path.join(process.cwd(), "output", "graph-proposals");
const INDEX_FILE_PATH = path.join(PROPOSAL_DIR, "proposal-index.ndjson");

function ensureProposalDir() {
  fs.mkdirSync(PROPOSAL_DIR, { recursive: true });
}

function getProposalPath(proposalId) {
  return path.join(PROPOSAL_DIR, `${proposalId}.json`);
}

function getProposalPathLabel(proposalId) {
  return getProposalPath(proposalId);
}

function readProposalFile(proposalId) {
  const proposalPath = getProposalPath(proposalId);

  if (!fs.existsSync(proposalPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(proposalPath, "utf8"));
}

function writeProposalFile(proposal) {
  ensureProposalDir();
  fs.writeFileSync(getProposalPath(proposal.id), `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
}

function appendIndexRecord(proposal) {
  ensureProposalDir();
  const record = {
    id: proposal.id,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    status: proposal.status,
    title: proposal.title,
    entityCount: proposal.entities.length,
    candidateNodeCount: proposal.candidateNodes.length,
    candidateRelationshipCount: proposal.candidateRelationships.length
  };

  fs.appendFileSync(INDEX_FILE_PATH, `${JSON.stringify(record)}\n`, "utf8");
}

function collapseIndexRecords(records) {
  const byId = new Map();

  for (const record of records) {
    if (record && typeof record.id === "string") {
      byId.set(record.id, record);
    }
  }

  return [...byId.values()].sort((left, right) =>
    String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
  );
}

function readIndexRecords(limit = 50) {
  if (!fs.existsSync(INDEX_FILE_PATH)) {
    return [];
  }

  const records = fs
    .readFileSync(INDEX_FILE_PATH, "utf8")
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
  const collapsedRecords = collapseIndexRecords(records);

  if (!Number.isFinite(limit) || limit <= 0) {
    return collapsedRecords;
  }

  return collapsedRecords.slice(0, limit);
}

async function createProposal(proposal) {
  const now = new Date().toISOString();
  const nextProposal = {
    ...proposal,
    createdAt: proposal.createdAt || now,
    updatedAt: proposal.updatedAt || now
  };

  writeProposalFile(nextProposal);
  appendIndexRecord(nextProposal);
  return nextProposal;
}

async function updateProposal(proposalId, updater) {
  const currentProposal = readProposalFile(proposalId);

  if (!currentProposal) {
    throw new Error(`No graph proposal exists for id ${proposalId}.`);
  }

  const updatedProposal = {
    ...updater(currentProposal),
    updatedAt: new Date().toISOString()
  };

  writeProposalFile(updatedProposal);
  appendIndexRecord(updatedProposal);
  return updatedProposal;
}

async function getProposal(proposalId) {
  const proposal = readProposalFile(proposalId);

  if (!proposal) {
    throw new Error(`No graph proposal exists for id ${proposalId}.`);
  }

  return proposal;
}

async function listProposals(limit = 50) {
  return {
    proposalPath: PROPOSAL_DIR,
    proposals: readIndexRecords(limit)
  };
}

module.exports = {
  createProposal,
  getProposal,
  getProposalPathLabel,
  listProposals,
  updateProposal
};
