// Reproducible static asset compression, using the backend's existing sharp dependency.
// Run after changing a bundled source image; commit the generated assets and manifest.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),sharp=createRequire(path.join(root,'functions/package.json'))('sharp');
const originals=['moon-terrace.webp','quiet-lake.jpg','wanderer.webp','cat.jpg','forest.jpg','night-sky.jpg'];
const heroSizes='(max-width: 380px) calc(100vw - 30px), (max-width: 760px) calc(100vw - 40px), (max-width: 1100px) calc(100vw - 64px), (max-width: 1376px) calc(100vw - 96px), 1280px';
(async()=>{
  const output=path.join(root,'public/images/optimized');fs.mkdirSync(output,{recursive:true});
  const manifest={},keep=new Set();let originalBytes=0,largestBytes=0;
  for(const file of originals){
    const bytes=fs.readFileSync(path.join(root,'public/images',file));originalBytes+=bytes.length;
    const sourceHash=createHash('sha256').update(bytes).digest('hex'),meta=await sharp(bytes).metadata();
    const widths=[...new Set([96,320,640,960,Math.min(1280,meta.width)].filter(w=>w<=meta.width))].sort((a,b)=>a-b),sources=[];
    for(const width of widths){
      const name=`${path.parse(file).name}-${sourceHash.slice(0,10)}-q80-${width}.webp`;
      const {data,info}=await sharp(bytes).rotate().resize({width,withoutEnlargement:true}).webp({quality:80,effort:4}).toBuffer({resolveWithObject:true});
      fs.writeFileSync(path.join(output,name),data);keep.add(name);sources.push({src:'/images/optimized/'+name,width:info.width,height:info.height,bytes:data.length});
    }
    largestBytes+=sources.at(-1).bytes;manifest['/images/'+file]={sourceHash,sources};
  }
  for(const file of fs.readdirSync(output))if(!keep.has(file)&&/^[\w-]+\.webp$/.test(file))fs.unlinkSync(path.join(output,file));
  fs.writeFileSync(path.join(root,'src/image-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const hero=manifest['/images/moon-terrace.webp'].sources;
  const preload=`<link rel="preload" as="image" href="${hero.at(-1).src}" imagesrcset="${hero.map(s=>`${s.src} ${s.width}w`).join(', ')}" imagesizes="${heroSizes}" type="image/webp" fetchpriority="high" />`;
  const htmlPath=path.join(root,'index.html'),html=fs.readFileSync(htmlPath,'utf8');
  fs.writeFileSync(htmlPath,html.replace(/<link rel="preload" as="image"[^>]*>/,preload));
  console.log(JSON.stringify({images:originals.length,variants:keep.size,originalBytes,largestVariantBytes:largestBytes}));
})().catch(()=>{console.error('IMAGE_OPTIMIZATION_FAILED');process.exitCode=1;});
