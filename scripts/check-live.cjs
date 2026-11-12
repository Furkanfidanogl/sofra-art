// Read-only post-deploy gate. No cookies, user credentials or mutations.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const origin='https://sofra-art.netlify.app';
const root=path.resolve(__dirname,'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function read(url){return fetch(new URL(url,origin),{signal:AbortSignal.timeout(20000)});}
(async()=>{
  const home=await read('/');assert.equal(home.status,200);const html=await home.text();
  const metadata={title:html.match(/<title>([^<]+)<\/title>/)?.[1],description:html.match(/<meta name="description" content="([^"]+)"/)?.[1],canonical:html.match(/rel="canonical" href="([^"]+)"/)?.[1],ogImage:html.match(/property="og:image" content="([^"]+)"/)?.[1]};
  assert.match(metadata.title,/Sofra Art/);assert.ok(metadata.description?.length>20);assert.equal(metadata.canonical,origin+'/');
  assert.equal(new URL(metadata.ogImage).origin,origin);
  const og=await read(metadata.ogImage);assert.equal(og.status,200);assert.match(og.headers.get('content-type'),/^image\//);
  assert.match(html,/<meta name="twitter:card" content="summary_large_image"/);
  const robots=await read('/robots.txt');assert.equal(robots.status,200);assert.match(await robots.text(),/Disallow: \/\s/);
  const headers={nosniff:home.headers.get('x-content-type-options')==='nosniff',frameDenied:home.headers.get('x-frame-options')==='DENY',hsts:home.headers.get('strict-transport-security')?.includes('max-age=31536000')===true,csp:home.headers.get('content-security-policy')?.includes("frame-ancestors 'none'")===true};
  for(const [name,pass]of Object.entries(headers))assert.equal(pass,true,`Missing security header: ${name}`);
  const assets=[html.match(/<script[^>]+src="([^"]+)"/)?.[1],html.match(/<link[^>]+href="([^"]+\.css)"[^>]*crossorigin/)?.[1]||html.match(/<link[^>]+href="(\/assets\/[^\"]+\.css)"/)?.[1]].filter(Boolean);
  assert.equal(assets.length,2,'JS/CSS entry discovery');
  const matches=await Promise.all(assets.map(async url=>{
    const response=await read(url);assert.equal(response.status,200);const actual=Buffer.from(await response.arrayBuffer());const expected=fs.readFileSync(path.join(root,'dist',url));assert.equal(sha(actual),sha(expected),`Build differs: ${url}`);return{url,matchesBuild:true,immutable:response.headers.get('cache-control')?.includes('immutable')===true};
  }));
  const routes=await Promise.all([['/gizlilik/',200],['/sitemap.xml',200],['/favicon.svg',200],['/fonts/fonts.css',200],['/sofra-release-missing-page',404]].map(async([url,status])=>{
    const response=await read(url);assert.equal(response.status,status,`Wrong route status: ${url}`);if(url==='/gizlilik/')assert.equal((await response.text()).includes('fatihfidanogl@gmail.com'),true);return{url,status:response.status};
  }));
  const cross=await fetch('https://europe-west1-sofra-512816.cloudfunctions.net/manageMyData',{method:'OPTIONS',headers:{origin:'https://untrusted.invalid','access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'},signal:AbortSignal.timeout(20000)});
  const allowedOrigin=cross.headers.get('access-control-allow-origin');
  assert.notEqual(allowedOrigin,'https://untrusted.invalid','Untrusted browser origin must not be reflected');
  assert.notEqual(allowedOrigin,'*','A wildcard must not allow untrusted origins');
  const report={checkedAt:new Date().toISOString(),origin,metadata,ogImageStatus:og.status,robotsIntentionallyBlocked:true,headers,assets:matches,routes,untrustedCorsOriginAllowed:false,indexing:home.headers.get('x-robots-tag'),containsRemoteGoogleFont:html.includes('fonts.googleapis.com')};
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});
  fs.writeFileSync(path.join(root,'reports/go-live-live.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(error=>{console.error('LIVE_GATE_FAILED',error.message);process.exitCode=1});
