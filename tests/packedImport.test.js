const test=require('node:test'),assert=require('node:assert/strict');
const domain=require('../src/domain'),{storageRow}=require('../src/domain/repository');
const {packRows,restoreRow}=require('../src/packedEvidence');
const {preparePackedImport}=require('../src/packedImport');
test('incremental imports preserve packed storage, exact previous evidence and correction conflicts',async()=>{
 const artist=new domain.Artist({externalId:{provider:'musicbrainz',type:'artist',value:'12345678-1234-1234-1234-123456789abc'},name:'Before',properties:{providerEvidence:{url:'https://musicbrainz.org/a',retrievedAt:'2026-10-19',responseHash:'a'.repeat(64)},rawProvider:{name:'Before'}}});
 const original=storageRow(artist,false,true),packed=packRows([original]);assert.equal(packed.pages.length,1);
 let stored=packed.rows[0],uploads=0;
 const db={entity:{findMany:async()=>[stored]}},options={readPage:async()=>packed.pages[0].document,upload:async pages=>{uploads+=pages.length}};
 let result=await preparePackedImport(db,{nodes:[artist],compactEvidence:true},options);
 assert.deepEqual(result.nodes,[stored]);assert.equal(uploads,0);
 const next=new domain.Artist({id:artist.id,externalId:artist.externalId,name:'After',properties:artist.properties});
 let newPages;result=await preparePackedImport(db,{nodes:[next],compactEvidence:true,previousNodes:new Map([[artist.id,artist]])},{...options,upload:async pages=>{newPages=pages}});
 assert.deepEqual(restoreRow(result.nodes[0],newPages[0].document),storageRow(next,false,true));assert.deepEqual(result.beforeNodes,[stored]);
 stored={...stored,description:'User correction'};
 await assert.rejects(()=>preparePackedImport(db,{nodes:[next],compactEvidence:true,previousNodes:new Map([[artist.id,artist]])},options),/conflict/);
 assert.equal(uploads,0);
});
