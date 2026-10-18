const assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
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
function compare(expected,actual){
  try {assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k=>[k,actual?.[k]])),expected);}
  catch {throw new Error(`Existing domain record conflict: ${expected.id}`);}
}
/** One atomic, repeatable batch. Never overwrite a correction or an older differing assertion. */
async function persistDomainBatchInTransaction(tx,{nodes=[],relationships=[]}){
  const nodeRows=nodes.map(nodeRow),edgeRows=relationships.map(edgeRow);
  if(new Set(nodeRows.map(n=>n.id)).size!==nodeRows.length || new Set(edgeRows.map(e=>e.id)).size!==edgeRows.length)throw new Error('Duplicate identities within import batch');
    const insertedNodes=nodeRows.length?await tx.entity.createMany({data:nodeRows,skipDuplicates:true}):{count:0};
    const actualNodes=new Map((await tx.entity.findMany({where:{id:{in:nodeRows.map(n=>n.id)}}})).map(n=>[n.id,n]));
    for(const row of nodeRows)compare(row,actualNodes.get(row.id));
    if(relationships.length){
      const endpointIds=[...new Set(edgeRows.flatMap(row=>[row.sourceId,row.targetId]))];
      const endpoints=new Map((await tx.entity.findMany({where:{id:{in:endpointIds}}})).map(row=>[row.id,entityFromGraph(entityRecord(row))]));
      for(const edge of relationships){
        try {relationshipFromGraph(edge.toGraphRelationship(),endpoints);}
        catch(error){throw new Error(`Stored relationship endpoint validation failed: ${edge.id}`,{cause:error});}
      }
    }
    const insertedEdges=edgeRows.length?await tx.relationship.createMany({data:edgeRows,skipDuplicates:true}):{count:0};
    const actualEdges=new Map((await tx.relationship.findMany({where:{id:{in:edgeRows.map(e=>e.id)}}})).map(e=>[e.id,e]));
    for(const row of edgeRows)compare(row,actualEdges.get(row.id));
    return {createdNodes:insertedNodes.count,createdRelationships:insertedEdges.count,verifiedNodes:nodeRows.length,verifiedRelationships:edgeRows.length};
}
// A refresh is an explicit compare-and-swap against a previously imported snapshot.
// Row locks also protect against writers that do not use our advisory lock.
async function refreshRows(tx,objects,previous,relationship=false){
  if(!previous?.size)return 0;
  const changed=objects.filter(o=>previous.has(o.id));
  if(!changed.length)return 0;
  const ids=changed.map(o=>o.id),table=relationship?tx.relationship:tx.entity,toRow=relationship?edgeRow:nodeRow;
  if(relationship)await tx.$queryRaw`SELECT id FROM relationships WHERE id = ANY(${ids}::text[]) FOR UPDATE`;
  else await tx.$queryRaw`SELECT id FROM entities WHERE id = ANY(${ids}::text[]) FOR UPDATE`;
  const current=new Map((await table.findMany({where:{id:{in:ids}}})).map(r=>[r.id,r]));
  let updated=0;
  for(const object of changed){
    const next=toRow(object),before=toRow(previous.get(object.id)),actual=current.get(object.id);
    if(isDeepStrictEqual(next,actual))continue;
    compare(before,actual);
    await table.update({where:{id:object.id},data:next});updated++;
  }
  return updated;
}
async function persistDomainBatch(db,batch){
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73130908)::text`;
    const updatedNodes=await refreshRows(tx,batch.nodes||[],batch.previousNodes);
    const updatedRelationships=await refreshRows(tx,batch.relationships||[],batch.previousRelationships,true);
    return {...await persistDomainBatchInTransaction(tx,batch),updatedNodes,updatedRelationships};
  },{isolationLevel:'ReadCommitted',timeout:30000});
}
module.exports={persistDomainBatch,persistDomainBatchInTransaction,nodeRow,edgeRow};
