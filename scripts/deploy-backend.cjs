// Trusted operator deployment. Existing CLI credentials stay in the CLI store.
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {loadContext}=require('./firebase-context.cjs');
(async()=>{
  await loadContext();
  const result=spawnSync(process.execPath,[path.join(process.env.FIREBASE_CLI_PACKAGE_PATH,'lib/bin/firebase.js'),
    'deploy','--project','sofra-512816','--account',process.env.SOFRA_OPERATOR_EMAIL,
    '--only','functions:sofra,firestore:indexes','--non-interactive'],{stdio:'inherit',cwd:path.resolve(__dirname,'..'),env:process.env});
  process.exitCode=result.status ?? 1;
})().catch(()=>{console.error('BACKEND_DEPLOYMENT_FAILED');process.exitCode=1;});
