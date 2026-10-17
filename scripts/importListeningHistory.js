const { parseArgs } = require('node:util');
const { prepareHistory } = require('../src/import/history');
const { fetchRecordings } = require('../src/import/providerCache');

async function main() {
  const {values,positionals}=parseArgs({allowPositionals:true,options:{
    source:{type:'string'},output:{type:'string'},account:{type:'string'},
    'listenbrainz-export':{type:'string'},'listenbrainz-account':{type:'string'},help:{type:'boolean'},
    prepared:{type:'string'},cache:{type:'string'},coverage:{type:'string'},limit:{type:'string'},
    snapshot:{type:'string'},'replace-existing':{type:'boolean'},
  }});
  if(values.help) {
    console.log([
      'npm run brainz:import -- prepare --source <CSV> --account <Last.fm user> --output <empty directory> [--listenbrainz-export <directory/JSON/NDJSON> --listenbrainz-account <user>]',
      'npm run brainz:import -- fetch-recordings --prepared <directory> --cache <directory> [--limit <count>]',
      'npm run brainz:import -- acoustic-coverage --prepared <directory> --cache <directory> [--limit <count>]',
      'npm run brainz:import -- acoustic-features --prepared <directory> --coverage <complete coverage directory> --cache <directory> [--limit <count>]',
      'npm run brainz:import -- compile --prepared <directory> --cache <directory> --output <empty directory>',
      'node --env-file=.env.migration scripts/importListeningHistory.js load-isolated --snapshot <directory> [--replace-existing]',
      'Only load-isolated writes a database; its target is restricted to the configured validation hosts. No command submits listens.'
    ].join('\n'));return;
  }
  if(positionals.length===1 && positionals[0]==='fetch-recordings') {
    if(!values.prepared||!values.cache)throw new Error('--prepared and --cache are required');
    const result=await fetchRecordings({preparedDir:values.prepared,cacheDir:values.cache,limit:values.limit?Number(values.limit):Infinity,
      onProgress:p=>{if(p.processed===1 || p.processed%25===0)console.log(JSON.stringify(p));}});
    console.log(JSON.stringify(result,null,2));return;
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
    console.log(JSON.stringify(require('../src/import/graphSnapshot').compileSnapshot({preparedDir:values.prepared,cacheDir:values.cache,outputDir:values.output}),null,2));return;
  }
  if(positionals.length===1 && positionals[0]==='load-isolated') {
    if(!values.snapshot)throw new Error('load-isolated requires --snapshot');
    try {console.log(JSON.stringify(await require('../src/import/graphSnapshot').loadIsolatedSnapshot({directory:values.snapshot,replace:!!values['replace-existing'],onProgress:p=>console.log(JSON.stringify(p))}),null,2));}
    finally {await require('../src/postgres').closeDatabase();}return;
  }
  if(positionals.length>1 || (positionals[0] && positionals[0]!=='prepare')) throw new Error('Unknown command; use --help');
  for(const key of ['source','output','account']) if(!values[key]) throw new Error(`--${key} is required; use --help`);
  console.log(JSON.stringify(prepareHistory({sourcePath:values.source,outputDir:values.output,account:values.account,
    listenbrainzPath:values['listenbrainz-export'],listenbrainzAccount:values['listenbrainz-account']}),null,2));
}
if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
