const d = require('./domain.cjs');
const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = ['image/jpeg','image/png','image/webp'];

function decodeUpload(input) {
  d.object(input,['name','contentType','dataBase64','uploadId']);
  const name=d.text(input.name,1,100);
  if(input.uploadId!==undefined && input.uploadId!==null) {
    if(typeof input.uploadId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.uploadId)) {
      d.fail('invalid-argument','Geçersiz yükleme kimliği.');
    }
  }
  if(!TYPES.includes(input.contentType) || typeof input.dataBase64!=='string' ||
      input.dataBase64.length>Math.ceil(MAX_BYTES/3)*4 ||
      input.dataBase64.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.dataBase64)) {
    d.fail('invalid-argument','En fazla 20 MB boyutunda JPEG, PNG veya WebP seç.');
  }
  const buffer=Buffer.from(input.dataBase64,'base64');
  if(!buffer.length || buffer.length>MAX_BYTES)d.fail('invalid-argument','Görsel boyutu uygun değil.');
  if(buffer.toString('base64')!==input.dataBase64)d.fail('invalid-argument','Görsel verisi uygun değil.');
  const actual=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':
    buffer[0]===255 && buffer[1]===216 && buffer[2]===255?'image/jpeg':
      buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  if(actual!==input.contentType)d.fail('invalid-argument','Dosyanın içeriği görsel türüyle uyuşmuyor.');
  return {buffer,name,uploadId:input.uploadId||null};
}

async function prepareImage(input) {
  const {buffer,name,uploadId}=decodeUpload(input);
  const sharp=require('sharp');
  try {
    const image=sharp(buffer,{limitInputPixels:40_000_000,animated:false,failOn:'warning'});
    const metadata=await image.metadata();
    if(!metadata.width || !metadata.height || metadata.width>6000 || metadata.height>6000 || (metadata.pages || 1)>1) {
      d.fail('invalid-argument','Tek kareli ve en fazla 6000 piksel genişliğinde/yüksekliğinde bir görsel seç.');
    }
    const {data,info}=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
    if(data.length>MAX_BYTES)d.fail('invalid-argument','Daha küçük bir görsel seç.');
    return {buffer:data,name,width:info.width,height:info.height,uploadId};
  } catch(error) {
    if(error instanceof d.DomainError)throw error;
    d.fail('invalid-argument','Görsel açılamadı. Başka bir dosya seç.');
  }
}
function storagePath(value) {
  if(typeof value!=='string' || !/^artworks\/[0-9a-f-]{36}\.webp$/.test(value))d.fail('not-found','Görsel bulunamadı.');
  return value;
}
module.exports={MAX_BYTES,decodeUpload,prepareImage,storagePath};
