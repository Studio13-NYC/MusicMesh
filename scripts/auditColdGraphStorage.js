// Server-side fingerprints: no full graph download. Exact changed-row values
// are separately covered by archive roundtrips and the migration's locked CAS.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('pg');
async function main(){
 const [mode,directory]=process.argv.slice(2);
 if(!['baseline-local','verify-local','baseline-main','verify-main'].includes(mode)||!directory)throw Error('Usage: auditColdGraphStorage.js baseline-local|verify-local|baseline-main|verify-main <receipt directory>');
 const mainTarget=mode.endsWith('main'),verify=mode.startsWith('verify');
 const url=new URL(mainTarget?process.env.DIRECT_URL:process.env.DATABASE_URL);
 if(mainTarget)require('../src/import/graphSnapshot').assertMainDevelopmentTarget(url.toString());
 else{assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55433');assert.equal(url.pathname,'/musicmesh_storage_20261019');}
 const client=new Client({connectionString:url.toString(),statement_timeout:300000});await client.connect();
 const out={at:new Date().toISOString(),mode,state:'checking',graph:{},unaffected:{},protected:{}};
 try{
  out.bytes=(await client.query('SELECT pg_database_size(current_database())::text AS bytes')).rows[0].bytes;
  for(const table of ['entities','relationships']){
   const entity=table==='entities';
   const columns=entity?`jsonb_build_array(id,labels,"primaryLabel",name,"searchText")`:`jsonb_build_array(id,"sourceId","targetId",type,extra->'providerTypeId',extra->'providerTypeName',extra->'attributes')`;
   out.graph[table]=(await client.query(`SELECT count(*)::int AS count,md5(string_agg(id||':'||md5(${columns}::text),',' ORDER BY id COLLATE "C")) AS hash FROM ${table}`)).rows[0];
   const common=`"threadId" IS NULL AND "lastChatThreadId" IS NULL AND NOT extra ? 'coldRef'`;
   const target=entity?`(("primaryLabel"='Url' AND source='musicbrainz' AND id LIKE 'musicbrainz:url:%') OR ("primaryLabel"='SimilarityAssessment' AND source='musicmesh' AND id LIKE 'musicmesh:similarity:%'))`:
    `((source='musicmesh' AND type IN ('ComparesRecording','SupportedByAnalysis')) OR (source='musicbrainz' AND type='MusicBrainzRelationship' AND ("sourceId" LIKE 'musicbrainz:url:%' OR "targetId" LIKE 'musicbrainz:url:%')))`;
   const unchanged=verify?`NOT extra ? 'coldRef'`:`NOT coalesce((${common} AND ${target}),false)`;
   out.unaffected[table]=(await client.query(`SELECT count(*)::int AS count,md5(string_agg(id||':'||md5(to_jsonb(t)::text),',' ORDER BY id COLLATE "C")) AS hash FROM ${table} t WHERE ${unchanged}`)).rows[0];
   out.protected[table]=(await client.query(`SELECT count(*)::int AS count,md5(string_agg(id||':'||md5(to_jsonb(t)::text),',' ORDER BY id COLLATE "C")) AS hash FROM ${table} t WHERE ${entity?`"primaryLabel" IN ('EvidenceAssertion','SourceDocument','PreferenceSignal','ListeningEvent','IdentityMapping')`:`type IN ('AssertionSubject','AssertionFactor','SupportedBySource','PreferenceFor')`}`)).rows[0];
  }
  out.cold=(await client.query(`SELECT (SELECT count(*)::int FROM entities WHERE extra ? 'coldRef') AS entities,(SELECT count(*)::int FROM relationships WHERE extra ? 'coldRef') AS relationships`)).rows[0];
  if(verify){
   const before=JSON.parse(fs.readFileSync(path.join(directory,mainTarget?'baseline-main.json':'baseline-local.json')));
   for(const key of ['graph','unaffected','protected'])assert.deepEqual(out[key],before[key],key+' preservation');
  }
  out.state='verified';
 }catch(error){out.state='failed';out.error=error.message;throw error;}
 finally{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,mode+'.json'),JSON.stringify(out,null,2)+'\n');await client.end();console.log(JSON.stringify(out));}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
