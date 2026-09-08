-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "domainId" TEXT,
    "labels" TEXT[],
    "primaryLabel" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "name" TEXT,
    "label" TEXT,
    "description" TEXT,
    "aliasesJson" TEXT,
    "canonicalStatus" TEXT,
    "isProposed" BOOLEAN,
    "source" TEXT,
    "threadId" TEXT,
    "turnId" TEXT,
    "lastChatThreadId" TEXT,
    "lastChatTurnId" TEXT,
    "lastChatSource" TEXT,
    "updatedAt" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "evidenceBasis" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "year" DOUBLE PRECISION,
    "basis" TEXT,
    "role" TEXT,
    "foundingMember" BOOLEAN,
    "date" TEXT,
    "performanceName" TEXT,
    "format" TEXT,
    "position" DOUBLE PRECISION,
    "canonicalStatus" TEXT,
    "isProposed" BOOLEAN,
    "source" TEXT,
    "threadId" TEXT,
    "turnId" TEXT,
    "lastChatThreadId" TEXT,
    "lastChatTurnId" TEXT,
    "lastChatSource" TEXT,
    "updatedAt" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "evidenceBasis" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "sourceHash" TEXT NOT NULL,
    "importedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nodes" INTEGER NOT NULL,
    "relationships" INTEGER NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("sourceHash")
);

-- CreateIndex
CREATE INDEX "entities_primaryLabel_domainId_idx" ON "entities"("primaryLabel", "domainId");

-- CreateIndex
CREATE INDEX "entities_labels_idx" ON "entities" USING GIN ("labels");

-- CreateIndex
CREATE INDEX "relationships_sourceId_type_targetId_idx" ON "relationships"("sourceId", "type", "targetId");

-- CreateIndex
CREATE INDEX "relationships_targetId_idx" ON "relationships"("targetId");

-- CreateIndex
CREATE INDEX "relationships_type_idx" ON "relationships"("type");

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
