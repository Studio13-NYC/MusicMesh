const { getDatabase } = require("./postgres");
const store = require("./graphStore");
const { getOntology } = require("./domain");
const DEFAULT_LOOKUP_LIMIT = 5;
const DEFAULT_TRAVERSAL_DEPTH = 2;
const DEFAULT_TRAVERSAL_PATH_LIMIT = 120;
const DEFAULT_TRAVERSAL_NODE_LIMIT = 80;
const DEFAULT_TRAVERSAL_EDGE_LIMIT = 140;

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function toNativeValue(value) {
  return value;
}

function stableString(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function pickNodeLabel(properties, fallbackId) {
  const keys = [
    "name",
    "title",
    "displayName",
    "label",
    "fullName",
    "stageName",
    "canonicalName",
    "id",
  ];

  for (const key of keys) {
    const candidate = stableString(properties[key]);

    if (candidate) {
      return candidate;
    }
  }

  return fallbackId;
}

function pickNodeKind(labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return "Node";
  }

  return [...labels].sort((left, right) => left.localeCompare(right))[0];
}

function normalizeCanonNode(record) {
  const properties = toNativeValue(record.properties || {});
  const labels = Array.isArray(record.labels)
    ? record.labels.map((label) => stableString(label))
    : [];
  const id = stableString(record.id);

  return {
    id,
    labels,
    kind: pickNodeKind(labels),
    label: pickNodeLabel(properties, id),
    degree: Number(toNativeValue(record.degree) || 0),
    properties,
  };
}

async function lookupCanonEntities(entities, options = {}) {
  const limit = clampInteger(options.limit, 1, 20, DEFAULT_LOOKUP_LIMIT);
  const normalizedEntities = (Array.isArray(entities) ? entities : [])
    .map((entity) => {
      if (typeof entity === "string") {
        return { name: entity.trim(), type: "" };
      }

      return {
        name: stableString(entity.name || entity.label || entity.title),
        type: stableString(entity.type || entity.kind || entity.labelType),
      };
    })
    .filter((entity) => entity.name);

  if (normalizedEntities.length === 0) {
    return [];
  }

  const results=[];
  // Keep a large model plan from occupying every connection in the small runtime pool.
  for(const input of normalizedEntities.slice(0,80))results.push({
      input,
      matches: (await store.searchEntities(input.name, limit, [], true)).filter(isDomainRecord).map(
        (match) => ({
          ...normalizeCanonNode(match),
          matchRank: match.matchRank,
        }),
      ),
    });
  return results;
}

// A bounded evidence projection, not the raw provider payload or browser claims.
function isDomainRecord(record){
  if(!record.properties?.ontologyVersion)return false;
  try {require('./domain/serialization').entityFromGraph(record);return true;}catch{return false;}
}
function catalogProperties(properties={}) {
  const keys=['video','country','evidenceRefs','detailsRef','evidenceStorageVersion','externalId','description','disambiguation','artistType','durationMs','firstReleaseDate','hydrationStatus','credits','releaseId','date','barcode','catalogNumber','format','number','mediumId','recordingId','position','source','evidenceBasis','providerTypeId','providerTypeName','sourceType','targetType','definitionUrl','beginDate','endDate','ended','attributes','features','extractorVersion','submissionId','audioProperties','recordingIds','analysisIds','method','methodVersion','featureFamily','cohortId','score','scoreMeaning','explanation','cohortSize','interpretation','selectionPolicy','selectionLimitation'];
  const projected=Object.fromEntries(keys.filter(key=>Object.hasOwn(properties,key)).map(key=>[key,properties[key]]));
  for(const key of ['disambiguation','attributes','ended','video','country'])if(properties.rawProvider?.[key]!==undefined&&!Object.hasOwn(projected,key))projected[key]=properties.rawProvider[key];
  if(properties.providerEvidence&&!Array.isArray(properties.providerEvidence))projected.providerEvidence=properties.providerEvidence;
  return projected;
}
async function readCatalogContext(graphContext={}) {
  const ids=[...new Set([graphContext?.selectedNode?.id,graphContext?.currentView?.seedNode?.id].map(stableString).filter(Boolean))];
  if(!ids.length)return {nodes:[],relationships:[]};
  const graph=await traverseCanonNeighborhood(ids,{depth:1,pathLimit:200,nodeLimit:80,edgeLimit:160});
  const nodes=graph.nodes.filter(isDomainRecord).map(node=>({...node,properties:catalogProperties(node.properties)}));
  const publicIds=new Set(nodes.map(node=>node.id));
  return {nodes,relationships:graph.relationships.filter(edge=>publicIds.has(edge.source)&&publicIds.has(edge.target)).map(edge=>({...edge,properties:catalogProperties(edge.properties)}))};
}
async function lookupCanonRelationships(ids) {
  const publicNodes=await getDatabase().entity.findMany({where:{id:{in:[...new Set(ids)].slice(0,200)},primaryLabel:{in:Object.values(getOntology().entities).filter(d=>d.visibility!=='private').map(d=>d.key)}},select:{id:true}});
  const publicIds=publicNodes.map(node=>node.id);
  return (await getDatabase().relationship.findMany({where:{sourceId:{in:publicIds},targetId:{in:publicIds}},orderBy:{id:'asc'},take:200})).map(row=>{
    const edge=require('./graphProperties').relationshipRecord(row);
    return {...edge,properties:catalogProperties(edge.properties)};
  });
}

async function inspectSchema() {
  const db = getDatabase();
  const ontology=getOntology(),definitions=Object.values(ontology.entities).filter(d=>d.visibility!=="private");
  const privateLabels=Object.values(ontology.entities).filter(d=>d.visibility==="private").map(d=>d.key);
  const [nodes,relationships]=await Promise.all([
    db.entity.groupBy({by:["primaryLabel"],where:{NOT:{labels:{hasSome:privateLabels}}}}),
    db.$queryRaw`SELECT DISTINCT r.type FROM relationships r JOIN entities s ON s.id=r."sourceId" JOIN entities t ON t.id=r."targetId" WHERE NOT s.labels && ${privateLabels}::text[] AND NOT t.labels && ${privateLabels}::text[]`
  ]);
  return {nodeLabels:nodes.map(n=>n.primaryLabel).sort(),relationshipTypes:relationships.map(r=>r.type).sort(),
    nodePropertyKeys:[...new Set(["id","name","description","externalId","hydrationStatus",...definitions.flatMap(d=>Object.keys(d.fields))])].sort(),
    relationshipPropertyKeys:[...new Set(["assertionKey",...Object.values(ontology.relationships).flatMap(d=>Object.keys(d.fields))])].sort(),
    semanticVersion:ontology.version};
}

function normalizeRelationshipRecord(record) {
  return {
    id: stableString(record.id),
    source: stableString(record.source),
    target: stableString(record.target),
    type: stableString(record.type) || "RELATED_TO",
    properties: toNativeValue(record.properties || {}),
  };
}

async function traverseCanonNeighborhood(seedIds, options = {}) {
  const normalizedSeedIds = [
    ...new Set((seedIds || []).map((id) => stableString(id)).filter(Boolean)),
  ];

  if (normalizedSeedIds.length === 0) {
    return {
      depth: 0,
      seeds: [],
      nodes: [],
      relationships: [],
      bridgeNodes: [],
      relationshipTypeCounts: [],
    };
  }

  const depth = clampInteger(options.depth, 1, 3, DEFAULT_TRAVERSAL_DEPTH);
  const pathLimit = clampInteger(
    options.pathLimit,
    1,
    400,
    DEFAULT_TRAVERSAL_PATH_LIMIT,
  );
  const nodeLimit = clampInteger(
    options.nodeLimit,
    1,
    200,
    DEFAULT_TRAVERSAL_NODE_LIMIT,
  );
  const edgeLimit = clampInteger(
    options.edgeLimit,
    1,
    300,
    DEFAULT_TRAVERSAL_EDGE_LIMIT,
  );
  const payload = await store.neighborhood(normalizedSeedIds, {
    depth,
    pathLimit,
    nodeLimit,
    edgeLimit,
  });
  const nodes = toNativeValue(payload.nodes || []).map((node) =>
    normalizeCanonNode(node),
  );
  const relationships = toNativeValue(payload.relationships || []).map(
    (relationship) => normalizeRelationshipRecord(relationship),
  );
  const seedIdSet = new Set(normalizedSeedIds);
  const bridgeNodeIds = new Set();

  for (const node of nodes) {
    if (seedIdSet.has(node.id)) {
      continue;
    }

    const connectedSeedIds = new Set();

    for (const relationship of relationships) {
      if (
        relationship.source === node.id &&
        seedIdSet.has(relationship.target)
      ) {
        connectedSeedIds.add(relationship.target);
      }

      if (
        relationship.target === node.id &&
        seedIdSet.has(relationship.source)
      ) {
        connectedSeedIds.add(relationship.source);
      }
    }

    if (connectedSeedIds.size > 1) {
      bridgeNodeIds.add(node.id);
    }
  }
  const relationshipTypeCounts = [
    ...relationships.reduce((counts, relationship) => {
      counts.set(relationship.type, (counts.get(relationship.type) || 0) + 1);
      return counts;
    }, new Map()),
  ]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return String(left.type).localeCompare(String(right.type));
    });

  return {
    depth,
    seeds: toNativeValue(payload.seeds || []),
    nodes,
    relationships,
    bridgeNodes: nodes.filter((node) => bridgeNodeIds.has(node.id)),
    relationshipTypeCounts,
  };
}

module.exports = {
  inspectSchema,
  catalogProperties,
  isDomainRecord,
  readCatalogContext,
  lookupCanonRelationships,
  lookupCanonEntities,
  stableString,
  toNativeValue,
  traverseCanonNeighborhood,
};
