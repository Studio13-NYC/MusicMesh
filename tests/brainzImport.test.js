const test=require('node:test');
const assert=require('node:assert/strict');
const domain=require('../src/domain');
const {recordingGraph}=require('../src/import/catalogGraph');
const rec='bf7c0045-d389-4ef9-9df4-0a375000076c';
const artist='97b1142f-c71e-4971-8736-4a8ce6b4c300';
const work='28506538-3b4a-36e0-bb56-572ebf29d5bd';
const type='a3005666-a872-32c3-ad06-98af558e99b0';
function response(){return {url:`https://musicbrainz.org/ws/2/recording/${rec}?fmt=json`,fetchedAt:'2026-10-17T00:00:00Z',body:{id:rec,title:'Example',length:123000,'first-release-date':'1989',
  'artist-credit':[{name:'Credited name',joinphrase:'',artist:{id:artist,name:'Canonical name',type:'Group'}}],
  relations:[{'target-type':'work','type-id':type,type:'performance',direction:'forward',begin:'1988',end:null,attributes:['live'],work:{id:work,title:'Composition'}}]}};}
test('provider graph distinguishes recordings/works, preserves billing and actual relationship types',()=>{
  const graph=recordingGraph(response());
  assert.equal(graph.nodes.filter(x=>x instanceof domain.Recording).length,1);
  assert.equal(graph.nodes.filter(x=>x instanceof domain.Work).length,1);
  const credit=graph.nodes.find(x=>x instanceof domain.ArtistCredit);
  assert.equal(credit.properties.credits[0].creditedName,'Credited name');
  assert.ok(graph.relationships.some(x=>x.type==='CreditsArtist' && x.target===`musicbrainz:artist:${artist}`));
  const relationship=graph.relationships.find(x=>x.type==='MusicBrainzRelationship');
  assert.equal(relationship.properties.providerTypeId,type);
  assert.equal(relationship.properties.beginDate,'1988');
  assert.equal(relationship.source,`musicbrainz:recording:${rec}`);
  assert.equal(relationship.target,`musicbrainz:work:${work}`);
  assert.equal(graph.nodes.find(x=>x.type==='Recording').properties.durationMs,123000);
});
test('provider relationship direction and separate episodes survive without converting similarity to influence',()=>{
  const data=response();data.body.relations[0].direction='backward';
  data.body.relations.push({...data.body.relations[0],begin:'1999'});
  const graph=recordingGraph(data),rels=graph.relationships.filter(x=>x.type==='MusicBrainzRelationship');
  assert.equal(rels[0].source,`musicbrainz:work:${work}`);
  assert.equal(new Set(rels.map(x=>x.id)).size,2);
  assert.throws(()=>recordingGraph({...data,body:{...data.body,relations:[{...data.body.relations[0],direction:'unknown'}]}}),/direction/);
});
test('provider relationship endpoints and artist credit positions are enforced by domain classes',()=>{
  const a=new domain.Artist({id:'a',name:'A'}),r=new domain.Recording({id:'r',name:'R'});
  const credit=new domain.ArtistCredit({id:'c',name:'A',properties:{credits:[{artistId:'a',creditedName:'A',joinPhrase:''}]}});
  assert.throws(()=>new domain.CreditsArtist({source:credit,target:a,assertionKey:'x',properties:{position:1}}),/credit/);
  assert.throws(()=>new domain.MusicBrainzRelationship({source:a,target:r,assertionKey:'x',properties:{providerTypeId:type,providerTypeName:'performance',sourceType:'Recording',targetType:'Work'}}),/endpoint/);
});
