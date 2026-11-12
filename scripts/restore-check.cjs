// A bounded restore drill. Production is only read; only our unique scratch DB can be deleted.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {loadContext}=require('./firebase-context.cjs');
const root=path.resolve(__dirname,'..'),statePath=path.join(root,'.firebase/restore-check.json'),reportPath=path.join(root,'reports/restore-check.json');
const PROJECT='sofra-512816',LOCATION='europe-west1';
function assertScratch(project,id){if(project!==PROJECT||!/^sofra-restore-check-\d{8}-[a-f0-9]{8}$/.test(id||''))throw new Error('UNSAFE_RESTORE_TARGET');return `projects/${project}/databases/${id}`;}
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;}
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function expiredEphemeral(collection,fields,cutoff){
  if(!['requestLimits','commentFingerprints','editorialDrafts','accountDeletions'].includes(collection))return false;
  const expiry=Date.parse(fields?.expiresAt?.timestampValue);
  return Number.isFinite(expiry)&&Number.isFinite(cutoff)&&expiry<=cutoff;
}
const rawSummary=value=>value?{count:value.count,sha256:value.sha256}:{};
function save(state){fs.mkdirSync(path.dirname(statePath),{recursive:true});fs.writeFileSync(statePath,JSON.stringify(state,null,2)+'\n');}
async function inventory(client,database,cutoff=NaN){
  const base='/v1/'+database+'/documents';
  const ids=(await client.post(base+':listCollectionIds',{pageSize:100})).body;
  if(ids.nextPageToken)throw new Error('COLLECTION_BOUND_EXCEEDED');
  const result={};
  for(const id of (ids.collectionIds||[]).sort()){
    const response=(await client.get(`${base}/${encodeURIComponent(id)}`,{queryParams:{pageSize:1000}})).body;
    if(response.nextPageToken)throw new Error('DOCUMENT_BOUND_EXCEEDED');
    const docs=(response.documents||[]).map(d=>({id:d.name.split('/').at(-1),fields:d.fields||{}})).sort((a,b)=>a.id.localeCompare(b.id));
    const active=docs.filter(d=>!expiredEphemeral(id,d.fields,cutoff));
    result[id]={count:docs.length,sha256:digest(docs),activeCount:active.length,activeSha256:digest(active),expiredCount:docs.length-active.length};
  }
  return result;
}
async function main(){
  const action=process.argv[2]||'--inspect';
  if(!['--inspect','--start','--status','--verify','--cleanup'].includes(action))throw new Error('UNKNOWN_RESTORE_ACTION');
  if(['--start','--cleanup'].includes(action)&&process.env.SOFRA_RESTORE_CHECK!=='true')throw new Error('EXPLICIT_RESTORE_DRILL_REQUIRED');
  const ctx=await loadContext(),client=new ctx.api.Client({urlPrefix:'https://firestore.googleapis.com',auth:true});
  if(action==='--inspect'||action==='--start'){
    const backups=(await client.get(`/v1/projects/${PROJECT}/locations/${LOCATION}/backups`)).body.backups||[];
    const backup=backups.filter(b=>b.database===`projects/${PROJECT}/databases/(default)`&&b.state==='READY').sort((a,b)=>b.snapshotTime.localeCompare(a.snapshotTime))[0];
    if(!backup)throw new Error('NO_READY_PRODUCTION_BACKUP');
    if(action==='--inspect'){console.log(JSON.stringify({ready:true,snapshotTime:backup.snapshotTime,region:LOCATION}));return;}
    if(fs.existsSync(statePath)&&!JSON.parse(fs.readFileSync(statePath)).cleanupComplete)throw new Error('RESTORE_DRILL_ALREADY_EXISTS');
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');
    const databaseId=`sofra-restore-check-${date}-${randomUUID().slice(0,8)}`;
    assertScratch(ctx.projectId,databaseId);
    const state={projectId:ctx.projectId,databaseId,backup:backup.name,snapshotTime:backup.snapshotTime,startedAt:new Date().toISOString(),sourceBefore:await inventory(client,backup.database)};
    save(state);
    const op=(await client.post(`/v1/projects/${PROJECT}/databases:restore`,{databaseId,backup:backup.name})).body;
    state.operation=op.name;save(state);console.log(JSON.stringify({started:true,databaseId,operation:op.name}));return;
  }
  const state=JSON.parse(fs.readFileSync(statePath,'utf8')),database=assertScratch(state.projectId,state.databaseId);
  if(action==='--status'){
    const op=(await client.get('/v1/'+(state.cleanupOperation||state.operation))).body;
    if(op.error)throw new Error('RESTORE_OPERATION_FAILED');
    if(op.done){if(state.cleanupOperation)state.cleanupComplete=true;else state.restoreComplete=true;save(state);}
    console.log(JSON.stringify({done:Boolean(op.done),stage:state.cleanupOperation?'cleanup':'restore'}));
    if(state.cleanupComplete&&fs.existsSync(reportPath)){const report=JSON.parse(fs.readFileSync(reportPath));report.cleanupComplete=true;report.cleanedAt=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
    return;
  }
  if(!state.restoreComplete)throw new Error('RESTORE_NOT_COMPLETE');
  if(action==='--verify'){
    const databaseInfo=(await client.get('/v1/'+database)).body;
    if(databaseInfo.locationId!==LOCATION)throw new Error('RESTORE_LOCATION_MISMATCH');
    const cutoff=Date.parse(state.startedAt),restored=await inventory(client,database,cutoff),sourceAfter=await inventory(client,`projects/${PROJECT}/databases/(default)`,cutoff);
    const collections=[...new Set([...Object.keys(state.sourceBefore),...Object.keys(restored),...Object.keys(sourceAfter)])].sort().map(collection=>{
      const before=state.sourceBefore[collection],target=restored[collection],after=sourceAfter[collection];
      const matchesBefore=digest(rawSummary(before))===digest(rawSummary(target));
      const sourceUnchanged=digest(rawSummary(before))===digest(rawSummary(after));
      const knownExpiryDifference=!matchesBefore&&sourceUnchanged&&((target?.expiredCount||0)+(after?.expiredCount||0)>0)&&target?.activeSha256===after?.activeSha256;
      return {collection,sourceBefore:before?.count||0,restored:target?.count||0,sourceAfter:after?.count||0,matchesBefore,sourceUnchanged,knownExpiryDifference,expiredRestoredRecords:target?.expiredCount||0};
    });
    const unauth=await fetch(`https://firestore.googleapis.com/v1/${database}/documents:runQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:'siteContent'}],limit:1}}),signal:AbortSignal.timeout(20000)});
    const integrityMatches=collections.every(c=>(c.matchesBefore||c.knownExpiryDifference)&&c.sourceUnchanged),unauthenticatedAccessDenied=[401,403].includes(unauth.status);
    const report={checkedAt:new Date().toISOString(),backup:state.backup,snapshotTime:state.snapshotTime,databaseId:state.databaseId,region:LOCATION,observedRestoreUpperBoundMs:Date.now()-Date.parse(state.startedAt),backupAgeAtStartSeconds:Math.round((Date.parse(state.startedAt)-Date.parse(state.snapshotTime))/1000),collections,integrityMatches,unauthenticatedAccessDenied,productionWritten:false,cleanupComplete:false,limitations:'Restored Firestore documents were compared; scratch index definitions were not separately compared. Auth/Storage excluded. Scratch DB is never connected to the app; TTL must be reapplied before any real recovery is served.'};
    fs.mkdirSync(path.dirname(reportPath),{recursive:true});
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
    state.verified=integrityMatches&&unauthenticatedAccessDenied;save(state);
    console.log(JSON.stringify({verified:state.verified,collections:collections.length,unauthenticatedStatus:unauth.status}));
    if(!state.verified)throw new Error('RESTORE_VERIFICATION_FAILED');return;
  }
  if(!state.verified)throw new Error('RESTORE_NOT_VERIFIED');
  if(state.cleanupComplete){console.log(JSON.stringify({cleanupComplete:true}));return;}
  const info=(await client.get('/v1/'+database)).body;
  if(info.deleteProtectionState==='DELETE_PROTECTION_ENABLED')await client.patch('/v1/'+database,{deleteProtectionState:'DELETE_PROTECTION_DISABLED'},{queryParams:{updateMask:'deleteProtectionState'}});
  const op=(await client.delete('/v1/'+database)).body;state.cleanupOperation=op.name;save(state);console.log(JSON.stringify({cleanupStarted:true,operation:op.name}));
}
if(require.main===module)main().catch(error=>{console.error('RESTORE_DRILL_FAILED',error.status||'UNAVAILABLE',/^[A-Z_]+$/.test(error.message)?error.message:'SEE_OPERATOR_PERMISSIONS');process.exitCode=1;});
module.exports={assertScratch,digest,expiredEphemeral};
