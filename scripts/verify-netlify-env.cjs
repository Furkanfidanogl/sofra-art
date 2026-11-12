// Public build configuration only. Do not print values or CLI credential output.
const {spawnSync}=require('node:child_process');
const keys=['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID','VITE_FIREBASE_APPCHECK_SITE_KEY','VITE_SOFRA_BACKEND_ENABLED'];
for(const key of keys){
 const r=spawnSync('npx',['--yes','netlify-cli@27.12.0','env:get',key,'--context','production','--site','cd69cd56-c63e-4a8e-b96a-bf1ce377c02b'],{encoding:'utf8'});
 if(r.status!==0 || r.stdout.trim()!==process.env[key]){console.error('NETLIFY_ENV_MISMATCH',key);process.exit(1);}
}
console.log(JSON.stringify({productionBuildConfig:'verified',keys:keys.length}));
