// Callable middleware verifies the ID token before request.auth is provided.
// Only the designated owner email with verified Google identity and server claim can administer.
const AUTHORIZED_ADMIN_EMAIL = (process.env.SOFRA_ADMIN_EMAIL || 'fatihfidanogl@gmail.com').toLowerCase().trim();

function requireUser(request, HttpsError) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Oturum açmalısın.');
  return request.auth;
}

function requireAdmin(request, HttpsError) {
  const auth = requireUser(request, HttpsError);
  const email = (auth.token?.email || '').toLowerCase().trim();

  // Strict administrator identity verification:
  // 1) Email must be explicitly present and match the designated admin email
  if (!email || email !== AUTHORIZED_ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Bu işlem için yetkili yönetici hesabı gerekiyor.');
  }

  // 2) The email must be verified by Google OAuth
  if (auth.token?.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Doğrulanmış Google hesabıyla giriş yap.');
  }

  // 3) Reject missing, empty, or non-Google sign-in providers
  const signInProvider = auth.token?.firebase?.sign_in_provider;
  if (signInProvider !== 'google.com') {
    throw new HttpsError('permission-denied', 'Yönetim işlemleri yalnızca yetkili Google hesabıyla yapılabilir.');
  }

  // 4) The token must have admin === true claim explicitly signed by Firebase Admin SDK
  if (auth.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Bu işlem için yetkili yönetici hesabı gerekiyor.');
  }

  return auth;
}

async function verifyCallableAuth(kind, authHeader, { getAuth, HttpsError }) {
  if (kind === 'public') return null;
  const match = authHeader?.match(/^Bearer (\S+)$/);
  if (!match) throw new HttpsError('unauthenticated', 'Oturum açmalısın.');
  const token = await getAuth().verifyIdToken(match[1], true);
  const verified = { auth: { uid: token.uid, token } };
  const auth = (kind === 'admin' ? requireAdmin : requireUser)(verified, HttpsError);
  if (auth.token?.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Doğrulanmış hesabınla giriş yap.');
  }
  return auth.uid;
}

module.exports = { requireUser, requireAdmin, AUTHORIZED_ADMIN_EMAIL, verifyCallableAuth };
