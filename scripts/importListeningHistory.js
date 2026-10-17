const { parseArgs } = require('node:util');
const { prepareHistory } = require('../src/import/history');
const { fetchRecordings } = require('../src/import/providerCache');

async function main() {
  const {values,positionals}=parseArgs({allowPositionals:true,options:{
    source:{type:'string'},output:{type:'string'},account:{type:'string'},
    'listenbrainz-export':{type:'string'},'listenbrainz-account':{type:'string'},help:{type:'boolean'},
    prepared:{type:'string'},cache:{type:'string'},limit:{type:'string'},
  }});
  if(values.help) { console.log('npm run brainz:import -- prepare --source <CSV> --account <Last.fm user> --output <empty directory> [--listenbrainz-export <directory/JSON/NDJSON> --listenbrainz-account <user>]\nnpm run brainz:import -- fetch-recordings --prepared <prepared directory> --cache <cache directory> [--limit <count>]\nPrepares local artifacts only; never writes a database or submits listens.'); return; }
  if(positionals.length===1 && positionals[0]==='fetch-recordings') {
    if(!values.prepared||!values.cache)throw new Error('--prepared and --cache are required');
    const result=await fetchRecordings({preparedDir:values.prepared,cacheDir:values.cache,limit:values.limit?Number(values.limit):Infinity,
      onProgress:p=>{if(p.processed===1 || p.processed%25===0)console.log(JSON.stringify(p));}});
    console.log(JSON.stringify(result,null,2));return;
  }
  if(positionals.length>1 || (positionals[0] && positionals[0]!=='prepare')) throw new Error('Unknown command; use prepare or fetch-recordings');
  for(const key of ['source','output','account']) if(!values[key]) throw new Error(`--${key} is required; use --help`);
  console.log(JSON.stringify(prepareHistory({sourcePath:values.source,outputDir:values.output,account:values.account,
    listenbrainzPath:values['listenbrainz-export'],listenbrainzAccount:values['listenbrainz-account']}),null,2));
}
if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
