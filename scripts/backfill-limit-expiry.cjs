// Only adds the previously approved expiry to legacy ephemeral rate records.
// Never touches comments/assets/accounts or overwrites concurrently updated records.
const {loadContext}=require('./firebase-context.cjs');
function expiryFor(fields){
  if(fields.expiresAt)return null;
  const lastAt=Number(fields.lastAt?.integerValue??fields.lastAt?.doubleValue);
  const windowStart=Number(fields.windowStart?.integerValue??fields.windowStart?.doubleValue);
  if(!Number.isSafeInteger(lastAt)||!Number.isSafeInteger(windowStart)||lastAt<0||windowStart<0)return null;
  const date=new Date(Math.max(lastAt,windowStart)+86400000);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}
async function main(){
  const action=process.argv[2]||'--inspect';
  if(!['--inspect','--apply'].includes(action))throw new Error('UNKNOWN_ACTION');
  if(action==='--apply'&&process.env.SOFRA_APPLY_SAFEGUARDS!=='true')throw new Error('EXPLICIT_SAFEGUARD_APPLY_REQUIRED');
  const ctx=await loadContext(),client=new ctx.api.Client({urlPrefix:'https://firestore.googleapis.com',auth:true});
  const base=`/v1/projects/${ctx.projectId}/databases/(default)/documents`;
  const response=await client.post(`${base}:runQuery`,{structuredQuery:{from:[{collectionId:'requestLimits'}],select:{fields:['expiresAt','lastAt','windowStart'].map(fieldPath=>({fieldPath}))},limit:501}});
  const docs=response.body.filter(row=>row.document).map(row=>row.document);
  if(docs.length>500)throw new Error('BOUNDED_MIGRATION_LIMIT_EXCEEDED');
  const report={checkedAt:new Date().toISOString(),mode:action,collection:'requestLimits',scanned:docs.length,missingExpiry:0,updated:0,concurrentSkips:0,unrecognizedSkipped:0};
  for(const doc of docs){
    if(doc.fields?.expiresAt)continue;
    report.missingExpiry++;
    const expiry=expiryFor(doc.fields||{});
    if(!expiry){report.unrecognizedSkipped++;continue;}
    if(action==='--apply'){
      try{await client.patch('/v1/'+doc.name,{fields:{expiresAt:{timestampValue:expiry}}},{queryParams:{'updateMask.fieldPaths':'expiresAt','currentDocument.updateTime':doc.updateTime}});report.updated++;}
      catch(error){if([404,409,412].includes(error.status)){report.concurrentSkips++;continue;}throw error;}
    }
  }
  console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(error=>{console.error('LIMIT_EXPIRY_BACKFILL_FAILED',error.status||'UNAVAILABLE',/^[A-Z_]+$/.test(error.message)?error.message:'SEE_OPERATOR_PERMISSIONS');process.exitCode=1;});
module.exports={expiryFor};
