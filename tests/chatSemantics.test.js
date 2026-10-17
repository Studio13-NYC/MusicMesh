const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
process.env.MUSICMESH_BLOB_CONNECTION_STRING='';
process.env.OPENAI_API_KEY='test-key-not-a-credential';
if(process.env.MUSICMESH_TEST_BRAINZ!=='isolated')process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/musicmesh_test';
const {getOntology}=require('../src/domain');
const {createAssistantReply}=require('../src/chatService');
const {createGraphPreview}=require('../src/graphPreview');
const {planGraphFromAnswer,groundGraphPlan}=require('../src/graphChatOrchestrator');
const {closeDatabase}=require('../src/postgres');
const {assertIsolatedTarget}=require('../src/import/graphSnapshot');
test.after(closeDatabase);
test('catalog evidence retains acoustic interpretation and excludes incompatible legacy identity',()=>{
  const {catalogProperties,isDomainRecord}=require('../src/graphCanonRepository');
  const properties={features:{bpm:{value:120,unit:'beats/minute'}},extractorVersion:'music 1.0',score:0.8,scoreMeaning:'similarity',method:'cosine',methodVersion:'1',featureFamily:'rhythm',explanation:[{feature:'bpm',difference:1}],cohortSize:3,interpretation:'Relative candidate',selectionPolicy:'first-submission-v1',selectionLimitation:'Audio match unverified',rawProvider:{huge:'payload'}};
  assert.deepEqual(catalogProperties(properties),Object.fromEntries(Object.entries(properties).filter(([key])=>key!=='rawProvider')));
  assert.equal(isDomainRecord({id:'legacy-storage-id',labels:['Genre'],properties:{id:'genre:rock',name:'Rock'}}),false);
  assert.deepEqual(catalogProperties({catalogNumber:'ABC-001',date:'1999',barcode:'00123',format:'CD',number:'A1'}),{catalogNumber:'ABC-001',date:'1999',barcode:'00123',format:'CD',number:'A1'});
});
function fakeModel(t,reply){
  const requests=[];t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({id:'test-response',output:[{content:[{type:'output_text',text:JSON.stringify(reply)}]}]}));
  });return requests;
}
function assertSemantics(request){
  assert.ok(request.instructions.includes('MusicMesh domain semantics '+getOntology().version));
  assert.ok(request.instructions.includes('Recording'));assert.ok(request.instructions.includes('Work'));
  assert.ok(!request.instructions.includes('new uppercase snake_case'));
}
test('answer, preview and planning requests share domain semantics and preserve declared predicate case',async t=>{
  const reply={mode:'persist_graph',entities:[{id:'r',name:'Example',type:'Recording'},{id:'w',name:'Example',type:'Work'}],relationships:[{sourceRef:'r',targetRef:'w',type:'PerformanceOf',assertionKey:'a'}],seed:{id:'r',label:'Example',kind:'Recording'},nodes:[{id:'r',label:'Example',kind:'Recording'},{id:'w',label:'Example',kind:'Work'}],edges:[{source:'r',target:'w',type:'PerformanceOf'}]};
  const requests=fakeModel(t,reply);
  await createAssistantReply({prompt:'Explain a recording',messages:[],threadId:'semantic-test',systemPromptPath:path.resolve('docs/product/MUSICMESH_CHAT_SYSTEM_PROMPT.md')});
  await createGraphPreview({requestId:'semantic-test',threadId:'semantic-test',prompt:'Show a recording',assistantText:'Example is a recording of Example.'});
  const plan=await planGraphFromAnswer({prompt:'Show a recording',assistantText:'Example is a recording of Example.',messages:[]});
  assert.equal(plan.relationships[0].type,'PerformanceOf');assert.equal(plan.relationships[0].assertionKey,'a');
  assert.equal(requests.length,3);requests.forEach(assertSemantics);
});
test('grounding receives identical semantics and does not invent identity when candidate ID is invalid',{skip:process.env.MUSICMESH_TEST_BRAINZ!=='isolated'},async t=>{
  assertIsolatedTarget(process.env.DATABASE_URL);
  const requests=fakeModel(t,{nodes:[{tempId:'r',name:'Nonexistent semantic test',type:'Recording',matchedCanonId:'invented-id'}],relationships:[],humanInputNeeded:false});
  const grounded=await groundGraphPlan({entities:[{tempId:'r',name:'Nonexistent semantic test',type:'Recording',labels:['Recording'],properties:{}}],relationships:[]});
  assertSemantics(requests[0]);assert.equal(grounded.humanInputNeeded,true);
});
test('ambiguous name references and unsupported classes cannot become a partial graph',async t=>{
  fakeModel(t,{mode:'persist_graph',entities:[{id:'r1',name:'Same',type:'Recording'},{id:'r2',name:'Same',type:'Recording'},{id:'w',name:'Composition',type:'Work'}],relationships:[{sourceName:'Same',targetRef:'w',type:'PerformanceOf'}]});
  const plan=await planGraphFromAnswer({prompt:'Show both recordings',assistantText:'Two distinct recordings share a name.',messages:[]});
  assert.equal(plan.humanInputNeeded,true);
});
test('preview retains distinct explicit identities and parallel assertions',async t=>{
  fakeModel(t,{seed:{id:'R',label:'Same',kind:'Recording'},nodes:[{id:'R',label:'Same',kind:'Recording'},{id:'r',label:'Same',kind:'Recording'},{id:'w',label:'Same',kind:'Work'}],edges:[{source:'R',target:'w',type:'PerformanceOf'},{source:'R',target:'w',type:'PerformanceOf'},{source:'r',target:'w',type:'PerformanceOf'}]});
  const result=await createGraphPreview({requestId:'identity-test',threadId:'semantic-test',prompt:'Show both',assistantText:'Two recordings of one work.'});
  const graph=result.graph||result;
  assert.equal(new Set(graph.nodes.map(n=>n.id)).size,3);
  assert.equal(new Set(graph.edges.map(e=>e.id)).size,3);
});
test('answer context comes from stored public catalog facts, never browser-supplied properties',{skip:process.env.MUSICMESH_TEST_BRAINZ!=='isolated'},async t=>{
  assertIsolatedTarget(process.env.DATABASE_URL);
  const {getDatabase}=require('../src/postgres'),db=getDatabase();
  const recording=await db.entity.findFirst({where:{primaryLabel:'Recording'}});
  const privateEvent=await db.entity.findFirst({where:{primaryLabel:'ListeningEvent'}});
  assert.ok(recording&&privateEvent,'requires isolated listening catalog');
  const requests=fakeModel(t,{text:'Stored context checked'});
  const common={prompt:'Explain this recording',messages:[],threadId:'catalog-context-test',systemPromptPath:path.resolve('docs/product/MUSICMESH_CHAT_SYSTEM_PROMPT.md')};
  await createAssistantReply({...common,graphContext:{selectedNode:{id:recording.id,properties:{secret:'BROWSER_FORGERY'}}}});
  const input=JSON.stringify(requests[0].input);
  assert.ok(input.includes(recording.id));assert.ok(!input.includes('BROWSER_FORGERY'));
  await createAssistantReply({...common,graphContext:{selectedNode:{id:privateEvent.id}}});
  assert.ok(!JSON.stringify(requests[1].input).includes(privateEvent.id));
});
