import { backendEnabled, callFunction } from './firebase.js';
export { backendEnabled };
export const getPublicContent = (artId,catalogCursor) => callFunction('getPublicContent',{artId,...(catalogCursor?{catalogCursor}:{})});
export const getAdminDashboard = (options={}) => callFunction('getAdminDashboard',options);
export const submitComment = value => callFunction('submitComment',value);
export const manageContent = value => callFunction('manageContent',value);
export const generateEditorial = (type, context = {}, requestId = null) => callFunction('generateEditorial', { type, context, ...(requestId ? { requestId } : {}) });
export const manageMyData = value => callFunction('manageMyData', value);

export async function uploadArtwork(file, uploadId = null) {
  if(file?.size>20*1024*1024)throw Object.assign(new Error('IMAGE_TOO_LARGE'),{code:'upload/file-too-large'});
  if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) {
    throw Object.assign(new Error('INVALID_IMAGE'),{code:'functions/invalid-argument'});
  }
  const id = uploadId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null);
  const dataBase64=await new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=()=>reject(new Error('FILE_UNREADABLE'));
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);
  });
  return callFunction('uploadArtwork',{name:file.name,contentType:file.type,dataBase64,...(id?{uploadId:id}:{})});
}
export async function getArtworkUrl(id) {
  const value=await callFunction('getArtwork',{id});
  if(value.contentType!=='image/webp' || typeof value.dataBase64!=='string')throw new Error('INVALID_IMAGE_RESPONSE');
  return `data:image/webp;base64,${value.dataBase64}`;
}
export function backendErrorMessage(error) {
  if(error?.details?.reason==='duplicate-comment')return 'Bu yorumu bu sohbete zaten bıraktın.';
  if(error?.details?.reason==='rate-limit'){const seconds=Number(error.details.retryAfterSeconds);return Number.isFinite(seconds)&&seconds>0?`Biraz hızlı ilerliyoruz. ${Math.ceil(seconds)} saniye sonra yeniden dene.`:'Biraz bekleyip yeniden dene.';}
  if(error?.details?.reason==='account-deleting')return 'Hesabının silinmesi başlatılmış. Hesabım bölümünden işlemi tamamla.';
  if(error?.details?.reason==='recent-login-required')return 'Hesabını silmeden önce Google ile yeniden doğrula.';
  if(error?.details?.reason==='admin-account')return 'Yönetici hesabını silmeden önce yönetimi devretmelisin.';
  if(error?.code==='functions/invalid-argument' && error?.details?.field==='spotifyUrl')return 'Yalnızca tek bir Spotify şarkısının bağlantısını ekleyebilirsin.';
  if(error?.code==='functions/failed-precondition' && error?.details?.reason==='asset-in-use')return 'Bu görsel bir eserde kullanılıyor. Silmek için önce eserin görselini değiştir.';
  if(error?.code==='functions/invalid-argument' && error?.details?.reason==='editorial-length-exceeded')return 'Öneri metni hedef alan sınırını aştı. Elle yazmaya devam edebilirsin.';
  return ({
    'upload/file-too-large':'En fazla 20 MB boyutunda bir görsel seç.',
    'appCheck/recaptcha-error':'Bağlantıyı doğrulayamadık. Sayfayı yenileyip yeniden dene.',
    'appCheck/fetch-network-error':'Sofra bağlantısı şu an kurulamıyor. Birazdan yeniden dene.',
    'functions/unauthenticated':'Oturumunu yeniden açıp dene.',
    'functions/permission-denied':'Bu işlem için yönetici hesabıyla giriş yapmalısın.',
    'functions/resource-exhausted':'Şu an işlem sınırına ulaştık. Birazdan yeniden dene.',
    'functions/invalid-argument':'Alanları ve dosya türünü kontrol edip yeniden dene.',
    'functions/aborted':'İçerik başka bir oturumda değişti. Masayı yeniden açıp dene.',
    'functions/already-exists':'Bu gönderim daha önce kullanılmış. Pencereyi yeniden açıp dene.',
    'functions/not-found':'Bu kayıt artık kullanılamıyor. Listeyi yenileyip yeniden dene.',
    'functions/failed-precondition':'Önce seçtiğin eseri galeriye yayınla.',
    'functions/unavailable':'Sofra bağlantısı şu an kurulamıyor. Birazdan yeniden dene.',
    'functions/deadline-exceeded':'Bağlantı yavaşladı. Birazdan yeniden dene.',
  })[error?.code] || 'Sofraya şu an bağlanamadık. Birazdan yeniden deneyebilirsin.';
}
