const { parseArgs } = require('node:util');
const { prepareHistory } = require('../src/import/history');
const { fetchRecordings } = require('../src/import/providerCache');

async function main() {
  const {values,positionals}=parseArgs({allowPositionals:true,options:{
    source:{type:'string'},output:{type:'string'},account:{type:'string'},
    'listenbrainz-export':{type:'string'},'listenbrainz-account':{type:'string'},help:{type:'boolean'},
    prepared:{type:'string'},cache:{type:'string'},coverage:{type:'string'},features:{type:'string'},neighbors:{type:'string'},limit:{type:'string'},
    snapshot:{type:'string'},'previous-snapshot':{type:'string'},acoustic:{type:'string'},'replace-existing':{type:'boolean'},'include-catalog':{type:'boolean'},'wait-for-lock':{type:'boolean'},
  }});
  if(values.help) {
    console.log([
      'npm run brainz:import -- prepare --source <CSV> --account <Last.fm user> --output <empty directory> [--listenbrainz-export <directory/JSON/NDJSON> --listenbrainz-account <user>]',
      'npm run brainz:import -- fetch-recordings --prepared <directory> --cache <directory> [--limit <count>]',
      'npm run brainz:import -- fetch-catalog --prepared <directory> --cache <same MusicBrainz directory> [--wait-for-lock] [--limit <count>]',
      'npm run brainz:import -- acoustic-coverage --prepared <directory> --cache <directory> [--limit <count>]',
      'npm run brainz:import -- acoustic-features --prepared <directory> --coverage <complete coverage directory> --cache <directory> [--limit <count>]',
      'npm run brainz:import -- acoustic-compare --features <feature directory> --output <empty directory> [--neighbors 3]',
      'npm run brainz:import -- compile --prepared <directory> --cache <directory> --output <empty directory> [--include-catalog] [--acoustic <comparison directory>]',
      'npm run brainz:import -- audit-snapshot --prepared <directory> --snapshot <directory> (read-only)',
      'node --env-file=.env.migration scripts/importListeningHistory.js load-isolated --snapshot <directory> [--replace-existing | --previous-snapshot <loaded directory>]',
      'node --env-file=.env scripts/importListeningHistory.js load-main --prepared <directory> --snapshot <directory> [--replace-existing | --previous-snapshot <loaded directory>]',
      'Only load-isolated and load-main write a database; each requires its named MusicMesh target. Main is the shared development backend. Partial enrichment is allowed and recorded. No command submits listens.'
    ].join('\n'));return;
  }
  if(positionals.length===1 && positionals[0]==='fetch-recordings') {
    if(!values.prepared||!values.cache)throw new Error('--prepared and --cache are required');
    const result=await fetchRecordings({preparedDir:values.prepared,cacheDir:values.cache,limit:values.limit?Number(values.limit):Infinity,
      onProgress:p=>{if(p.processed===1 || p.processed%25===0)console.log(JSON.stringify(p));}});
    console.log(JSON.stringify(result,null,2));return;
  }
  if(positionals.length===1 && positionals[0]==='fetch-catalog') {
    if(!values.prepared||!values.cache)throw new Error('--prepared and --cache are required');
    const result=await require('../src/import/catalogClosure').collectCatalog({preparedDir:values.prepared,cacheDir:values.cache,waitForLock:!!values['wait-for-lock'],limit:values.limit?Number(values.limit):Infinity,onProgress:p=>{if(p.state!=='running'||p.requested%100===0)console.log(JSON.stringify(p));}});
    const {requests,recordingEvidence,...summary}=result;console.log(JSON.stringify(summary,null,2));return;
  }
  if(positionals.length===1 && positionals[0]==='acoustic-coverage') {
    if(!values.prepared||!values.cache)throw new Error('--prepared and --cache are required');
    console.log(JSON.stringify(await require('../src/import/acousticCoverage').fetchAcousticCoverage({preparedDir:values.prepared,cacheDir:values.cache,limit:values.limit?Number(values.limit):Infinity,onProgress:p=>{if(p.processed%250===0)console.log(JSON.stringify(p));}}),null,2));return;
  }
  if(positionals.length===1 && positionals[0]==='acoustic-features') {
    if(!values.prepared||!values.coverage||!values.cache)throw new Error('--prepared, --coverage and --cache are required');
    console.log(JSON.stringify(await require('../src/import/acousticFeatures').fetchAcousticFeatures({preparedDir:values.prepared,coverageDir:values.coverage,cacheDir:values.cache,limit:values.limit?Number(values.limit):Infinity,onProgress:p=>{if(p.processed%250===0)console.log(JSON.stringify(p));}}),null,2));return;
  }
  if(positionals.length===1 && positionals[0]==='compile') {
    if(!values.prepared || !values.cache || !values.output)throw new Error('compile requires --prepared, --cache and --output');
    console.log(JSON.stringify(require('../src/import/graphSnapshot').compileSnapshot({preparedDir:values.prepared,cacheDir:values.cache,outputDir:values.output,acousticDir:values.acoustic,includeCatalog:!!values['include-catalog']}),null,2));return;
  }
  if(positionals.length===1 && positionals[0]==='acoustic-compare') {
    if(!values.features||!values.output)throw new Error('--features and --output are required');
    console.log(JSON.stringify(require('../src/import/acousticSimilarity').writeComparisons({featuresDir:values.features,outputDir:values.output,neighbors:values.neighbors?Number(values.neighbors):3}),null,2));return;
  }
  if(positionals.length===1 && positionals[0]==='load-isolated') {
    if(!values.snapshot)throw new Error('load-isolated requires --snapshot');
    try {console.log(JSON.stringify(await require('../src/import/graphSnapshot').loadIsolatedSnapshot({directory:values.snapshot,previousDirectory:values['previous-snapshot'],replace:!!values['replace-existing'],onProgress:p=>console.log(JSON.stringify(p))}),null,2));}
    finally {await require('../src/postgres').closeDatabase();}return;
  }
  if(positionals.length===1 && positionals[0]==='load-main') {
    if(!values.snapshot||!values.prepared)throw new Error('load-main requires --snapshot and --prepared');
    try {console.log(JSON.stringify(await require('../src/import/graphSnapshot').loadMainDevelopmentSnapshot({directory:values.snapshot,preparedDir:values.prepared,previousDirectory:values['previous-snapshot'],replace:!!values['replace-existing'],onProgress:p=>console.log(JSON.stringify(p))}),null,2));}
    finally {await require('../src/postgres').closeDatabase();}return;
  }
  if(positionals.length===1 && positionals[0]==='audit-snapshot') {
    if(!values.snapshot||!values.prepared)throw new Error('audit-snapshot requires --snapshot and --prepared');
    console.log(JSON.stringify(require('../src/import/snapshotAudit').auditSnapshot({directory:values.snapshot,preparedDir:values.prepared}),null,2));return;
  }
  if(positionals.length>1 || (positionals[0] && positionals[0]!=='prepare')) throw new Error('Unknown command; use --help');
  for(const key of ['source','output','account']) if(!values[key]) throw new Error(`--${key} is required; use --help`);
  console.log(JSON.stringify(prepareHistory({sourcePath:values.source,outputDir:values.output,account:values.account,
    listenbrainzPath:values['listenbrainz-export'],listenbrainzAccount:values['listenbrainz-account']}),null,2));
}
if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
