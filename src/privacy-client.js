// Bind every page to the initiating identity; never turn a partial export into success.
export async function exportMyComments({ uid, request, isCurrent }) {
  const comments = [];
  const cursors = new Set();
  let cursor = null;
  do {
    if (!isCurrent()) throw new Error('ACCOUNT_CHANGED');
    const result = await request({ operation: 'export', accountUid: uid, ...(cursor ? { cursor } : {}) });
    if (!isCurrent()) throw new Error('ACCOUNT_CHANGED');
    if (!Array.isArray(result?.comments)) throw new Error('INVALID_EXPORT');
    comments.push(...result.comments);
    cursor = result.nextCursor;
    if (cursor && (typeof cursor !== 'string' || cursors.has(cursor))) throw new Error('INVALID_EXPORT_CURSOR');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return comments;
}

export async function removeMyComments({ uid, request, isCurrent }) {
  let complete = false;
  do {
    if (!isCurrent()) throw new Error('ACCOUNT_CHANGED');
    const result = await request({ operation: 'delete', accountUid: uid });
    if (!isCurrent()) throw new Error('ACCOUNT_CHANGED');
    if (typeof result?.complete !== 'boolean') throw new Error('INVALID_DELETE_RESULT');
    complete = result.complete;
  } while (!complete);
}

// Execute reauthentication, Firestore cleanup, Apple OAuth revocation, and Auth deletion
// in strict order so partial failures never masquerade as complete account erasure.
export async function eraseAccountWorkflow({
  uid,
  providerId = null,
  isCurrent,
  reauthenticate,
  removeComments,
  revokeAppleToken,
  deleteAuthAccount,
}) {
  if (!uid || !isCurrent()) throw new Error('ACCOUNT_CHANGED');
  const reauth = await reauthenticate(uid, providerId);
  if (!reauth || reauth.uid !== uid || !isCurrent()) throw new Error('ACCOUNT_CHANGED');
  await removeComments(uid);
  if (!isCurrent()) throw new Error('ACCOUNT_CHANGED');
  const activeProvider = reauth.providerId || providerId;
  let appleRevoked = false;
  if (activeProvider === 'apple.com') {
    if (typeof revokeAppleToken !== 'function' || !reauth.appleAccessToken) {
      throw Object.assign(new Error('APPLE_REVOCATION_REQUIRED'), { code: 'auth/apple-revocation-failed' });
    }
    await revokeAppleToken(uid, reauth.appleAccessToken);
    if (!isCurrent()) throw new Error('ACCOUNT_CHANGED');
    appleRevoked = true;
  }
  await deleteAuthAccount(uid);
  return { providerId: activeProvider, appleRevoked };
}
