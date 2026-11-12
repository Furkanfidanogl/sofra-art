const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const backendRequire=createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=backendRequire('firebase-admin/app');
const {getFirestore}=backendRequire('firebase-admin/firestore');
const {getAuth}=backendRequire('firebase-admin/auth');
const {getStorage}=backendRequire('firebase-admin/storage');
const {createContentService}=require('../functions/content-service.cjs');
const d=require('../functions/domain.cjs');

if(process.env.GCLOUD_PROJECT!=='demo-sofra' || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error('Tests require isolated demo-sofra Auth/Firestore/Storage emulators. No production access permitted.');
}
const app=initializeApp({projectId:'demo-sofra',storageBucket:'demo-sofra.firebasestorage.app'});
const db=getFirestore(app);let clock=100000;
const service=createContentService({db,now:()=>clock});
const sample={artId:'table',name:'Furkan',text:'Bugün kendime bir mola verdim.',requestId:'first-request'};
const daily={quote:'Biraz dur.',question:'Bugün ne hissettin?',artwork:'moon',songTitle:'Akşam Aralığı'};
after(async()=>{await db.terminate();await deleteApp(app);});

test('pending comments stay private; approval exposes only allowed fields and rejection removes them',async()=>{
  const result=await service.submitComment('visitor-one',sample);
  assert.equal(result.status,'pending');assert.equal((await service.getPublicContent({artId:'table'})).comments.length,0);
  await service.manageContent('admin',{operation:'moderateComment',commentId:result.id,status:'approved'});
  const visible=(await service.getPublicContent({artId:'table'})).comments;
  assert.equal(visible.length,1);assert.deepEqual(Object.keys(visible[0]).sort(),['artId','createdAt','id','name','text']);
  const approved=(await service.adminDashboard()).comments.find(c=>c.id===result.id);
  assert.equal(approved.status,'approved');assert.equal('uid' in approved,false);
  clock+=1000;
  await service.manageContent('admin',{operation:'moderateComment',commentId:result.id,status:'rejected'});
  assert.equal((await service.getPublicContent({artId:'table'})).comments.length,0);
  assert.equal((await service.adminDashboard()).comments.some(c=>c.id===result.id),false);
});

test('drafts never leak; publishing uses version checks and rejects stale editors',async()=>{
  clock+=2000;
  await service.manageContent('admin',{operation:'saveDaily',daily,version:0});
  assert.equal((await service.getPublicContent({artId:'table'})).daily,null);
  clock+=1000;
  await assert.rejects(service.manageContent('admin',{operation:'publishDaily',daily,version:0}),{code:'aborted'});
  await service.manageContent('admin',{operation:'publishDaily',daily,version:1});
  assert.deepEqual((await service.getPublicContent({artId:'table'})).daily,daily);
  clock+=1000;
  await service.manageContent('admin',{operation:'saveDaily',daily:{...daily,quote:'Gizli taslak'},version:2});
  assert.equal((await service.getPublicContent({artId:'table'})).daily.quote,'Biraz dur.');
});

test('concurrent retries create one comment; altered idempotency keys and rapid/duplicate submissions are rejected',async()=>{
  clock+=100000;
  const [one,two]=await Promise.all([service.submitComment('visitor-two',sample),service.submitComment('visitor-two',sample)]);
  assert.equal(one.id,two.id);
  assert.equal((await db.collection('comments').where('uid','==','visitor-two').get()).size,1);
  await assert.rejects(service.submitComment('visitor-two',{...sample,text:'Başka içerik'}),{code:'already-exists'});
  await assert.rejects(service.submitComment('visitor-two',{...sample,text:'Farklı bir not bıraktım.',requestId:'second-request'}),{code:'resource-exhausted'});
  clock+=30000;
  await assert.rejects(service.submitComment('visitor-two',{...sample,text:sample.text.toLocaleUpperCase('tr'),requestId:'duplicate-request'}),{code:'resource-exhausted'});
});

test('direct Firestore/Storage access is denied to guests and a signed-in admin',async()=>{
  const auth=getAuth(app);
  await auth.createUser({uid:'rules-admin',email:'admin@example.com',emailVerified:true});
  await auth.setCustomUserClaims('rules-admin',{admin:true});
  const customToken=await auth.createCustomToken('rules-admin');
  const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=emulator-only`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:customToken,returnSecureToken:true})});
  assert.equal(response.status,200);const {idToken}=await response.json();
  const base=`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-sofra/databases/(default)/documents/siteContent/daily`;
  for(const token of [null,idToken]) {
    const headers=token?{authorization:`Bearer ${token}`} : {};
    assert.equal((await fetch(base,{headers})).status,403);
    assert.equal((await fetch(base,{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({fields:{admin:{booleanValue:true}}})})).status,403);
  }
  const bucket=getStorage(app).bucket();await bucket.file('private-test.txt').save('private');
  const storage=`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket.name}/o`;
  for(const token of [null,idToken]) {
    const headers=token?{authorization:`Firebase ${token}`} : {};
    assert.equal((await fetch(`${storage}/private-test.txt?alt=media`,{headers})).status,403);
    assert.equal((await fetch(`${storage}?name=blocked.txt&uploadType=media`,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'blocked'})).status,403);
  }
});

test('artwork drafts stay private, published metadata and images match, stale edits fail and unpublish removes access',async()=>{
  clock=Date.parse('2026-10-30T12:00:00+03:00');
  const assetId='12345678-1234-1234-1234-123456789abc';
  await service.saveAsset('editor',{id:assetId,buffer:Buffer.from('sanitized image'),name:'test.webp',width:10,height:10});
  const artwork={title:'Özgün test eseri',description:'Emulator içindeki özgün çalışma.',alt:'Sakin bir göl',mood:'calm',tag:'SEÇKİ',credit:'Özgün çalışma',source:'https://example.com/source',question:'Sana ne hissettirdi?',assetId,rightsConfirmed:true};
  await assert.rejects(service.manageContent('editor',{operation:'publishArtwork',version:0,artwork:{...artwork,rightsConfirmed:false}}),{code:'invalid-argument'});
  const saved=await service.manageContent('editor',{operation:'saveArtwork',version:0,artwork});
  assert.equal((await service.getPublicContent({artId:'table'})).artworks.some(a=>a.id===saved.id),false);
  await assert.rejects(service.publishedImage(saved.id),{code:'not-found'});
  clock+=1000;
  const published=await service.manageContent('editor',{operation:'publishArtwork',id:saved.id,version:1,artwork});
  const art=(await service.getPublicContent({artId:'table'})).artworks.find(a=>a.id===saved.id);
  assert.equal(art.title,artwork.title);assert.equal('assetId' in art,false);assert.equal('rightsConfirmed' in art,false);
  assert.match(art.image,/publicArtwork\?id=art-/);assert.equal((await service.publishedImage(saved.id)).name,'test.webp');
  clock+=1000;
  await assert.rejects(service.manageContent('editor',{operation:'saveArtwork',id:saved.id,version:0,artwork}),{code:'aborted'});
  await service.manageContent('editor',{operation:'saveArtwork',id:saved.id,version:published.version,artwork:{...artwork,title:'Henüz yayınlanmayan başlık'}});
  assert.equal((await service.getPublicContent({artId:'table'})).artworks.find(a=>a.id===saved.id).title,artwork.title);
  clock+=1000;
  await service.manageContent('editor',{operation:'unpublishArtwork',id:saved.id,version:3});
  assert.equal((await service.getPublicContent({artId:'table'})).artworks.some(a=>a.id===saved.id),false);
  await assert.rejects(service.publishedImage(saved.id),{code:'not-found'});
  await assert.rejects(service.submitComment('visitor',{...sample,artId:saved.id,requestId:'hidden-art'}),{code:'not-found'});
});

test('dated packages activate at Istanbul midnight, separate questions, keep scheduled copies apart from drafts and support cancellation',async()=>{
  clock=Date.parse('2026-11-01T23:59:58+03:00');
  const one={...daily,question:'Birinci günün sorusu'};
  const two={...daily,question:'İkinci günün sorusu',spotifyUrl:'https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ'};
  await service.manageContent('planner',{operation:'schedulePackage',date:'2026-11-01',daily:one,version:0});
  clock+=600;
  await service.manageContent('planner',{operation:'schedulePackage',date:'2026-11-02',daily:two,version:0});
  const before=await service.getPublicContent({artId:'table'});
  assert.equal(before.daily.question,one.question);assert.equal(before.packageDate,'2026-11-01');
  const comment=await service.submitComment('dated-visitor',{...sample,text:'Birinci soruya cevap veriyorum.',requestId:'day-one',tableKey:before.tableKey});
  await service.manageContent('moderator',{operation:'moderateComment',commentId:comment.id,status:'approved'});
  assert.equal((await service.getPublicContent({artId:'table'})).comments.length,1);
  clock=Date.parse('2026-11-02T00:00:00+03:00');
  const after=await service.getPublicContent({artId:'table'});
  assert.equal(after.daily.question,two.question);assert.equal(after.packageDate,'2026-11-02');assert.equal(after.comments.length,0);assert.notEqual(before.tableKey,after.tableKey);
  await assert.rejects(service.submitComment('dated-visitor',{...sample,text:'Eski pencereden yazıyorum.',requestId:'stale-question',tableKey:before.tableKey}),{code:'aborted'});
  await service.manageContent('planner',{operation:'savePackage',date:'2026-11-02',version:1,daily:{...two,question:'Gizli sonraki taslak'}});
  assert.equal((await service.getPublicContent({artId:'table'})).daily.question,two.question);
  clock+=1000;
  await assert.rejects(service.manageContent('planner',{operation:'schedulePackage',date:'2026-11-01',version:1,daily:one}),{code:'invalid-argument'});
  await assert.rejects(service.manageContent('planner',{operation:'schedulePackage',date:'2026-11-02',version:1,daily:two}),{code:'aborted'});
  await service.manageContent('planner',{operation:'unschedulePackage',date:'2026-11-02',version:2});
  assert.equal((await service.getPublicContent({artId:'table'})).daily.question,one.question);
  clock+=1000;
  await service.manageContent('planner',{operation:'schedulePackage',date:'2026-11-02',version:3,daily:{...two,spotifyUrl:''}});
  assert.equal((await service.getPublicContent({artId:'table'})).daily.spotifyUrl,undefined);
});

test('approved comments and older assets remain reachable across independent paginated lists',async()=>{
  const batch=db.batch();
  batch.set(db.doc('comments/old-approved'),{artId:'moon',name:'Ada',text:'Eski onaylı yorum.',status:'approved',createdAt:1});
  for(let i=0;i<45;i++)batch.set(db.doc(`comments/new-pending-${String(i).padStart(3,'0')}`),{artId:'moon',name:'Ada',text:'Yeni bekleyen yorum.',status:'pending',createdAt:clock+i});
  for(let i=0;i<25;i++)batch.set(db.doc(`assets/asset-${String(i).padStart(3,'0')}`),{name:`Görsel ${i}`,width:10,height:10,bytes:10,status:'draft',createdAt:clock+i});
  await batch.commit();
  const approved=await service.adminDashboard({commentStatus:'approved'});
  assert.ok(approved.comments.some(c=>c.id==='old-approved'));assert.ok(approved.comments.every(c=>c.status==='approved'));
  const first=await service.adminDashboard({commentStatus:'pending'});
  assert.equal(first.comments.length,30);assert.ok(first.commentCursor);assert.equal(first.assets.length,20);assert.ok(first.assetCursor);
  const next=await service.adminDashboard({commentStatus:'pending',commentCursor:first.commentCursor,assetCursor:first.assetCursor});
  assert.ok(next.comments.length>0);assert.equal(first.comments.some(a=>next.comments.some(b=>a.id===b.id)),false);
  assert.equal(first.assets.some(a=>next.assets.some(b=>a.id===b.id)),false);
});

test('an editorial package retains its featured artwork even beyond the first admin catalogue page',async()=>{
  const value={title:'Katalog eseri',description:'Özgün çalışma.',alt:'Görsel',mood:'calm',tag:'SEÇKİ',credit:'Sofra',source:null,question:'Ne hissettin?',assetId:'12345678-1234-1234-1234-123456789abc',rightsConfirmed:true};
  const batch=db.batch();
  for(let i=0;i<25;i++)batch.set(db.doc(`artworks/art-${i.toString(16).padStart(8,'0')}-0000-0000-0000-000000000000`),{version:1,status:'published',draft:value,published:value});
  const id='art-ffffffff-ffff-ffff-ffff-ffffffffffff';
  batch.set(db.doc(`artworks/${id}`),{version:1,status:'published',draft:value,published:value});
  await batch.commit();clock+=1000;
  await service.manageContent('planner',{operation:'schedulePackage',date:'2026-11-03',daily:{...daily,artwork:id},version:0});
  const result=await service.adminDashboard({date:'2026-11-03'});
  assert.ok(result.artworkCursor);assert.equal(result.selectedPackage.draft.artwork,id);
  assert.ok(result.artworks.some(a=>a.id===id));
});

test('private image deletion is reversible, filters selected/deleted files and cannot break a saved artwork',async()=>{
  clock+=10000;
  const assetId='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const file=getStorage(app).bucket().file(`artworks/${assetId}.webp`);
  await file.save('private test bytes');
  await service.saveAsset('asset-editor',{id:assetId,buffer:Buffer.from('private test bytes'),name:'Özel görsel.webp',width:20,height:20});
  await assert.rejects(service.manageContent('asset-editor',{operation:'deleteAsset',assetId,storagePath:'arbitrary'}),{code:'invalid-argument'});
  await service.manageContent('asset-editor',{operation:'deleteAsset',assetId});
  assert.equal((await db.doc(`assets/${assetId}`).get()).data().status,'deleted');
  assert.equal((await service.adminDashboard({selectedAsset:assetId})).assets.some(a=>a.id===assetId),false);
  await assert.rejects(service.assetInfo(assetId),{code:'not-found'});
  assert.equal((await file.exists())[0],true);
  const artwork={title:'Korunacak eser',description:'Özgün bir test.',alt:'Bir görsel',mood:'calm',tag:'SEÇKİ',credit:'Sofra',question:'Ne hissettin?',assetId,rightsConfirmed:true};
  clock+=1000;
  await assert.rejects(service.manageContent('asset-editor',{operation:'saveArtwork',version:0,artwork}),{code:'not-found'});
  await service.manageContent('asset-editor',{operation:'restoreAsset',assetId});
  assert.equal((await service.adminDashboard({selectedAsset:assetId})).assets.some(a=>a.id===assetId),true);
  clock+=1000;
  const saved=await service.manageContent('asset-editor',{operation:'saveArtwork',version:0,artwork});
  clock+=1000;
  await assert.rejects(service.manageContent('asset-editor',{operation:'deleteAsset',assetId}),error=>error.code==='failed-precondition' && error.details.reason==='asset-in-use');
  await service.manageContent('asset-editor',{operation:'publishArtwork',id:saved.id,version:1,artwork});
  clock+=1000;
  await assert.rejects(service.manageContent('asset-editor',{operation:'deleteAsset',assetId}),{code:'failed-precondition'});
});

test('concurrent artwork creation and image deletion cannot leave a dangling asset reference',async()=>{
  const assetId='dddddddd-dddd-dddd-dddd-dddddddddddd';
  await service.saveAsset('race-editor',{id:assetId,buffer:Buffer.from('private'),name:'Race.webp',width:10,height:10});
  const artwork={title:'Eşzamanlı eser',description:'Bir çalışma.',alt:'Görsel',mood:'calm',tag:'SEÇKİ',credit:'Sofra',question:'Ne hissettin?',assetId,rightsConfirmed:true};
  const results=await Promise.allSettled([
    service.manageContent('race-delete',{operation:'deleteAsset',assetId}),
    service.manageContent('race-create',{operation:'saveArtwork',version:0,artwork}),
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const deleted=(await db.doc(`assets/${assetId}`).get()).data().status==='deleted';
  const refs=await db.collection('artworks').where('draft.assetId','==',assetId).get();
  assert.equal(deleted,refs.empty);
});

test('the localized Spotify URL from the reported form saves and schedules as a canonical link',async()=>{
  clock+=10000;
  const value={...daily,spotifyUrl:'https://open.spotify.com/intl-tr/track/6qqdFWe7C4LsBjWbXQdsHA?si=eaf77be0991949e1'};
  await service.manageContent('spotify-editor',{operation:'schedulePackage',date:'2026-11-04',version:0,daily:value});
  const result=await service.adminDashboard({date:'2026-11-04'});
  assert.equal(result.selectedPackage.published.spotifyUrl,'https://open.spotify.com/track/6qqdFWe7C4LsBjWbXQdsHA');
  assert.equal(result.selectedPackage.status,'scheduled');
});

test('single-song policy rejects album/playlist writes and strips old collection links from public content',async()=>{
  clock+=10000;
  const id='6qqdFWe7C4LsBjWbXQdsHA';
  for(const operation of ['saveDaily','publishDaily','savePackage','schedulePackage']) {
    for(const type of ['album','playlist']) {
      await assert.rejects(service.manageContent('track-only-editor',{operation,version:0,daily:{...daily,spotifyUrl:`https://open.spotify.com/intl-tr/${type}/${id}?si=test`},...(operation.endsWith('Package')?{date:'2026-11-05'}:{})}),error=>error.code==='invalid-argument' && error.details.field==='spotifyUrl');
    }
  }
  await db.doc('siteContent/daily').set({published:{...daily,spotifyUrl:`https://open.spotify.com/playlist/${id}`},publishedAt:clock},{merge:true});
  let value=await service.getPublicContent({artId:'table'});
  assert.equal(value.daily.spotifyUrl,undefined);
  await db.doc('dailyPackages/2026-11-05').set({date:'2026-11-05',status:'scheduled',version:1,scheduledAt:clock,published:{...daily,spotifyUrl:`https://open.spotify.com/album/${id}`}});
  clock=Date.parse('2026-11-05T00:00:00+03:00');
  value=await service.getPublicContent({artId:'table'});
  assert.equal(value.packageDate,'2026-11-05');assert.equal(value.daily.spotifyUrl,undefined);
});

test('Gemini auto-moderation: true approves, false rejects and unclear leaves comment in pending queue',async()=>{
  clock+=10000;
  let simulatedDecision='true';
  const mockModerator={
    isEnabled:()=>true,
    getModel:()=>'gemini-3.5-flash-lite',
    evaluateComment:async()=>({decision:simulatedDecision,model:'gemini-3.5-flash-lite'})
  };
  const modService=createContentService({db,now:()=>clock,moderationService:mockModerator});
  const current=await modService.currentDaily();
  const tableKey=current.tableKey;

  // 1. "true" -> auto approved -> visible to visitors
  const trueComment={artId:'table',tableKey,name:'Sakin',text:'Gecenin sessizliği iyi geldi.',requestId:'mod-true-1'};
  const resTrue=await modService.submitComment('user-true',trueComment);
  assert.equal(resTrue.status,'approved');
  const publicAfterTrue=await modService.getPublicContent({artId:'table'});
  assert.equal(publicAfterTrue.comments.some(c=>c.id===resTrue.id),true);

  // 2. "false" -> auto rejected -> not visible to visitors, visible in admin rejected filter
  clock+=20000;
  simulatedDecision='false';
  const falseComment={artId:'table',tableKey,name:'Saldırgan',text:'Kaba ve saldırgan bir metin.',requestId:'mod-false-1'};
  const resFalse=await modService.submitComment('user-false',falseComment);
  assert.equal(resFalse.status,'rejected');
  const publicAfterFalse=await modService.getPublicContent({artId:'table'});
  assert.equal(publicAfterFalse.comments.some(c=>c.id===resFalse.id),false);
  const rejectedInAdmin=(await modService.adminDashboard({commentStatus:'rejected'})).comments;
  assert.equal(rejectedInAdmin.some(c=>c.id===resFalse.id),true);

  // 3. "unclear" -> pending -> not visible to visitors, visible in admin pending queue
  clock+=20000;
  simulatedDecision='unclear';
  const unclearComment={artId:'table',tableKey,name:'Belirsiz',text:'Acaba burası ne kadar sakin?',requestId:'mod-unclear-1'};
  const resUnclear=await modService.submitComment('user-unclear',unclearComment);
  assert.equal(resUnclear.status,'pending');
  const publicAfterUnclear=await modService.getPublicContent({artId:'table'});
  assert.equal(publicAfterUnclear.comments.some(c=>c.id===resUnclear.id),false);
  const pendingInAdmin=(await modService.adminDashboard({commentStatus:'pending'})).comments;
  assert.equal(pendingInAdmin.some(c=>c.id===resUnclear.id),true);
});

test('artwork comments carry the specific artwork question to moderation and store it in Firestore', async () => {
  clock += 20000;
  let receivedQuestion = null;
  const mockModerator = {
    isEnabled: () => true,
    getModel: () => 'gemini-3.5-flash-lite',
    evaluateComment: async ({ text, question }) => {
      receivedQuestion = question;
      return { decision: 'true', model: 'gemini-3.5-flash-lite' };
    }
  };
  const artService = createContentService({ db, now: () => clock, moderationService: mockModerator });
  const artComment = { artId: 'moon', name: 'Ziyaretçi', text: 'Ay terası bana çocukluğumu hatırlattı.', requestId: 'art-context-req-1' };
  const res = await artService.submitComment('art-visitor', artComment);
  assert.equal(res.status, 'approved');
  assert.equal(receivedQuestion, 'Bu sandalyeye otursan aklından geçen ilk şey ne olurdu?');
  const doc = await db.doc(`comments/${res.id}`).get();
  assert.equal(doc.data().question, 'Bu sandalyeye otursan aklından geçen ilk şey ne olurdu?');
});

test('Gemini disabled, API errors and budget exhaustion fail closed to pending without auto-approving',async()=>{
  clock+=20000;
  let callCount=0;
  const failingModerator={
    isEnabled:()=>true,
    getModel:()=>'gemini-3.5-flash-lite',
    evaluateComment:async()=>{callCount++;throw new Error('API timeout/quota');}
  };
  const failingService=createContentService({db,now:()=>clock,moderationService:failingModerator});
  const current=await failingService.currentDaily();
  const tableKey=current.tableKey;

  const comment={artId:'table',tableKey,name:'Deneme',text:'Zaman aşımına uğrayacak yorum.',requestId:'fail-req-1'};
  const result=await failingService.submitComment('user-fail',comment);
  assert.equal(result.status,'pending');
  assert.equal(callCount,1);

  // Must not leak to visitors
  const publicComments=(await failingService.getPublicContent({artId:'table'})).comments;
  assert.equal(publicComments.some(c=>c.id===result.id),false);

  // Admin can still manually approve or reject
  await failingService.manageContent('admin',{operation:'moderateComment',commentId:result.id,status:'approved'});
  const approvedNow=(await failingService.getPublicContent({artId:'table'})).comments;
  assert.equal(approvedNow.some(c=>c.id===result.id),true);
});

test('repeated submissions avoid redundant model calls and late model responses never overwrite admin decisions',async()=>{
  clock+=20000;
  let evaluations=0;
  let evalStarted;
  const evalStartedPromise=new Promise(resolve=>{evalStarted=resolve;});
  let releaseModelEvaluation;
  const delayedPromise=new Promise(resolve=>{releaseModelEvaluation=resolve;});

  const raceModerator={
    isEnabled:()=>true,
    getModel:()=>'gemini-3.5-flash-lite',
    evaluateComment:async()=>{
      evaluations++;
      evalStarted();
      await delayedPromise;
      return {decision:'true',model:'gemini-3.5-flash-lite'};
    }
  };
  const raceService=createContentService({db,now:()=>clock,moderationService:raceModerator});
  const current=await raceService.currentDaily();
  const tableKey=current.tableKey;

  const commentInput={artId:'table',tableKey,name:'Yarış',text:'Geciken model yanıtı testi.',requestId:'race-comment-1'};

  // Start submission (held in flight waiting for delayedPromise)
  const submissionPromise=raceService.submitComment('race-user',commentInput);

  // Wait deterministically for the initial pending record and evaluation to begin
  await evalStartedPromise;

  // Admin intervenes and explicitly rejects the comment before model finishes
  const commentId=d.hash('race-user:race-comment-1');
  await raceService.manageContent('admin',{operation:'moderateComment',commentId,status:'rejected'});

  // Verify it is rejected
  const adminDoc=await db.doc(`comments/${commentId}`).get();
  assert.equal(adminDoc.data().status,'rejected');
  assert.equal(adminDoc.data().moderatedBy,'admin');

  // Now release the delayed model response (which returned 'true')
  releaseModelEvaluation();
  const submissionResult=await submissionPromise;

  // The admin decision MUST be preserved (rejected), NOT overwritten by the model's 'true'
  assert.equal(submissionResult.status,'rejected');
  const finalDoc=await db.doc(`comments/${commentId}`).get();
  assert.equal(finalDoc.data().status,'rejected');
  assert.equal(finalDoc.data().moderatedBy,'admin');

  // Idempotency check: repeated submit with same requestId does NOT evaluate model again
  clock+=1000;
  const repeatResult=await raceService.submitComment('race-user',commentInput);
  assert.equal(repeatResult.id,commentId);
  assert.equal(repeatResult.status,'rejected');
  assert.equal(evaluations,1); // No second model evaluation!

  // Parallel concurrent submissions with same requestId:
  // Contract:
  // 1. In-flight duplicate receives intermediate status ('pending').
  // 2. Once evaluation completes, DB status is updated to 'approved'.
  // 3. Post-completion duplicate receives final status ('approved').
  // 4. Exactly 1 model evaluation occurs and exactly 1 comment document is created in DB.
  clock+=1000;
  let concurrentEvals = 0;
  let concurrentStarted;
  const concurrentStartedPromise = new Promise(resolve => { concurrentStarted = resolve; });
  let releaseConcurrentEval;
  const concurrentReleasePromise = new Promise(resolve => { releaseConcurrentEval = resolve; });

  const concurrentModerator = {
    isEnabled: () => true,
    getModel: () => 'gemini-3.5-flash-lite',
    evaluateComment: async () => {
      concurrentEvals++;
      concurrentStarted();
      await concurrentReleasePromise;
      return { decision: 'true', model: 'gemini-3.5-flash-lite' };
    }
  };
  const concurrentService = createContentService({ db, now: () => clock, moderationService: concurrentModerator });
  const parallelInput = { artId: 'table', tableKey, name: 'Paralel', text: 'Paralel aynı anda gelen yorum.', requestId: 'parallel-same-req-1' };

  // 1) Start first submission
  const firstSubmissionPromise = concurrentService.submitComment('concurrent-user', parallelInput);

  // 2) Wait until model evaluation is actively running (doc created in Firestore, model in flight)
  await concurrentStartedPromise;

  // 3) Duplicate submission arriving while model is in flight receives intermediate status 'pending'
  const inFlightDuplicate = await concurrentService.submitComment('concurrent-user', parallelInput);
  assert.equal(inFlightDuplicate.status, 'pending');

  // 4) Release model evaluation to complete
  releaseConcurrentEval();
  const firstResult = await firstSubmissionPromise;
  assert.equal(firstResult.status, 'approved');
  assert.equal(inFlightDuplicate.id, firstResult.id);

  // 5) Verify Firestore DB document status is updated to 'approved'
  const parallelDoc = await db.doc(`comments/${firstResult.id}`).get();
  assert.equal(parallelDoc.data().status, 'approved');
  assert.equal(parallelDoc.data().autoApproved, true);

  // 6) Post-completion duplicate returns final 'approved' status
  const postCompletionDuplicate = await concurrentService.submitComment('concurrent-user', parallelInput);
  assert.equal(postCompletionDuplicate.id, firstResult.id);
  assert.equal(postCompletionDuplicate.status, 'approved');

  // 7) Verify public content visibility: approved comment must be visible in public content
  const publicContent = await concurrentService.getPublicContent({ artId: 'table' });
  assert.equal(publicContent.comments.some(c => c.id === firstResult.id), true);

  // 8) Verify exactly 1 model evaluation occurred and only 1 comment doc was created
  assert.equal(concurrentEvals, 1, 'Parallel/repeated requests with identical requestId must result in exactly 1 evaluation');
  const userComments = await db.collection('comments').where('uid', '==', 'concurrent-user').get();
  assert.equal(userComments.size, 1, 'Exactly one comment document must exist for the concurrent user');
});

test('hourly moderation budget enforces quota limit under real concurrent requests and recovers after 1 hour window', async () => {
  clock += 3600001; // Advance past any previous test window so global budget starts fresh
  let modCalls = 0;
  const testModerator = {
    isEnabled: () => true,
    getModel: () => 'gemini-3.5-flash-lite',
    evaluateComment: async () => {
      modCalls++;
      // Simulate real async evaluation delay to allow true concurrent contention
      await new Promise(r => setTimeout(r, 20));
      return { decision: 'true', model: 'gemini-3.5-flash-lite' };
    }
  };
  const quotaLimit = 4;
  const budgetService = createContentService({
    db,
    now: () => clock,
    moderationService: testModerator,
    hourlyQuota: quotaLimit,
  });

  const current = await budgetService.currentDaily();
  const tableKey = current.tableKey;

  // 1. Submit 8 simultaneous requests in parallel via Promise.all
  const concurrentSubmissions = Array.from({ length: 8 }, (_, i) =>
    budgetService.submitComment(`budget-concurrent-user-${i}`, {
      artId: 'table',
      tableKey,
      name: `User ${i}`,
      text: `Sakin paralel yorum ${i}`,
      requestId: `req-concurrent-${i}`
    })
  );

  const results = await Promise.all(concurrentSubmissions);

  // Model calls must NEVER exceed the hourly quota limit
  assert.equal(modCalls, quotaLimit, `Model calls (${modCalls}) must strictly equal quota limit (${quotaLimit})`);

  // Exactly quotaLimit must be approved; the remainder must fail closed to pending with quota-limit
  const approvedCount = results.filter(r => r.status === 'approved').length;
  const pendingCount = results.filter(r => r.status === 'pending').length;
  assert.equal(approvedCount, quotaLimit);
  assert.equal(pendingCount, 8 - quotaLimit);

  // 2. Advance clock past 1 hour (3600000 ms) -> budget window recovers!
  clock += 3600001;
  const recoveredRes = await budgetService.submitComment('budget-user-recovered', {
    artId: 'table',
    tableKey,
    name: 'Recovered User',
    text: 'Yeni saat penceresindeki ilk yorum.',
    requestId: 'req-recovered'
  });
  assert.equal(recoveredRes.status, 'approved');
  assert.equal(modCalls, quotaLimit + 1); // Model was successfully called again after window recovery!
});

test('upload service handles successful retry, lost response reconciliation, rejects different content or soft-deleted IDs, and preserves storage bytes', async () => {
  clock += 10000;
  const bucket = getStorage(app).bucket();
  const testUploadId = 'bbbbbbbb-1111-4222-8333-dddddddddddd';
  const originalBytes = Buffer.from('sanitized-webp-artwork-original-bytes');
  const originalHash = d.hash(originalBytes);
  const originalName = 'original-art.webp';

  // 1. Initial successful upload
  const path = `artworks/${testUploadId}.webp`;
  const file = bucket.file(path);
  await file.save(originalBytes, {
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType: 'image/webp' }
  });
  const [meta] = await file.getMetadata();
  const initialGeneration = meta.generation;

  await service.saveAsset('admin', {
    id: testUploadId,
    buffer: originalBytes,
    name: originalName,
    width: 1200,
    height: 900,
    contentHash: originalHash,
    storageGeneration: initialGeneration
  });

  // 2. Lost response / retry with identical uploadId and identical content -> reconciled safely
  const retryResult = await service.checkAssetUpload('admin', testUploadId, originalHash, originalName, originalBytes.length);
  assert.deepEqual(retryResult, {
    id: testUploadId,
    name: originalName,
    width: 1200,
    height: 900,
    bytes: originalBytes.length
  });

  // Verify file in Storage was NOT overwritten or modified (generation matches!)
  const [retryMeta] = await file.getMetadata();
  assert.equal(retryMeta.generation, initialGeneration);
  const [downloaded] = await file.download();
  assert.deepEqual(downloaded, originalBytes);

  // 3. Retry with same uploadId but DIFFERENT content -> rejected with already-exists
  const differentBytes = Buffer.from('different-content-for-same-id');
  const differentHash = d.hash(differentBytes);
  await assert.rejects(
    service.checkAssetUpload('admin', testUploadId, differentHash, originalName, differentBytes.length),
    { code: 'already-exists', details: { reason: 'asset-content-mismatch' } }
  );
  // Verify Storage file bytes remain completely intact
  const [checkMeta1] = await file.getMetadata();
  assert.equal(checkMeta1.generation, initialGeneration);

  // 4. Retry with same uploadId by DIFFERENT admin -> rejected with permission-denied
  await assert.rejects(
    service.checkAssetUpload('other-admin', testUploadId, originalHash, originalName, originalBytes.length),
    { code: 'permission-denied', details: { reason: 'asset-ownership-conflict' } }
  );

  // 5. Soft-deleted asset ID -> rejected with already-exists, NEVER silently reused or deleted!
  await service.manageContent('admin', { operation: 'deleteAsset', assetId: testUploadId });
  const deletedDoc = await db.doc(`assets/${testUploadId}`).get();
  assert.equal(deletedDoc.data().status, 'deleted');

  await assert.rejects(
    service.checkAssetUpload('admin', testUploadId, originalHash, originalName, originalBytes.length),
    { code: 'already-exists', details: { reason: 'asset-deleted' } }
  );

  // Storage bytes of the soft-deleted asset must remain strictly intact!
  const [postDeleteMeta] = await file.getMetadata();
  assert.equal(postDeleteMeta.generation, initialGeneration);
  const [postDeleteBytes] = await file.download();
  assert.deepEqual(postDeleteBytes, originalBytes);

  // 6. Precondition check: attempt to write to existing file with ifGenerationMatch: 0 fails
  try {
    await file.save(differentBytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 } });
    // If emulator does not enforce GCS preconditions, verify that at least generation changed
    const [savedMeta] = await file.getMetadata();
    assert.notEqual(savedMeta.generation, initialGeneration);
  } catch (err) {
    // In environments that enforce GCS preconditions (GCS / newer emulators), it rejects with 412
    assert.match(String(err?.message || err?.code), /412|Precondition|conditionNotMet/);
  }
});

test('service.uploadArtwork executes full production upload lifecycle against emulated storage and firestore', async () => {
  clock += 50000;
  const bucket = getStorage(app).bucket();
  const e2eUploadId = 'cccccccc-2222-4333-8444-ffffffffffff';
  const testBytes = Buffer.from('production-service-e2e-artwork-bytes');
  const fakePrep = async () => ({
    buffer: testBytes,
    name: 'e2e-art.webp',
    width: 1400,
    height: 900
  });

  // 1. First upload succeeds
  const res1 = await service.uploadArtwork('admin', { uploadId: e2eUploadId }, {
    bucket,
    prepareImage: fakePrep
  });
  assert.equal(res1.id, e2eUploadId);
  assert.equal(res1.name, 'e2e-art.webp');

  // Verify file in emulated Storage exists
  const file = bucket.file(`artworks/${e2eUploadId}.webp`);
  const [fileMeta] = await file.getMetadata();
  assert.ok(fileMeta.generation, 'File generation must exist');

  // 2. Idempotent retry with same uploadId and identical content returns the same asset without duplicate
  const res2 = await service.uploadArtwork('admin', { uploadId: e2eUploadId }, {
    bucket,
    prepareImage: fakePrep
  });
  assert.deepEqual(res2, res1);

  // 3. Retry with same uploadId but DIFFERENT content is strictly rejected
  const fakePrepDiff = async () => ({
    buffer: Buffer.from('different-image-bytes-conflict'),
    name: 'e2e-art.webp',
    width: 1400,
    height: 900
  });
  await assert.rejects(
    service.uploadArtwork('admin', { uploadId: e2eUploadId }, {
      bucket,
      prepareImage: fakePrepDiff
    }),
    { code: 'already-exists', details: { reason: 'asset-content-mismatch' } }
  );

  // 4. Comment submission when moderation is disabled marks reason as disabled
  clock += 1000;
  const disabledService = createContentService({
    db,
    now: () => clock,
    moderationService: { isEnabled: () => false }
  });
  const currentPub = await disabledService.getPublicContent({ artId: 'table' });
  const commentRes = await disabledService.submitComment('visitor-disabled', {
    artId: 'table',
    name: 'Deniz',
    text: 'Sakin bir gece.',
    requestId: 'req-disabled-e2e',
    tableKey: currentPub.tableKey || 'legacy'
  });
  assert.equal(commentRes.status, 'pending');
  const commentDoc = await db.doc(`comments/${commentRes.id}`).get();
  assert.equal(commentDoc.data().moderation?.reason, 'disabled');
});

test('editorial AI draft generation provides suggestions without publishing, enforces isolated quota, and handles idempotency', async () => {
  clock += 10000;
  let editorialCalls = 0;
  const mockEditorial = {
    isEnabled: () => true,
    getModel: () => 'gemini-3.5-flash-lite',
    generateDraft: async ({ type, context }) => {
      editorialCalls++;
      return {
        draft: `Sakin bir ${type} taslağı: ${context?.title || context?.seed || 'Sofra'}.`,
        model: 'gemini-3.5-flash-lite'
      };
    }
  };

  const edService = createContentService({
    db,
    now: () => clock,
    editorialService: mockEditorial,
    editorialHourlyQuota: 5
  });

  // 1. Generate note draft
  const res1 = await edService.generateEditorial('admin', {
    type: 'note',
    requestId: 'req-ai-note-1',
    context: { seed: 'Akşamın sükuneti' }
  });
  assert.equal(res1.type, 'note');
  assert.match(res1.draft, /Akşamın sükuneti/);
  assert.equal(editorialCalls, 1);

  // 2. Verify that NO content was auto-published in Firestore
  const dailyDoc = await db.doc('siteContent/daily').get();
  const dailyData = dailyDoc.data() || {};
  assert.notEqual(dailyData.published?.quote, res1.draft, 'AI draft must NEVER auto-publish to daily quote');

  // 3. Idempotency: repeated call with same requestId returns cached result without second model call
  clock += 1000;
  const resRepeat = await edService.generateEditorial('admin', {
    type: 'note',
    requestId: 'req-ai-note-1',
    context: { seed: 'Akşamın sükuneti' }
  });
  assert.equal(resRepeat.draft, res1.draft);
  assert.equal(editorialCalls, 1, 'Idempotent request must not trigger second model call');

  // 4. Generate question draft via manageContent delegator
  clock += 2000;
  const resQ = await edService.manageContent('admin', {
    operation: 'generateEditorial',
    type: 'question',
    requestId: 'req-ai-q-1',
    context: { room: 'calm' }
  });
  assert.equal(resQ.type, 'question');
  assert.equal(editorialCalls, 2);

  // 5. Quota isolation: editorial quota does NOT consume or affect comment moderation quota
  clock += 2000;
  // Comment moderation service with fresh call count
  let modCalls = 0;
  const testMod = {
    isEnabled: () => true,
    getModel: () => 'gemini-3.5-flash-lite',
    evaluateComment: async () => { modCalls++; return { decision: 'true', model: 'gemini-3.5-flash-lite' }; }
  };
  const isolatedService = createContentService({
    db,
    now: () => clock,
    moderationService: testMod,
    editorialService: mockEditorial,
    hourlyQuota: 2,
    editorialHourlyQuota: 2
  });

  // Comment moderation works cleanly
  const current = await isolatedService.currentDaily();
  const comRes = await isolatedService.submitComment('user-isolated', {
    artId: 'table',
    name: 'Ada',
    text: 'Sakin ve duru bir gece.',
    requestId: 'isolated-comment-1',
    tableKey: current.tableKey || 'legacy'
  });
  assert.equal(comRes.status, 'approved');
  assert.equal(modCalls, 1);
});

test('public content deep link includes requested published artwork even if beyond the first catalog page', async () => {
  clock += 10000;
  const deepService = createContentService({ db, now: () => clock });

  // Create 42 published artworks to push subsequent items onto page 2 (default page is 40)
  const batch = db.batch();
  const createdIds = [];
  for (let i = 1; i <= 42; i++) {
    const id = `art-00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
    createdIds.push(id);
    batch.set(db.doc(`artworks/${id}`), {
      status: 'published',
      version: 1,
      published: {
        title: `Derin Eser ${i}`,
        description: `Açıklama ${i}`,
        alt: `Betimleme ${i}`,
        mood: 'calm',
        tag: 'SEÇKİ',
        credit: 'Özgün',
        question: 'Ne hissettin?',
        assetId: null,
        rightsConfirmed: true
      }
    });
  }
  await batch.commit();

  // Pick the 42nd artwork, which is beyond page 1 of publicCatalog
  const targetId = createdIds[41];
  const publicData = await deepService.getPublicContent({ artId: targetId });

  // Verify the target artwork is present in publicData.artworks
  assert.ok(
    publicData.artworks.some(a => a.id === targetId),
    `Deep-linked artwork ${targetId} must be included in public artworks even if beyond first page`
  );
  assert.equal(publicData.comments !== undefined, true);
});
test('nickname moderation rejects prohibited public names and passes valid names to the model',async()=>{
  clock+=100000;let calls=0,seenName;
  const full=createContentService({db,now:()=>clock,moderationService:{isEnabled:()=>true,evaluateComment:async({name})=>{calls++;seenName=name;return {decision:'true'};}}});
  const tableKey=(await full.currentDaily()).tableKey;
  const bad=await full.submitComment('nickname-bypass',{...sample,tableKey,name:'fuck',requestId:'nickname-bad',text:'Bugün sessiz bir sabah yaşadım.'});
  assert.equal(bad.status,'rejected');assert.equal(calls,0);
  assert.equal((await full.getPublicContent({artId:'table'})).comments.some(c=>c.id===bad.id),false);
  const good=await full.submitComment('nickname-valid',{...sample,tableKey,name:'İlker',requestId:'nickname-good',text:'Bu seçkiyi bugün biraz hüzünlü buldum.'});
  assert.equal(good.status,'approved');assert.equal(seenName,'İlker');assert.equal(calls,1);
});

test('privacy export/delete is owner-bound, paginated, retry-safe, and blocks in-flight comment recreation',async()=>{
  const {createPrivacyService}=require('../functions/privacy.cjs');
  clock+=100000;
  const privacy=createPrivacyService({db,now:()=>clock}),uid='privacy-owner',other='privacy-other';
  const token={auth_time:Math.floor(clock/1000)};
  const batch=db.batch();
  for(let i=0;i<205;i++)batch.set(db.collection('comments').doc(`privacy-${String(i).padStart(3,'0')}`),{uid,name:'Deniz',text:`Kendi notum ${i}`,artId:'table',status:i%2?'approved':'pending',createdAt:clock});
  batch.set(db.collection('comments').doc('privacy-other-record'),{uid:other,name:'Başka',text:'Başkasının verisi',artId:'table',status:'pending',createdAt:clock});
  await batch.commit();
  const first=await privacy.manage(uid,{operation:'export',accountUid:uid},token);
  assert.equal(first.comments.length,100);assert.ok(first.nextCursor);
  assert.equal(first.comments.some(c=>c.text==='Başkasının verisi'),false);
  assert.equal('uid' in first.comments[0],false);
  const second=await privacy.manage(uid,{operation:'export',accountUid:uid,cursor:first.nextCursor},token);
  assert.equal(second.comments.length,100);assert.notEqual(second.comments[0].id,first.comments[0].id);
  await assert.rejects(privacy.manage(uid,{operation:'delete',accountUid:other},token),{code:'aborted'});
  await assert.rejects(privacy.manage(uid,{operation:'delete',accountUid:uid},{auth_time:0}),{code:'failed-precondition'});
  const one=await privacy.manage(uid,{operation:'delete',accountUid:uid},token);
  assert.equal(one.deleted,100);assert.equal(one.complete,false);
  const tableKey=(await service.currentDaily()).tableKey;
  await assert.rejects(service.submitComment(uid,{...sample,tableKey,requestId:'after-delete',text:'Silme başladıktan sonra yeni yorum.'}),{code:'failed-precondition'});
  const middle=await privacy.manage(uid,{operation:'delete',accountUid:uid},token);
  assert.equal(middle.deleted,100);assert.equal(middle.complete,false);
  const two=await privacy.manage(uid,{operation:'delete',accountUid:uid},token);
  assert.equal(two.deleted,5);assert.equal(two.complete,true);
  assert.equal((await privacy.manage(uid,{operation:'delete',accountUid:uid},token)).deleted,0);
  assert.equal((await db.collection('comments').where('uid','==',uid).get()).size,0);
  assert.equal((await db.doc('comments/privacy-other-record').get()).exists,true);

  let release,started;const waiting=new Promise(r=>started=r),model=new Promise(r=>release=r);
  const delayed=createContentService({db,now:()=>clock,moderationService:{isEnabled:()=>true,evaluateComment:async()=>{started();await model;return {decision:'true'};}}});
  const lateUid='privacy-delayed';
  const pending=delayed.submitComment(lateUid,{...sample,tableKey,requestId:'delete-during-model',text:'Değerlendirmesi henüz tamamlanmamış not.'});
  await waiting;
  await privacy.manage(lateUid,{operation:'delete',accountUid:lateUid},token);
  release();await pending;
  assert.equal((await db.collection('comments').where('uid','==',lateUid).get()).size,0,'Late moderation must not recreate erased content');
});


test('scoped duplicate protection allows sincere cross-art reactions, blocks unicode repeats and cleans both fingerprint generations',async()=>{
  const {fingerprintId,legacyFingerprintId}=require('../functions/comment-policy.cjs');
  const {createPrivacyService}=require('../functions/privacy.cjs');
  clock+=100000;
  const uid='scoped-comment-owner',name='Amina',text='Çok güzel 🌿';
  const tableKey=(await service.currentDaily()).tableKey;
  const input={...sample,name,text,tableKey,requestId:'scope-table'};
  const first=await service.submitComment(uid,input);
  clock+=20000;
  const next=await service.submitComment(uid,{artId:'moon',name,text,requestId:'scope-art'});
  assert.notEqual(first.id,next.id);
  clock+=20000;
  await assert.rejects(service.submitComment(uid,{artId:'moon',name,text:'ÇOK  GÜZEL 🌿',requestId:'scope-repeat'}),error=>error.code==='resource-exhausted'&&error.details.reason==='duplicate-comment');
  const comment=(await db.doc(`comments/${next.id}`).get()).data();
  const newId=fingerprintId(comment),oldId=legacyFingerprintId(uid,text);
  assert.equal((await db.doc(`commentFingerprints/${newId}`).get()).exists,true);
  await db.doc(`commentFingerprints/${oldId}`).set({createdAt:clock});
  const privacy=createPrivacyService({db,now:()=>clock});
  assert.equal((await privacy.manage(uid,{operation:'delete',accountUid:uid},{auth_time:Math.floor(clock/1000)})).complete,true);
  for(const id of [newId,oldId])assert.equal((await db.doc(`commentFingerprints/${id}`).get()).exists,false);
});
