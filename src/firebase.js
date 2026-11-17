// Authentication, App Check and callable Functions only. Never import DB/Storage here.
import { createSessionObserver } from './auth-session.js';
import { primaryAuthProvider } from './account-presentation.js';

const nodeEnv = typeof process === 'undefined' ? {} : (process.env || {});
const readEnv = (viteVal, processVal) => viteVal ?? processVal;

let authPromise;
let loadedAuth = null;
let backendPromise;
let recaptchaPromise;
const config = {
  apiKey: readEnv(import.meta.env?.VITE_FIREBASE_API_KEY, nodeEnv.VITE_FIREBASE_API_KEY),
  authDomain: readEnv(import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN, nodeEnv.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: readEnv(import.meta.env?.VITE_FIREBASE_PROJECT_ID, nodeEnv.VITE_FIREBASE_PROJECT_ID),
  appId: readEnv(import.meta.env?.VITE_FIREBASE_APP_ID, nodeEnv.VITE_FIREBASE_APP_ID),
};
export const authConfigured = () => Object.values(config).every(v => typeof v === 'string' && v.trim());
export const appleAuthConfigured = () => authConfigured() && readEnv(import.meta.env?.VITE_APPLE_SIGNIN_ENABLED, nodeEnv.VITE_APPLE_SIGNIN_ENABLED) === 'true';

async function loadAuth() {
  if (!authConfigured()) throw new Error('AUTH_NOT_CONFIGURED');
  if (loadedAuth) return loadedAuth;
  if (!authPromise) {
    authPromise = Promise.all([import('firebase/app'), import('firebase/auth')]).then(async ([app, sdk]) => {
      const instance = app.getApps().length ? app.getApp() : app.initializeApp(config);
      const auth = sdk.getAuth(instance);
      auth.languageCode = 'tr';
      await sdk.setPersistence(auth, sdk.browserLocalPersistence);
      loadedAuth = { sdk, auth };
      return loadedAuth;
    }).catch(error => { loadedAuth = null; authPromise = undefined; throw error; });
  }
  return authPromise;
}

export function warmAuth() {
  if (!authConfigured() || loadedAuth) return;
  loadAuth().catch(() => {});
}

function createGoogleProvider(sdk) {
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

function createAppleProvider(sdk) {
  const provider = new sdk.OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  provider.setCustomParameters({ locale: 'tr' });
  return provider;
}

export async function observeSession(onChange, onError) {
  if (!authConfigured()) {
    onChange({ user: null, admin: false, providerId: null, loading: false, error: null });
    return () => {};
  }
  const { sdk, auth } = await loadAuth();
  const refreshed = new Set();
  return createSessionObserver({
    subscribe: callback => sdk.onIdTokenChanged(auth, user => {
      if (!user) refreshed.clear();
      callback(user);
    }),
    tokenResult: user => {
      // Once per restored identity. Set before refreshing to avoid observer loops.
      const force = !refreshed.has(user.uid);
      refreshed.add(user.uid);
      return sdk.getIdTokenResult(user, force);
    },
    onChange, onError,
  });
}

export async function googleSignIn() {
  const { sdk, auth } = loadedAuth || await loadAuth();
  return (await sdk.signInWithPopup(auth, createGoogleProvider(sdk))).user;
}

export async function appleSignIn() {
  if (!appleAuthConfigured()) {
    throw Object.assign(new Error('APPLE_NOT_CONFIGURED'), { code: 'auth/operation-not-allowed' });
  }
  const { sdk, auth } = loadedAuth || await loadAuth();
  return (await sdk.signInWithPopup(auth, createAppleProvider(sdk))).user;
}

export async function signOutCurrent() {
  if (!authPromise && !loadedAuth) return;
  const { sdk, auth } = loadedAuth || await authPromise;
  await sdk.signOut(auth);
}

export const googleSignOut = signOutCurrent;

export async function reauthenticateForDeletion(expectedUid = null, preferredProviderId = null) {
  const { sdk, auth } = loadedAuth || await loadAuth();
  if (!auth.currentUser) throw Object.assign(new Error('NO_USER'), { code: 'auth/user-token-expired' });
  if (expectedUid && auth.currentUser.uid !== expectedUid) throw new Error('ACCOUNT_CHANGED');
  const resolvedProvider = primaryAuthProvider(auth.currentUser, preferredProviderId) || 'google.com';
  if (resolvedProvider === 'apple.com' && !appleAuthConfigured()) {
    throw Object.assign(new Error('APPLE_NOT_CONFIGURED'), { code: 'auth/operation-not-allowed' });
  }
  const provider = resolvedProvider === 'apple.com' ? createAppleProvider(sdk) : createGoogleProvider(sdk);
  const result = await sdk.reauthenticateWithPopup(auth.currentUser, provider);
  if ((expectedUid && result?.user?.uid !== expectedUid) || (expectedUid && auth.currentUser?.uid !== expectedUid)) {
    throw new Error('ACCOUNT_CHANGED');
  }
  const appleAccessToken = resolvedProvider === 'apple.com'
    ? (sdk.OAuthProvider.credentialFromResult(result)?.accessToken || null)
    : null;
  await sdk.getIdToken(auth.currentUser, true);
  return { uid: auth.currentUser.uid, providerId: resolvedProvider, appleAccessToken };
}

export async function revokeAppleAuthorization(expectedUid, appleAccessToken) {
  const { sdk, auth } = loadedAuth || await loadAuth();
  if (!expectedUid || auth.currentUser?.uid !== expectedUid) throw new Error('ACCOUNT_CHANGED');
  if (typeof appleAccessToken !== 'string' || !appleAccessToken.trim()) {
    throw Object.assign(new Error('APPLE_REVOCATION_TOKEN_MISSING'), { code: 'auth/apple-revocation-failed' });
  }
  try {
    await sdk.revokeAccessToken(auth, appleAccessToken);
  } catch {
    throw Object.assign(new Error('APPLE_REVOCATION_FAILED'), { code: 'auth/apple-revocation-failed' });
  }
}

export async function deleteCurrentAccount(expectedUid) {
  const { sdk, auth } = loadedAuth || await loadAuth();
  if (!expectedUid || auth.currentUser?.uid !== expectedUid) throw new Error('ACCOUNT_CHANGED');
  await sdk.deleteUser(auth.currentUser);
}

export const backendEnabled = () => readEnv(import.meta.env?.VITE_SOFRA_BACKEND_ENABLED, nodeEnv.VITE_SOFRA_BACKEND_ENABLED) === 'true';

function loadRecaptcha() {
  // Google's documented global domain; same Enterprise attestation and score.
  // Load before Firebase so its provider reuses the existing Enterprise runtime.
  if (window.grecaptcha?.enterprise) return Promise.resolve();
  if (!recaptchaPromise) recaptchaPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { script.remove(); reject(Object.assign(new Error('RECAPTCHA_UNAVAILABLE'), { code: 'appCheck/recaptcha-error' })); };
    const timeout = setTimeout(fail, 15000);
    script.src = 'https://www.recaptcha.net/recaptcha/enterprise.js?render=explicit';
    script.async = true;
    script.onload = () => { clearTimeout(timeout); window.grecaptcha?.enterprise ? resolve() : fail(); };
    script.onerror = () => { clearTimeout(timeout); fail(); };
    document.head.append(script);
  }).catch(error => { recaptchaPromise = undefined; throw error; });
  return recaptchaPromise;
}

export const ALLOWED_CALLABLE_FUNCTIONS = Object.freeze([
  'getPublicContent',
  'submitComment',
  'getAdminDashboard',
  'manageContent',
  'uploadArtwork',
  'getArtwork',
  'generateEditorial',
  'manageMyData'
]);

export async function callFunction(name, data) {
  if (!backendEnabled()) throw Object.assign(new Error('BACKEND_DISABLED'), { code: 'functions/unavailable' });
  if (!ALLOWED_CALLABLE_FUNCTIONS.includes(name)) throw new Error('UNKNOWN_OPERATION');
  const siteKey = readEnv(import.meta.env?.VITE_FIREBASE_APPCHECK_SITE_KEY, nodeEnv.VITE_FIREBASE_APPCHECK_SITE_KEY);
  if (!siteKey) throw Object.assign(new Error('APPCHECK_NOT_CONFIGURED'), { code: 'functions/unavailable' });
  if (!backendPromise) {
    backendPromise = Promise.all([loadAuth(), import('firebase/app-check'), import('firebase/functions')])
      .then(async ([{ auth }, check, functions]) => {
        await loadRecaptcha();
        const appCheck = check.initializeAppCheck(auth.app, { provider: new check.ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
        return { appCheck, check, functions, instance: functions.getFunctions(auth.app, 'europe-west1') };
      }).catch(error => { backendPromise = undefined; throw error; });
  }
  const { appCheck, check, functions, instance } = await backendPromise;
  await check.getToken(appCheck);
  const timeout = name === 'uploadArtwork' ? 120000 : 30000;
  return (await functions.httpsCallable(instance, name, { timeout })(data)).data;
}
