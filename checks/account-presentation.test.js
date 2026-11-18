import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firstName,
  accountPresentation,
  commentNickname,
  accountGreeting,
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

test('accounts without a display name get a blank nickname and a neutral greeting', () => {
  const user = { uid: 'visitor', displayName: null, email: 'visitor@example.com' };
  assert.equal(accountPresentation({ user, loading: false }).label, 'Hesabım');
  assert.equal(commentNickname(user), '');
  assert.equal(accountGreeting(user), 'Sofra’ya hoş geldin.');
  assert.equal(accountIdentityNote(user), 'Google ile bağlı · visitor@example.com');
});

test('the signed-out account dialog offers one Google sign-in action', () => {
  const options = { user: null, pending: false, authConfigured: true, isAdmin: false };
  const ready = accountButtonsHTML(options);
  assert.deepEqual([...ready.matchAll(/data-action="([^"]+)"/g)].map(match => match[1]), ['google']);
  assert.match(ready, /Google ile bağlan/);
  const busy = accountButtonsHTML({ ...options, pending: true, googleBusy: true });
  assert.match(busy, /disabled/);
  assert.match(busy, /aria-busy="true"/);
});
