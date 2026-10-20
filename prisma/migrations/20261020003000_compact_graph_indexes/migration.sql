-- Public IDs and all foreign keys remain unchanged. domainId duplicates id and
-- is not queried. Graph traversal needs both endpoint indexes; retain targetId.
-- Type is separately indexed. Source neighborhoods filter their few rows by
-- type/target without storing the long target ID again in a compound index.
CREATE INDEX "entities_primaryLabel_idx" ON "entities"("primaryLabel");
CREATE INDEX "relationships_sourceId_idx" ON "relationships"("sourceId");
DROP INDEX "entities_primaryLabel_domainId_idx";
DROP INDEX "relationships_sourceId_type_targetId_idx";
