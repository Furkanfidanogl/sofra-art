// Run from the project root with operator ADC credentials, never a browser token.
// No credentials are generated, downloaded or stored by this script.
const { prepareAdmin, grantAdmin, revokeAdmin } = require('../admin-access.cjs');

async function main() {
  const args = process.argv.slice(2);
  const uidIndex = args.indexOf('--uid');
  const uid = uidIndex >= 0 ? args[uidIndex + 1] : '';
  const apply = args.includes('--apply');
  const revoke = args.includes('--revoke');
  if (!uid || args.some((arg, index) => !['--uid','--apply','--revoke'].includes(arg) && index !== uidIndex + 1)) {
    throw new Error('Usage: set-admin.cjs --uid EXACT_FIREBASE_UID [--revoke] [--apply]');
  }
  const projectId = process.env.SOFRA_FIREBASE_PROJECT_ID;
  const email = process.env.SOFRA_ADMIN_EMAIL;
  if (projectId !== 'sofra-512816' || !email) throw new Error('EXPECTED_PROJECT_AND_EMAIL_REQUIRED');
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const app = initializeApp({ credential: applicationDefault(), projectId });
  const auth = getAuth(app);
  const plan = await prepareAdmin(auth, { uid, email });
  if (!apply) {
    console.log(`Identity verified in ${projectId}. UID: ${plan.uid}. No change made; --apply ${revoke?'removes':'grants'} admin.`);
    return;
  }
  await (revoke ? revokeAdmin : grantAdmin)(auth, { uid, email });
  console.log(`Admin role ${revoke?'removed from':'granted to'} verified UID ${plan.uid}. Sign in again to update the interface.`);
}

main().catch(error => {
  // Do not dump SDK error objects, credentials or tokens.
  console.error(`Admin setup failed: ${error.code || (/^[A-Z_]+$/.test(error.message) ? error.message : 'CHECK_OPERATOR_CREDENTIALS_AND_ARGUMENTS')}`);
  process.exitCode = 1;
});
