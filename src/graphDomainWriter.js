const {createHash}=require('node:crypto');
const {getDatabase}=require('./postgres');
const domain=require('./domain');
const {entityRecord,relationshipRecord}=require('./graphProperties');
const {entityFromGraph,relationshipFromGraph}=require('./domain/serialization');
const {persistDomainBatchInTransaction}=require('./domain/repository');

const IMPORT_ONLY=new Set(['ListeningEvent','IdentityMapping','AcousticAnalysis','SimilarityAssessment']);
const ALLOWED_NODE_LABELS=new Set(Object.values(domain.getOntology().entities).filter(type=>type.visibility!=='private').map(type=>type.key));
const IMPORT_ONLY_RELATIONSHIPS=new Set(['MusicBrainzRelationship','ReleaseLabel','RedirectsTo','HasMapping','MapsToRecording','AnalysisOf','ComparesRecording','SupportedByAnalysis']);
function stableString(value){return typeof value==='string'?value.trim():typeof value==='number'||typeof value==='boolean'?String(value):'';}
function sanitizeIdentifier(value,fallback){return stableString(value).replace(/[^A-Za-z0-9_]/g,'_').replace(/^([^A-Za-z_])/,'_$1')||fallback;}
function chatIdentity(threadId,turnId,tempId){return 'musicmesh:chat:'+createHash('sha256').update(JSON.stringify([threadId,turnId,tempId])).digest('hex');}
function nodeType(node){
  const labels=[...new Set([...(node.labels||[]),node.type].filter(Boolean))];
  if(labels.length!==1||!ALLOWED_NODE_LABELS.has(labels[0]))throw new Error('Chat requires one declared public domain class; unknown and import-only types cannot be created');
  return labels[0];
}
function newProperties(input,context){
  const properties={...(input.properties||{})};
  for(const reserved of ['externalId','rawProvider','providerEvidence','observations','evidenceRefs','detailsRef','evidenceStorageVersion','hydrationStatus','providerTypeId','providerTypeName','responseHash','definitionUrl']){
    if(Object.hasOwn(properties,reserved))throw new Error('Chat cannot create provider or analysis evidence');
  }
  for(const key of ['id','name','ontologyVersion','assertionKey'])delete properties[key];
  return {...properties,source:'chat',evidenceBasis:'chat-assertion',threadId:context.threadId,turnId:context.turnId,
    ...(Number.isFinite(input.confidenceScore)?{confidenceScore:input.confidenceScore}:{})};
}
/** Validates a complete chat patch before committing. Provider records are read-only here. */
async function persistChatGraph({groundedGraph,threadId,turnId}){
  if(!stableString(threadId)||!stableString(turnId))throw new Error('Chat persistence requires stable thread and turn identities');
  const inputs=groundedGraph?.nodes||[],relations=groundedGraph?.relationships||[],context={threadId,turnId};
  const refs=new Map(),types=new Map();
  for(const node of inputs){
    const ref=stableString(node.tempId||node.id);
    if(!ref||refs.has(ref))throw new Error('Chat node references must be present and unique');
    types.set(ref,nodeType(node));
    refs.set(ref,stableString(node.matchedCanonId)||chatIdentity(threadId,turnId,ref));
  }
  return getDatabase().$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73130908)::text`;
    const stored=new Map((await tx.entity.findMany({where:{id:{in:[...refs.values()]}}})).map(row=>[row.id,row]));
    const objects=new Map(),newNodes=[],persistedNodes=[];
    for(const node of inputs){
      const ref=stableString(node.tempId||node.id),id=refs.get(ref),type=types.get(ref),row=stored.get(id);
      let object;
      if(row){
        object=entityFromGraph(entityRecord(row));
        if(object.type!==type)throw new Error('Matched stored entity class differs from the planned class');
        if(!node.matchedCanonId && (row.threadId!==threadId||row.turnId!==turnId))throw new Error('Chat identity belongs to another operation');
      }else{
        if(IMPORT_ONLY.has(type))throw new Error('Analysis classes are importer-owned; chat may only reference a stored public analysis');
        if(node.matchedCanonId)throw new Error('Matched entity no longer exists');
        if(node.externalId)throw new Error('Chat cannot create provider identities');
        const properties=newProperties(node,context);
        for(const key of ['releaseId','mediumId','recordingId'])if(refs.has(properties[key]))properties[key]=refs.get(properties[key]);
        if(Array.isArray(properties.credits))properties.credits=properties.credits.map(credit=>({...credit,artistId:refs.get(credit.artistId)||credit.artistId}));
        object=new domain[type]({id,name:stableString(node.name||node.label),properties});newNodes.push(object);
      }
      objects.set(ref,object);
      persistedNodes.push({tempId:ref,elementId:object.id,id:object.id,label:object.name,labels:[object.type],action:row?'matched':'created'});
    }
    const newEdges=[],persistedRelationships=[];
    for(const [index,edge] of relations.entries()){
      const source=objects.get(stableString(edge.sourceRef||edge.sourceId)),target=objects.get(stableString(edge.targetRef||edge.targetId));
      if(!source||!target)throw new Error('Relationship endpoint is absent from this patch');
      const type=stableString(edge.type);
      if(!Object.hasOwn(domain.getOntology().relationships,type))throw new Error('Unknown relationship class; declare its semantics before persistence');
      let object;
      if(edge.matchedRelationshipId){
        const row=await tx.relationship.findUnique({where:{id:edge.matchedRelationshipId}});
        if(!row||row.sourceId!==source.id||row.targetId!==target.id||row.type!==type)throw new Error('Matched relationship does not match the stored endpoints/type');
        object=relationshipFromGraph(relationshipRecord(row),new Map([[source.id,source],[target.id,target]]));
      }else{
        if(IMPORT_ONLY_RELATIONSHIPS.has(type))throw new Error('Provider and acoustic relationships require an existing verified relationship ID');
        const assertion=stableString(edge.assertionKey||edge.properties?.assertionKey||edge.tempId)||'relation-'+index;
        object=new domain[type]({source,target,assertionKey:JSON.stringify([threadId,turnId,assertion]),properties:newProperties(edge,context)});
        newEdges.push(object);
      }
      persistedRelationships.push({elementId:object.id,type:object.type,sourceElementId:object.source,targetElementId:object.target});
    }
    await persistDomainBatchInTransaction(tx,{nodes:newNodes,relationships:newEdges});
    const anchorRef=stableString(groundedGraph?.anchor?.tempId||groundedGraph?.anchor?.id);
    return {persistedAt:new Date().toISOString(),anchor:persistedNodes.find(node=>node.tempId===anchorRef)||persistedNodes[0]||null,
      persistedNodeCount:persistedNodes.length,persistedRelationshipCount:persistedRelationships.length,skippedRelationshipCount:0,persistedNodes,persistedRelationships,skippedRelationships:[]};
  },{timeout:60000,maxWait:15000});
}
module.exports={ALLOWED_NODE_LABELS,persistChatGraph,sanitizeIdentifier,stableString};
