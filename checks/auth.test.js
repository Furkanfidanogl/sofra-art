import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createSessionObserver, authErrorMessage } from '../src/auth-session.js';
const { requireUser, requireAdmin, verifyCallableAuth } = createRequire(import.meta.url)('../functions/authorization.cjs');
const { prepareAdmin, grantAdmin } = createRequire(import.meta.url)('../functions/admin-access.cjs');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

function harness(tokenResult) {
  let changed;
  const states = [];
  const stop = createSessionObserver({
    subscribe: callback => { changed = callback; return () => {}; },
    tokenResult, onChange: state => states.push(state),
  });
  return { states, change: user => changed(user), stop };
}

test('restored sessions and token refresh update role; truthy strings never grant admin', async () => {
  let claims = { admin: true };
  const h = harness(async () => ({ claims }));
  const user = { uid: 'known-user' };
  await h.change(user);
  assert.equal(h.states.at(-1).admin, true);
  claims = { admin: 'true' };
  await h.change(user);
  assert.equal(h.states.at(-1).admin, false);
  await h.change(null);
  assert.equal(h.states.at(-1).user, null);
  assert.equal(h.states.at(-1).admin, false);
});

test('late token result cannot restore admin after logout, account switch or disposal', async () => {
  let resolve;
  const h = harness(() => new Promise(done => { resolve = done; }));
  const old = h.change({ uid: 'old-admin' });
  await h.change(null);
  resolve({ claims: { admin: true } }); await old;
  assert.equal(h.states.at(-1).user, null);
  const switched = h.change({ uid: 'old-admin' });
  const oldResolve = resolve;
  const latest = h.change({ uid: 'new-visitor' });
  resolve({ claims: {} }); await latest;
  oldResolve({ claims: { admin: true } }); await switched;
  assert.equal(h.states.at(-1).user.uid, 'new-visitor');
  assert.equal(h.states.at(-1).admin, false);
  const disposed = h.change({ uid: 'old-admin' });
  h.stop(); resolve({ claims: { admin: true } }); await disposed;
  assert.equal(h.states.at(-1).admin, false);
});

test('failed token lookup drops privileges and keeps the user a visitor', async () => {
  const h = harness(async () => { throw new Error('offline'); });
  await h.change({ uid: 'user' });
  assert.equal(h.states.at(-1).admin, false);
  assert.equal(h.states.at(-1).loading, false);
  assert.equal(h.states.at(-1).error, 'TOKEN_UNAVAILABLE');
});

test('server rejects guests, forged data roles, unverified emails, missing emails and nonboolean admin claims', () => {
  for (const request of [{}, { data: { admin: true, uid: 'fake' } }]) {
    assert.throws(() => requireAdmin(request, HttpsError), { code: 'unauthenticated' });
  }
  for (const token of [
    {},
    { admin: 'true', email_verified: true, email: 'fatihfidanogl@gmail.com' },
    { admin: true }, // missing email completely
    { admin: true, email: '' }, // empty email
    { admin: true, email_verified: false, email: 'fatihfidanogl@gmail.com' }, // unverified
    { admin: false, email_verified: true, email: 'fatihfidanogl@gmail.com' }, // no admin claim despite email match
    { email_verified: true, email: 'fatihfidanogl@gmail.com' }, // completely missing admin claim
  ]) {
    assert.throws(() => requireAdmin({ auth: { uid: 'user', token }, data: { admin: true } }, HttpsError), { code: 'permission-denied' });
  }
  assert.equal(requireUser({ auth: { uid: 'visitor', token: {} } }, HttpsError).uid, 'visitor');
  assert.equal(requireAdmin({ auth: { uid: 'fatih', token: { admin: true, email_verified: true, email: 'fatihfidanogl@gmail.com' } } }, HttpsError).uid, 'fatih');
  assert.throws(() => requireAdmin({ auth: { uid: 'furkan', token: { admin: true, email_verified: true, email: 'furkan7188a@gmail.com' } } }, HttpsError), { code: 'permission-denied' });
  assert.throws(() => requireAdmin({ auth: { uid: 'attacker', token: { admin: true, email_verified: true, email: 'attacker@example.com' } } }, HttpsError), { code: 'permission-denied' });
});

test('callable request pipeline performs zero role writes; matching email without claims never gains admin', async () => {
  let claimWrites = 0;
  const mockAuth = {
    setCustomUserClaims: async () => { claimWrites++; },
    verifyIdToken: async (tokenStr) => {
      if (tokenStr === 'fatih-token-no-claims') {
        return { uid: 'fatih-uid', email: 'fatihfidanogl@gmail.com', email_verified: true };
      }
      if (tokenStr === 'fatih-token-with-claims') {
        return { uid: 'fatih-uid', email: 'fatihfidanogl@gmail.com', email_verified: true, admin: true };
      }
      return { uid: 'visitor-uid', email: 'user@example.com', email_verified: true };
    }
  };

  // Directly call the shared production middleware from functions/authorization.cjs
  async function runPipeline(bearerToken, kind) {
    return verifyCallableAuth(kind, `Bearer ${bearerToken}`, {
      getAuth: () => mockAuth,
      HttpsError
    });
  }

  // 1. Regular user call -> 0 claim writes
  const visitorUid = await runPipeline('visitor-token', 'user');
  assert.equal(visitorUid, 'visitor-uid');
  assert.equal(claimWrites, 0, 'User call must perform zero claim writes');

  // 2. Fatih calls user endpoint without admin claim -> succeeds as user, but NEVER mutates claims or becomes admin
  const fatihUserUid = await runPipeline('fatih-token-no-claims', 'user');
  assert.equal(fatihUserUid, 'fatih-uid');
  assert.equal(claimWrites, 0, 'Unprivileged request must perform zero claim writes');

  // 3. Fatih calls admin endpoint without admin claim -> REJECTED, and ZERO claim writes performed!
  await assert.rejects(runPipeline('fatih-token-no-claims', 'admin'), { code: 'permission-denied' });
  assert.equal(claimWrites, 0, 'Rejected admin request must perform zero auto-provisioning claim writes');

  // 4. Properly provisioned admin token succeeds
  const fatihAdminUid = await runPipeline('fatih-token-with-claims', 'admin');
  assert.equal(fatihAdminUid, 'fatih-uid');
  assert.equal(claimWrites, 0, 'Authorized admin request must perform zero claim writes');
});

test('auth failures show fixed messages without exposing provider errors or tokens', () => {
  assert.match(authErrorMessage({ code:'auth/network-request-failed' }), /Bağlantı/);
  assert.equal(authErrorMessage({ message:'private-token', code:'unknown' }).includes('private-token'), false);
});

test('operator grant requires the exact verified Google identity and preserves existing claims', async () => {
  const user = { uid:'brother', email:'owner@example.com',emailVerified:true,providerData:[{providerId:'google.com'}],customClaims:{editor:true} };
  const writes = [];
  const auth = { getUser:async uid => { assert.equal(uid,'brother');return user; },setCustomUserClaims:async(...args)=>writes.push(args) };
  const target = { uid:'brother',email:'owner@example.com' };
  assert.deepEqual((await prepareAdmin(auth,target)).claims,{editor:true,admin:true});
  assert.equal(writes.length,0);
  for (const patch of [{email:'someone@example.com'},{emailVerified:false},{disabled:true},{providerData:[{providerId:'password'}]}]) {
    const rejectedAuth = {...auth,getUser:async()=>({...user,...patch})};
    await assert.rejects(grantAdmin(rejectedAuth,target),/ADMIN_IDENTITY_MISMATCH/);
  }
  assert.equal(writes.length,0);
  await grantAdmin(auth,target);
  assert.deepEqual(writes,[['brother',{editor:true,admin:true}]]);
});
