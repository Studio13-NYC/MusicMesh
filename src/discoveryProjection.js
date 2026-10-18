// Small public evidence contract shared by catalog and researcher graph reads.
// Full provider bodies and private listening metadata never belong in this projection.
const keys = ['subjectId', 'factorId', 'role', 'scope', 'mode', 'overridesAssertionId',
  'sourceUrl', 'definitionUrl', 'excerpt', 'evidenceKind', 'confidenceScore',
  'confidenceReason', 'confidenceRevision', 'providerTypeName', 'attributes'];
function discoveryProperties(properties = {}) {
  return Object.fromEntries(keys.filter(key => properties[key] != null).map(key => [key, properties[key]]));
}
module.exports = { discoveryProperties };
