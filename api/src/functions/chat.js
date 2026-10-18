const {app}=require('@azure/functions');
const {readTapeEntries,readRuntimeEvents,getTapePathLabel,getRuntimeLogPathLabel}=require('../../shared/activityStore');
const {researchApi}=require('../../shared/researchApi');
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const jsonResponse=(status,jsonBody)=>({status,headers:{...corsHeaders,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},jsonBody});
for(const [name,route,action] of [['chat','chat','advance'],['chatDecision','chat/decision','decision'],['chatRun','chat/run','read']]) {
 app.http(name,{methods:action==='read'?['GET','OPTIONS']:['POST','OPTIONS'],route,authLevel:'anonymous',handler:async request=>{
  if(request.method==='OPTIONS')return {status:204,headers:corsHeaders};
  try {const body=action==='read'?{id:new URL(request.url).searchParams.get('id')}:await request.json();const result=await researchApi(action,body);return jsonResponse(result.status,result.body);}
  catch {return jsonResponse(400,{error:'Invalid request body'});}
 }});
}
app.http("chatTape", {
  methods: ["GET", "OPTIONS"],
  route: "chat/tape",
  authLevel: "anonymous",
  handler: async (request) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    const requestUrl = new URL(request.url);
    const limit = Number(requestUrl.searchParams.get("limit") || 100);
    const entries = await readTapeEntries(limit);

    return jsonResponse(200, {
      tapePath: getTapePathLabel(),
      entries
    });
  }
});

app.http("runtimeLogs", {
  methods: ["GET", "OPTIONS"],
  route: "chat/runtime",
  authLevel: "anonymous",
  handler: async (request) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    const requestUrl = new URL(request.url);
    const limit = Number(requestUrl.searchParams.get("limit") || 100);
    const events = await readRuntimeEvents(limit);

    return jsonResponse(200, {
      runtimeLogPath: getRuntimeLogPathLabel(),
      events
    });
  }
});
