const test = require('node:test');
const assert = require('node:assert/strict');
const {validateAssertion, resolveCredits} = require('../src/enrichment');
const {executeResearchTool} = require('../src/researchTools');
const domain = require('../src/domain');

const claim = {
  subjectId:'artist:dave', subjectType:'Artist', factorId:'equipment:guitar',
  role:'equipment', scope:'artist-context', mode:'add',
  sourceUrl:'https://example.org/interview', excerpt:'His main guitar at the time of the interview.',
  evidenceKind:'summary', certainty:'documented', confidenceScore:80,
  confidenceReason:'Dated artist testimony, without a recording-specific attribution.'
};

test('artist context cannot become album or recording credits, defaults or overrides', () => {
  assert.equal(validateAssertion(claim), claim);
  for (const change of [
    {scope:'all-tracks'}, {scope:'album-credit'}, {scope:'direct'},
    {releaseId:'release:1'}, {mode:'replace',overridesAssertionId:'claim:1'},
    {overridesAssertionId:'claim:1'}, {role:'producer'}
  ]) assert.throws(()=>validateAssertion({...claim,...change}), /Artist context/);
  assert.throws(()=>validateAssertion({...claim,subjectType:'Recording'}), /scope/);
  assert.throws(()=>validateAssertion({...claim,subjectType:'Recording',scope:'direct',role:'influenced-by'}), /Influence/);
  const credits = resolveCredits({releaseId:'release:1',recordingId:'recording:1',assertions:[claim]});
  assert.equal(credits.effective.length,0);
  assert.equal(credits.albumCredits.length,0);
  assert.equal(credits.exceptions.length,0);
});

test('artist context uses the existing sourced decision and typed assertion relationship', async () => {
  const subject = new domain.Artist({id:claim.subjectId,name:'Dave'});
  const assertion = new domain.EvidenceAssertion({id:'claim:1',name:'Dated guitar use',properties:{...claim,attribution:'Nick'}});
  assert.ok(new domain.AssertionSubject({source:assertion,target:subject,assertionKey:'claim:1'}));
  const db = {$queryRaw:async()=>[{id:subject.id,name:subject.name,kind:'Artist',properties:{}}]};
  const a={...claim,factorId:undefined,newFactor:{type:'Guitar',name:'Reported guitar model'}};
  const result=await executeResearchTool('prepare_enrichment',a,{db,evidenceTexts:[{url:claim.sourceUrl,text:'Interview text describing a main guitar in 1982.'}]});
  assert.equal(result.decision.action.scope,'artist-context');
  assert.equal(result.decision.display.scope,'artist-context');
  assert.equal(result.decision.kind,'enrichment');
  await assert.rejects(executeResearchTool('prepare_enrichment',{...a,role:'influenced-by'},{db,evidenceTexts:[{url:claim.sourceUrl,text:'Interview'}]}), /Factor class/);
});
