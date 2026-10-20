const {canonicalJson}=require('./domain/serialization');
const {packRows,expandRow,readPackedPage,uploadPackedPages}=require('./packedEvidence');
async function preparePackedImport(db,batch,{readPage=readPackedPage,upload=uploadPackedPages}={}){
 const {storageRow}=require('./domain/repository'),result={nodes:[],relationships:[],beforeNodes:[],beforeRelationships:[]},cache=new Map();
 const cached=ref=>{if(!cache.has(ref))cache.set(ref,readPage(ref));return cache.get(ref);};
 for(const [key,model,previousKey,beforeKey,relationship] of [['nodes','entity','previousNodes','beforeNodes',false],['relationships','relationship','previousRelationships','beforeRelationships',true]]){
  const objects=batch[key]||[];if(!objects.length)continue;
  const found=await db[model].findMany({where:{id:{in:objects.map(o=>o.id)}}}),existing=new Map(found.map(r=>[r.id,r]));
  const toPack=[],unchanged=new Map();
  for(const object of objects){
   const next=storageRow(object,relationship,!!batch.compactEvidence),stored=existing.get(object.id);
   if(stored){
    const full=await expandRow(stored,{relationship,readPage:cached}),value=canonicalJson(full);
    if(value===canonicalJson(next)){unchanged.set(object.id,stored);continue;}
    const previous=batch[previousKey]?.get(object.id);
    if(!previous||![storageRow(previous,relationship,false),storageRow(previous,relationship,true)].some(row=>canonicalJson(row)===value))throw new Error('Existing domain record conflict: '+object.id);
    result[beforeKey].push(stored);
   }
   toPack.push(next);
  }
  const packed=packRows(toPack,{relationship});await upload(packed.pages);
  const next=new Map(packed.rows.map(r=>[r.id,r]));result[key]=objects.map(o=>unchanged.get(o.id)||next.get(o.id));
 }
 return result;
}
async function refreshPackedRows(tx,rows,before,relationship){
 if(!before.length)return 0;
 const {Prisma}=require('../generated/prisma'),table=Prisma.raw(relationship?'relationships':'entities'),old=new Map(before.map(r=>[r.id,r]));
 const changes=rows.filter(r=>old.has(r.id)).map(next=>({id:next.id,before:old.get(next.id),next}));
 await tx.$queryRaw(Prisma.sql`SELECT id FROM ${table} WHERE id=ANY(${changes.map(r=>r.id)}::text[]) FOR UPDATE`);
 const conflict=await tx.$queryRaw(Prisma.sql`SELECT s.id FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) AS s(id text,before jsonb,next jsonb) LEFT JOIN ${table} t ON t.id=s.id WHERE t.id IS NULL OR (to_jsonb(t) IS DISTINCT FROM s.before AND to_jsonb(t) IS DISTINCT FROM s.next) LIMIT 1`);
 if(conflict.length)throw new Error('Existing domain record conflict: '+conflict[0].id);
 const columns=Object.keys(rows[0]).filter(k=>k!=='id'),set=Prisma.join(columns.map(k=>Prisma.sql`${Prisma.raw('"'+k+'"')}=n.${Prisma.raw('"'+k+'"')}`));
 return tx.$executeRaw(Prisma.sql`UPDATE ${table} t SET ${set} FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) AS s(id text,next jsonb) CROSS JOIN LATERAL jsonb_populate_record(NULL::${table},s.next) n WHERE t.id=s.id AND to_jsonb(t) IS DISTINCT FROM to_jsonb(n)`);
}
module.exports={preparePackedImport,refreshPackedRows};
