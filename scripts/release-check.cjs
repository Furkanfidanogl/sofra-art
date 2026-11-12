// Read-only production acceptance using the existing operator session in memory.
const {loadContext}=require('./firebase-context.cjs');
(async()=>{
 const ctx=await loadContext();
 const api=new ctx.api.Client({urlPrefix:'https://firestore.googleapis.com',auth:true});
 const base=`/v1/projects/${ctx.projectId}/databases/(default)`;
 const query=async structuredQuery=>(await api.post(`${base}/documents:runQuery`,{structuredQuery})).body.filter(r=>r.document).map(r=>r.document);
 const [{body:legacy},scheduled,artworks,approved,assets]=await Promise.all([
  api.get(`${base}/documents/siteContent/daily`),
  query({from:[{collectionId:'dailyPackages'}],where:{compositeFilter:{op:'AND',filters:[{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'scheduled'}}},{fieldFilter:{field:{fieldPath:'date'},op:'LESS_THAN_OR_EQUAL',value:{stringValue:require('../functions/domain.cjs').istanbulDay(Date.now())}}}]}},orderBy:[{field:{fieldPath:'date'},direction:'DESCENDING'}],limit:1}),
  query({from:[{collectionId:'artworks'}],where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'published'}}},orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:41}),
  query({from:[{collectionId:'comments'}],where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'approved'}}},orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:31}),
  query({from:[{collectionId:'assets'}],orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:21}),
 ]);
 console.log(JSON.stringify({productionQueries:'passed',legacyPublished:!!legacy.fields?.published,duePackages:scheduled.length,publishedOverrides:artworks.length,approvedPage:approved.length,assetPage:assets.length}));
 const result=await api.get(`${base}/collectionGroups/-/indexes`);
 console.log(JSON.stringify({indexes:(result.body.indexes||[]).map(i=>({collection:i.name.split('/collectionGroups/')[1]?.split('/')[0],state:i.state}))}));
 const url='https://europe-west1-sofra-512816.cloudfunctions.net';
 const callables=await Promise.all(['getPublicContent','getAdminDashboard','manageContent','submitComment','uploadArtwork','getArtwork','generateEditorial','manageMyData'].map(async name=>{
  const response=await fetch(`${url}/${name}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:{}}),signal:AbortSignal.timeout(30000)});
  if(response.status!==401)throw new Error('CALLABLE_ACCESS_CHANGED');return {name,withoutAppCheck:response.status};
 }));
 const image=await fetch(`${url}/publicArtwork?id=art-00000000-0000-0000-0000-000000000000`,{signal:AbortSignal.timeout(30000)});
 if(image.status!==404)throw new Error('UNPUBLISHED_IMAGE_ACCESS_CHANGED');
 console.log(JSON.stringify({callables,unpublishedImage:image.status}));
})().catch(error=>{console.error('RELEASE_CHECK_FAILED',error.code||error.status||'UNAVAILABLE',String(error.message||'').replace(/https?:\/\/\S+/g,'[link]').slice(0,1000));process.exitCode=1;});
