import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firstName,
  accountPresentation,
  commentNickname,
  accountGreeting,
  primaryAuthProvider,
  providerLabel,
  accountIdentityNote,
  accountButtonsHTML,
} from '../src/account-presentation.js';

test('automatic names use the first name with Turkish capitalization', () => {
  assert.equal(firstName('  FURKAN FİDANOĞLU  '), 'Furkan');
  assert.equal(firstName('İSMAİL YILMAZ'), 'İsmail');
  assert.equal(firstName('ipek deniz'), 'İpek');
  assert.equal(firstName('IŞIK ÖZTÜRK'), 'Işık');
  assert.equal(firstName(null, 'Hesabım'), 'Hesabım');
});

test('restoring a session never displays a guest invitation before identity is known', () => {
  assert.deepEqual(accountPresentation({ user: null, loading: true }), { label: '', loading: true });
  assert.deepEqual(accountPresentation({ user: { displayName: 'FURKAN FİDANOĞLU' }, loading: true }), { label: 'Furkan', loading: false });
  assert.deepEqual(accountPresentation({ user: null, loading: false }), { label: 'İçeri buyur', loading: false });
});

test('Apple users without displayName get safe labels and never leak "Misafir" as nickname or greeting', () => {
  const appleNoName = { uid: 'apple-1', displayName: null, email: 'abc123@privaterelay.appleid.com', providerData: [{ providerId: 'apple.com' }] };
  assert.equal(accountPresentation({ user: appleNoName, loading: false }).label, 'Hesabım');
  assert.equal(commentNickname(appleNoName), '');
  assert.equal(accountGreeting(appleNoName), 'Sofra’ya hoş geldin.');
  assert.equal(primaryAuthProvider(appleNoName), 'apple.com');
  assert.equal(providerLabel('apple.com'), 'Apple');
  assert.equal(accountIdentityNote(appleNoName), 'Apple ile bağlı · Gizli e-posta aktarımı');

  const appleIcloudRelay = { uid: 'apple-2', displayName: '', email: 'x@private.icloud.com', providerData: [{ providerId: 'apple.com' }] };
  assert.equal(accountIdentityNote(appleIcloudRelay), 'Apple ile bağlı · Gizli e-posta aktarımı');

  const appleMissingEmail = { uid: 'apple-3', displayName: '', email: null, providerData: [{ providerId: 'apple.com' }] };
  assert.equal(accountIdentityNote(appleMissingEmail), 'Apple ile bağlı');
});

test('accountButtonsHTML hides unconfigured Apple button and renders accessible Apple button when enabled', () => {
  const hidden = accountButtonsHTML({ user: null, pending: false, authConfigured: true, appleConfigured: false, isAdmin: false });
  assert.match(hidden, /data-action="google"/);
  assert.equal(hidden.includes('data-action="apple"'), false);

  const enabled = accountButtonsHTML({ user: null, pending: false, authConfigured: true, appleConfigured: true, isAdmin: false });
  assert.match(enabled, /data-action="google"/);
  assert.match(enabled, /data-action="apple"/);
  assert.match(enabled, /class="apple-logo"/);
  assert.match(enabled, /Apple ile giriş yap/);

  const busyApple = accountButtonsHTML({ user: null, pending: true, authConfigured: true, appleConfigured: true, isAdmin: false, authProviderBusy: 'apple.com' });
  assert.match(busyApple, /Apple penceresinde devam et/);
  assert.match(busyApple, /disabled/);
});
