const {Prisma}=require('../../generated/prisma');
const {compactProperties,FIELDS}=require('../evidenceArchive');
const {DomainEntity,DomainRelationship}=require('./index');
const {toColumns,searchText,entityRecord}=require('../graphProperties');
const {entityFromGraph,relationshipFromGraph}=require('./serialization');
function nodeRow(node){
  if(!(node instanceof DomainEntity))throw new Error('Persistence requires a validated domain entity');
  return {id:node.id,labels:[node.type],primaryLabel:node.type,searchText:searchText(node.toGraphNode().properties,node.id),...toColumns(node.toGraphNode().properties)};
}
function edgeRow(edge){
  if(!(edge instanceof DomainRelationship))throw new Error('Persistence requires a validated domain relationship');
  return {id:edge.id,sourceId:edge.source,targetId:edge.target,type:edge.type,...toColumns(edge.toGraphRelationship().properties,true)};
}
function storageRow(object,relationship=false,compact=false){
 const row=(relationship?edgeRow:nodeRow)(object);
 if(compact)row.extra=compactProperties(row.extra);
 return row;
}
async function verifyRows(tx,rows,relationship=false){
 if(!rows.length)return;
 const table=Prisma.raw(relationship?'relationships':'entities');
 const conflicts=await tx.$queryRaw(Prisma.sql`SELECT src.id FROM jsonb_populate_recordset(NULL::${table}, ${JSON.stringify(rows)}::jsonb) src LEFT JOIN ${table} dst ON dst.id=src.id WHERE dst.id IS NULL OR to_jsonb(dst) IS DISTINCT FROM to_jsonb(src) LIMIT 1`);
 if(conflicts.length)throw new Error('Existing domain record conflict: '+conflicts[0].id);
}
/** Exact verification runs in PostgreSQL; only conflict IDs cross the network. */
async function persistDomainBatchInTransaction(tx,{nodes=[],relationships=[],compactEvidence=false,storageRows}){
 const nodeRows=storageRows?.nodes||nodes.map(n=>storageRow(n,false,compactEvidence)),edgeRows=storageRows?.relationships||relationships.map(e=>storageRow(e,true,compactEvidence));
 if(new Set(nodeRows.map(n=>n.id)).size!==nodeRows.length||new Set(edgeRows.map(e=>e.id)).size!==edgeRows.length)throw new Error('Duplicate identities within import batch');
 const insertedNodes=nodeRows.length?await tx.entity.createMany({data:nodeRows,skipDuplicates:true}):{count:0};
 await verifyRows(tx,nodeRows);
 if(relationships.length){
  const endpointIds=[...new Set(edgeRows.flatMap(row=>[row.sourceId,row.targetId]))];
  const rows=await tx.$queryRaw`SELECT id, labels, name, "domainId", extra - ${FIELDS}::text[] AS extra FROM entities WHERE id=ANY(${endpointIds}::text[])`;
  const endpoints=new Map(rows.map(row=>[row.id,entityFromGraph(entityRecord(row))]));
  for(const edge of relationships){
   try{relationshipFromGraph(edge.toGraphRelationship(),endpoints);}
   catch(error){throw new Error('Stored relationship endpoint validation failed: '+edge.id,{cause:error});}
  }
 }
 const insertedEdges=edgeRows.length?await tx.relationship.createMany({data:edgeRows,skipDuplicates:true}):{count:0};
 await verifyRows(tx,edgeRows,true);
 return {createdNodes:insertedNodes.count,createdRelationships:insertedEdges.count,verifiedNodes:nodeRows.length,verifiedRelationships:edgeRows.length};
}
// Row locks protect against non-cooperating writers as well as this importer's lock.
async function refreshRows(tx,objects,previous,relationship=false,compact=false){
 if(!previous?.size)return 0;
 const changed=objects.filter(o=>previous.has(o.id));
 if(!changed.length)return 0;
 const ids=changed.map(o=>o.id),table=Prisma.raw(relationship?'relationships':'entities');
 await tx.$queryRaw(Prisma.sql`SELECT id FROM ${table} WHERE id=ANY(${ids}::text[]) FOR UPDATE`);
 const candidates=changed.map(o=>({id:o.id,next:storageRow(o,relationship,compact),before:storageRow(previous.get(o.id),relationship),compactBefore:compact?storageRow(previous.get(o.id),relationship,true):null}));
 const states=await tx.$queryRaw(Prisma.sql`SELECT src.id, CASE WHEN to_jsonb(dst)=src.next THEN 'next' WHEN to_jsonb(dst)=src.before OR (${compact} AND to_jsonb(dst)=src."compactBefore") THEN 'before' ELSE 'conflict' END AS state FROM jsonb_to_recordset(${JSON.stringify(candidates)}::jsonb) AS src(id text,next jsonb,before jsonb,"compactBefore" jsonb) LEFT JOIN ${table} dst ON dst.id=src.id`);
 const conflict=states.find(s=>s.state==='conflict');
 if(conflict)throw new Error('Existing domain record conflict: '+conflict.id);
 const updateIds=new Set(states.filter(s=>s.state==='before').map(s=>s.id));
 const updates=candidates.filter(c=>updateIds.has(c.id)).map(c=>c.next);
 if(!updates.length)return 0;
 const columns=Object.keys(updates[0]).filter(key=>key!=='id');
 const assignments=Prisma.join(columns.map(key=>Prisma.sql`${Prisma.raw('"'+key+'"')} = src.${Prisma.raw('"'+key+'"')}`));
 const updated=await tx.$executeRaw(Prisma.sql`UPDATE ${table} AS dst SET ${assignments} FROM jsonb_populate_recordset(NULL::${table}, ${JSON.stringify(updates)}::jsonb) AS src WHERE dst.id=src.id`);
 if(updated!==updates.length)throw new Error('Refresh update count differs from locked rows');
 return updated;
}
async function persistDomainBatch(db,batch){
  const packed=batch.packedEvidence?await require('../packedImport').preparePackedImport(db,batch):null;
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73130908)::text`;
    const updatedNodes=packed?await require('../packedImport').refreshPackedRows(tx,packed.nodes,packed.beforeNodes,false):await refreshRows(tx,batch.nodes||[],batch.previousNodes,false,!!batch.compactEvidence);
    const updatedRelationships=packed?await require('../packedImport').refreshPackedRows(tx,packed.relationships,packed.beforeRelationships,true):await refreshRows(tx,batch.relationships||[],batch.previousRelationships,true,!!batch.compactEvidence);
    return {...await persistDomainBatchInTransaction(tx,{...batch,storageRows:packed}),updatedNodes,updatedRelationships};
  },{isolationLevel:'ReadCommitted',timeout:30000});
}
module.exports={persistDomainBatch,persistDomainBatchInTransaction,nodeRow,edgeRow,storageRow};
