const test=require('node:test'),assert=require('node:assert/strict');
const {AcousticAnalysis}=require('../src/domain');
const {compareAnalyses}=require('../src/import/acousticSimilarity');
function analysis(i,bpm,{version='music-v1',onset=3,dance=1.4,submission='0'}={}){
  return new AcousticAnalysis({id:'analysis:'+i+':'+submission,name:'Analysis '+i,properties:{recordingId:'recording:'+i,submissionId:submission,extractorVersion:version,audioProperties:{analysis_sample_rate:44100,downmix:'mix',equal_loudness:0},features:{rhythm:{bpm:{value:bpm,unit:'beats/minute'},onsetRate:{value:onset,unit:'onsets/second'},danceability:{value:dance,unit:'Essentia danceability index'}}}}});
}
test('similarity is reproducible, version-cohorted, evidence-backed and explains distance',()=>{
  const inputs=[analysis(1,120),analysis(2,121),analysis(3,180),analysis(4,120,{version:'other'})];
  const result=compareAnalyses(inputs,{neighbors:1});
  assert.deepEqual(compareAnalyses([...inputs].reverse(),{neighbors:1}),result);
  assert.equal(result.assessments.length,2);
  assert.equal(result.cohorts.length,1);
  const near=result.assessments.find(a=>a.properties.recordingIds.includes('recording:1'));
  assert.deepEqual(near.properties.recordingIds,['recording:1','recording:2']);
  assert.deepEqual(near.properties.analysisIds,['analysis:1:0','analysis:2:0']);
  assert.equal(near.properties.scoreMeaning,'distance');assert.equal(near.properties.methodVersion,'1');
  assert.equal(near.properties.featureFamily,'rhythm');assert.ok(near.properties.score>=0);
  assert.equal(near.properties.explanation[0].feature,'bpm');assert.equal(near.properties.explanation[0].difference,1);
  assert.ok(result.exclusions.some(e=>e.analysisId==='analysis:4:0'&&e.reason==='cohort-too-small'));
});
test('missing measurements and ambiguous duplicate submissions never become fabricated comparisons',()=>{
  const sparse=analysis(5,120);const properties=JSON.parse(JSON.stringify(sparse.properties));delete properties.features.rhythm.onsetRate;
  const input=[analysis(1,120),analysis(1,123,{submission:'1'}),analysis(2,121),new AcousticAnalysis({id:sparse.id,name:sparse.name,properties})];
  const result=compareAnalyses(input,{neighbors:3});assert.equal(result.assessments.length,0);
  assert.ok(result.exclusions.some(e=>e.reason==='multiple-submissions-require-selection'));
  assert.ok(result.exclusions.some(e=>e.analysisId===sparse.id&&e.reason==='missing-or-incompatible-features'));
});
test('pair identity is independent of neighbor selection and overflow never becomes zero distance',()=>{
  const inputs=[analysis(1,120),analysis(2,121),analysis(3,180),analysis(4,185)];
  const one=compareAnalyses(inputs,{neighbors:1}),three=compareAnalyses(inputs,{neighbors:3});
  for(const a of one.assessments)assert.deepEqual(a,three.assessments.find(b=>b.id===a.id));
  assert.throws(()=>compareAnalyses([analysis(1,1e200),analysis(2,2e200),analysis(3,3e200)]),/finite/);
});
test('acoustic graph import requires recording endpoints and exact evidence hashes',t=>{
  const fs=require('node:fs'),path=require('node:path'),domain=require('../src/domain');
  const {sha256}=require('../src/import/history'),{writeComparisons,readAcousticGraph}=require('../src/import/acousticSimilarity');
  const root=path.join(__dirname,'..','output','tests');fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'comparison-'));t.after(()=>fs.rmSync(dir,{recursive:true}));
  const input=[analysis(1,120),analysis(2,121),analysis(3,180)],bytes=input.map(a=>JSON.stringify(a.toGraphNode())).join('\n')+'\n';
  fs.writeFileSync(path.join(dir,'analyses.ndjson'),bytes);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({version:1,state:'limited',collected:3,files:{'analyses.ndjson':sha256(bytes)},input:{sourceHash:'original'},recordingListHash:'recording-list'}));
  const out=path.join(dir,'comparisons');writeComparisons({featuresDir:dir,outputDir:out,neighbors:1});
  const recordings=new Map(input.map(a=>[a.properties.recordingId,new domain.Recording({id:a.properties.recordingId,name:'Recording'})]));
  const graph=readAcousticGraph(out,recordings,{input:{sourceHash:'original'},files:{'recording-mbids.json':'recording-list'}});
  assert.equal(graph.nodes.length,5);assert.equal(graph.relationships.length,11);
  assert.throws(()=>readAcousticGraph(out,new Map(),{input:{sourceHash:'original'},files:{'recording-mbids.json':'recording-list'}}),/Recording/);
  fs.appendFileSync(path.join(out,'analyses.ndjson'),'corrupt');
  assert.throws(()=>readAcousticGraph(out,recordings,{input:{sourceHash:'original'},files:{'recording-mbids.json':'recording-list'}}),/checksum/);
});
