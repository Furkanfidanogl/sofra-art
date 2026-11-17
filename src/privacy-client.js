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

const hasValidToken = token => typeof token === 'string' && token.trim().length > 0;

// Validate all preconditions and obtain required provider credentials BEFORE deleting any comments.
export async function eraseAccountWorkflow({
  uid,
  providerId = null,
  hasLinkedApple = false,
  isCurrent,
  reauthenticate,
  removeComments,
  revokeAppleToken,
  deleteAuthAccount,
}) {
  if (!uid || typeof isCurrent !== 'function' || !isCurrent()) throw new Error('ACCOUNT_CHANGED');
  if (typeof reauthenticate !== 'function' || typeof removeComments !== 'function' || typeof deleteAuthAccount !== 'function') {
    throw Object.assign(new Error('DELETE_WORKFLOW_INVALID'), { code: 'functions/failed-precondition' });
  }
  const expectsApple = Boolean(hasLinkedApple || providerId === 'apple.com');
  if (expectsApple && typeof revokeAppleToken !== 'function') {
    throw Object.assign(new Error('APPLE_REVOCATION_UNAVAILABLE'), { code: 'auth/apple-revocation-failed' });
  }

  const reauthProvider = expectsApple ? 'apple.com' : providerId;
  const reauth = await reauthenticate(uid, reauthProvider);
  if (!reauth || reauth.uid !== uid || !isCurrent()) throw new Error('ACCOUNT_CHANGED');

  const requiresAppleRevocation = Boolean(expectsApple || reauth.providerId === 'apple.com' || reauth.requiresAppleRevocation);
  if (requiresAppleRevocation) {
    if (typeof revokeAppleToken !== 'function' || !hasValidToken(reauth.appleAccessToken)) {
      throw Object.assign(new Error('APPLE_REVOCATION_REQUIRED'), { code: 'auth/apple-revocation-failed' });
    }
  }

  await removeComments(uid);
  if (!isCurrent()) throw new Error('ACCOUNT_CHANGED');

  if (requiresAppleRevocation) {
    await revokeAppleToken(uid, reauth.appleAccessToken);
    if (!isCurrent()) throw new Error('ACCOUNT_CHANGED');
  }

  await deleteAuthAccount(uid);
  return {
    providerId: reauth.providerId || (requiresAppleRevocation ? 'apple.com' : providerId),
    appleRevoked: requiresAppleRevocation,
  };
}
