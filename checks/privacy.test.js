import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import { imageSource, imageAttributes } from '../src/responsive-image.js';
import { exportMyComments, removeMyComments, eraseAccountWorkflow } from '../src/privacy-client.js';
import { readSpotifyPreference, saveSpotifyPreference } from '../src/spotify-track.js';
import { createAuthActions } from '../src/firebase.js';
const require = createRequire(import.meta.url);
const { requireRecentDeletion, createPrivacyService } = require('../functions/privacy.cjs');

test('browser configuration evaluates without a Node process global', () => {
  const source=fs.readFileSync(new URL('../src/firebase.js',import.meta.url),'utf8');
  const prefix=source.slice(0,source.indexOf('async function loadAuth()')).replace(/^import .*;$/mg,'').replaceAll('import.meta.env','({})').replaceAll('export ','');
  assert.equal(vm.runInNewContext(`${prefix}\nauthConfigured()`,{}),false);
  assert.equal(vm.runInNewContext(`${prefix}\nappleAuthConfigured()`,{}),false);
});

test('the real Spotify renderer creates no external iframe before opt-in or after revocation', () => {
  const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const renderer=source.slice(source.indexOf('function renderPlayer()'),source.indexOf('async function togglePlay()'));
  const root={dataset:{},innerHTML:''};
  const context={imageSource,imageAttributes,document:{querySelector:()=>root},getDaily:()=>({spotifyUrl:'https://open.spotify.com/track/6qqdFWe7C4LsBjWbXQdsHA',songTitle:'Seçilen şarkı'}),audio:{pause(){}},esc:s=>s,spotifyTrackUrl:s=>s,forcedOriginal:false,spotifyAllowed:false};
  vm.createContext(context);vm.runInContext(renderer+';renderPlayer()',context);
  assert.equal(root.innerHTML.includes('<iframe'),false);
  assert.match(root.innerHTML,/Spotify oynatıcısını yükle/);
  context.spotifyAllowed=true;vm.runInContext('renderPlayer()',context);assert.match(root.innerHTML,/<iframe/);
  context.spotifyAllowed=false;vm.runInContext('renderPlayer()',context);assert.equal(root.innerHTML.includes('<iframe'),false);
});

test('account erasure requires recent identity and cannot remove the administrator', () => {
  const now = 2000000;
  for (const token of [{}, {auth_time: 100}, {auth_time: 3000}, {admin: true, auth_time: 2000}]) {
    assert.throws(() => requireRecentDeletion(token, now), { code: 'failed-precondition' });
  }
  assert.doesNotThrow(() => requireRecentDeletion({auth_time: 1990}, now));
});

test('privacy operations reject a different account or forged fields before database access', async () => {
  const service = createPrivacyService({db: {}});
  await assert.rejects(service.manage('user-a', {operation:'delete', accountUid:'user-b'}, {}), {code:'aborted'});
  await assert.rejects(service.manage('user-a', {operation:'export', accountUid:'user-a', uid:'user-b'}, {}), {code:'invalid-argument'});
});

test('data export paginates completely and rejects repeated cursors or identity changes', async () => {
  const calls=[];
  const comments=await exportMyComments({uid:'owner',isCurrent:()=>true,request:async value=>{
    calls.push(value);return value.cursor?{comments:[{id:'two'}],nextCursor:null}:{comments:[{id:'one'}],nextCursor:'page-two'};
  }});
  assert.deepEqual(comments.map(c=>c.id),['one','two']);
  assert.equal(calls.every(c=>c.accountUid==='owner'),true);
  await assert.rejects(exportMyComments({uid:'owner',isCurrent:()=>true,request:async()=>({comments:[],nextCursor:'loop'})}),/INVALID_EXPORT_CURSOR/);
  let active=true;
  await assert.rejects(exportMyComments({uid:'owner',isCurrent:()=>active,request:async()=>{active=false;return {comments:[],nextCursor:null};}}),/ACCOUNT_CHANGED/);
});

test('deletion waits for every cleanup page and stops immediately after account switch', async () => {
  let calls=0;
  await removeMyComments({uid:'owner',isCurrent:()=>true,request:async value=>{
    assert.equal(value.accountUid,'owner');return {complete:++calls===2};
  }});
  assert.equal(calls,2);
  let active=true;
  await assert.rejects(removeMyComments({uid:'owner',isCurrent:()=>active,request:async()=>{active=false;return {complete:false};}}),/ACCOUNT_CHANGED/);
});

test('Spotify requires explicit opt-in and revocation survives a page reload', () => {
  const values=new Map();const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  assert.equal(readSpotifyPreference(storage),false);
  saveSpotifyPreference(storage,true);assert.equal(readSpotifyPreference(storage),true);
  saveSpotifyPreference(storage,false);assert.equal(readSpotifyPreference(storage),false);
  assert.equal(readSpotifyPreference({getItem(){throw Error('unavailable')}}),false);
});

test('eraseAccountWorkflow enforces pre-checks before deleting any comments and covers linked/Google/Apple cases', async () => {
  // 1. Valid Apple scenario: exact order & success
  const steps = [];
  const appleResult = await eraseAccountWorkflow({
    uid: 'apple-u1',
    providerId: 'apple.com',
    hasLinkedApple: true,
    isCurrent: () => true,
    reauthenticate: async (uid, providerId) => {
      steps.push(['reauth', uid, providerId]);
      return { uid, providerId: 'apple.com', requiresAppleRevocation: true, appleAccessToken: 'apple-oauth-tok' };
    },
    removeComments: async uid => { steps.push(['removeComments', uid]); },
    revokeAppleToken: async (uid, token) => { steps.push(['revokeApple', uid, token]); },
    deleteAuthAccount: async uid => { steps.push(['deleteAuth', uid]); },
  });
  assert.deepEqual(appleResult, { providerId: 'apple.com', appleRevoked: true });
  assert.deepEqual(steps, [
    ['reauth', 'apple-u1', 'apple.com'],
    ['removeComments', 'apple-u1'],
    ['revokeApple', 'apple-u1', 'apple-oauth-tok'],
    ['deleteAuth', 'apple-u1'],
  ]);

  // 2. null, empty, or whitespace Apple tokens MUST abort BEFORE removeComments/revoke/deleteAuthAccount
  for (const badToken of [null, undefined, '', '   \t\n  ']) {
    let removeCalls = 0, revokeCalls = 0, deleteCalls = 0;
    await assert.rejects(eraseAccountWorkflow({
      uid: 'apple-u1',
      providerId: 'apple.com',
      isCurrent: () => true,
      reauthenticate: async uid => ({ uid, providerId: 'apple.com', appleAccessToken: badToken }),
      removeComments: async () => { removeCalls++; },
      revokeAppleToken: async () => { revokeCalls++; },
      deleteAuthAccount: async () => { deleteCalls++; },
    }), { code: 'auth/apple-revocation-failed' });
    assert.equal(removeCalls, 0, `removeComments must not run for token=${JSON.stringify(badToken)}`);
    assert.equal(revokeCalls, 0);
    assert.equal(deleteCalls, 0);
  }

  // 3. Missing revokeAppleToken callback MUST fail BEFORE reauth or removeComments
  {
    let reauthCalls = 0, removeCalls = 0, deleteCalls = 0;
    await assert.rejects(eraseAccountWorkflow({
      uid: 'apple-u1',
      providerId: 'apple.com',
      hasLinkedApple: true,
      isCurrent: () => true,
      reauthenticate: async uid => { reauthCalls++; return { uid, providerId: 'apple.com', appleAccessToken: 'tok' }; },
      removeComments: async () => { removeCalls++; },
      deleteAuthAccount: async () => { deleteCalls++; },
    }), { code: 'auth/apple-revocation-failed' });
    assert.equal(reauthCalls, 0);
    assert.equal(removeCalls, 0);
    assert.equal(deleteCalls, 0);
  }

  // 4. Reauthentication cancel or UID mismatch MUST stop BEFORE removeComments
  {
    let removeCalls = 0, revokeCalls = 0, deleteCalls = 0;
    await assert.rejects(eraseAccountWorkflow({
      uid: 'apple-u1',
      providerId: 'apple.com',
      isCurrent: () => true,
      reauthenticate: async () => { throw Object.assign(new Error('cancelled'), { code: 'auth/popup-closed-by-user' }); },
      removeComments: async () => { removeCalls++; },
      revokeAppleToken: async () => { revokeCalls++; },
      deleteAuthAccount: async () => { deleteCalls++; },
    }), { code: 'auth/popup-closed-by-user' });
    assert.equal(removeCalls, 0);
    assert.equal(revokeCalls, 0);
    assert.equal(deleteCalls, 0);

    await assert.rejects(eraseAccountWorkflow({
      uid: 'apple-u1',
      providerId: 'apple.com',
      isCurrent: () => true,
      reauthenticate: async () => ({ uid: 'other-uid', providerId: 'apple.com', appleAccessToken: 'tok' }),
      removeComments: async () => { removeCalls++; },
      revokeAppleToken: async () => { revokeCalls++; },
      deleteAuthAccount: async () => { deleteCalls++; },
    }), /ACCOUNT_CHANGED/);
    assert.equal(removeCalls, 0);
    assert.equal(revokeCalls, 0);
    assert.equal(deleteCalls, 0);
  }

  // 5. Linked Google + Apple (session started via Google, hasLinkedApple: true) MUST force Apple reauth & revocation
  {
    const linkedSteps = [];
    const linkedRes = await eraseAccountWorkflow({
      uid: 'linked-u1',
      providerId: 'google.com',
      hasLinkedApple: true,
      isCurrent: () => true,
      reauthenticate: async (uid, providerId) => {
        linkedSteps.push(['reauth', providerId]);
        return { uid, providerId, appleAccessToken: 'linked-apple-tok' };
      },
      removeComments: async () => { linkedSteps.push(['removeComments']); },
      revokeAppleToken: async (uid, token) => { linkedSteps.push(['revokeApple', token]); },
      deleteAuthAccount: async () => { linkedSteps.push(['deleteAuth']); },
    });
    assert.deepEqual(linkedRes, { providerId: 'apple.com', appleRevoked: true });
    assert.deepEqual(linkedSteps, [
      ['reauth', 'apple.com'],
      ['removeComments'],
      ['revokeApple', 'linked-apple-tok'],
      ['deleteAuth'],
    ]);
  }

  // 6. Apple revocation network failure MUST preserve Firebase Auth account (no partial-success wipe)
  {
    let deleteCalls = 0;
    const secretTok = 'apple-secret-access-token-xyz';
    let caught;
    try {
      await eraseAccountWorkflow({
        uid: 'apple-u1',
        providerId: 'apple.com',
        isCurrent: () => true,
        reauthenticate: async uid => ({ uid, providerId: 'apple.com', appleAccessToken: secretTok }),
        removeComments: async () => {},
        revokeAppleToken: async () => { throw Object.assign(new Error('REVOCATION_NETWORK_FAIL'), { code: 'auth/apple-revocation-failed' }); },
        deleteAuthAccount: async () => { deleteCalls++; },
      });
    } catch (err) {
      caught = err;
    }
    assert.equal(caught?.code, 'auth/apple-revocation-failed');
    assert.equal(String(caught?.message || '').includes(secretTok), false);
    assert.equal(deleteCalls, 0);
  }

  // 7. Google-only happy path preserves existing non-Apple deletion flow
  {
    const googleSteps = [];
    const googleResult = await eraseAccountWorkflow({
      uid: 'google-u1',
      providerId: 'google.com',
      hasLinkedApple: false,
      isCurrent: () => true,
      reauthenticate: async (uid, providerId) => { googleSteps.push(['reauth', providerId]); return { uid, providerId: 'google.com', appleAccessToken: null }; },
      removeComments: async () => { googleSteps.push(['removeComments']); },
      revokeAppleToken: async () => { throw new Error('Should not revoke Apple for Google user'); },
      deleteAuthAccount: async () => { googleSteps.push(['deleteAuth']); },
    });
    assert.deepEqual(googleResult, { providerId: 'google.com', appleRevoked: false });
    assert.deepEqual(googleSteps, [['reauth', 'google.com'], ['removeComments'], ['deleteAuth']]);
  }
});

test('real Firebase auth helpers (createAuthActions) handle provider selection, credentials, UID switches, flag gating, and revocation', async () => {
  function makeHarness({
    currentUser = { uid: 'u-1', providerData: [{ providerId: 'apple.com' }] },
    appleEnabled = true,
    hasCred = true,
    credentialToken = 'fresh-apple-oauth-token',
    reauthUidOverride = null,
    revokeShouldFail = false,
  } = {}) {
    const calls = [];
    let activeUser = currentUser;
    class FakeGoogleAuthProvider {
      constructor() { this.providerId = 'google.com'; this.params = {}; }
      setCustomParameters(p) { this.params = p; }
    }
    class FakeOAuthProvider {
      constructor(providerId) { this.providerId = providerId; this.scopes = []; this.params = {}; }
      addScope(s) { this.scopes.push(s); }
      setCustomParameters(p) { this.params = p; }
      static credentialFromResult(result) { return result?._cred || null; }
    }
    const auth = {
      get currentUser() { return activeUser; },
    };
    const sdk = {
      GoogleAuthProvider: FakeGoogleAuthProvider,
      OAuthProvider: FakeOAuthProvider,
      signInWithPopup: async (_auth, provider) => {
        calls.push(['signInWithPopup', provider.providerId, provider.scopes || []]);
        return { user: activeUser };
      },
      signOut: async () => { calls.push(['signOut']); activeUser = null; },
      reauthenticateWithPopup: async (user, provider) => {
        calls.push(['reauthenticateWithPopup', user.uid, provider.providerId, provider.scopes || []]);
        if (reauthUidOverride) activeUser = { ...user, uid: reauthUidOverride };
        return {
          user: activeUser,
          _cred: hasCred ? { accessToken: credentialToken, providerId: provider.providerId } : null,
        };
      },
      getIdToken: async (user, force) => { calls.push(['getIdToken', user.uid, force]); return 'fresh-jwt'; },
      revokeAccessToken: async (_auth, token) => {
        calls.push(['revokeAccessToken', token]);
        if (revokeShouldFail) throw new Error('raw-provider-error ' + token);
      },
      deleteUser: async user => { calls.push(['deleteUser', user.uid]); },
    };
    const actions = createAuthActions({
      loadAuth: async () => ({ sdk, auth }),
      getLoadedAuth: () => ({ sdk, auth }),
      isAppleEnabled: () => appleEnabled,
    });
    return { actions, calls, setUser: next => { activeUser = next; } };
  }

  // 1. Apple feature flag disabled -> appleSignIn & Apple/linked reauth fail closed BEFORE popup or comment deletion
  {
    const h = makeHarness({ appleEnabled: false });
    await assert.rejects(h.actions.appleSignIn(), { code: 'auth/operation-not-allowed' });
    let removed = 0;
    await assert.rejects(eraseAccountWorkflow({
      uid: 'u-1',
      providerId: 'apple.com',
      hasLinkedApple: true,
      isCurrent: () => true,
      reauthenticate: h.actions.reauthenticateForDeletion,
      removeComments: async () => { removed++; },
      revokeAppleToken: h.actions.revokeAppleAuthorization,
      deleteAuthAccount: h.actions.deleteCurrentAccount,
    }), { code: 'auth/operation-not-allowed' });
    assert.equal(removed, 0);
    assert.equal(h.calls.length, 0);
  }

  // 2. Linked [google.com, apple.com] user currently signed in with Google -> forces Apple popup + Apple revocation!
  {
    const h = makeHarness({
      currentUser: { uid: 'linked-1', providerData: [{ providerId: 'google.com' }, { providerId: 'apple.com' }] },
      appleEnabled: true,
      credentialToken: 'real-apple-access-tok',
    });
    const res = await eraseAccountWorkflow({
      uid: 'linked-1',
      providerId: 'google.com', // active session was google.com
      hasLinkedApple: true,
      isCurrent: () => true,
      reauthenticate: h.actions.reauthenticateForDeletion,
      removeComments: async () => { h.calls.push(['removeComments', 'linked-1']); },
      revokeAppleToken: h.actions.revokeAppleAuthorization,
      deleteAuthAccount: h.actions.deleteCurrentAccount,
    });
    assert.deepEqual(res, { providerId: 'apple.com', appleRevoked: true });
    assert.deepEqual(h.calls, [
      ['reauthenticateWithPopup', 'linked-1', 'apple.com', ['email', 'name']],
      ['getIdToken', 'linked-1', true],
      ['removeComments', 'linked-1'],
      ['revokeAccessToken', 'real-apple-access-tok'],
      ['deleteUser', 'linked-1'],
    ]);
  }

  // 3. Missing or whitespace Apple credential token -> real reauthenticateForDeletion aborts BEFORE removeComments
  for (const opts of [{ hasCred: false }, { credentialToken: null }, { credentialToken: '' }, { credentialToken: '   ' }]) {
    const h = makeHarness(opts);
    let removed = 0;
    await assert.rejects(eraseAccountWorkflow({
      uid: 'u-1',
      providerId: 'apple.com',
      hasLinkedApple: true,
      isCurrent: () => true,
      reauthenticate: h.actions.reauthenticateForDeletion,
      removeComments: async () => { removed++; },
      revokeAppleToken: h.actions.revokeAppleAuthorization,
      deleteAuthAccount: h.actions.deleteCurrentAccount,
    }), { code: 'auth/apple-revocation-failed' });
    assert.equal(removed, 0);
    assert.equal(h.calls.some(c => c[0] === 'deleteUser'), false);
  }

  // 4. UID switch during reauthentication -> real helper throws ACCOUNT_CHANGED and stops BEFORE removeComments
  {
    const h = makeHarness({ reauthUidOverride: 'u-2' });
    let removed = 0;
    await assert.rejects(eraseAccountWorkflow({
      uid: 'u-1',
      providerId: 'apple.com',
      hasLinkedApple: true,
      isCurrent: () => true,
      reauthenticate: h.actions.reauthenticateForDeletion,
      removeComments: async () => { removed++; },
      revokeAppleToken: h.actions.revokeAppleAuthorization,
      deleteAuthAccount: h.actions.deleteCurrentAccount,
    }), /ACCOUNT_CHANGED/);
    assert.equal(removed, 0);
    assert.equal(h.calls.some(c => c[0] === 'deleteUser'), false);
  }

  // 5. Real revokeAccessToken throws -> wrapped as auth/apple-revocation-failed (token stripped) and deleteUser NOT called
  {
    const h = makeHarness({ credentialToken: 'sensitive-token-abc', revokeShouldFail: true });
    let errCaught;
    try {
      await eraseAccountWorkflow({
        uid: 'u-1',
        providerId: 'apple.com',
        hasLinkedApple: true,
        isCurrent: () => true,
        reauthenticate: h.actions.reauthenticateForDeletion,
        removeComments: async () => { h.calls.push(['removeComments']); },
        revokeAppleToken: h.actions.revokeAppleAuthorization,
        deleteAuthAccount: h.actions.deleteCurrentAccount,
      });
    } catch (err) {
      errCaught = err;
    }
    assert.equal(errCaught?.code, 'auth/apple-revocation-failed');
    assert.equal(String(errCaught?.message || '').includes('sensitive-token-abc'), false);
    assert.equal(h.calls.some(c => c[0] === 'deleteUser'), false);
  }

  // 6. Google-only user through real helpers -> Google reauth, removeComments, deleteUser, zero revokeAccessToken
  {
    const h = makeHarness({
      currentUser: { uid: 'g-only', providerData: [{ providerId: 'google.com' }] },
      appleEnabled: false,
    });
    const res = await eraseAccountWorkflow({
      uid: 'g-only',
      providerId: 'google.com',
      hasLinkedApple: false,
      isCurrent: () => true,
      reauthenticate: h.actions.reauthenticateForDeletion,
      removeComments: async () => { h.calls.push(['removeComments', 'g-only']); },
      revokeAppleToken: h.actions.revokeAppleAuthorization,
      deleteAuthAccount: h.actions.deleteCurrentAccount,
    });
    assert.deepEqual(res, { providerId: 'google.com', appleRevoked: false });
    assert.deepEqual(h.calls, [
      ['reauthenticateWithPopup', 'g-only', 'google.com', []],
      ['getIdToken', 'g-only', true],
      ['removeComments', 'g-only'],
      ['deleteUser', 'g-only'],
    ]);
  }
});
