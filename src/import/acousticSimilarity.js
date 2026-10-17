const fs=require('node:fs'),path=require('node:path');
const {AcousticAnalysis,SimilarityAssessment}=require('../domain');
const {canonicalJson,entityFromGraph}=require('../domain/serialization');
const {sha256}=require('./history');
const order=(a,b)=>a<b?-1:a>b?1:0;
const families={
  rhythm:[['bpm','beats/minute'],['onsetRate','onsets/second'],['danceability','Essentia danceability index']],
  timbre:Array.from({length:13},(_,i)=>['mfccMean['+i+']','Essentia MFCC coefficients'])
};
function vector(analysis,family){
  const f=analysis.properties.features?.[family];
  if(!f)return null;
  const values=family==='rhythm'?families.rhythm.map(([key,unit])=>f[key]?.unit===unit?f[key].value:null):f.mfccMean?.unit==='Essentia MFCC coefficients'?f.mfccMean.value:null;
  return Array.isArray(values)&&values.length===families[family].length&&values.every(v=>typeof v==='number'&&Number.isFinite(v))?values:null;
}
/** Relative neighbors within exactly compatible extractor/audio cohorts, not perceptual ground truth. */
function compareAnalyses(input,{neighbors=3}={}){
  if(!Number.isSafeInteger(neighbors)||neighbors<1||neighbors>10)throw new Error('neighbors must be 1 to 10');
  if(input.some(a=>!(a instanceof AcousticAnalysis)))throw new Error('Comparison requires typed acoustic analyses');
  if(new Set(input.map(a=>a.id)).size!==input.length)throw new Error('Duplicate analysis identity');
  const analyses=[...input].sort((a,b)=>order(a.id,b.id)),recordingCounts=new Map();
  for(const a of analyses)recordingCounts.set(a.properties.recordingId,(recordingCounts.get(a.properties.recordingId)||0)+1);
  const groups=new Map(),exclusions=[],cohorts=[],assessments=[];
  for(const a of analyses){
    const p=a.properties,audio=p.audioProperties||{};
    if(recordingCounts.get(p.recordingId)>1){exclusions.push({analysisId:a.id,reason:'multiple-submissions-require-selection'});continue;}
    if(!Number.isFinite(audio.analysis_sample_rate)||audio.analysis_sample_rate<=0||typeof audio.downmix!=='string'||![0,1].includes(audio.equal_loudness)){
      exclusions.push({analysisId:a.id,reason:'missing-extractor-audio-context'});continue;
    }
    for(const family of Object.keys(families)){
      const values=vector(a,family);
      if(!values){exclusions.push({analysisId:a.id,family,reason:'missing-or-incompatible-features'});continue;}
      const compatibility={extractorVersion:p.extractorVersion,analysisSampleRate:audio.analysis_sample_rate,downmix:audio.downmix,equalLoudness:audio.equal_loudness};
      const key=canonicalJson({family,compatibility});
      if(!groups.has(key))groups.set(key,{family,compatibility,rows:[]});
      groups.get(key).rows.push({analysis:a,values});
    }
  }
  for(const [key,{family,compatibility,rows}] of [...groups].sort(([a],[b])=>order(a,b))){
    if(rows.length<3){for(const row of rows)exclusions.push({analysisId:row.analysis.id,family,reason:'cohort-too-small'});continue;}
    const mean=families[family].map((_,j)=>rows.reduce((s,r)=>s+r.values[j],0)/rows.length);
    const standardDeviation=mean.map((m,j)=>Math.sqrt(rows.reduce((s,r)=>s+(r.values[j]-m)**2,0)/rows.length));
    if([...mean,...standardDeviation].some(v=>!Number.isFinite(v)))throw new Error('Non-finite normalization statistics');
    const dimensions=standardDeviation.map((v,i)=>v>1e-12?i:-1).filter(i=>i>=0);
    if(!dimensions.length){for(const row of rows)exclusions.push({analysisId:row.analysis.id,family,reason:'no-varying-features'});continue;}
    const cohortId='acoustic-cohort:'+sha256(canonicalJson({key,methodVersion:'1',rows:rows.map(r=>[r.analysis.id,r.values])}));
    cohorts.push({id:cohortId,family,compatibility,size:rows.length,mean,standardDeviation,activeDimensions:dimensions,features:families[family]});
    const normalized=rows.map(r=>dimensions.map(j=>(r.values[j]-mean[j])/standardDeviation[j]));
    const closest=rows.map(()=>[]);
    function retain(i,j,distance){const list=closest[i];if(list.length===neighbors&&(distance>list.at(-1).distance||(distance===list.at(-1).distance&&j>list.at(-1).index)))return;list.push({index:j,distance});list.sort((a,b)=>a.distance-b.distance||a.index-b.index);if(list.length>neighbors)list.pop();}
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      const distance=Math.sqrt(normalized[i].reduce((s,v,k)=>s+(v-normalized[j][k])**2,0)/dimensions.length);
      if(!Number.isFinite(distance))throw new Error('Non-finite normalized distance');
      retain(i,j,distance);retain(j,i,distance);
    }
    const pairs=new Map();closest.forEach((list,i)=>list.forEach(({index:j,distance})=>{const [a,b]=i<j?[i,j]:[j,i];pairs.set(a+':'+b,{a,b,distance});}));
    for(const {a,b,distance} of pairs.values()){
      const left=rows[a],right=rows[b],recordingIds=[left.analysis.properties.recordingId,right.analysis.properties.recordingId],analysisIds=[left.analysis.id,right.analysis.id];
      const explanation=dimensions.map(j=>({feature:families[family][j][0],unit:families[family][j][1],left:left.values[j],right:right.values[j],difference:right.values[j]-left.values[j],normalizedDifference:(right.values[j]-left.values[j])/standardDeviation[j]}));
      assessments.push(new SimilarityAssessment({id:'musicmesh:similarity:'+sha256(canonicalJson({cohortId,analysisIds})),name:`${family==='rhythm'?'Rhythm':'Timbre'} similarity candidate`,properties:{recordingIds,analysisIds,
        method:'Root-mean-square Euclidean distance after population z-score normalization; constant dimensions excluded',methodVersion:'1',featureFamily:family,cohortId,score:distance,scoreMeaning:'distance',
        source:'musicmesh',evidenceBasis:'derived-acoustic-comparison',explanation,cohortSize:rows.length,
        interpretation:'Lower distance means closer measured features within this exact cohort. Top neighbors are relative candidates, not a calibrated perceptual score, influence, identity, or preference.'}}));
    }
  }
  assessments.sort((a,b)=>order(a.id,b.id));exclusions.sort((a,b)=>order(canonicalJson(a),canonicalJson(b)));
  return {assessments,cohorts,exclusions};
}
function writeComparisons({featuresDir,outputDir,neighbors=3}){
  const manifest=JSON.parse(fs.readFileSync(path.join(featuresDir,'manifest.json'))),bytes=fs.readFileSync(path.join(featuresDir,'analyses.ndjson'));
  if(manifest.version!==1||sha256(bytes)!==manifest.files?.['analyses.ndjson'])throw new Error('Acoustic feature checksum/version mismatch');
  const analyses=bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse).map(entityFromGraph);
  if(analyses.length!==manifest.collected)throw new Error('Acoustic analysis count mismatch');
  const result=compareAnalyses(analyses,{neighbors});
  fs.mkdirSync(outputDir,{recursive:true});if(fs.readdirSync(outputDir).length)throw new Error('Comparison output must be empty');
  const payloads={
    'analyses.ndjson':bytes,
    'comparisons.ndjson':result.assessments.map(a=>JSON.stringify(a.toGraphNode())).join('\n')+(result.assessments.length?'\n':''),
    'cohorts.json':JSON.stringify(result.cohorts),
    'exclusions.json':JSON.stringify(result.exclusions)
  },files={};
  for(const [name,payload] of Object.entries(payloads)){fs.writeFileSync(path.join(outputDir,name),payload,{flag:'wx'});files[name]=sha256(payload);}
  const receipt={version:1,createdAt:new Date().toISOString(),input:manifest.input,recordingListHash:manifest.recordingListHash,featureCollectionState:manifest.state,sourceFeatureHash:manifest.files['analyses.ndjson'],analyses:analyses.length,comparisons:result.assessments.length,cohorts:result.cohorts.length,exclusions:result.exclusions.length,neighbors,databaseWritten:false,files};
  fs.writeFileSync(path.join(outputDir,'manifest.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return receipt;
}
function readAcousticGraph(directory,recordings,prepared){
  const domain=require('../domain'),manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
  if(manifest.version!==1||manifest.recordingListHash!==prepared.files['recording-mbids.json']||canonicalJson(manifest.input)!==canonicalJson(prepared.input))throw new Error('Acoustic source identity mismatch');
  const payloads={};
  for(const name of ['analyses.ndjson','comparisons.ndjson','cohorts.json','exclusions.json']){
    const bytes=fs.readFileSync(path.join(directory,name));if(sha256(bytes)!==manifest.files[name])throw new Error('Acoustic graph checksum mismatch');payloads[name]=bytes.toString('utf8');
  }
  const lines=name=>payloads[name].split(/\r?\n/).filter(Boolean).map(JSON.parse).map(entityFromGraph);
  const analyses=lines('analyses.ndjson'),comparisons=lines('comparisons.ndjson'),byId=new Map(analyses.map(a=>[a.id,a]));
  if(analyses.length!==manifest.analyses||comparisons.length!==manifest.comparisons||byId.size!==analyses.length||analyses.some(a=>a.type!=='AcousticAnalysis')||comparisons.some(a=>a.type!=='SimilarityAssessment'))throw new Error('Acoustic graph count/class mismatch');
  const relationships=[];
  function recording(id){const result=recordings.get(id);if(result?.type!=='Recording')throw new Error('Acoustic evidence references a missing Recording');return result;}
  for(const a of analyses)relationships.push(new domain.AnalysisOf({source:a,target:recording(a.properties.recordingId),assertionKey:'submitted-analysis',properties:{source:'acousticbrainz'}}));
  for(const c of comparisons){
    const p=c.properties;
    if(p.analysisIds.length!==2||new Set(p.analysisIds).size!==2||p.analysisIds.some((id,i)=>byId.get(id)?.properties.recordingId!==p.recordingIds[i]))throw new Error('Comparison evidence does not match its recording pair');
    p.recordingIds.forEach(id=>relationships.push(new domain.ComparesRecording({source:c,target:recording(id),assertionKey:'comparison-participant',properties:{source:'musicmesh'}})));
    p.analysisIds.forEach(id=>relationships.push(new domain.SupportedByAnalysis({source:c,target:byId.get(id),assertionKey:'measurement-evidence',properties:{source:'musicmesh'}})));
  }
  return {nodes:[...analyses,...comparisons],relationships,receipt:{featureCollectionState:manifest.featureCollectionState,analyses:manifest.analyses,comparisons:manifest.comparisons,cohorts:manifest.cohorts,files:manifest.files}};
}
module.exports={compareAnalyses,writeComparisons,readAcousticGraph};
