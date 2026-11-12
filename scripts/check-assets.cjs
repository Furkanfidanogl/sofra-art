// Deterministic build budget, not a substitute for real-device CWV measurements.
const fs=require('node:fs'),path=require('node:path'),{gzipSync}=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
// Six variable WOFF2 subsets (two scripts per family/style), all counted even when not requested.
const budgets={entryGzip:50*1024,totalJsGzip:120*1024,cssGzip:15*1024,fontTotal:200*1024,hero:120*1024,gallery320Total:100*1024};
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const entry=html.match(/<script[^>]+src="([^"]+)"/)[1];
const files=fs.readdirSync(path.join(dist,'assets')).map(name=>{const bytes=fs.readFileSync(path.join(dist,'assets',name));return{file:`assets/${name}`,bytes:bytes.length,gzip:gzipSync(bytes).length};}).sort((a,b)=>b.bytes-a.bytes);
const imageManifest=require('../src/image-manifest.json');
const hero=html.match(/<link rel="preload" as="image" href="([^"]+)"/)[1];
const gallery320Total=Object.values(imageManifest).reduce((n,image)=>n+image.sources.find(s=>s.width===320).bytes,0);
for(const image of Object.values(imageManifest))for(const source of image.sources)assert.equal(fs.statSync(path.join(dist,source.src)).size,source.bytes,'Missing or stale image variant');
const totals={entryGzip:files.find(f=>'/'+f.file===entry).gzip,totalJsGzip:files.filter(f=>f.file.endsWith('.js')).reduce((n,f)=>n+f.gzip,0),cssGzip:files.filter(f=>f.file.endsWith('.css')).reduce((n,f)=>n+f.gzip,0),fontTotal:fs.readdirSync(path.join(dist,'fonts')).filter(f=>f.endsWith('.woff2')).reduce((n,f)=>n+fs.statSync(path.join(dist,'fonts',f)).size,0),hero:fs.statSync(path.join(dist,hero)).size,gallery320Total};
for(const [name,bytes] of Object.entries(totals))assert.ok(bytes<=budgets[name],`${name}: ${bytes} exceeds ${budgets[name]}`);
assert.match(html,/<link[^>]+rel="preload"[^>]+as="image"[^>]+fetchpriority="high"/);
assert.match(html,/<audio[^>]+preload="none"/);
assert.match(html,/<div id="app">\s*<header/,'Visible public shell must not wait for JavaScript');
assert.match(html,/<h1>Biraz dur\./);
assert.equal(/fonts\.googleapis\.com|googletagmanager|google-analytics/.test(html),false);
const fontCss=fs.readFileSync(path.join(dist,'fonts/fonts.css'),'utf8');assert.equal((fontCss.match(/font-display: swap/g)||[]).length,6);
const report={checkedAt:new Date().toISOString(),budgets,totals,assets:files,measurement:'Static gzip/raw asset sizes; includes lazy JS chunks in total; excludes cached/conditional network behavior and user uploads. Not field CWV.'};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/asset-budget.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({budgets,totals}));
