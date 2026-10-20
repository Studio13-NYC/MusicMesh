const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {Client}=require('pg'),{applyStorageBatch}=require('../src/storageCompaction'),{packRows}=require('../src/packedEvidence');
const enabled=process.env.MUSICMESH_TEST_STORAGE==='local';
test('storage CAS preserves edits, rolls back a whole batch and is idempotent',{skip:!enabled},async()=>{
 const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55433');assert.equal(u.pathname,'/musicmesh_restore');
 const c=new Client({connectionString:u.toString()});await c.connect();const ids=[randomUUID(),randomUUID()].map(id=>'storage-test:'+id);
 try{
  for(const id of ids)await c.query(`INSERT INTO entities(id,labels,"primaryLabel","searchText",name,extra) VALUES ($1,ARRAY['Artist'],'Artist','Storage fixture','Storage fixture',$2::jsonb)`,[id,JSON.stringify({providerEvidence:{text:'source '.repeat(100)}})]);
  const original=(await c.query('SELECT e.*,md5(to_jsonb(e)::text) AS hash FROM entities e WHERE id=ANY($1) ORDER BY id',[ids])).rows;
  const packed=packRows(original.map(({hash,...r})=>r)),changes=packed.rows.map((next,i)=>({id:next.id,beforeHash:original[i].hash,next}));
  await c.query('UPDATE entities SET description=$1 WHERE id=$2',['User correction',changes[1].id]);
  await assert.rejects(()=>applyStorageBatch(c,'entities',changes),/conflict/);
  assert.equal((await c.query('SELECT extra FROM entities WHERE id=$1',[changes[0].id])).rows[0].extra.detailsRef,undefined);
  await c.query('UPDATE entities SET description=NULL WHERE id=$1',[changes[1].id]);
  await assert.rejects(()=>applyStorageBatch(c,'entities',[{...changes[0],next:{...changes[0].next,name:'Unrelated change'}}]),/readback mismatch/);
  assert.equal(await applyStorageBatch(c,'entities',changes),2);
  assert.equal(await applyStorageBatch(c,'entities',changes),0);
  for(const [i,r] of (await c.query('SELECT * FROM entities WHERE id=ANY($1) ORDER BY id',[ids])).rows.entries())assert.deepEqual(r,packed.rows[i]);
 }finally{await c.query('DELETE FROM entities WHERE id=ANY($1)',[ids]);await c.end();}
});
