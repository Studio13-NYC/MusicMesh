const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
test('snapshot files stream long Unicode records and validate the exact bytes',t=>{
 const {writeRecords,readRecords}=require('../src/import/snapshotFiles');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'musicmesh-stream-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'nodes.ndjson'),rows=[{id:'a',text:'é🎸'.repeat(250000)},{id:'b',name:'Last row'}];
 const expected=Buffer.from(rows.map(JSON.stringify).join('\n')+'\n');
 const hash=writeRecords(file,rows.values());
 assert.equal(hash,crypto.createHash('sha256').update(expected).digest('hex'));
 assert.deepEqual([...readRecords(file,hash)],rows);
 assert.throws(()=>writeRecords(file,rows),/EEXIST/,'never replaces a frozen snapshot');
 fs.appendFileSync(file,' ');
 assert.throws(()=>[...readRecords(file,hash)],/checksum/);
});
