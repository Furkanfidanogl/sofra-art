import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const d=require('../functions/domain.cjs');
const {MAX_BYTES,decodeUpload,prepareImage,storagePath}=require('../functions/uploads.cjs');
const {revokeAdmin}=require('../functions/admin-access.cjs');

test('backend rejects forged identity/status, unknown fields, invalid paths and unbounded content',()=>{
  const value={artId:'table',name:'Furkan',text:'Bugün biraz durdum.',requestId:'request-one'};
  assert.equal(d.commentInput(value).name,'Furkan');
  for(const patch of [{admin:true},{uid:'someone'},{status:'approved'},{artId:'../../users'},{text:'x'.repeat(501)},{text:'\u200b'}]) {
    assert.throws(()=>d.commentInput({...value,...patch}),d.DomainError);
  }
  assert.throws(()=>d.dailyInput({quote:'Söz',question:'Soru',artwork:'https://evil.example/a',songTitle:'Şarkı'}),d.DomainError);
  assert.throws(()=>d.version(-1),d.DomainError);
});

test('server rate windows reject rapid and excessive calls, then recover after window expiry',()=>{
  const first=d.rate(null,100000);
  assert.throws(()=>d.rate(first,100001),{code:'resource-exhausted'});
  assert.equal(d.rate(first,120001).count,2);
  assert.throws(()=>d.rate({...first,count:20},400000),{code:'resource-exhausted'});
  assert.equal(d.rate({...first,count:20},4000000).count,1);
});

test('uploads reject SVG, forged MIME, corrupt images, excessive dimensions and path traversal',async()=>{
  assert.throws(()=>decodeUpload({name:'x.svg',contentType:'image/svg+xml',dataBase64:Buffer.from('<svg/>').toString('base64')}),d.DomainError);
  assert.throws(()=>decodeUpload({name:'x.png',contentType:'image/png',dataBase64:Buffer.from('arbitrary text').toString('base64')}),d.DomainError);
  assert.throws(()=>decodeUpload({name:'x.png',contentType:'image/png',dataBase64:'!not base64!'}),d.DomainError);
  assert.throws(()=>storagePath('artworks/../../secret'),d.DomainError);
  const sharp=require('../functions/node_modules/sharp');
  const buffer=await sharp({create:{width:12,height:9,channels:3,background:'#aabbcc'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'private author'}}}).toBuffer();
  const result=await prepareImage({name:'image.jpg',contentType:'image/jpeg',dataBase64:buffer.toString('base64')});
  const metadata=await sharp(result.buffer).metadata();
  assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);
  assert.equal(result.width,12);assert.equal(result.height,9);
  const large=await sharp({create:{width:6001,height:1,channels:3,background:'#000000'}}).png().toBuffer();
  await assert.rejects(prepareImage({name:'large.png',contentType:'image/png',dataBase64:large.toString('base64')}),{code:'invalid-argument'});
});

test('uploads accept a real image near the 20 MiB limit (~19.5 MiB), verify Cloud Run base64 bounds, and reject over-limit payloads', async () => {
  assert.equal(MAX_BYTES, 20 * 1024 * 1024);
  const sharp = require('../functions/node_modules/sharp');
  const crypto = require('node:crypto');

  // 1. Mathematically verify Cloud Run 32 MiB body limit compliance:
  // 20 MiB max raw image = 20,971,520 bytes
  // Base64 encoding factor: Math.ceil(20971520 / 3) * 4 = 27,962,028 bytes (~26.67 MiB)
  // Cloud Run HTTP/1.1 limit = 32 MiB (33,554,432 bytes)
  const maxBase64Len = Math.ceil(MAX_BYTES / 3) * 4;
  const cloudRunBodyLimit = 32 * 1024 * 1024;
  assert.ok(maxBase64Len < cloudRunBodyLimit, '20 MiB base64 payload must fit within Cloud Run 32 MiB body limit');
  assert.ok(cloudRunBodyLimit - maxBase64Len > 5 * 1024 * 1024, 'At least 5 MiB headroom remaining for HTTP headers and JSON wrapping');

  // 2. Near-limit valid image: ~19.5 MiB (2600 x 2620 uncompressed PNG)
  const rawBytes = crypto.randomBytes(2600 * 2620 * 3);
  const nearLimitBuffer = await sharp(rawBytes, { raw: { width: 2600, height: 2620, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const nearLimitMiB = nearLimitBuffer.length / (1024 * 1024);
  assert.ok(nearLimitMiB >= 19.0 && nearLimitMiB <= 20.0, `Buffer size (${nearLimitMiB.toFixed(2)} MiB) must be near limit (19-20 MiB)`);
  assert.ok(nearLimitBuffer.length <= MAX_BYTES, 'Near-limit buffer must not exceed MAX_BYTES');

  const nearLimitResult = await prepareImage({
    name: 'near-limit-art.png',
    contentType: 'image/png',
    dataBase64: nearLimitBuffer.toString('base64'),
    uploadId: '12345678-1234-4234-8234-123456789abc',
  });
  assert.equal(nearLimitResult.name, 'near-limit-art.png');
  assert.equal(nearLimitResult.uploadId, '12345678-1234-4234-8234-123456789abc');
  assert.ok(nearLimitResult.width <= 2400 && nearLimitResult.height <= 2400);
  assert.ok(nearLimitResult.buffer.length <= MAX_BYTES);

  // 3. Reject over-limit raw buffer (> 20 MiB)
  assert.throws(
    () => decodeUpload({
      name: 'too-large.png',
      contentType: 'image/png',
      dataBase64: Buffer.alloc(MAX_BYTES + 1).toString('base64'),
    }),
    { code: 'invalid-argument' }
  );

  // 4. Reject invalid uploadId format
  assert.throws(
    () => decodeUpload({
      name: 'test.png',
      contentType: 'image/png',
      dataBase64: nearLimitBuffer.subarray(0, 100).toString('base64'),
      uploadId: 'invalid-not-a-uuid',
    }),
    { code: 'invalid-argument' }
  );

  // 5. Reject corrupt/truncated base64
  assert.throws(
    () => decodeUpload({
      name: 'bad.png',
      contentType: 'image/png',
      dataBase64: 'AAAA===',
    }),
    { code: 'invalid-argument' }
  );
});

test('role removal preserves unrelated claims and revokes existing sessions',async()=>{
  const calls=[];
  const auth={getUser:async()=>({uid:'temporary',email:'test@example.com',emailVerified:true,providerData:[{providerId:'google.com'}],customClaims:{admin:true,editor:true}}),
    setCustomUserClaims:async(uid,claims)=>calls.push(['claims',uid,claims]),revokeRefreshTokens:async uid=>calls.push(['revoke',uid])};
  await revokeAdmin(auth,{uid:'temporary',email:'test@example.com'});
  assert.deepEqual(calls,[['claims','temporary',{editor:true}],['revoke','temporary']]);
});

test('callable handlers fail closed without App Check or a real signed bearer token',async()=>{
  const handlers=require('../functions/index.cjs');
  for(const fn of Object.values(handlers).filter(fn=>typeof fn.run==='function'))await assert.rejects(fn.run({data:{admin:true},auth:{uid:'fake',token:{admin:true}}}),{code:'unauthenticated'});
  for(const name of ['submitComment','manageContent','getAdminDashboard','uploadArtwork','getArtwork']) {
    await assert.rejects(handlers[name].run({app:{appId:'1:449977598604:web:17dcbd3c9665e0413eb1a9'},data:{admin:true}}),{code:'unauthenticated'});
  }
});

test('admin moderation panel accurately distinguishes in-flight, unclear, quota, disabled, and stale pending comments', async () => {
  const { commentStatusLabel, reasonLabels } = await import('../src/admin-panel.js');

  const now = 1000000;

  // 1. Genuinely in-flight (< 30s ago, no moderation metadata yet)
  const inFlightComment = { status: 'pending', createdAt: now - 5000 };
  assert.equal(commentStatusLabel(inFlightComment, now), 'Değerlendiriliyor…');

  // 2. Stale pending comment (> 30s ago, missing moderation metadata e.g. legacy or crashed)
  const staleComment = { status: 'pending', createdAt: now - 60000 };
  assert.equal(commentStatusLabel(staleComment, now), 'İnceleme bekliyor · Eski kayıt');

  // 3. Human review pending due to model unclear decision
  const unclearComment = { status: 'pending', createdAt: now - 10000, moderation: { decision: 'unclear', model: 'gemini-3.5-flash-lite' } };
  assert.equal(commentStatusLabel(unclearComment, now), 'İnceleme bekliyor · Model belirsiz');

  // 4. Human review pending due to disabled moderation / missing API key
  const disabledComment = { status: 'pending', createdAt: now - 10000, moderation: { decision: 'unclear', reason: 'disabled', model: 'gemini-3.5-flash-lite' } };
  assert.equal(commentStatusLabel(disabledComment, now), 'İnceleme bekliyor · Servis kapalı');

  // 5. Human review pending due to quota limit exhaustion
  const quotaComment = { status: 'pending', createdAt: now - 10000, moderation: { decision: 'unclear', errorReason: 'quota-limit', model: 'gemini-3.5-flash-lite' } };
  assert.equal(commentStatusLabel(quotaComment, now), 'İnceleme bekliyor · Kota aşımı');

  // 6. Explicit content rejection reason reaches admin
  const rejectedComment = { status: 'rejected', createdAt: now - 10000, moderation: { decision: 'false', reason: 'explicit-content', model: 'blocklist' } };
  assert.equal(commentStatusLabel(rejectedComment, now), 'Reddedildi');
  assert.equal(reasonLabels[rejectedComment.moderation.reason], 'Açık küfür/argo filtresi (otomatik ret)');

  // 7. Verify publicComment strips moderation metadata while admin preserves it
  const rawCommentDoc = {
    id: 'test-comment-id',
    name: 'Ahmet',
    text: 'Sakin bir gün.',
    createdAt: now,
    artId: 'table',
    status: 'pending',
    moderation: { decision: 'unclear', errorReason: 'quota-limit', model: 'gemini-3.5-flash-lite' }
  };
  const publicClean = d.publicComment(rawCommentDoc);
  assert.equal('moderation' in publicClean, false, 'Public comment must never expose moderation metadata');
  assert.equal('status' in publicClean, false, 'Public comment must never expose internal status');
});

test('upload service strictly handles idempotency, rejects different content or ownership, and prevents soft-deleted asset reuse', async () => {
  const { createContentService } = require('../functions/content-service.cjs');
  const mockStorage = new Map();
  const mockDb = {
    doc: path => ({
      get: async () => ({
        exists: mockStorage.has(path),
        data: () => mockStorage.get(path)
      })
    }),
    collection: () => ({
      where: () => ({ limit: () => ({ get: async () => ({ docs: [], size: 0 }) }) })
    })
  };

  const service = createContentService({ db: mockDb });
  const uid = 'admin-user-1';
  const assetId = '12345678-1234-4234-8234-123456789abc';
  const buffer = Buffer.from('test-image-content-bytes');
  const contentHash = d.hash(buffer);
  const name = 'test-art.webp';

  // 1. Fresh ID (does not exist in DB) -> returns null (safe to proceed)
  const freshCheck = await service.checkAssetUpload(uid, assetId, contentHash, name, buffer.length);
  assert.equal(freshCheck, null);

  // 2. Asset exists with identical content and same owner -> returns existing asset info
  mockStorage.set(`assets/${assetId}`, {
    storagePath: `artworks/${assetId}.webp`,
    name,
    width: 800,
    height: 600,
    bytes: buffer.length,
    contentHash,
    status: 'draft',
    createdBy: uid,
    createdAt: 100000
  });

  const idempotentCheck = await service.checkAssetUpload(uid, assetId, contentHash, name, buffer.length);
  assert.deepEqual(idempotentCheck, { id: assetId, name, width: 800, height: 600, bytes: buffer.length });

  // 3. Asset exists with DIFFERENT content (contentHash mismatch) -> throws already-exists
  const diffHash = d.hash(Buffer.from('different-content'));
  await assert.rejects(
    service.checkAssetUpload(uid, assetId, diffHash, name, buffer.length),
    { code: 'already-exists', details: { reason: 'asset-content-mismatch' } }
  );

  // 4. Asset exists with DIFFERENT owner -> throws permission-denied
  await assert.rejects(
    service.checkAssetUpload('different-admin', assetId, contentHash, name, buffer.length),
    { code: 'permission-denied', details: { reason: 'asset-ownership-conflict' } }
  );

  // 5. Soft-deleted asset with same ID -> explicitly rejected, never reused or overwritten!
  const deletedAssetId = '87654321-4321-4321-8321-cba987654321';
  mockStorage.set(`assets/${deletedAssetId}`, {
    storagePath: `artworks/${deletedAssetId}.webp`,
    name: 'old-deleted.webp',
    width: 800,
    height: 600,
    bytes: buffer.length,
    contentHash,
    status: 'deleted',
    deletedAt: 105000,
    createdBy: uid
  });

  await assert.rejects(
    service.checkAssetUpload(uid, deletedAssetId, contentHash, 'old-deleted.webp', buffer.length),
    { code: 'already-exists', details: { reason: 'asset-deleted' } }
  );
});

test('real Google Cloud Storage SDK generates ifGenerationMatch in query string for file.delete', async () => {
  const { createRequire } = await import('node:module');
  const path = await import('node:path');
  const dir = new URL('.', import.meta.url).pathname;
  const backendRequire = createRequire(path.resolve(dir, '../functions/package.json'));
  const { Storage } = backendRequire('@google-cloud/storage');
  const storage = new Storage({ projectId: 'demo-sofra' });
  const bucket = storage.bucket('demo-sofra.firebasestorage.app');
  const file = bucket.file('artworks/test-generation.webp');

  let interceptedRequest = null;
  storage.makeAuthenticatedRequest = (reqOpts, callback) => {
    interceptedRequest = reqOpts;
    if (typeof callback === 'function') callback(null, {}, {});
    return { abort: () => {} };
  };

  // 1. Correct format: { ifGenerationMatch: 12345 }
  await file.delete({ ifGenerationMatch: 12345 });
  assert.ok(interceptedRequest, 'Request must be generated');
  assert.equal(interceptedRequest.method, 'DELETE');
  assert.equal(interceptedRequest.uri, 'https://storage.googleapis.com/storage/v1/b/demo-sofra.firebasestorage.app/o/artworks%2Ftest-generation.webp');
  assert.equal(interceptedRequest.qs?.ifGenerationMatch, 12345, 'ifGenerationMatch must be passed in query string');
  assert.equal('preconditionOpts' in (interceptedRequest.qs || {}), false, 'preconditionOpts must NOT be sent');

  // 2. Erroneous format: { preconditionOpts: { ifGenerationMatch: 12345 } } generates wrong query string
  interceptedRequest = null;
  await file.delete({ preconditionOpts: { ifGenerationMatch: 12345 } });
  assert.notEqual(interceptedRequest.qs?.ifGenerationMatch, 12345, 'preconditionOpts wrapper fails to set ifGenerationMatch');
});

test('submitComment when moderation is disabled explicitly records reason: disabled and displays review-pending', async () => {
  const { createContentService } = require('../functions/content-service.cjs');
  const { commentStatusLabel } = await import('../src/admin-panel.js');

  const mockDocs = new Map();
  const emptyQuery = () => ({
    where: emptyQuery,
    orderBy: emptyQuery,
    limit: () => ({ get: async () => ({ docs: [], size: 0 }) })
  });

  const mockDb = {
    doc: path => ({
      id: path.split('/').pop(),
      get: async () => ({
        exists: mockDocs.has(path),
        data: () => mockDocs.get(path)
      }),
      set: async (val) => { mockDocs.set(path, val); },
      create: async (val) => { mockDocs.set(path, val); },
      update: async (val) => {
        const cur = mockDocs.get(path) || {};
        mockDocs.set(path, { ...cur, ...val });
      }
    }),
    collection: (name) => ({
      where: emptyQuery,
      orderBy: emptyQuery,
      doc: id => mockDb.doc(`${name}/${id}`)
    }),
    runTransaction: async (fn) => fn({
      get: async ref => ref.get(),
      set: (ref, val) => ref.set(val),
      create: (ref, val) => ref.create(val),
      update: (ref, val) => ref.update(val)
    })
  };

  const service = createContentService({
    db: mockDb,
    now: () => 1000000,
    moderationService: { isEnabled: () => false }
  });

  const res = await service.submitComment('guest-uid', {
    artId: 'table',
    name: 'Selin',
    text: 'Sakin bir köşe.',
    requestId: 'req-disabled-1',
    tableKey: 'legacy'
  });

  assert.equal(res.status, 'pending');
  const savedDoc = mockDocs.get(`comments/${res.id}`);
  assert.ok(savedDoc, 'Comment must be saved');
  assert.equal(savedDoc.status, 'pending');
  assert.deepEqual(savedDoc.moderation, {
    decision: 'unclear',
    evaluatedAt: 1000000,
    reason: 'disabled'
  });

  // Admin panel must immediately label as "İnceleme bekliyor · Servis kapalı" (not "Değerlendiriliyor…")
  const label = commentStatusLabel(savedDoc, 1000005);
  assert.equal(label, 'İnceleme bekliyor · Servis kapalı');
});

test('uploadArtwork production service handles ambiguous commits, reconciliation failures, retries, and generation cleanup', async () => {
  const { createContentService } = require('../functions/content-service.cjs');
  const uid = 'admin-uploader';
  const uploadId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const rawBytes = Buffer.from('sanitized-webp-image-bytes');
  const contentHash = d.hash(rawBytes);

  function createMockEnvironment(opts = {}) {
    const firestore = new Map();
    const storageFiles = new Map();
    let deleteCalls = [];

    const mockFile = {
      save: async (buf, saveOpts) => {
        if (opts.saveError) throw opts.saveError;
        const exists = storageFiles.has(uploadId);
        if (exists && saveOpts?.preconditionOpts?.ifGenerationMatch === 0) {
          const err = new Error('PreconditionFailed');
          err.code = 412;
          throw err;
        }
        const currentGen = (storageFiles.get(uploadId)?.generation || 0) + 1;
        storageFiles.set(uploadId, {
          bytes: buf,
          generation: currentGen,
          metadata: saveOpts?.metadata?.metadata || {},
          size: buf.length
        });
      },
      getMetadata: async () => {
        if (opts.getMetadataError) throw opts.getMetadataError;
        if (!storageFiles.has(uploadId)) {
          const err = new Error('Not Found');
          err.code = 404;
          throw err;
        }
        const f = storageFiles.get(uploadId);
        return [{ generation: f.generation, metadata: f.metadata, size: f.size }];
      },
      delete: async (delOpts) => {
        deleteCalls.push(delOpts);
        if (opts.deleteGenerationMismatch && delOpts?.ifGenerationMatch !== storageFiles.get(uploadId)?.generation) {
          const err = new Error('PreconditionFailed');
          err.code = 412;
          throw err;
        }
        if (!storageFiles.has(uploadId)) {
          const err = new Error('Not Found');
          err.code = 404;
          throw err;
        }
        storageFiles.delete(uploadId);
      }
    };

    const mockBucket = {
      file: () => mockFile
    };

    const mockDb = {
      doc: path => ({
        get: async () => {
          if (opts.reconcileReadError && path.startsWith('assets/') && firestore.has(path)) {
            throw opts.reconcileReadError;
          }
          return {
            exists: firestore.has(path),
            data: () => firestore.get(path)
          };
        },
        set: async (val) => firestore.set(path, val),
        create: async (val) => {
          if (opts.saveAssetCommitThenDrop) {
            firestore.set(path, val);
            throw new Error('ETIMEDOUT: Connection dropped after commit');
          }
          if (opts.saveAssetDefiniteFail) {
            throw new Error('Firestore unavailable');
          }
          firestore.set(path, val);
        }
      }),
      collection: () => ({
        where: () => ({ limit: () => ({ get: async () => ({ docs: [], size: 0 }) }) })
      }),
      runTransaction: async fn => fn({
        get: async ref => ref.get(),
        set: (ref, val) => ref.set(val)
      })
    };

    const service = createContentService({ db: mockDb, now: () => 1000000 });
    const fakePrepareImage = async () => ({
      buffer: rawBytes,
      name: 'art.webp',
      width: 1200,
      height: 800
    });

    return { service, mockBucket, firestore, storageFiles, getDeleteCalls: () => deleteCalls, fakePrepareImage };
  }

  // Scenario 1: Metadata committed to Firestore but response dropped (network timeout)
  // Reconciles safely without deleting the committed file!
  {
    const env = createMockEnvironment({ saveAssetCommitThenDrop: true });
    const result = await env.service.uploadArtwork(uid, { uploadId }, {
      bucket: env.mockBucket,
      prepareImage: env.fakePrepareImage
    });
    assert.equal(result.id, uploadId);
    assert.equal(env.storageFiles.has(uploadId), true, 'Storage file must NOT be deleted');
    assert.equal(env.firestore.has(`assets/${uploadId}`), true, 'Firestore asset doc must exist');
    assert.equal(env.getDeleteCalls().length, 0, 'No delete call must be executed');
  }

  // Scenario 2: Metadata definitely not written (Firestore down)
  // Safely cleans up the newly written generation using { ifGenerationMatch: writtenGeneration }
  {
    const env = createMockEnvironment({ saveAssetDefiniteFail: true });
    await assert.rejects(
      env.service.uploadArtwork(uid, { uploadId }, {
        bucket: env.mockBucket,
        prepareImage: env.fakePrepareImage
      }),
      { message: 'Firestore unavailable' }
    );
    assert.equal(env.storageFiles.has(uploadId), false, 'Storage file must be cleaned up');
    assert.equal(env.getDeleteCalls().length, 1);
    assert.deepEqual(env.getDeleteCalls()[0], { ifGenerationMatch: 1 }, 'Must delete with generation precondition');
  }

  // Scenario 3: Reconciliation read also fails (transient DB read error)
  // Does NOT delete the file blindly! Leaves file in safe retryable state.
  {
    const env = createMockEnvironment({
      saveAssetCommitThenDrop: true,
      reconcileReadError: new Error('Transient DB timeout reading assets')
    });
    await assert.rejects(
      env.service.uploadArtwork(uid, { uploadId }, {
        bucket: env.mockBucket,
        prepareImage: env.fakePrepareImage
      }),
      { message: 'ETIMEDOUT: Connection dropped after commit' }
    );
    assert.equal(env.storageFiles.has(uploadId), true, 'Must NOT blindly delete file when reconciliation read fails');
    assert.equal(env.getDeleteCalls().length, 0);
  }

  // Scenario 4: Storage written but getMetadata failed on initial attempt.
  // Subsequent retry encounters 412 from Storage, adopts existing matching file, and completes metadata without deadlock!
  {
    const env = createMockEnvironment();
    // Pre-populate storage file as if written by previous attempt of same user
    env.storageFiles.set(uploadId, {
      bytes: rawBytes,
      generation: 42,
      metadata: { contentHash, owner: uid },
      size: rawBytes.length
    });

    const result = await env.service.uploadArtwork(uid, { uploadId }, {
      bucket: env.mockBucket,
      prepareImage: env.fakePrepareImage
    });
    assert.equal(result.id, uploadId);
    const savedDoc = env.firestore.get(`assets/${uploadId}`);
    assert.ok(savedDoc, 'Asset metadata must be completed');
    assert.equal(savedDoc.storageGeneration, 42, 'Adopted generation from storage file');
  }

  // Scenario 5: Storage file has unproven or different ownership -> rejects with asset-ownership-conflict
  {
    const env = createMockEnvironment();
    env.storageFiles.set(uploadId, {
      bytes: rawBytes,
      generation: 42,
      metadata: { contentHash, owner: 'unauthorized-admin' },
      size: rawBytes.length
    });

    await assert.rejects(
      env.service.uploadArtwork(uid, { uploadId }, {
        bucket: env.mockBucket,
        prepareImage: env.fakePrepareImage
      }),
      { code: 'permission-denied', details: { reason: 'asset-ownership-conflict' } }
    );
  }

  // Scenario 6: Storage file has unproven or mismatched content hash -> rejects with asset-content-mismatch
  {
    const env = createMockEnvironment();
    env.storageFiles.set(uploadId, {
      bytes: rawBytes,
      generation: 42,
      metadata: { contentHash: 'mismatched-content-hash', owner: uid },
      size: rawBytes.length
    });

    await assert.rejects(
      env.service.uploadArtwork(uid, { uploadId }, {
        bucket: env.mockBucket,
        prepareImage: env.fakePrepareImage
      }),
      { code: 'already-exists', details: { reason: 'asset-content-mismatch' } }
    );
  }
});
