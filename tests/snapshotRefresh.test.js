const test=require('node:test'),assert=require('node:assert/strict');
const d=require('../src/domain');
const {planSnapshotRefresh}=require('../src/import/graphSnapshot');
function graph(nodes,relationships=[]){return {manifest:{sourceInput:{sourceHash:'same'},files:{}},nodes,relationships};}
test('refresh identifies changed baseline rows while retaining omitted evidence',()=>{
 const a=new d.Recording({id:'r',name:'Before'}),b=new d.Recording({id:'r',name:'After'}),c=new d.Work({id:'w',name:'Retained'}),n=new d.Work({id:'new',name:'New'});
 const p=planSnapshotRefresh(graph([a,c]),graph([b,n]));
 assert.deepEqual(p.summary,{changedNodes:1,changedRelationships:0,retainedNodes:1,retainedRelationships:0});
 assert.equal(p.nodes.get('r'),a);assert.equal(p.nodes.has('new'),false);
 assert.throws(()=>planSnapshotRefresh(graph([a]),graph([new d.Artist({id:'r',name:'Different class'})])),/identity/);
 const wrong=graph([b]);wrong.manifest.sourceInput={sourceHash:'different'};
 assert.throws(()=>planSnapshotRefresh(graph([a]),wrong),/source/);
});
test('verified compact baselines import only new or changed source objects',()=>{
 const {selectSnapshotDelta}=require('../src/import/graphSnapshot');
 const a=new d.Recording({id:'a',name:'Same'}),old=new d.Work({id:'w',name:'Old'}),next=new d.Work({id:'w',name:'New'}),added=new d.Work({id:'new',name:'Added'});
 const before=graph([a,old]),after=graph([a,next,added]);
 const selected=selectSnapshotDelta(before,after,planSnapshotRefresh(before,after));
 assert.deepEqual(selected.nodes.map(x=>x.id),['w','new']);assert.equal(selected.carriedNodes,1);assert.equal(selected.carriedRelationships,0);
});
