// Operator-only helper. Not exported as a Function, never bundled in the website.
async function prepareAdmin(auth, { uid, email }) {
  if (typeof uid !== 'string' || !uid || uid.length > 128) throw new Error('EXACT_UID_REQUIRED');
  if (typeof email !== 'string' || !email.includes('@')) throw new Error('EXPECTED_EMAIL_REQUIRED');
  const user = await auth.getUser(uid);
  if (user.disabled || !user.emailVerified || user.email?.toLowerCase() !== email.toLowerCase() ||
      !user.providerData?.some(provider => provider.providerId === 'google.com')) {
    throw new Error('ADMIN_IDENTITY_MISMATCH');
  }
  return { uid: user.uid, claims: { ...user.customClaims, admin: true } };
}

async function grantAdmin(auth, target) {
  const plan = await prepareAdmin(auth, target);
  await auth.setCustomUserClaims(plan.uid, plan.claims);
  return plan.uid;
}

async function revokeAdmin(auth, target) {
  const plan = await prepareAdmin(auth, target);
  const { admin, ...claims } = plan.claims;
  await auth.setCustomUserClaims(plan.uid, claims);
  // Existing ID tokens must not retain the removed privilege.
  await auth.revokeRefreshTokens(plan.uid);
  return plan.uid;
}

module.exports = { prepareAdmin, grantAdmin, revokeAdmin };
