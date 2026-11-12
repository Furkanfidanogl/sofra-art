const { randomUUID } = require('node:crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { requireUser, requireAdmin, verifyCallableAuth } = require('./authorization.cjs');
const { createContentService } = require('./content-service.cjs');
const { createModerationService } = require('./moderation.cjs');
const { createEditorialService } = require('./editorial.cjs');
const { createPrivacyService } = require('./privacy.cjs');
const d = require('./domain.cjs');
const { DomainError, object, resourceId } = d;
const { prepareImage, storagePath } = require('./uploads.cjs');

const geminiApiKey = defineSecret('GEMINI_API_KEY');

if(!getApps().length)initializeApp();
let service;
const content=()=>service ||= createContentService({
  db:getFirestore(),
  moderationService:createModerationService({
    apiKey:()=>process.env.GEMINI_API_KEY || (geminiApiKey?geminiApiKey.value():''),
    model:process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  }),
  editorialService:createEditorialService({
    apiKey:()=>process.env.GEMINI_API_KEY || (geminiApiKey?geminiApiKey.value():''),
    model:process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  }),
});
const EXPECTED_APP_ID='1:449977598604:web:17dcbd3c9665e0413eb1a9';
const options={region:'europe-west1',serviceAccount:'sofra-runtime@sofra-512816.iam.gserviceaccount.com',enforceAppCheck:true,maxInstances:2,minInstances:0,
  invoker:'public',concurrency:20,timeoutSeconds:30,memory:'256MiB',cors:['https://sofra-art.netlify.app']};

function secured(name,kind,handler,extra={}) {
  return onCall({...options,...extra},async request=>{
    try {
      if(request.app?.appId!==EXPECTED_APP_ID)throw new HttpsError('unauthenticated','Sofra bağlantısını yenileyip tekrar dene.');
      const uid=await verifyCallableAuth(kind,request.rawRequest?.headers?.authorization,{getAuth,HttpsError});
      return await handler(uid,request.data,request.auth?.token);
    } catch(error) {
      if(error instanceof HttpsError)throw error;
      if(error instanceof DomainError)throw new HttpsError(error.code,error.message,error.details);
      if(typeof error.code==='string' && error.code.startsWith('auth/'))throw new HttpsError('unauthenticated','Oturumunu yeniden açıp dene.');
      const requestId=randomUUID();
      console.error('Sofra operation failed',{operation:name,requestId});
      throw new HttpsError('internal','İşlem şu an tamamlanamıyor. Birazdan yeniden dene.',{requestId});
    }
  });
}

exports.getPublicContent=secured('getPublicContent','public',(_,data)=>content().getPublicContent(data));
exports.submitComment=secured('submitComment','user',(uid,data)=>content().submitComment(uid,data),{secrets:[geminiApiKey]});
exports.getAdminDashboard=secured('getAdminDashboard','admin',(_,data)=>content().adminDashboard(data));
exports.manageContent=secured('manageContent','admin',(uid,data)=>content().manageContent(uid,data),{secrets:[geminiApiKey]});
exports.generateEditorial=secured('generateEditorial','admin',(uid,data)=>content().generateEditorial(uid,data),{secrets:[geminiApiKey]});
exports.manageMyData=secured('manageMyData','user',(uid,data,token)=>createPrivacyService({db:getFirestore()}).manage(uid,data,token));
exports.uploadArtwork=secured('uploadArtwork','admin',async(uid,data)=>{
  const bucket=getStorage().bucket(process.env.SOFRA_STORAGE_BUCKET || 'sofra-512816.firebasestorage.app');
  return await content().uploadArtwork(uid,data,{bucket});
},{memory:'1GiB',concurrency:1,maxInstances:2,timeoutSeconds:120});
exports.getArtwork=secured('getArtwork','admin',async(_,data)=>{
  object(data,['id']);const id=resourceId(data.id);
  const asset=await content().assetInfo(id);
  const file=getStorage().bucket(process.env.SOFRA_STORAGE_BUCKET || 'sofra-512816.firebasestorage.app').file(storagePath(asset.storagePath));
  const [buffer]=await file.download();
  return {contentType:'image/webp',dataBase64:buffer.toString('base64')};
});

// Publication gateway: only the sanitized image of a currently published work.
// Storage stays private. No asset ID, draft preview or download token is public.
exports.publicArtwork=onRequest({region:'europe-west1',serviceAccount:options.serviceAccount,invoker:'public',
  maxInstances:2,minInstances:0,timeoutSeconds:30,memory:'256MiB',cors:['https://sofra-art.netlify.app']},async(req,res)=>{
  res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
  if(!['GET','HEAD'].includes(req.method)){res.status(405).set('Allow','GET, HEAD').end();return;}
  try {
    const asset=await content().publishedImage(req.query.id);
    const [buffer]=await getStorage().bucket(process.env.SOFRA_STORAGE_BUCKET || 'sofra-512816.firebasestorage.app').file(storagePath(asset.storagePath)).download();
    res.set('Content-Type','image/webp');res.status(200).send(buffer);
  }catch(error){res.status(error instanceof DomainError?404:503).end();}
});
