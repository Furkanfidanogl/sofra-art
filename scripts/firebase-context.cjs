// Existing operator credentials remain in the Firebase CLI's own store.
const path=require('node:path');
const {createRequire}=require('node:module');
async function loadContext() {
  const cliRoot=process.env.FIREBASE_CLI_PACKAGE_PATH;
  const projectId=process.env.SOFRA_FIREBASE_PROJECT_ID;
  const email=process.env.SOFRA_OPERATOR_EMAIL || process.env.SOFRA_ADMIN_EMAIL;
  if(!cliRoot || !email || projectId!=='sofra-512816')throw new Error('OPERATOR_CONFIGURATION_REQUIRED');
  const cli=createRequire(path.join(cliRoot,'package.json'));
  if(cli('./package.json').version!=='15.34.2')throw new Error('REVIEW_CLI_VERSION_BEFORE_USE');
  const auth=cli('./lib/auth.js'),api=cli('./lib/apiv2.js');
  const options={project:projectId,account:email,projectRoot:path.resolve(__dirname,'..')};
  const account=auth.selectAccount(email,options.projectRoot);
  if(account?.user?.email!==email)throw new Error('EXPECTED_CLI_ACCOUNT_NOT_REGISTERED');
  auth.setActiveAccount(options,account);
  await cli('./lib/requireAuth.js').requireAuth(options);
  return {projectId,api,credential:{getAccessToken:async()=>({access_token:await api.getAccessToken(),expires_in:300})}};
}
module.exports={loadContext};
