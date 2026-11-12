// Bounded high-confidence pattern scan. Prints paths only, never matched values.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const publicEnv=fs.existsSync(path.join(root,'.env.local'))?fs.readFileSync(path.join(root,'.env.local'),'utf8'):'';
const publicKey=process.env.VITE_FIREBASE_API_KEY || publicEnv.match(/^VITE_FIREBASE_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,/\b(?:ghp_|github_pat_|GOCSPX-)[A-Za-z0-9_\-]{20,}/g,/\bya29\.[A-Za-z0-9_\-]{20,}/g,/\bAIza[A-Za-z0-9_\-]{35}\b/g];
const candidates=new Set();let currentTextFiles=0,buildTextFiles=0,historyRevisions=0;
function scan(file,build=false){
  const absolute=path.join(root,file);if(!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())return;
  const bytes=fs.readFileSync(absolute);if(bytes.includes(0)||bytes.length>2e6)return;
  if(build)buildTextFiles++;else currentTextFiles++;
  const text=bytes.toString();
  if(patterns.some(pattern=>[...text.matchAll(pattern)].some(match=>match[0]!==publicKey)))candidates.add(file);
}
for(const file of new Set(git(['ls-files','-co','--exclude-standard','-z']).split('\0').filter(Boolean)))scan(file);
function build(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())build(file);else scan(path.relative(root,file),true);}}
if(fs.existsSync(path.join(root,'dist')))build(path.join(root,'dist'));
if(process.argv.includes('--history'))for(const rev of git(['rev-list','--all']).trim().split('\n').filter(Boolean)){
  historyRevisions++;
  try{for(const match of git(['grep','-I','-l','-E','-e','-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|GOCSPX-[A-Za-z0-9_-]{20,}|ya29\\.[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{35}',rev,'--','.']).trim().split('\n').filter(Boolean))candidates.add(match);}
  catch(error){if(error.status!==1)throw new Error('HISTORY_PATTERN_SCAN_FAILED');}
}
console.log(JSON.stringify({currentTextFiles,buildTextFiles,historyRevisions,candidatePaths:[...candidates],scope:'High-confidence credential patterns and known public Firebase-key exception; complements manual review, not a universal secret guarantee.'}));
if(candidates.size)process.exitCode=1;
