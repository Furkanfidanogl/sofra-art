const {randomUUID}=require('node:crypto');
const d=require('./domain.cjs');
const {fingerprintId}=require('./comment-policy.cjs');
const builtins=require('./builtin-artworks.json');
const PUBLIC_IMAGE='https://europe-west1-sofra-512816.cloudfunctions.net/publicArtwork';

function createContentService({db,now=Date.now,moderationService=null,editorialService=null,hourlyQuota=120,editorialHourlyQuota=60}) {
  const dailyRef=db.doc('siteContent/daily');
  const comments=db.collection('comments');
  const artworks=db.collection('artworks');
  const packages=db.collection('dailyPackages');
  function publicDaily(value) {
    if(!value)return null;
    const daily={...value};
    // Apply the current policy to previously stored content without rewriting it.
    if(daily.spotifyUrl){try{daily.spotifyUrl=d.spotifyUrl(daily.spotifyUrl);}catch{delete daily.spotifyUrl;}}
    return daily;
  }
  const limitRef=(uid,action)=>db.doc(`requestLimits/${d.hash(`${uid}:${action}`)}`);
  const pageCursor=value=>value===undefined || value===null?null:d.resourceId(value);
  async function page(query,cursor,size=20) {
    query=query.orderBy('__name__');
    if(cursor)query=query.startAfter(cursor);
    const result=await query.limit(size+1).get();
    return {docs:result.docs.slice(0,size),next:result.size>size?result.docs[size-1].id:null};
  }
  function publicArt(id,value) {
    const {title,description,alt,mood,tag,credit,source,question}=value;
    const builtin=builtins.find(a=>a.id===id);
    return {id,title,description,alt,mood,tag,credit,source,question,
      image:value.assetId?`${PUBLIC_IMAGE}?id=${encodeURIComponent(id)}&v=${value.imageVersion || 0}`:builtin?.image,
      ratio:'tall'};
  }
  async function currentDaily() {
    const date=d.istanbulDay(now());
    const [legacy,scheduled]=await Promise.all([dailyRef.get(),packages.where('status','==','scheduled').where('date','<=',date).orderBy('date','desc').limit(1).get()]);
    const selected=scheduled.docs[0]?.data();
    // A manually published legacy daily after a scheduled package takes precedence
    // until the next dated package becomes due. Its comments get their own thread.
    const legacyData=legacy.data() || {};
    const activation=selected?Date.parse(selected.date+'T00:00:00+03:00'):0;
    if(selected?.published && !(legacyData.publishedAt>activation && legacyData.publishedAt>(selected.scheduledAt || 0))) {
      return {daily:publicDaily(selected.published),packageDate:selected.date,tableKey:`day-${selected.date}-${d.hash(selected.published.question).slice(0,12)}`};
    }
    return {daily:publicDaily(legacyData.published),packageDate:null,tableKey:'legacy'};
  }
  async function publishedArt(id) {
    d.artId(id,false);
    const doc=await artworks.doc(id).get();
    const value=doc.data();
    if(value)return value.status==='published' && value.published?publicArt(id,value.published):null;
    return builtins.find(a=>a.id===id) || null;
  }
  async function publicCatalog(cursor) {
    const [overrides,custom]=await Promise.all([
      db.getAll(...builtins.map(a=>artworks.doc(a.id))),
      page(artworks.where('status','==','published'),cursor,40),
    ]);
    const base=builtins.flatMap((a,i)=>{
      const value=overrides[i].data();
      return value?(value.status==='published' && value.published?[publicArt(a.id,value.published)]:[]):[a];
    });
    const extra=custom.docs.filter(doc=>!d.ART_IDS.includes(doc.id)).map(doc=>publicArt(doc.id,doc.data().published));
    return {artworks:[...base,...extra],catalogCursor:custom.next};
  }
  async function getPublicContent(input) {
    d.object(input,['artId','catalogCursor']);const artId=d.artId(input.artId);
    const [current,catalog]=await Promise.all([currentDaily(),publicCatalog(pageCursor(input.catalogCursor))]);
    if(artId!=='table' && !await publishedArt(artId))d.fail('not-found','Bu eser artık yayında değil.');
    let query=comments.where('artId','==',artId).where('status','==','approved');
    if(artId==='table' && current.tableKey!=='legacy')query=query.where('tableKey','==',current.tableKey);
    const result=await query.orderBy('createdAt','desc').limit(30).get();
    const visible=result.docs.filter(doc=>artId!=='table' || current.tableKey!=='legacy' || !doc.data().tableKey || doc.data().tableKey==='legacy');
    // Include the featured work even if it is on a later gallery page.
    if(current.daily && !catalog.artworks.some(a=>a.id===current.daily.artwork)) {
      const featured=await publishedArt(current.daily.artwork);
      if(featured)catalog.artworks.push(featured);
      else current.daily={...current.daily,artwork:catalog.artworks[0]?.id || null};
    }
    // Include the requested work if it is on a later gallery page.
    if(artId!=='table' && !catalog.artworks.some(a=>a.id===artId)) {
      const requested=await publishedArt(artId);
      if(requested)catalog.artworks.push(requested);
    }
    return {...current,...catalog,serverDate:d.istanbulDay(now()),serverTime:now(),comments:visible.map(doc=>d.publicComment({id:doc.id,...doc.data()})).reverse()};
  }
  async function submitComment(uid,input) {
    const value=d.commentInput(input),time=now();
    const ref=comments.doc(d.hash(`${uid}:${value.requestId}`));
    const limits=limitRef(uid,'comment');
    const current=value.artId==='table'?await currentDaily():null;
    const art=value.artId!=='table'?await publishedArt(value.artId):null;
    if(value.artId!=='table' && !art)d.fail('not-found','Bu eser artık yayında değil.');
    if(current && (value.tableKey || 'legacy')!==current.tableKey)d.fail('aborted','Günün sorusu değişti. Yeni sofrayı açıp tekrar yaz.');
    const questionText=value.artId==='table'?(current?.daily?.question || ''):(art?.question || '');
    const fingerprint=db.doc(`commentFingerprints/${fingerprintId({uid,artId:value.artId,tableKey:current?.tableKey,question:questionText,text:value.text})}`);
    const initial=await db.runTransaction(async tx=>{
      const [existing,duplicate,previous,deletion]=await Promise.all([tx.get(ref),tx.get(fingerprint),tx.get(limits),tx.get(db.doc(`accountDeletions/${d.hash(uid)}`))]);
      if(deletion.exists)d.fail('failed-precondition','Hesabının silinmesi başlatılmış. Hesabım bölümünden işlemi tamamla.',{reason:'account-deleting'});
      if(existing.exists) {
        const old=existing.data();
        if(old.uid!==uid || old.text!==value.text || old.artId!==value.artId || old.name!==value.name || (old.tableKey || 'legacy')!==(value.tableKey || 'legacy'))d.fail('already-exists','Bu gönderim daha önce kullanılmış.');
        return {id:ref.id,status:old.status,isDuplicate:true};
      }
      if(duplicate.exists && time-duplicate.data().createdAt<86400000)d.fail('resource-exhausted','Bu yorumu bu sohbete zaten bıraktın.',{reason:'duplicate-comment'});
      tx.set(limits,d.rate(previous.data(),time));
      tx.set(fingerprint,{createdAt:time,expiresAt:new Date(time+86400000)});
      const comment={uid,name:value.name,text:value.text,artId:value.artId,status:'pending',question:questionText,createdAt:time};
      if(current){comment.tableKey=current.tableKey;comment.packageDate=current.packageDate;}
      tx.create(ref,comment);
      return {id:ref.id,status:'pending',isDuplicate:false};
    });
    if(initial.isDuplicate) {
      return {id:initial.id,status:initial.status};
    }
    if(!moderationService || !moderationService.isEnabled()) {
      const modResult = { decision: 'unclear', evaluatedAt: time, reason: 'disabled' };
      await db.runTransaction(async tx => {
        const doc = await tx.get(ref);
        if (!doc.exists) return;
        if (doc.data().status === 'pending') {
          tx.update(ref, { moderation: modResult });
        }
      });
      return {id:initial.id,status:'pending'};
    }
    const budgetRef=db.doc(`requestLimits/${d.hash('global:gemini-moderation')}`);
    async function reserveModelCall(){
      try{
        await db.runTransaction(async tx=>{
          const doc=await tx.get(budgetRef);
          tx.set(budgetRef,d.rate(doc.data(),time,{windowMs:3600000,limit:hourlyQuota,minInterval:0}));
        });
        return true;
      }catch{return false;}
    }
    let modResult={decision:'unclear'};
    if(await reserveModelCall()){
      try{
        modResult=await moderationService.evaluateComment({text:value.text,name:value.name,question:questionText,reserveAdditionalCall:reserveModelCall});
      }catch{modResult={decision:'unclear',errorReason:'evaluation-error'};}
    }else{modResult={decision:'unclear',errorReason:'quota-limit'};}
    const targetStatus=modResult.decision==='true'?'approved':(modResult.decision==='false'?'rejected':'pending');
    const finalStatus=await db.runTransaction(async tx=>{
      const doc=await tx.get(ref);
      if(!doc.exists)return 'pending';
      const currentData=doc.data();
      if(currentData.status!=='pending' || currentData.moderatedBy)return currentData.status;
      const patch={
        moderation:{
          decision:modResult.decision || 'unclear',
          model:modResult.model || (moderationService.getModel?moderationService.getModel():'gemini'),
          evaluatedAt:time,
          ...(modResult.policyVersion?{policyVersion:modResult.policyVersion}:{}),
          ...(modResult.verification?{verification:modResult.verification}:{}),
          ...(Number.isSafeInteger(modResult.modelCalls)?{modelCalls:modResult.modelCalls}:{}),
          ...(modResult.errorReason?{errorReason:modResult.errorReason}:{}),
          ...(modResult.reason?{reason:modResult.reason}:{})
        }
      };
      if(targetStatus==='approved'){patch.status='approved';patch.approvedAt=time;patch.autoApproved=true;}
      else if(targetStatus==='rejected'){patch.status='rejected';patch.rejectedAt=time;patch.autoRejected=true;}
      tx.update(ref,patch);
      return targetStatus;
    });
    return {id:ref.id,status:finalStatus};
  }
  async function adminDashboard(input={}) {
    d.object(input,['commentStatus','commentCursor','assetCursor','artworkCursor','packageCursor','date','selectedArtwork','selectedAsset']);
    const status=input.commentStatus || 'all';
    if(!['all','pending','approved','rejected'].includes(status))d.fail('invalid-argument','Yorum durumunu seç.');
    const commentQuery=status==='all'?comments:comments.where('status','==',status);
    const [legacy,commentPage,assetPage,artPage,packagePage,current]=await Promise.all([
      dailyRef.get(),page(commentQuery,pageCursor(input.commentCursor),30),page(db.collection('assets').where('status','==','draft'),pageCursor(input.assetCursor)),
      page(artworks,pageCursor(input.artworkCursor)),page(packages,pageCursor(input.packageCursor)),currentDaily(),
    ]);
    const content=legacy.data() || {};
    let selectedPackage=null;
    if(input.date){const doc=await packages.doc(d.dateKey(input.date)).get();if(doc.exists)selectedPackage={date:doc.id,...doc.data()};}
    const overrides=new Map(artPage.docs.map(doc=>[doc.id,doc.data()]));
    const missing=builtins.filter(a=>!overrides.has(a.id));
    const originals=missing.length?await db.getAll(...missing.map(a=>artworks.doc(a.id))):[];
    originals.forEach(doc=>{if(doc.exists)overrides.set(doc.id,doc.data());});
    const referenced=[...new Set([input.selectedArtwork,current.daily?.artwork,content.draft?.artwork,selectedPackage?.draft?.artwork,selectedPackage?.published?.artwork].filter(Boolean))].filter(id=>!overrides.has(id) && !d.ART_IDS.includes(id));
    if(referenced.length){const docs=await db.getAll(...referenced.map(id=>artworks.doc(d.artId(id,false))));docs.forEach(doc=>{if(doc.exists)overrides.set(doc.id,doc.data());});}
    const artworkList=[...new Set([...builtins.map(a=>a.id),...overrides.keys()])].map(id=>{
      const value=overrides.get(id);return {id,version:value?.version || 0,status:value?.status || 'published',artwork:value?.draft || value?.published || {...builtins.find(a=>a.id===id),assetId:null,rightsConfirmed:true}};
    });
    if(input.selectedAsset){const id=d.resourceId(input.selectedAsset);if(!assetPage.docs.some(doc=>doc.id===id)){const doc=await db.doc(`assets/${id}`).get();if(doc.exists && doc.data().status!=='deleted')assetPage.docs.push(doc);}}
    return {version:content.version || 0,...current,legacyDaily:content.draft || content.published || null,
      comments:commentPage.docs.filter(doc=>status!=='all' || doc.data().status!=='rejected').map(doc=>{
        const data=doc.data(),mod=data.moderation;
        return {
          ...d.publicComment({id:doc.id,...data}),
          status:data.status,
          question:data.question || '',
          packageDate:data.packageDate || null,
          ...(mod?{
            moderation:{
              decision:mod.decision,
              model:mod.model,
              evaluatedAt:mod.evaluatedAt,
              ...(mod.errorReason?{errorReason:mod.errorReason}:{}),
              ...(mod.reason?{reason:mod.reason}:{}),
            }
          }:{})
        };
      }),commentCursor:commentPage.next,
      assets:assetPage.docs.map(doc=>{const a=doc.data();return {id:doc.id,name:a.name,width:a.width,height:a.height,bytes:a.bytes};}),assetCursor:assetPage.next,
      artworks:artworkList,artworkCursor:artPage.next,
      packages:packagePage.docs.map(doc=>({date:doc.id,...doc.data()})),packageCursor:packagePage.next,selectedPackage,serverDate:d.istanbulDay(now())};
  }
  async function generateEditorial(uid, input) {
    const value = d.editorialInput(input);
    const time = now();
    const adminLimits = db.doc(`requestLimits/${d.hash(`${uid}:editorial`)}`);
    const globalLimits = db.doc(`requestLimits/${d.hash('global:gemini-editorial')}`);
    const cacheRef = db.doc(`editorialDrafts/${d.hash(`${uid}:${value.requestId}`)}`);

    const cached = await cacheRef.get();
    if (cached.exists) {
      const data = cached.data();
      if (data.type === value.type && time - (data.createdAt || 0) < 300000) {
        return { draft: data.draft, type: value.type, cached: true };
      }
    }

    if (!editorialService || !editorialService.isEnabled()) {
      d.fail('failed-precondition', 'Editoryal AI servisi şu an etkin değil.');
    }

    await db.runTransaction(async tx => {
      const [adminDoc, globalDoc] = await Promise.all([tx.get(adminLimits), tx.get(globalLimits)]);
      tx.set(adminLimits, d.rate(adminDoc.data(), time, { windowMs: 60000, limit: 10, minInterval: 1500 }));
      tx.set(globalLimits, d.rate(globalDoc.data(), time, { windowMs: 3600000, limit: editorialHourlyQuota, minInterval: 0 }));
    });

    let result;
    try {
      result = await editorialService.generateDraft({ type: value.type, context: value.context });
    } catch {
      result = { draft: null, errorReason: 'evaluation-error' };
    }

    if (!result?.draft) {
      if (result?.errorReason === 'quota-exceeded') {
        d.fail('resource-exhausted', 'Editoryal AI saatlik kotası doldu. Elle yazmaya devam edebilirsin.');
      }
      if (result?.errorReason === 'length-exceeded') {
        d.fail('invalid-argument', 'Öneri metni hedef alan sınırını aştı. Elle yazmaya devam edebilirsin.', { reason: 'editorial-length-exceeded' });
      }
      d.fail('unavailable', 'Öneri şu an üretilemedi. Elle yazmaya devam edebilirsin.');
    }

    try {
      await cacheRef.set({
        draft: result.draft,
        type: value.type,
        uid,
        createdAt: time,
        expiresAt: new Date(time + 300000)
      });
    } catch {}

    return { draft: result.draft, type: value.type };
  }

  async function manageContent(uid,input) {
    if (input && input.operation === 'generateEditorial') {
      return await generateEditorial(uid, input);
    }
    d.object(input,['operation','daily','version','commentId','status','date','id','artwork','assetId','type','context','requestId']);
    const time=now(),limits=limitRef(uid,'manage');
    if(['deleteAsset','restoreAsset'].includes(input.operation)) {
      d.object(input,['operation','assetId']);
      const assetId=d.resourceId(input.assetId),ref=db.doc(`assets/${assetId}`);
      return db.runTransaction(async tx=>{
        const [asset,previous,drafts,published]=await Promise.all([
          tx.get(ref),tx.get(limits),tx.get(artworks.where('draft.assetId','==',assetId).limit(1)),tx.get(artworks.where('published.assetId','==',assetId).limit(1)),
        ]);
        if(!asset.exists)d.fail('not-found','Görsel bulunamadı.');
        const deleting=input.operation==='deleteAsset';
        if(deleting && (drafts.size || published.size))d.fail('failed-precondition','Bu görsel bir eserde kullanılıyor. Önce eserin görselini değiştir.',{reason:'asset-in-use'});
        const status=deleting?'deleted':'draft';
        if(asset.data().status===status)return {assetId,status};
        tx.set(limits,d.rate(previous.data(),time,{windowMs:60000,limit:30,minInterval:500}));
        // Reversible removal. Bytes remain private; no destructive Storage action.
        tx.update(ref,{status,deletedAt:deleting?time:null,deletedBy:deleting?uid:null});
        return {assetId,status};
      });
    }
    if(['saveDaily','publishDaily','savePackage','schedulePackage','unschedulePackage'].includes(input.operation)) {
      const dated=input.operation.endsWith('Package');
      d.object(input,dated?['operation','daily','version','date']:['operation','daily','version']);
      const date=dated?d.dateKey(input.date):null;
      if(input.operation==='schedulePackage' && date<d.istanbulDay(time))d.fail('invalid-argument','Geçmiş bir güne yayın planlayamazsın.');
      const daily=input.operation==='unschedulePackage'?null:d.dailyInput(input.daily),expected=d.version(input.version);
      const ref=dated?packages.doc(date):dailyRef;
      return db.runTransaction(async tx=>{
        const [current,previous,work]=await Promise.all([tx.get(ref),tx.get(limits),daily?tx.get(artworks.doc(daily.artwork)):Promise.resolve(null)]);
        const content=current.data() || {};
        if((content.version || 0)!==expected)d.fail('aborted','İçerik başka bir oturumda değişti. Masayı yeniden aç.');
        const publishing=['publishDaily','schedulePackage'].includes(input.operation);
        if(daily && (work?.exists?work.data().status!=='published':!d.ART_IDS.includes(daily.artwork)))d.fail('failed-precondition','Önce seçtiğin eseri galeriye yayınla.');
        const patch={version:expected+1,updatedAt:time,updatedBy:uid};
        if(daily)patch.draft=daily;
        if(dated){patch.date=date;if(!content.status)patch.status='draft';}
        if(publishing){patch.published=daily;if(dated){patch.status='scheduled';patch.scheduledAt=time;}else patch.publishedAt=time;}
        if(input.operation==='unschedulePackage'){patch.status='draft';patch.published=null;}
        tx.set(limits,d.rate(previous.data(),time,{windowMs:60000,limit:30,minInterval:500}));
        tx.set(ref,patch,{mergeFields:Object.keys(patch)});
        return {version:expected+1,daily,published:publishing,date};
      });
    }
    if(['saveArtwork','publishArtwork','unpublishArtwork'].includes(input.operation)) {
      d.object(input,['operation','id','version','artwork']);
      const id=input.id?d.artId(input.id,false):`art-${randomUUID()}`;
      const value=input.operation==='unpublishArtwork'?null:d.artworkInput(input.artwork);
      const ref=artworks.doc(id),expected=d.version(input.version);
      return db.runTransaction(async tx=>{
        const [current,previous,asset]=await Promise.all([tx.get(ref),tx.get(limits),value?.assetId?tx.get(db.doc(`assets/${value.assetId}`)):Promise.resolve(null)]);
        const record=current.data() || {};
        if((record.version || 0)!==expected)d.fail('aborted','Eser başka bir oturumda değişti. Yeniden aç.');
        if(value?.assetId && (!asset?.exists || asset.data().status==='deleted'))d.fail('not-found','Yüklediğin görsel bulunamadı.');
        if(value && !value.assetId && !d.ART_IDS.includes(id))d.fail('invalid-argument','Bir görsel seç.');
        const patch={version:expected+1,updatedAt:time,updatedBy:uid,createdAt:record.createdAt || time,status:record.status || 'draft'};
        if(value)patch.draft=value;
        if(input.operation==='publishArtwork'){patch.published={...value,imageVersion:expected+1};patch.status='published';}
        if(input.operation==='unpublishArtwork')patch.status='hidden';
        tx.set(limits,d.rate(previous.data(),time,{windowMs:60000,limit:30,minInterval:500}));
        tx.set(ref,patch,{mergeFields:Object.keys(patch)});
        return {id,version:expected+1,status:patch.status};
      });
    }
    if(input.operation==='moderateComment') {
      d.object(input,['operation','commentId','status']);const id=d.resourceId(input.commentId);
      if(!['approved','rejected'].includes(input.status))d.fail('invalid-argument','Yorum kararı uygun değil.');
      const ref=comments.doc(id);
      return db.runTransaction(async tx=>{
        const [comment,previous]=await Promise.all([tx.get(ref),tx.get(limits)]);
        if(!comment.exists)d.fail('not-found','Yorum bulunamadı.');
        tx.set(limits,d.rate(previous.data(),time,{windowMs:60000,limit:60,minInterval:200}));
        tx.update(ref,{status:input.status,moderatedAt:time,moderatedBy:uid});return {id,status:input.status};
      });
    }
    d.fail('invalid-argument','Bu işlem bulunamadı.');
  }
  async function reserveUpload(uid) {
    const ref=limitRef(uid,'upload'),time=now();
    await db.runTransaction(async tx=>{const doc=await tx.get(ref);tx.set(ref,d.rate(doc.data(),time,{windowMs:3600000,limit:12,minInterval:3000}));});
  }
  async function checkAssetUpload(uid,id,contentHash,name,bytes) {
    const doc=await db.doc(`assets/${d.resourceId(id)}`).get();
    if(!doc.exists)return null;
    const existing=doc.data();
    if(existing.status==='deleted')d.fail('already-exists','Bu görsel kimliği daha önce kullanılmış ve silinmiş.',{reason:'asset-deleted'});
    if(existing.createdBy!==uid)d.fail('permission-denied','Bu görsel kimliği başka bir yöneticiye ait.',{reason:'asset-ownership-conflict'});
    if((existing.contentHash && existing.contentHash!==contentHash) || existing.name!==name || existing.bytes!==bytes) {
      d.fail('already-exists','Bu yükleme kimliği farklı bir görsel veya içerikle kullanılmış.',{reason:'asset-content-mismatch'});
    }
    return {id,name:existing.name,width:existing.width,height:existing.height,bytes:existing.bytes};
  }
  async function saveAsset(uid,{id,buffer,name,width,height,contentHash,storageGeneration}) {
    const storagePath=`artworks/${id}.webp`;
    await db.doc(`assets/${id}`).create({
      storagePath,
      name,
      width,
      height,
      bytes:buffer.length,
      contentHash:contentHash || d.hash(buffer),
      ...(storageGeneration?{storageGeneration}:{}),
      status:'draft',
      createdBy:uid,
      createdAt:now()
    });
    return {id,storagePath};
  }
  async function uploadArtwork(uid, data, options = {}) {
    const bucket = options.bucket;
    if (!bucket) throw new Error('Storage bucket is required for uploadArtwork');
    const prepImage = options.prepareImage || require('./uploads.cjs').prepareImage;
    const toPath = options.storagePath || require('./uploads.cjs').storagePath;

    const image = await prepImage(data);
    const contentHash = d.hash(image.buffer);
    const id = (data?.uploadId && typeof data.uploadId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.uploadId))
      ? data.uploadId
      : randomUUID();

    const existing = await checkAssetUpload(uid, id, contentHash, image.name, image.buffer.length);
    if (existing) return existing;

    await reserveUpload(uid);

    const path = toPath(`artworks/${id}.webp`);
    const file = bucket.file(path);
    let writtenGeneration = null;

    try {
      await file.save(image.buffer, {
        resumable: false,
        validation: 'crc32c',
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: 'image/webp',
          cacheControl: 'private, no-store',
          metadata: { contentHash, owner: uid }
        }
      });
      try {
        const [meta] = await file.getMetadata();
        writtenGeneration = meta?.generation ?? null;
      } catch {
        // Transient error reading metadata immediately after save; writtenGeneration stays null
      }
    } catch (err) {
      const isPreconditionFailed = err?.code === 412 || err?.status === 412 ||
        String(err?.message || '').includes('PreconditionFailed') ||
        String(err?.message || '').includes('conditionNotMet');

      if (isPreconditionFailed) {
        const retryCheck = await checkAssetUpload(uid, id, contentHash, image.name, image.buffer.length);
        if (retryCheck) return retryCheck;

        try {
          const [existingMeta] = await file.getMetadata();
          const objMeta = existingMeta.metadata || {};

          if (objMeta.owner !== uid) {
            d.fail('permission-denied', 'Bu görsel kimliği başka bir yöneticiye ait veya sahipliği doğrulanamadı.', { reason: 'asset-ownership-conflict' });
          }
          if (objMeta.contentHash !== contentHash || (existingMeta.size && Number(existingMeta.size) !== image.buffer.length)) {
            d.fail('already-exists', 'Bu yükleme kimliği farklı bir görsel veya içerikle kullanılmış.', { reason: 'asset-content-mismatch' });
          }
          writtenGeneration = existingMeta.generation;
        } catch (metaErr) {
          if (metaErr instanceof d.DomainError) throw metaErr;
          throw err;
        }
      } else {
        throw err;
      }
    }

    try {
      await saveAsset(uid, { id, ...image, contentHash, storageGeneration: writtenGeneration });
    } catch (error) {
      if (error instanceof d.DomainError || error?.code === 'already-exists' || error?.code === 'permission-denied') {
        throw error;
      }
      let reconciled = null;
      let reconcileFailed = false;
      try {
        reconciled = await checkAssetUpload(uid, id, contentHash, image.name, image.buffer.length);
      } catch (checkErr) {
        if (checkErr instanceof d.DomainError) throw checkErr;
        reconcileFailed = true;
      }

      if (reconciled) {
        return reconciled;
      }

      if (reconcileFailed) {
        throw error;
      }

      if (writtenGeneration !== null) {
        await file.delete({ ifGenerationMatch: writtenGeneration }).catch(() => {});
      }
      throw error;
    }

    return { id, name: image.name, width: image.width, height: image.height, bytes: image.buffer.length };
  }
  async function assetInfo(id) {const doc=await db.doc(`assets/${d.resourceId(id)}`).get();if(!doc.exists || doc.data().status==='deleted')d.fail('not-found','Görsel bulunamadı.');return doc.data();}
  async function publishedImage(id) {
    const doc=await artworks.doc(d.artId(id,false)).get(),record=doc.data();
    if(record?.status!=='published' || !record.published?.assetId)d.fail('not-found','Görsel bulunamadı.');
    return assetInfo(record.published.assetId);
  }
  return {getPublicContent,submitComment,adminDashboard,manageContent,reserveUpload,checkAssetUpload,saveAsset,uploadArtwork,assetInfo,publishedImage,currentDaily,generateEditorial};
}
module.exports={createContentService};
