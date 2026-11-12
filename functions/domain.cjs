const { createHash } = require('node:crypto');

class DomainError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const fail = (code, message, details) => { throw new DomainError(code, message, details); };
const ART_IDS = ['moon','lake','wanderer','cat','forest','sky'];
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const hash = value => createHash('sha256').update(value).digest('hex');

function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) fail('invalid-argument','Gönderilen alanlar uygun değil.');
  return value;
}
function text(value, min, max) {
  if (typeof value !== 'string') fail('invalid-argument','Metin alanlarını kontrol et.');
  const result = value.normalize('NFC').trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(result)) {
    fail('invalid-argument','Metin uzunluğunu kontrol et.');
  }
  return result;
}
function artId(value, table = true) {
  if (!ART_IDS.includes(value) && !/^art-[0-9a-f-]{36}$/.test(value || '') && !(table && value === 'table')) fail('invalid-argument','Bu oda bulunamadı.');
  return value;
}
function resourceId(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) fail('invalid-argument','Kayıt bulunamadı.');
  return value;
}
function commentInput(input) {
  object(input,['artId','name','text','requestId','tableKey']);
  const result = {artId:artId(input.artId),name:text(input.name,2,32),text:text(input.text,1,500),requestId:resourceId(input.requestId)};
  if(input.tableKey!==undefined)result.tableKey=resourceId(input.tableKey);
  if (!result.text.replace(/[\p{White_Space}\p{Cf}\p{M}]/gu,'')) fail('invalid-argument','Görünür bir yorum veya emoji yaz.');
  return result;
}
function dailyInput(input) {
  object(input,['quote','question','artwork','songTitle','spotifyUrl']);
  const result={quote:text(input.quote,1,180),question:text(input.question,1,160),artwork:artId(input.artwork,false),songTitle:text(input.songTitle,1,70)};
  if(input.spotifyUrl)result.spotifyUrl=spotifyUrl(input.spotifyUrl);
  return result;
}
function spotifyUrl(value) {
  try {
    if(typeof value!=='string' || value.length>2048)throw Error();
    const url=new URL(value.trim());
    const match=url.pathname.match(/^(?:\/intl-[a-zA-Z]{2}(?:-[a-zA-Z]{2})?)?\/track\/([A-Za-z0-9]{22})\/?$/);
    if(url.origin!=='https://open.spotify.com' || url.username || url.password || !match)throw Error();
    return `https://open.spotify.com/track/${match[1]}`;
  }catch{fail('invalid-argument','Yalnızca tek bir Spotify şarkısının bağlantısını ekleyebilirsin.',{field:'spotifyUrl'});}
}
function dateKey(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T00:00:00Z')) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('invalid-argument','Geçerli bir tarih seç.');
  return value;
}
const istanbulDay=time=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
function artworkInput(input) {
  object(input,['title','description','alt','mood','tag','credit','source','question','assetId','rightsConfirmed']);
  if(!['calm','dream','smile','thought'].includes(input.mood))fail('invalid-argument','Bir oda seç.');
  if(input.rightsConfirmed!==true)fail('invalid-argument','Görselin kullanım hakkını doğrula.');
  let source=null;
  if(input.source){try{const url=new URL(text(input.source,1,500));if(url.protocol!=='https:' || url.username || url.password)throw Error();source=url.href;}catch{fail('invalid-argument','Kaynak için HTTPS bağlantısı kullan.');}}
  return {title:text(input.title,1,100),description:text(input.description,1,1200),alt:text(input.alt,1,240),mood:input.mood,tag:text(input.tag,1,60),credit:text(input.credit,1,240),source,question:text(input.question,1,160),assetId:input.assetId?resourceId(input.assetId):null,rightsConfirmed:true};
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('invalid-argument','İçeriği yeniden açıp dene.');
  return value;
}
function rate(previous, now, {windowMs=3600000,limit=20,minInterval=20000}={}) {
  const state = previous && now-previous.windowStart < windowMs ? previous : {windowStart:now,count:0,lastAt:0};
  if ((state.count && now-state.lastAt < minInterval) || state.count >= limit) {
    const until=state.count>=limit?state.windowStart+windowMs:state.lastAt+minInterval;
    fail('resource-exhausted','Biraz hızlı ilerliyoruz. Bekleyip yeniden dene.',{reason:'rate-limit',retryAfterSeconds:Math.max(1,Math.ceil((until-now)/1000))});
  }
  return {windowStart:state.windowStart,count:state.count+1,lastAt:now,expiresAt:new Date(now+Math.max(86400000,windowMs))};
}
const MODERATION_DECISIONS = ['true', 'false', 'unclear'];
function moderationDecision(value) {
  if (!MODERATION_DECISIONS.includes(value)) fail('invalid-argument', 'Moderasyon kararı uygun değil.');
  return value;
}
const EDITORIAL_TYPES = ['note', 'question', 'description'];
const EDITORIAL_LIMITS = Object.freeze({
  note: Object.freeze({ min: 3, max: 180 }),
  question: Object.freeze({ min: 3, max: 160 }),
  description: Object.freeze({ min: 3, max: 1200 })
});
function editorialInput(input) {
  object(input, ['type', 'context', 'requestId', 'operation']);
  if (!EDITORIAL_TYPES.includes(input.type)) fail('invalid-argument', 'Editoryal taslak türü uygun değil.');
  const result = {
    type: input.type,
    requestId: resourceId(input.requestId),
    context: {}
  };
  if (input.context !== undefined && input.context !== null) {
    object(input.context, ['title', 'room', 'theme', 'seed']);
    if (input.context.title) result.context.title = text(input.context.title, 1, 100);
    if (input.context.room) result.context.room = text(input.context.room, 1, 50);
    if (input.context.theme) result.context.theme = text(input.context.theme, 1, 100);
    if (input.context.seed) result.context.seed = text(input.context.seed, 1, 150);
  }
  return result;
}
function publicComment({id,name,text,artId,createdAt}) { return {id,name,text,artId,createdAt}; }

module.exports = {DomainError,fail,object,text,artId,resourceId,commentInput,dailyInput,version,rate,hash,publicComment,ART_IDS,dateKey,istanbulDay,artworkInput,spotifyUrl,MODERATION_DECISIONS,moderationDecision,EDITORIAL_TYPES,EDITORIAL_LIMITS,editorialInput};
