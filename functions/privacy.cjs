const d = require('./domain.cjs');
const { AUTHORIZED_ADMIN_EMAIL } = require('./authorization.cjs');
const {fingerprintId,legacyFingerprintId}=require('./comment-policy.cjs');

function requireRecentDeletion(token, now = Date.now()) {
  if (token?.admin === true || token?.email?.toLowerCase().trim() === AUTHORIZED_ADMIN_EMAIL) {
    d.fail('failed-precondition', 'Yönetici hesabı bu ekrandan silinemez. Önce yönetimi devret.', { reason: 'admin-account' });
  }
  const age = now / 1000 - token?.auth_time;
  if (!Number.isFinite(age) || age < -60 || age > 300) {
    d.fail('failed-precondition', 'Hesabını silmeden önce kimliğini yeniden doğrula.', { reason: 'recent-login-required' });
  }
}

function createPrivacyService({ db, now = Date.now }) {
  async function manage(uid, input, token) {
    d.object(input, ['operation', 'cursor', 'accountUid']);
    if (input.accountUid !== uid) d.fail('aborted', 'Hesabın değişti. İşlemi kendi hesabında yeniden başlat.');
    if (!['export', 'delete'].includes(input.operation)) d.fail('invalid-argument', 'Veri işlemini seç.');
    if (input.operation === 'delete') {
      d.object(input, ['operation', 'accountUid']);
      requireRecentDeletion(token, now());
    }
    const limits = db.doc(`requestLimits/${d.hash(`${uid}:privacy`)}`);
    const gate = db.doc(`accountDeletions/${d.hash(uid)}`);
    const time = now();
    await db.runTransaction(async tx => {
      const previous = await tx.get(limits);
      tx.set(limits, { ...d.rate(previous.data(), time, { windowMs: 3600000, limit: 120, minInterval: 0 }), expiresAt: new Date(time + 86400000) });
      if (input.operation === 'delete') {
        // Serializes with submitComment's read of this document. In-flight model
        // responses never recreate deleted comments; retries can finish cleanup.
        tx.set(gate, { requestedAt: time, expiresAt: new Date(time + 30 * 86400000) });
      }
    });
    let query = db.collection('comments').where('uid', '==', uid).orderBy('__name__');
    if (input.operation === 'export') {
      if (input.cursor) query = query.startAfter(d.resourceId(input.cursor));
      const page = await query.limit(101).get();
      const docs = page.docs.slice(0, 100);
      return {
        comments: docs.map(doc => {
          const value = doc.data();
          return { ...d.publicComment({ ...value, id: doc.id }), status: value.status };
        }),
        nextCursor: page.size > 100 ? docs.at(-1).id : null
      };
    }
    // Comment + current/legacy fingerprint <= 300 deletes, below Firestore's 500.
    const page = await query.limit(100).get();
    const batch = db.batch();
    for (const doc of page.docs) {
      const value = doc.data();
      batch.delete(doc.ref);
      for(const id of new Set([fingerprintId({...value,uid}),legacyFingerprintId(uid,value.text)]))batch.delete(db.doc(`commentFingerprints/${id}`));
    }
    batch.delete(db.doc(`requestLimits/${d.hash(`${uid}:comment`)}`));
    await batch.commit();
    const remaining = await query.limit(1).get();
    return { deleted: page.size, complete: remaining.empty };
  }
  return { manage };
}

module.exports = { createPrivacyService, requireRecentDeletion };
