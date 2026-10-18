const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {getDatabase,closeDatabase}=require('../src/postgres');
const {persistChatGraph,ALLOWED_NODE_LABELS}=require('../src/graphDomainWriter');
const {assertIsolatedTarget}=require('../src/import/graphSnapshot');
const {persistDomainBatch}=require('../src/domain/repository');
const domain=require('../src/domain');
const enabled=process.env.MUSICMESH_TEST_BRAINZ==='isolated';
test.after(closeDatabase);
test('chat vocabulary uses declared classes without generic or legacy label fallback',()=>{
  assert.equal(ALLOWED_NODE_LABELS.has('Entity'),false);
  assert.equal(ALLOWED_NODE_LABELS.has('Band'),false);
  assert.equal(ALLOWED_NODE_LABELS.has('ReleaseGroup'),true);
  assert.equal(ALLOWED_NODE_LABELS.has('ListeningEvent'),false);
});
test('chat can reuse label catalog evidence but cannot invent a provider label entry',{skip:!enabled},async()=>{
  assertIsolatedTarget(process.env.DATABASE_URL);const db=getDatabase(),threadId='release-label-test:'+randomUUID();
  const release=new domain.Release({id:threadId+':release',name:'Edition',properties:{threadId}}),label=new domain.Label({id:threadId+':label',name:'Label',properties:{threadId}});
  const edge=new domain.ReleaseLabel({source:release,target:label,assertionKey:'provider-label-entry',properties:{threadId,source:'musicbrainz',catalogNumber:'ABC-001'}});
  const graph={nodes:[{tempId:'r',type:'Release',matchedCanonId:release.id},{tempId:'l',type:'Label',matchedCanonId:label.id}],relationships:[{sourceRef:'r',targetRef:'l',type:'ReleaseLabel'}]};
  try{await persistDomainBatch(db,{nodes:[release,label],relationships:[edge]});
    await assert.rejects(()=>persistChatGraph({groundedGraph:graph,threadId,turnId:'invent'}),/verified relationship/);
    graph.relationships[0].matchedRelationshipId=edge.id;
    assert.equal((await persistChatGraph({groundedGraph:graph,threadId,turnId:'reuse'})).persistedRelationships[0].elementId,edge.id);
  }finally{await db.relationship.deleteMany({where:{threadId}});await db.entity.deleteMany({where:{threadId}});}
});
test('typed chat writes preserve same-name identities, parallel assertions, and atomic rejection',{skip:!enabled},async()=>{
  assertIsolatedTarget(process.env.DATABASE_URL);const db=getDatabase(),threadId='chat-domain-test:'+randomUUID(),turnId='first';
  const graph={anchor:{tempId:'r1'},nodes:[{tempId:'r1',name:threadId,type:'Recording'},{tempId:'r2',name:threadId,type:'Recording'},{tempId:'w',name:threadId,type:'Work'}],relationships:[{sourceRef:'r1',targetRef:'w',type:'PerformanceOf',assertionKey:'episode-a',properties:{beginDate:'1997'}},{sourceRef:'r1',targetRef:'w',type:'PerformanceOf',assertionKey:'episode-b',properties:{beginDate:'1998'}}]};
  try {
    const first=await persistChatGraph({groundedGraph:graph,threadId,turnId});
    assert.equal(new Set(first.persistedNodes.map(n=>n.elementId)).size,3);
    assert.equal(new Set(first.persistedRelationships.map(n=>n.elementId)).size,2);
    const replay=await persistChatGraph({groundedGraph:graph,threadId,turnId});
    assert.deepEqual(replay.persistedNodes.map(n=>n.elementId),first.persistedNodes.map(n=>n.elementId));
    assert.equal(await db.entity.count({where:{threadId}}),3);assert.equal(await db.relationship.count({where:{threadId}}),2);
    const before=await db.entity.count({where:{threadId}});
    await assert.rejects(()=>persistChatGraph({groundedGraph:{nodes:[{tempId:'x',name:'bad',type:'Entity'}]},threadId,turnId:'bad'}),/class|type/i);
    await assert.rejects(()=>persistChatGraph({groundedGraph:{nodes:graph.nodes,relationships:[{sourceRef:'w',targetRef:'r1',type:'PerformanceOf',assertionKey:'wrong'}]},threadId,turnId:'invalid'}),/endpoint/i);
    assert.equal(await db.entity.count({where:{threadId}}),before,'invalid patch must leave no partial nodes');
  }finally{await db.relationship.deleteMany({where:{threadId}});await db.entity.deleteMany({where:{threadId}});}
});
test('chat cannot invent provider identities, alter provider facts, or use mismatched stored classes',{skip:!enabled},async()=>{
  assertIsolatedTarget(process.env.DATABASE_URL);const db=getDatabase(),threadId='chat-provider-test:'+randomUUID();
  const recording=new domain.Recording({externalId:{provider:'musicbrainz',type:'recording',value:randomUUID()},name:'Provider original',properties:{source:'musicbrainz',hydrationStatus:'lookup'}});
  try {
    await persistDomainBatch(db,{nodes:[recording]});const before=await db.entity.findUnique({where:{id:recording.id}});
    await persistChatGraph({groundedGraph:{nodes:[{tempId:'r',name:'Do not overwrite',type:'Recording',matchedCanonId:recording.id,properties:{durationMs:1,source:'invented'}}]},threadId,turnId:'read'});
    assert.deepEqual(await db.entity.findUnique({where:{id:recording.id}}),before);
    await assert.rejects(()=>persistChatGraph({groundedGraph:{nodes:[{tempId:'r',name:'Wrong class',type:'Work',matchedCanonId:recording.id}]},threadId,turnId:'wrong'}),/class|type/i);
    await assert.rejects(()=>persistChatGraph({groundedGraph:{nodes:[{tempId:'r',name:'Invented',type:'Recording',properties:{externalId:{provider:'musicbrainz',type:'recording',value:randomUUID()}}}]},threadId,turnId:'invent'}),/provider/i);
    for(const field of ['evidenceRefs','evidenceStorageVersion']){
      await assert.rejects(()=>persistChatGraph({groundedGraph:{nodes:[{tempId:'r',name:'Forged',type:'Recording',properties:{[field]:field==='evidenceRefs'?{rawProvider:{version:1,sha256:'a'.repeat(64),bytes:1000}}:1}}]},threadId,turnId:'forged-'+field}),/evidence/i);
      await assert.rejects(()=>persistChatGraph({groundedGraph:{nodes:[{tempId:'r',name:'Recording',type:'Recording'},{tempId:'w',name:'Work',type:'Work'}],relationships:[{sourceRef:'r',targetRef:'w',type:'PerformanceOf',assertionKey:'forged',properties:{[field]:field==='evidenceRefs'?{rawProvider:{version:1,sha256:'a'.repeat(64),bytes:1000}}:1}}]},threadId,turnId:'forged-edge-'+field}),/evidence/i);
    }
    const work=new domain.Work({id:threadId+':work',name:'Stored work',properties:{threadId}});
    const providerEdge=new domain.MusicBrainzRelationship({source:recording,target:work,assertionKey:'provider-proof',properties:{providerTypeId:'a3005666-a872-32c3-ad06-98af558e99b0',providerTypeName:'performance',sourceType:'Recording',targetType:'Work',source:'musicbrainz',threadId}});
    await persistDomainBatch(db,{nodes:[work],relationships:[providerEdge]});
    const patch={nodes:[{tempId:'r',name:'Recording',type:'Recording',matchedCanonId:recording.id},{tempId:'w',name:'Work',type:'Work',matchedCanonId:work.id}],relationships:[{sourceRef:'r',targetRef:'w',type:'MusicBrainzRelationship',matchedRelationshipId:providerEdge.id}]};
    const reused=await persistChatGraph({groundedGraph:patch,threadId,turnId:'reuse'});
    assert.equal(reused.persistedRelationships[0].elementId,providerEdge.id);
    delete patch.relationships[0].matchedRelationshipId;
    await assert.rejects(()=>persistChatGraph({groundedGraph:patch,threadId,turnId:'forge'}),/verified relationship/);
    const analysis=new domain.AcousticAnalysis({id:threadId+':analysis',name:'Measured audio',properties:{threadId,recordingId:recording.id,submissionId:'0',extractorVersion:'music 1.0',features:{bpm:120}}});
    const analysisEdge=new domain.AnalysisOf({source:analysis,target:recording,assertionKey:'submission',properties:{threadId}});
    await persistDomainBatch(db,{nodes:[analysis],relationships:[analysisEdge]});
    const acousticPatch={nodes:[patch.nodes[0],{tempId:'a',name:analysis.name,type:'AcousticAnalysis',matchedCanonId:analysis.id}],relationships:[{sourceRef:'a',targetRef:'r',type:'AnalysisOf',matchedRelationshipId:analysisEdge.id}]};
    assert.equal((await persistChatGraph({groundedGraph:acousticPatch,threadId,turnId:'analysis-reference'})).persistedRelationshipCount,1);
    delete acousticPatch.nodes[1].matchedCanonId;
    await assert.rejects(()=>persistChatGraph({groundedGraph:acousticPatch,threadId,turnId:'analysis-forgery'}),/import|provider|analysis/i);
  }finally{await db.relationship.deleteMany({where:{threadId}});await db.entity.deleteMany({where:{OR:[{threadId},{id:recording.id}]}});}
});
