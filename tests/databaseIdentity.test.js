const test=require('node:test');
const assert=require('node:assert/strict');
test('a cached database client cannot silently survive a target change',async()=>{
  const original=process.env.DATABASE_URL;
  const {getDatabase,closeDatabase}=require('../src/postgres');
  try {
    process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:55433/musicmesh_restore';
    getDatabase(); // Construction only: no query or connection.
    process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:55434/another_database';
    assert.throws(()=>getDatabase(),/target changed/i);
  } finally {await closeDatabase();if(original===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=original;}
});
