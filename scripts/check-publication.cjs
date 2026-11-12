// Public-source boundary: inspect tracked/new nonignored files without reading secrets.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const rootFiles=new Set(['.env.example','.firebaserc','.gitignore','.nvmrc','README.md','SECURITY.md','firebase.emulators.json','firebase.json','firestore.indexes.json','firestore.rules','index.html','netlify.toml','package-lock.json','package.json','storage.rules','vite.config.js']);
const documents=new Set(['README.md','SECURITY.md','docs/ASSETS.md','docs/OPERATIONS.md','docs/PRODUCTION_GO_LIVE.md']);
const screenshots=new Set(['docs/screenshots/home.png','docs/screenshots/gallery.png','docs/screenshots/account.png']);
function allowedFile(file){
  const parts=file.split('/');
  if(parts.some(p=>/^(?:reports|private-archive|scratch|qa|\.firebase|\.netlify|\.openai|\.codex|\.agents|node_modules|dist)$/i.test(p)))return false;
  if(/(?:^|\/)(?:\.env(?:\..*)?|[^/]*(?:credentials?|service[-_]?account|client_secret)[^/]*\.json)$/i.test(file)&&file!=='.env.example')return false;
  if(/\.(?:key|pem|p12|pfx|bundle|zip|log|jsonl|bak|sqlite|db)$/i.test(file))return false;
  if(/\.md$/i.test(file))return documents.has(file);
  if(parts.length===1)return rootFiles.has(file);
  if(file.startsWith('docs/'))return screenshots.has(file);
  if(file.startsWith('.github/'))return file==='.github/workflows/quality.yml';
  if(file.startsWith('src/'))return /\.(?:js|json|css)$/.test(file);
  if(file.startsWith('functions/'))return /\.(?:cjs|json)$/.test(file);
  if(file.startsWith('scripts/'))return /\.(?:cjs|py)$/.test(file);
  if(file.startsWith('checks/')||file.startsWith('integration/'))return /\.(?:js|cjs|json)$/.test(file);
  if(file.startsWith('public/'))return /\.(?:html|css|svg|txt|xml|woff2|webp|jpg|png|wav|m4a)$/.test(file);
  return file==='netlify/functions/.gitkeep';
}
function checkPublication(){
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const actual=[...new Set(files)].filter(file=>fs.existsSync(path.join(root,file)));
  const rejected=actual.filter(file=>!allowedFile(file)||fs.lstatSync(path.join(root,file)).isSymbolicLink());
  if(rejected.length)throw new Error('PUBLICATION_REVIEW_REQUIRED: '+rejected.join(', '));
  for(const file of [...documents,...screenshots])if(!actual.includes(file))throw new Error('MISSING_PUBLIC_ASSET: '+file);
  for(const file of documents){
    const text=fs.readFileSync(path.join(root,file),'utf8');
    for(const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
      const target=match[1];if(/^(?:https?:|#)/.test(target))continue;
      const resolved=path.resolve(path.dirname(path.join(root,file)),target.split('#')[0]);
      if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved))throw new Error('BROKEN_DOCUMENT_LINK: '+file);
    }
  }
  console.log(JSON.stringify({publication:'passed',files:actual.length,markdown:actual.filter(f=>f.endsWith('.md')).length,screenshots:screenshots.size}));
}
if(require.main===module){try{checkPublication();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={allowedFile};
