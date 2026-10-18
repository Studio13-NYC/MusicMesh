const test=require('node:test'),assert=require('node:assert/strict');
const {INSTRUCTIONS,newState}=require('../src/researchRunner');
const {executeResearchTool}=require('../src/researchTools');
test('catalog evidence retains acoustic interpretation and excludes incompatible legacy identity',()=>{
  const {catalogProperties,isDomainRecord}=require('../src/graphCanonRepository');
  const properties={features:{bpm:{value:120,unit:'beats/minute'}},extractorVersion:'music 1.0',score:0.8,scoreMeaning:'similarity',method:'cosine',methodVersion:'1',featureFamily:'rhythm',explanation:[{feature:'bpm',difference:1}],cohortSize:3,interpretation:'Relative candidate',selectionPolicy:'first-submission-v1',selectionLimitation:'Audio match unverified',rawProvider:{huge:'payload'}};
  assert.deepEqual(catalogProperties(properties),Object.fromEntries(Object.entries(properties).filter(([key])=>key!=='rawProvider')));
  assert.equal(isDomainRecord({id:'legacy-storage-id',labels:['Genre'],properties:{id:'genre:rock',name:'Rock'}}),false);
  assert.deepEqual(catalogProperties({catalogNumber:'ABC-001',date:'1999',barcode:'00123',format:'CD',number:'A1'}),{catalogNumber:'ABC-001',date:'1999',barcode:'00123',format:'CD',number:'A1'});
});

test('researcher keeps compact semantic boundaries and fetches full definitions on demand',async()=>{
 assert.ok(INSTRUCTIONS.includes('Recording'));assert.ok(INSTRUCTIONS.includes('Work'));assert.ok(INSTRUCTIONS.includes('Plays are not likes'));
 assert.ok(INSTRUCTIONS.length<5000);
 const result=await executeResearchTool('semantics',{type:'EvidenceAssertion'});assert.ok(result.data.fields.scope);
});
test('browser context carries only an identity and label, never supplied facts',()=>{
 const state=newState({prompt:'Explain this',graphContext:{selectedNode:{id:'stored-id',label:'Recording',properties:{secret:'BROWSER_FORGERY'}}}});
 assert.ok(JSON.stringify(state.input).includes('stored-id'));assert.ok(!JSON.stringify(state.input).includes('BROWSER_FORGERY'));
});
