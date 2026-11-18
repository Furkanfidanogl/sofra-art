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

// Reverify the initiating account before deleting any comments.
export async function eraseAccountWorkflow({ uid, isCurrent, reauthenticate, removeComments, deleteAuthAccount }) {
  if (!uid || !isCurrent()) throw new Error('ACCOUNT_CHANGED');
  const verifiedUid = await reauthenticate(uid);
  if (verifiedUid !== uid || !isCurrent()) throw new Error('ACCOUNT_CHANGED');

  await removeComments(uid);
  if (!isCurrent()) throw new Error('ACCOUNT_CHANGED');
  await deleteAuthAccount(uid);
}
