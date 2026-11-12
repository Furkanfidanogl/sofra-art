// Trusted local operator only. Never imported by frontend or deployed Functions.
// Uses an existing Firebase CLI account in memory; never prints/copies credentials.
const path=require('node:path');
const {createRequire}=require('node:module');
const adminRequire=createRequire(path.resolve(__dirname,'../functions/package.json'));
const {initializeApp}=adminRequire('firebase-admin/app');
const {getAuth}=adminRequire('firebase-admin/auth');
const {prepareAdmin,grantAdmin,revokeAdmin}=require('../functions/admin-access.cjs');
const {loadContext}=require('./firebase-context.cjs');

async function main() {
  const email=process.env.SOFRA_ADMIN_EMAIL;
  if(!email)throw new Error('ADMIN_TARGET_REQUIRED');
  const {api,projectId,credential}=await loadContext();
  const app=initializeApp({projectId,credential});
  const auth=getAuth(app);
  const user=await auth.getUserByEmail(email);
  const target={uid:user.uid,email};
  const plan=await prepareAdmin(auth,target);
  const args=process.argv.slice(2);
  const operation=args[0] || '--inspect';
  if(!['--inspect','--grant','--revoke'].includes(operation))throw new Error('UNKNOWN_OPERATOR_ACTION');
  if(operation!=='--inspect') {
    if(args[1]!==plan.uid || args.length!==2)throw new Error('REVIEWED_EXACT_UID_REQUIRED');
    await (operation==='--grant'?grantAdmin:revokeAdmin)(auth,target);
    const updated=await auth.getUser(plan.uid);
    console.log(JSON.stringify({projectId,uid:updated.uid,email:updated.email,admin:updated.customClaims?.admin===true,operation}));
    return;
  }
  const billing=new api.Client({urlPrefix:'https://cloudbilling.googleapis.com',auth:true});
  let billingEnabled=null;
  try {billingEnabled=(await billing.get(`/v1/projects/${projectId}/billingInfo`)).body.billingEnabled===true;} catch {}
  console.log(JSON.stringify({projectId,uid:user.uid,email:user.email,emailVerified:user.emailVerified,
    disabled:user.disabled===true,google:user.providerData.some(p=>p.providerId==='google.com'),admin:user.customClaims?.admin===true,billingEnabled}));
}
main().catch(error=>{
  const code=typeof error.code==='string' && /^auth\/[a-z-]+$/.test(error.code)?error.code:
    /^[A-Z_]+$/.test(error.message)?error.message:'OPERATOR_REQUEST_FAILED';
  console.error(code);process.exitCode=1;
});
