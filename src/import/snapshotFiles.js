const fs=require('node:fs'),{createHash}=require('node:crypto'),{StringDecoder}=require('node:string_decoder');
// Large catalogs exceed V8's single-string limit. Keep NDJSON serialization and
// checksum verification bounded to one record/chunk, preserving exact bytes.
function writeRecords(file,records){
 const fd=fs.openSync(file,'wx'),hash=createHash('sha256');
 try{for(const record of records){const bytes=Buffer.from(JSON.stringify(record)+'\n');fs.writeFileSync(fd,bytes);hash.update(bytes);}}
 finally{fs.closeSync(fd);}
 return hash.digest('hex');
}
function* readRecords(file,expectedHash){
 const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024),decoder=new StringDecoder('utf8'),hash=createHash('sha256');let pending='',parseError;
 try{
  let count;
  while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0){
   const bytes=buffer.subarray(0,count);hash.update(bytes);pending+=decoder.write(bytes);
   let start=0,end;
   while((end=pending.indexOf('\n',start))!==-1){
    const line=pending.slice(start,end).trim();
    if(line&&!parseError){let row;try{row=JSON.parse(line);}catch(error){parseError=error;}if(!parseError)yield row;}
    start=end+1;
   }
   pending=pending.slice(start);
  }
  if(hash.digest('hex')!==expectedHash)throw new Error('Snapshot checksum mismatch: '+file);
  if(parseError)throw parseError;
  pending+=decoder.end();if(pending.trim())yield JSON.parse(pending);
 }finally{fs.closeSync(fd);}
}
module.exports={writeRecords,readRecords};
