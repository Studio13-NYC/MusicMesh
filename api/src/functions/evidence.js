const {app}=require('@azure/functions');
const {evidenceResponse}=require('../../shared/evidenceService');
app.http('graphEvidence',{methods:['GET'],route:'graph/evidence',authLevel:'anonymous',handler:async request=>{
 const q=new URL(request.url).searchParams;
 const result=await evidenceResponse({kind:q.get('kind'),id:q.get('id'),field:q.get('field')});
 return {status:result.status,jsonBody:result.body,headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}};
}});
