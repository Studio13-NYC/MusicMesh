const assert=require('node:assert/strict');
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
async function persistDomainBatch(db,{nodes=[],relationships=[]}){
  const nodeRows=nodes.map(nodeRow),edgeRows=relationships.map(edgeRow);
  if(new Set(nodeRows.map(n=>n.id)).size!==nodeRows.length || new Set(edgeRows.map(e=>e.id)).size!==edgeRows.length)throw new Error('Duplicate identities within import batch');
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73130908)::text`;
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
  },{isolationLevel:'ReadCommitted',timeout:30000});
}
module.exports={persistDomainBatch,nodeRow,edgeRow};
