const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
function canonicalText(value){return String(value).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF\u00AD]/g,'').toLocaleLowerCase('tr').replace(/\s+/gu,' ').trim();}
function fingerprintId({uid,artId,tableKey,question,text}){
  return hash(JSON.stringify(['comment-v2',uid,artId,tableKey||null,question||'',canonicalText(text)]));
}
function legacyFingerprintId(uid,text){return hash(`${uid}:${text.toLocaleLowerCase('tr').replace(/\s+/g,' ')}`);}
module.exports={canonicalText,fingerprintId,legacyFingerprintId};
