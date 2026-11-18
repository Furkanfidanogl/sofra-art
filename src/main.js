import './style.css';
import {icon,brand} from './icons.js';
import {pageTemplate} from './page-template.js';
import {imageSource,imageAttributes,HERO_SIZES,GALLERY_SIZES} from './responsive-image.js';
import {createDialogFocus} from './dialog-focus.js';
import {createFeedback,SOFRA_SHH} from './feedback.js';
import {framedImage,createImageLoading} from './image-loading.js';
import { adminHTML } from './admin-panel.js';
import { spotifyTrackUrl, readSpotifyPreference, saveSpotifyPreference } from './spotify-track.js';
import { artworks, daily, moods, readings, quizQuestions, quizResults } from './content.js';
import { escapeHTML as esc, readDemo, saveDemo, checkComment } from './demo-store.js';
import { authConfigured, warmAuth, googleSignIn, signOutCurrent, observeSession, reauthenticateForDeletion, deleteCurrentAccount } from './firebase.js';
import { exportMyComments, removeMyComments, eraseAccountWorkflow } from './privacy-client.js';
import { guestSession, authErrorMessage, isAuthorizedGoogleAdmin } from './auth-session.js';
import { accountPresentation, commentNickname, accountGreeting, accountIdentityNote, accountButtonsHTML } from './account-presentation.js';
import { backendEnabled, getPublicContent, getAdminDashboard, submitComment, manageContent, uploadArtwork, getArtworkUrl, generateEditorial, manageMyData, backendErrorMessage } from './backend.js';
import { validateEditorialContext, applyEditorialDraft, createEditorialController } from './editorial-client.js';

const defaultQuestion = 'Bugün sana iyi gelen küçücük şey neydi?';
let browserStorage;try{browserStorage=window.localStorage;}catch{}
let spotifyAllowed=readSpotifyPreference(browserStorage);
const demo = readDemo(browserStorage || {getItem:()=>null});
let catalog=[...artworks];
let catalogCursor=null;
let tableKey='legacy';
let publicRequest=0;
let midnightTimer;
let viewRevision=0;
let adminDate=null;
let artworkId=null;
let artworkEditor=null;
let selectedAsset=null;
let commentStatus='pending';
let forcedOriginal=false;
let currentMood = 'all';
let savedOnly = false;
let currentArtId = null;
let currentCommentId = null;
let quizAnswers = [];
let lastSubmitted = 0;
let user = null;
let session = guestSession();
let authBusy = false;
let googleBusy = false;
const DELETE_ACCOUNT_LABEL = 'Google ile doğrula ve hesabımı sil';
let dataBusy = false;
let currentAdminTab = 'daily';
let playing = false;
let remoteDaily=null;
let adminSnapshot=null;
let adminEditor=null;
let uploadBusy=false;
let pendingUpload=null;
let lastDeletedAsset=null;
let dashboardRequest=0;
const remoteComments=new Map();
let remotePending=[];
let aiBusy=null;
let aiBusyContext=null;
let aiDraft=null;
let aiTicket=0;
const audio = document.querySelector('#sofra-audio');
audio.volume = .5;

const todayDate = () => new Intl.DateTimeFormat('tr-TR', { timeZone:'Europe/Istanbul', day:'numeric', month:'long', year:'numeric' }).format(new Date());
const dayKey = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let displayedDay = dayKey();
function getDaily() {
  const value={ ...daily, ...(backendEnabled()?remoteDaily:Object.fromEntries(Object.entries(demo.daily).filter(([,v]) => typeof v === 'string' && v.trim()))) };
  if(value.spotifyUrl){const track=spotifyTrackUrl(value.spotifyUrl);if(track)value.spotifyUrl=track;else delete value.spotifyUrl;}
  return value;
}
function getArt(id) { return catalog.find(a => a.id === id) || catalog[0] || {id:'',title:'Bugünün seçkisi hazırlanıyor',image:'/images/moon-terrace.webp',alt:'Sofra için özgün ay terası',credit:'Sofra Art',question:defaultQuestion}; }
function persist() { if (!saveDemo(browserStorage, demo)) toast('Tarayıcı kaydı kullanılamıyor; değişiklikler bu oturumda kalacak.'); }
function commentList(id) { return backendEnabled()?(remoteComments.get(id)||[]):demo.comments.filter(c => c.artId === id && c.status === 'approved'); }
async function refreshPublic(id,updateDaily=false) {
  if(!backendEnabled())return;
  const ticket=updateDaily?++publicRequest:null;
  const value=await getPublicContent(id);
  if(updateDaily && ticket!==publicRequest)return;
  if(!updateDaily && id==='table' && (value.tableKey || 'legacy')!==tableKey)return;
  remoteComments.set(id,value.comments);
  remotePending=remotePending.filter(c=>c.artId!==id || !value.comments.some(approved=>approved.id===c.id));
  if(updateDaily){
    const dayChanged=tableKey!==(value.tableKey || 'legacy');
    const contentChanged=dayChanged || JSON.stringify(remoteDaily)!==JSON.stringify(value.daily) || JSON.stringify(catalog)!==JSON.stringify(value.artworks || [...artworks]);
    tableKey=value.tableKey || 'legacy';remoteDaily=value.daily;catalog=value.artworks || [...artworks];catalogCursor=value.catalogCursor;
    if(dayChanged){remotePending=remotePending.filter(c=>c.artId!=='table');remoteComments.set('table',id==='table'?value.comments:[]);}
    displayedDay=value.serverDate || dayKey();
    if(contentChanged){const y=window.scrollY;render();window.scrollTo(0,y);renderPlayer();}
    else if(id==='table')renderTable();
    clearTimeout(midnightTimer);
    if(value.serverTime){const next=Date.parse(value.serverDate+'T00:00:00+03:00')+86400000;midnightTimer=setTimeout(()=>refreshPublic('table',true).catch(()=>{}),Math.max(1000,next-value.serverTime+100));}
  } else if(id==='table')renderTable();
  if(currentCommentId===id && document.querySelector('#detail-dialog[open]') && (id!=='table' || document.querySelector('[data-form="comment"]')?.dataset.tableKey===(value.tableKey || 'legacy'))) {
    const list=document.querySelector('#detail-dialog .approved-comments');
    if(list)list.innerHTML=commentList(id).map(previewComment).join('')||'<p class="comment-empty">İlk sözü sen bırak.</p>';
  }
}
const feedback=createFeedback({document,viewport:window.visualViewport,window});
const imageLoading=createImageLoading(document);
function toast(message,type='normal'){feedback.show(message,type);}

function render() {
  const d = getDaily();
  const art = getArt(d.artwork);
  const account = accountPresentation(session);
  document.querySelector('#app').innerHTML = pageTemplate({d,art,account,dateLabel:todayDate().toLocaleUpperCase('tr'),playing,savedOnly,savedCount:demo.saved.length,currentMood,backend:backendEnabled(),defaultQuestion});
  renderTable(); renderGallery();imageLoading.refresh();
}

function renderTable() {
  document.querySelector('#table-preview').innerHTML = commentList('table').slice(-2).map((c,i) => previewComment(c,i)).join('') || '<p class="table-invitation">Bir cümle de yeter.<br>Bugünün sorusuna kendinden bir not bırak.</p>';
}
function previewComment(c, i=0) { return `<div class="comment-preview"><span class="avatar ${i%2?'amber':''}" aria-hidden="true">${esc(c.name[0])}</span><div><span class="comment-name">${esc(c.name)}</span><p>${esc(c.text)}</p></div></div>`; }
function renderGallery() {
  const list = catalog.filter(a => (currentMood==='all' || a.mood===currentMood) && (!savedOnly || demo.saved.includes(a.id)));
  document.querySelector('#gallery').innerHTML = list.length ? list.map(a => `<article class="art-card"><button class="art-image-button" data-action="art" data-id="${a.id}" aria-label="${esc(a.title)} — incele">${framedImage(a.image,a.alt,{sizes:GALLERY_SIZES,loading:'lazy'})}<span class="art-open">${icon('arrow')}</span></button><div class="art-meta"><div><span class="eyebrow">${esc(a.tag)}</span><h3><button data-action="art" data-id="${a.id}" style="padding:0;text-align:left">${esc(a.title)}</button></h3><p class="art-credit">${esc(a.credit.split(' · ').slice(0,2).join(' · '))}</p></div><button class="icon-button save-art ${demo.saved.includes(a.id)?'saved':''}" data-action="save" data-id="${a.id}" aria-label="${esc(a.title)} — ${demo.saved.includes(a.id)?'kaydı kaldır':'kaydet'}" aria-pressed="${demo.saved.includes(a.id)}">${icon('bookmark')}</button></div></article>`).join('') : `<div class="empty-state">${savedOnly?'Henüz bu odadan bir şey kaydetmedin. Görsellerdeki ayraç simgesine dokunabilirsin.':'Bu odada henüz bir içerik yok.'}</div>`;
  imageLoading.refresh(document.querySelector('#gallery'));
  document.querySelectorAll('.room-button').forEach(b=>{b.classList.toggle('selected',b.dataset.id===currentMood);b.setAttribute('aria-pressed',b.dataset.id===currentMood);});
  document.querySelector('.saved-filter')?.classList.toggle('active',savedOnly);
  document.querySelector('#saved-count').textContent = demo.saved.length;
  let more=document.querySelector('[data-action="gallery-more"]');if(more)more.remove();
  if(catalogCursor){more=document.createElement('button');more.className='btn gallery-load-more';more.dataset.action='gallery-more';more.textContent='Daha fazla eser';document.querySelector('#gallery').after(more);}
}

const dialogFocus=createDialogFocus(document);
function closeButton(view='') { return `<button class="icon-button dialog-close" data-action="close" aria-label="${view==='asset-preview'?'Önizlemeyi kapat':'Pencereyi kapat'}">${icon('close')}</button>`; }
function labelDialog(dialog){const title=dialog.querySelector?.('h2');if(title){title.id=`${dialog.id}-title`;dialog.setAttribute('aria-labelledby',title.id);}}
function closeDialog(dialog) {
  if(dialog?.id==='admin-dialog' && dialog.dataset.view==='asset-preview' && isAdmin()) {
    showAdmin('uploads',false);return;
  }
  if(dialog?.id==='admin-dialog') {
    rememberEditor();
    aiDraft=null;
  }
  viewRevision++;dashboardRequest++;dialog?.close();dialogFocus.restore(dialog);
}
function openDialog(id, html, view='') {
  viewRevision++;
  const dialog = document.querySelector(id);
  dialogFocus.remember(dialog,document.activeElement,document.querySelector('dialog[open]'));
  const feedback = document.querySelector('#toast');
  if (feedback && feedback.parentElement!==document.body) document.body.append(feedback);
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  dialog.dataset.view=view; dialog.innerHTML = closeButton(view) + html;
  labelDialog(dialog);
  dialog.showModal(); dialog.scrollTop=0; document.body.classList.add('dialog-open');
  imageLoading.refresh(dialog);
}
function renderDialog(id, html, view='', preserveNavigation=false) {
  const dialog = document.querySelector(id);
  if (dialog?.hasAttribute('open')) {
    const feedback=document.querySelector('#toast');
    if(feedback && dialog.contains?.(feedback))document.body.append(feedback);
    const active=document.activeElement;
    const focusState=dialog.contains?.(active)?{name:active.name,action:active.dataset?.action,target:active.dataset?.target,id:active.dataset?.id,start:active.selectionStart,end:active.selectionEnd}:null;
    if (!preserveNavigation) viewRevision++;
    dialog.dataset.view = view;
    dialog.innerHTML = closeButton(view) + html;
    labelDialog(dialog);
    imageLoading.refresh(dialog);
    if(focusState){
      const next=[...dialog.querySelectorAll('input,textarea,select,button,a')].find(el=>focusState.name?el.name===focusState.name:focusState.action && el.dataset.action===focusState.action && el.dataset.target===focusState.target && el.dataset.id===focusState.id);
      if(next){next.focus({preventScroll:true});if(typeof focusState.start==='number' && typeof next.setSelectionRange==='function' && ['text','search','url','tel','password','textarea'].includes(next.type))next.setSelectionRange(focusState.start,focusState.end);}
    }
    return;
  }
  openDialog(id, html, view);
}
document.querySelectorAll('dialog').forEach(d => {
  d.addEventListener('close',()=>{ const feedback=d.querySelector('#toast');if(feedback && feedback.parentElement!==document.body)document.body.append(feedback);if(!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open'); });
  d.addEventListener('click',e=>{ if(e.target===d){ const r=d.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d); } });
  d.addEventListener('cancel',e=>{e.preventDefault();closeDialog(d);});
});

function commentsHTML(id, question) {
  const pending = (backendEnabled()?remotePending:demo.comments).filter(c=>c.artId===id && c.status==='pending');
  return `<div class="comments"><h3>Sofrada bir söz de senden.</h3><p class="question-text">${esc(question)}</p><div class="notice">${backendEnabled()?'Sofra, birbirimize nezaketle alan açtığımız sakin bir sığınak. Paylaştığın düşünceler, ortamın huzurunu koruyan özenli bir süzgeçten geçerek masada yerini alır.':'Buraya bıraktığın notlar bu cihazda sana özel saklanır; diğer ziyaretçilere gösterilmez.'}</div><div class="approved-comments">${commentList(id).map(previewComment).join('') || '<p class="comment-empty">Bu görsel sana ne hissettirdi?</p>'}</div>${pending.map(c=>`<div class="pending-comment">${previewComment(c)}<small>${backendEnabled()?'Onay bekliyor':'Bu cihazda saklandı · Sana özel'}</small></div>`).join('')}
    <form class="comment-form" data-form="comment" data-id="${id}" data-table-key="${esc(tableKey)}"><label><span class="field-label">Sofradaki adın</span><input class="input" name="name" required minlength="2" maxlength="32" placeholder="Bir takma ad seç" value="${esc(commentNickname(user))}" autocomplete="nickname" /></label><label><span class="field-label">Aklından geçen</span><textarea class="input" name="text" required minlength="1" maxlength="500" placeholder="Acele etmeden, içinden geldiği gibi…"></textarea></label><div class="form-bottom"><small>En fazla 500 karakter · Birbirimize nazik davranıyoruz.</small><button class="btn btn-primary" type="submit" ${backendEnabled()&&!user?'disabled':''}>${backendEnabled()&&!user?'Yazmak için giriş yap':'Sofraya bırak'} ${icon('send')}</button></div></form></div>`;
}

async function showArt(id) {
  warmAuth();
  const revision=++viewRevision;
  if(!catalog.some(a=>a.id===id)){
    if(backendEnabled()) {
      try {
        const value=await getPublicContent(id);
        if(revision!==viewRevision)return;
        if(value.artworks?.length){
          catalog=[...new Map([...catalog,...value.artworks].map(a=>[a.id,a])).values()];
          renderGallery();
        }
      } catch {}
    }
  }
  if(revision!==viewRevision)return;
  if(!catalog.some(a=>a.id===id)){toast('Bu eser artık yayında değil.');return;}
  const art=getArt(id); currentArtId=art.id; currentCommentId=art.id;
  openDialog('#detail-dialog', `${framedImage(art.image,art.alt,{className:'dialog-art-image'})}<div class="dialog-body"><span class="eyebrow">${esc(art.tag)}</span><h2>${esc(art.title)}</h2><p class="dialog-credit">${esc(art.credit)}${art.source?` · <a href="${esc(art.source)}" target="_blank" rel="noopener noreferrer">Görsel kaynağı ↗</a>`:''}</p><p>${esc(art.description)}</p><div class="dialog-actions"><button class="btn ${demo.saved.includes(art.id)?'btn-primary':''}" data-action="save-detail" data-id="${art.id}">${icon('bookmark')} ${demo.saved.includes(art.id)?'Kaydedildi':'Sonraya sakla'}</button><button class="text-link" data-action="share-art" data-id="${art.id}">${icon('share')} Bağlantıyı kopyala</button></div>${commentsHTML(art.id,art.question)}</div>`);
  refreshPublic(art.id).catch(error=>toast(backendErrorMessage(error)));
}
function showTable() { warmAuth(); currentArtId=null;currentCommentId='table';openDialog('#detail-dialog',`<div class="dialog-body"><span class="eyebrow">GECE MASASI · GÜNÜN SORUSU</span><h2>${esc(getDaily().question||defaultQuestion)}</h2>${commentsHTML('table','Birbirimize nazik davranıyoruz. Bir cümle bile yeter.')}</div>`);refreshPublic('table').catch(error=>toast(backendErrorMessage(error))); }
function showReading(id) {
  const r=readings.find(r=>r.id===id);if(!r)return;
  currentArtId=null;currentCommentId=null;
  openDialog('#detail-dialog',`${framedImage(r.image,r.title,{className:'dialog-art-image'})}<article class="dialog-body reading-body"><div class="reading-category">${esc(r.category)} <span>${r.time} okuma</span></div><h2>${esc(r.title)}</h2><p class="reading-lede">${esc(r.intro)}</p>${r.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<p class="dialog-credit">Sofra Art · Okuma odası</p><button class="text-link" data-action="table">Bu düşünceyi Sofraya taşı ${icon('arrow')}</button></article>`);
}
function toggleSave(id) {
  if(!catalog.some(a=>a.id===id)) return;
  const index=demo.saved.indexOf(id); if(index===-1)demo.saved.push(id);else demo.saved.splice(index,1);
  persist();renderGallery();toast(index===-1?'Kendi küçük seçkine eklendi.':'Seçkinden çıkarıldı.');
}

function renderPlayer() {
  const selected=getDaily();
  const d=forcedOriginal && selected.spotifyUrl?{...daily}:selected;
  const root=document.querySelector('#player-root');
  const spotify=spotifyTrackUrl(d.spotifyUrl);
  if(spotify && !forcedOriginal){
    audio.pause();
    const playerKey=spotifyAllowed?spotify:`blocked:${spotify}`;
    if(root.dataset.spotify===playerKey)return;
    root.dataset.spotify=playerKey;
    if(!spotifyAllowed){root.innerHTML=`<aside class="spotify-player spotify-consent" aria-label="Günün şarkısı"><div><strong>${esc(d.songTitle)}</strong><p>Spotify oynatıcısı yüklenince Spotify cihaz ve bağlantı bilgilerini alabilir. Seçimin bu tarayıcıda hatırlanır. <a href="/gizlilik/">Gizlilik</a></p></div><div><button class="btn" data-action="spotify-allow">Spotify oynatıcısını yükle</button><button data-action="original-audio">Sofra kaydını dinle</button><a href="${esc(spotify)}" target="_blank" rel="noopener noreferrer">Spotify’da aç ↗</a></div></aside>`;return;}
    root.innerHTML=`<aside class="spotify-player" aria-label="Günün Spotify seçkisi"><iframe title="Günün Spotify seçkisi" src="${esc(spotify.replace('open.spotify.com/','open.spotify.com/embed/'))}?theme=0" width="100%" height="80" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe><div><a href="${esc(spotify)}" target="_blank" rel="noopener noreferrer">Spotify’da aç ↗</a><button data-action="original-audio">Sofra kaydını dinle</button></div></aside>`;return;
  }
  root.dataset.spotify='';

  document.querySelector('#player-root').innerHTML=`<aside class="player ${playing?'playing':''}" aria-label="Günün müzik oynatıcısı"><div class="player-track"><img class="player-cover" src="${imageSource('/images/moon-terrace.webp')}" ${imageAttributes('/images/moon-terrace.webp','48px')} alt="Akşam Aralığı kapak görseli" decoding="async" width="48" height="48" /><div><p class="song-title">${esc(d.songTitle)}</p><p>${esc(d.songArtist)} <span aria-hidden="true">·</span> Günün şarkısı</p></div></div><div class="player-controls"><button class="icon-button" data-action="restart" aria-label="Şarkıyı başa al">${icon('prev')}</button><button class="play-main" data-action="play" aria-label="${playing?'Şarkıyı duraklat':'Şarkıyı oynat'}">${icon(playing?'pause':'play')}</button></div><div class="player-progress"><span class="player-time" id="elapsed">0:00</span><input class="range" id="seek" type="range" min="0" max="100" value="0" step=".1" aria-label="Şarkıda ilerle" /><span class="track-context"><span class="audio-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>SOFRA SESSIONS</span><button class="volume-button" data-action="mute" aria-label="Sesi kapat">${icon(audio.muted?'mute':'sound')}</button></div></aside>`;
}
async function togglePlay() {
  if(getDaily().spotifyUrl && !forcedOriginal){document.querySelector('.spotify-player')?.scrollIntoView({block:'nearest'});toast('Müziği alttaki Spotify oynatıcısından başlatabilirsin.');return;}
  try { if(audio.paused)await audio.play();else audio.pause(); }
  catch { toast('Müzik açılamadı. Birazdan oynat düğmesine yeniden dokun.'); }
}
function syncPlay() {
  playing=!audio.paused;
  document.querySelector('.player')?.classList.toggle('playing',playing);
  document.querySelectorAll('[data-action="play"]').forEach(b=>{const active=playing && (!getDaily().spotifyUrl || Boolean(b.closest('.player')));b.innerHTML=icon(active?'pause':'play');b.setAttribute('aria-label',active?'Şarkıyı duraklat':'Şarkıyı oynat');});
}
audio.addEventListener('play',syncPlay);audio.addEventListener('pause',syncPlay);
audio.addEventListener('timeupdate',()=>{
  const t=Math.floor(audio.currentTime);const el=document.querySelector('#elapsed');if(el)el.textContent=`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
  const seek=document.querySelector('#seek');if(seek&&Number.isFinite(audio.duration))seek.value=audio.currentTime/audio.duration*100;
});
document.addEventListener('input',e=>{if(e.target.id==='seek'&&Number.isFinite(audio.duration))audio.currentTime=Number(e.target.value)/100*audio.duration;});

function showQuiz() { quizAnswers=[];renderQuiz(); }
function renderQuiz() {
  const step=quizAnswers.length;
  if(step===quizQuestions.length){
    const counts=quizAnswers.reduce((acc,m)=>({...acc,[m]:(acc[m]||0)+1}),{});
    const mood=[...quizAnswers].reverse().sort((a,b)=>counts[b]-counts[a])[0];
    const result=quizResults[mood];const art=getArt(result.art);
    openDialog('#quiz-dialog',`<div class="quiz-modal-body quiz-result"><span class="eyebrow">KENDİNE RASTLADIN</span>${framedImage(art.image,art.alt,{className:'quiz-result-image'})}<h2>${esc(result.title)}</h2><p>${esc(result.text)}</p><div class="quiz-actions"><button class="btn btn-primary" data-action="quiz-discover" data-id="${mood}">Bu odayı keşfet ${icon('arrow')}</button><button class="btn" data-action="quiz">Yeniden dene</button></div><p class="quiz-fineprint">Küçük bir eğlence testi; psikolojik değerlendirme değildir. Sonuçlar bir sunucuya gönderilmez.</p></div>`);return;
  }
  const q=quizQuestions[step];
  openDialog('#quiz-dialog',`<div class="quiz-modal-body"><span class="eyebrow">RUH HÂLİNE BİR PENCERE · ${step+1}/3</span><div class="quiz-step" aria-label="${step+1}. soru, toplam 3">${quizQuestions.map((_,i)=>`<i class="${i<=step?'done':''}"></i>`).join('')}</div><h2>${esc(q.title)}</h2><div class="quiz-options">${q.options.map((o,i)=>`<button class="quiz-option" data-action="quiz-answer" data-id="${o.mood}"><span>${String.fromCharCode(65+i)}</span>${esc(o.text)}</button>`).join('')}</div>${step?`<button class="quiz-back" data-action="quiz-back">${icon('back')} Bir önceki soruya dön</button>`:''}<p class="quiz-fineprint">Doğru ya da yanlış cevap yok. İçinden geldiği gibi.</p></div>`);
}

function isAdmin() {
  return Boolean(user && !session.loading && session.admin && isAuthorizedGoogleAdmin({
    email: user.email,
    emailVerified: user.emailVerified,
    adminClaim: session.admin,
    signInProvider: session.providerId,
    providerData: user.providerData,
  }));
}
function syncAccountUI() {
  const account = accountPresentation(session);
  const button = document.querySelector('.login-button');
  const label = button?.querySelector('.account-label');
  if (label) { label.textContent = account.label; label.classList.toggle('account-label-loading',account.loading); }
  if (button) {
    button.disabled=account.loading;
    button.setAttribute('aria-busy',String(account.loading));
    if(account.loading)button.setAttribute('aria-label','Hesabın yükleniyor');else button.removeAttribute('aria-label');
  }
  const nickname = document.querySelector('[data-form="comment"] [name="name"]');
  if (nickname && document.activeElement!==nickname) nickname.value=commentNickname(user);
  const commentButton=document.querySelector('[data-form="comment"] button[type="submit"]');
  if(commentButton && backendEnabled()) {
    commentButton.disabled=!user || session.loading;
    commentButton.innerHTML=`${user?'Sofraya bırak':'Yazmak için giriş yap'} ${icon('send')}`;
  }
  if (document.querySelector('#admin-dialog[open]') && !isAdmin()) document.querySelector('#admin-dialog').close();
}
function showAccount() {
  warmAuth();
  const pending = session.loading || authBusy;
  const identityNote = accountIdentityNote(user);
  const buttons = accountButtonsHTML({ user, pending, authConfigured: authConfigured(), isAdmin: isAdmin(), googleBusy });
  openDialog('#account-dialog',`<div class="account-body"><div class="brand">${brand}</div><h2>${user?'İyi ki geldin.':'Bir sandalye de sana.'}</h2><p>${esc(accountGreeting(user))}</p>${identityNote?`<p class="account-identity">${esc(identityNote)}</p>`:''}<div class="account-buttons">${buttons}</div><div class="notice">Bir sandalye hep sana ayrılmış. Müziğini aç, odaları keşfet ve biraz kendine kal.</div><button class="guest-button" data-action="close">${user?'Sofraya dön':'Şimdilik misafir olayım'}</button></div>`,'account');
  if(user && backendEnabled())document.querySelector('#account-dialog .account-buttons').insertAdjacentHTML('beforeend',`<button class="text-link" data-action="data-export" ${dataBusy?'disabled':''}>Yorumlarımı indir</button>${!isAdmin()?`<button class="text-link" data-action="data-delete-confirm" ${dataBusy?'disabled':''}>Hesabımı ve yorumlarımı sil</button>`:''}`);
  document.querySelector('#account-dialog .notice').insertAdjacentHTML('beforeend','<p><a class="text-link" href="/gizlilik/">Gizlilik ve verilerin</a></p>');
}

function showMusicSettings(){
  renderDialog('#account-dialog',`<div class="account-body"><h2>Müzik tercihlerin</h2><p>Spotify oynatıcısı isteğe bağlıdır. İzin vermediğinde bu site Spotify iframe’i yüklemez. Sofra’nın özgün kaydını her zaman dinleyebilirsin.</p><p>Şu an Spotify oynatıcısı: <strong>${spotifyAllowed?'izinli':'kapalı'}</strong>. İzin vermek otomatik müzik başlatmaz.</p><div class="account-buttons"><button class="btn" data-action="spotify-allow">Spotify’a izin ver</button><button class="btn" data-action="spotify-deny">Spotify iznini kaldır</button><a class="text-link" href="/gizlilik/">Gizlilik ve verilerin</a></div></div>`,'music-settings',true);
}

function returnAfterSignIn() {
  if (document.querySelector('#account-dialog[open]')?.dataset.view==='account') {
    document.querySelector('#account-dialog').close();
    window.scrollTo({top:0,behavior:'instant'});
    document.querySelector('.login-button')?.focus({preventScroll:true});
  }

}

function rememberEditor() {
  const form=document.querySelector('#admin-dialog [data-form="daily"]');
  if(form){const data=new FormData(form);adminEditor={date:form.dataset.date||null,daily:Object.fromEntries(['quote','question','artwork','songTitle','spotifyUrl'].map(k=>[k,String(data.get(k)||'')])),version:Number(form.dataset.version||0)};}
  const artForm=document.querySelector('#admin-dialog [data-form="artwork"]');
  if(artForm){const data=new FormData(artForm);artworkEditor=Object.fromEntries(['title','description','alt','mood','tag','credit','source','question','assetId'].map(k=>[k,String(data.get(k)||'')]));artworkEditor.rightsConfirmed=artForm.querySelector('[name="rightsConfirmed"]')?.checked ?? data.has('rightsConfirmed');}
}
function sameView(revision,uid){return revision===viewRevision && user?.uid===uid;}
async function showAdmin(tab=currentAdminTab,refresh=true,options={}) {
  if(!isAdmin()){showAccount();toast('Yönetim masası yalnızca yetkili yönetici hesabına açık.');return;}
  currentAdminTab=tab;
  const ticket=++dashboardRequest,uid=user.uid;
  if(!document.querySelector('#admin-dialog[open]'))openDialog('#admin-dialog',`<div class="admin-body"><h2>Yönetim masası</h2><p role="status">Sofra hazırlanıyor…</p></div>`);
  const revision=viewRevision;
  if(backendEnabled() && refresh) {
    try {
      const value=await getAdminDashboard({commentStatus,...(adminDate?{date:adminDate}:{}),...(artworkId?{selectedArtwork:artworkId}:{}),...(selectedAsset?{selectedAsset}:{}),...options});
      if(ticket!==dashboardRequest || !sameView(revision,uid) || !isAdmin())return;
      adminSnapshot=value;
    }catch(error){if(ticket===dashboardRequest && sameView(revision,uid))renderDialog('#admin-dialog',`<div class="admin-body"><h2>Bağlantı kurulamadı</h2><p>${esc(backendErrorMessage(error))}</p><button class="btn admin-retry" data-action="admin">Yeniden dene</button></div>`,'',true);return;}
  }
  const visibleAiBusy = (aiBusyContext && (aiBusyContext.tab !== tab || (aiBusyContext.tab === 'daily' && (aiBusyContext.date || null) !== (adminDate || null)) || (aiBusyContext.tab === 'gallery' && (aiBusyContext.artworkId || null) !== (artworkId || null)))) ? null : aiBusy;
  renderDialog('#admin-dialog',adminHTML(adminSnapshot||{},{tab, date:adminDate, dailyEditor:adminEditor, artworkId, artworkEditor, selectedAsset, commentStatus, uploadBusy, lastDeletedAsset, aiBusy:visibleAiBusy, aiDraft, daily:{...getDaily(),question:getDaily().question||defaultQuestion}}),'',true);
}
async function refreshOpenAdmin(revision,uid){if(sameView(revision,uid) && isAdmin() && document.querySelector('#admin-dialog[open]'))await showAdmin(currentAdminTab);}

const editorialCtrl = createEditorialController({
  getState: () => ({
    user,
    isAdmin: isAdmin(),
    backendEnabled: backendEnabled(),
    viewRevision,
    currentAdminTab,
    adminDate,
    artworkId,
    isDialogOpen: Boolean(document.querySelector('#admin-dialog[open]')),
    aiTicket,
    aiBusy,
    aiDraft,
    dailyEditor: adminEditor,
    artworkEditor
  }),
  rememberEditor,
  getFormContext: (tab) => {
    const context = {};
    if (tab === 'gallery') {
      const form = document.querySelector('[data-form="artwork"]');
      if (form) {
        const fd = new FormData(form);
        if (fd.get('title')) context.title = String(fd.get('title')).trim().slice(0, 100);
        if (fd.get('mood')) context.room = String(fd.get('mood')).trim().slice(0, 50);
        if (fd.get('tag')) context.theme = String(fd.get('tag')).trim().slice(0, 100);
        if (fd.get('description')) context.seed = String(fd.get('description')).trim().slice(0, 150);
      }
    } else if (tab === 'daily') {
      const form = document.querySelector('[data-form="daily"]');
      if (form) {
        const fd = new FormData(form);
        if (fd.get('quote')) context.seed = String(fd.get('quote')).trim().slice(0, 150);
        if (fd.get('songTitle')) context.title = String(fd.get('songTitle')).trim().slice(0, 100);
      }
    }
    return context;
  },
  generateEditorial,
  showAdmin,
  toast,
  backendErrorMessage,
  setAiBusy: (busy, ctx) => { aiBusy = busy; aiBusyContext = ctx; },
  setAiDraft: (draft) => { aiDraft = draft; },
  nextAiTicket: () => ++aiTicket,
  updateEditorState: ({ dailyEditor, artworkEditor: artEd }) => {
    adminEditor = dailyEditor;
    artworkEditor = artEd;
  },
  updateDomField: (target, text) => {
    if (target === 'quote') {
      const f = document.querySelector('[data-form="daily"] [name="quote"]'); if (f) f.value = text;
    } else if (target === 'question') {
      const f = document.querySelector('[data-form="daily"] [name="question"]'); if (f) f.value = text;
    } else if (target === 'description') {
      const f = document.querySelector('[data-form="artwork"] [name="description"]'); if (f) f.value = text;
    } else if (target === 'artwork-question') {
      const f = document.querySelector('[data-form="artwork"] [name="question"]'); if (f) f.value = text;
    }
  }
});

document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  const {action,id}=b.dataset;
  if(action==='close'){closeDialog(b.closest('dialog'));return;}
  if(action==='art')showArt(id);
  if(action==='reading')showReading(id);
  if(action==='random')showArt(catalog[Math.floor(Math.random()*catalog.length)]?.id);
  if(action==='table')showTable();
  if(action==='save')toggleSave(id);
  if(action==='save-detail'){toggleSave(id);b.innerHTML=`${icon('bookmark')} ${demo.saved.includes(id)?'Kaydedildi':'Sonraya sakla'}`;b.classList.toggle('btn-primary',demo.saved.includes(id));}
  if(action==='filter'){currentMood=id;renderGallery();}
  if(action==='saved'){savedOnly=!savedOnly;currentMood='all';renderGallery();document.querySelector('#library').scrollIntoView({behavior:'smooth'});}
  if(action==='menu'){const open=document.body.classList.toggle('mobile-nav-open');b.setAttribute('aria-expanded',open);}
  if(action==='play'){if(getDaily().spotifyUrl && !b.closest('.player')){forcedOriginal=false;renderPlayer();toast('Müziği alttaki Spotify oynatıcısından başlatabilirsin.');}else await togglePlay();}
  if(action==='restart'){audio.currentTime=0;toast('Acele yok, baştan dinleyelim.');}
  if(action==='mute'){audio.muted=!audio.muted;b.innerHTML=icon(audio.muted?'mute':'sound');b.setAttribute('aria-label',audio.muted?'Sesi aç':'Sesi kapat');}
  if(action==='quiz')showQuiz();
  if(action==='quiz-answer'){quizAnswers.push(id);renderQuiz();}
  if(action==='quiz-back'){quizAnswers.pop();renderQuiz();}
  if(action==='quiz-discover'){document.querySelector('#quiz-dialog').close();currentMood=id;savedOnly=false;renderGallery();document.querySelector('#library').scrollIntoView({behavior:'smooth'});}
  if(action==='account')showAccount();
  if(action==='google'){
    if(authBusy || session.loading)return;
    if(!authConfigured()){toast('Giriş bağlantısı henüz yapılandırılmamış.');return;}
    authBusy=true; googleBusy=true;
    document.querySelectorAll('#account-dialog .account-buttons button').forEach(btn=>{btn.disabled=true;});
    b.setAttribute('aria-busy','true');
    b.textContent='Google penceresinde devam et…';
    try { await googleSignIn(); returnAfterSignIn(); toast('Sofraya hoş geldin.'); }
    catch(error) { toast(authErrorMessage(error)); }
    finally { authBusy=false; googleBusy=false; if(document.querySelector('#account-dialog[open]')?.dataset.view==='account')showAccount(); }
  }
  if(action==='signout'){
    if(authBusy)return;
    authBusy=true; b.disabled=true;
    try { await signOutCurrent(); toast('Oturumun kapandı. Bir sandalye hep var.'); }
    catch(error) { toast(authErrorMessage(error)); }
    finally { authBusy=false; if(document.querySelector('#account-dialog[open]')?.dataset.view==='account')showAccount(); }
  }
  if(action==='data-export' && user && backendEnabled()){
    if(dataBusy)return;
    const owner=user,uid=owner.uid,provider=session.providerId;dataBusy=true;b.disabled=true;b.textContent='Verilerin hazırlanıyor…';
    try{
      const comments=await exportMyComments({uid,request:manageMyData,isCurrent:()=>user?.uid===uid});
      if(user?.uid!==uid)throw new Error('ACCOUNT_CHANGED');
      const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),account:{uid,provider,name:owner.displayName||null,email:owner.email||null},comments},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='sofra-verilerim.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
      toast('Yorumların indirmeye hazır. Cihazındaki kaydettiklerin bu hesaba bağlı değil.');
    }catch(error){if(user?.uid===uid)toast(backendErrorMessage(error));}
    finally{dataBusy=false;if(b.isConnected){b.disabled=false;b.textContent='Yorumlarımı indir';}}
    return;
  }
  if(action==='data-delete-confirm' && user && !isAdmin() && !dataBusy){
    warmAuth();
    openDialog('#account-dialog',`<div class="account-body"><h2>Sofra hesabını sil</h2><p>Bu sitedeki hesabın ve bekleyen, onaylı, gizlenmiş tüm yorumların silinecek. Google hesabın silinmez. Bu işlem geri alınamaz.</p><p>Devam etmeden Google ile kimliğini yeniden doğrulayacağız. İşlem yarıda kalırsa aynı hesaptan tekrar deneyebilirsin.</p><p>Yedekler ve servis güvenlik kayıtları kendi saklama süreleri sonunda kaldırılır. <a href="/gizlilik/">Ayrıntılar</a></p><div class="account-buttons"><button class="btn btn-primary" data-action="data-delete">${DELETE_ACCOUNT_LABEL}</button><button class="btn" data-action="account">Vazgeç</button></div></div>`,'delete-account');return;
  }
  if(action==='data-delete' && user && !isAdmin() && backendEnabled()){
    if(dataBusy)return;
    const uid=user.uid;
    dataBusy=true;authBusy=true;b.disabled=true;b.textContent='İşlemin sürüyor…';
    try{
      await eraseAccountWorkflow({
        uid,
        isCurrent:()=>user?.uid===uid,
        reauthenticate:reauthenticateForDeletion,
        removeComments:currentUid=>removeMyComments({uid:currentUid,request:manageMyData,isCurrent:()=>user?.uid===currentUid}),
        deleteAuthAccount:deleteCurrentAccount,
      });
      demo.saved=[];demo.comments=[];demo.daily={};
      try{browserStorage?.removeItem('sofra-art-demo-v1');sessionStorage.removeItem('sofra-nickname');}catch{}
      remotePending=[];remoteComments.clear();render();renderPlayer();
      if(document.querySelector('#account-dialog[open]')?.dataset.view==='delete-account')closeDialog(document.querySelector('#account-dialog'));
      toast('Sofra hesabın ve yorumların silindi. Google hesabın değişmedi.');
      refreshPublic('table',true).catch(()=>{});
    }catch(error){if(user?.uid===uid)toast(error?.code?.startsWith('auth/')?authErrorMessage(error):backendErrorMessage(error));}
    finally{dataBusy=false;authBusy=false;if(b.isConnected){b.disabled=false;b.textContent=DELETE_ACCOUNT_LABEL;}}
    return;
  }
  if(action==='ai-dismiss'){editorialCtrl.onDismissClick();return;}
  if(action==='ai-apply'){editorialCtrl.onApplyClick(b.dataset);return;}
  if(action==='ai-draft'){await editorialCtrl.onDraftClick(b.dataset);return;}
  if(action==='admin')showAdmin();
  if(action==='admin-tab'){viewRevision++;rememberEditor();showAdmin(id,backendEnabled()&&!adminSnapshot);}
  if(action==='original-audio'){forcedOriginal=true;renderPlayer();togglePlay();}
  if(action==='spotify-allow'){spotifyAllowed=true;saveSpotifyPreference(browserStorage,true);forcedOriginal=false;renderPlayer();if(document.querySelector('#account-dialog[open]')?.dataset.view==='music-settings')showMusicSettings();toast('Spotify iznin kaydedildi. Tercihini sayfanın altından değiştirebilirsin.');}
  if(action==='spotify-deny'){spotifyAllowed=false;saveSpotifyPreference(browserStorage,false);renderPlayer();if(document.querySelector('#account-dialog[open]')?.dataset.view==='music-settings')showMusicSettings();toast('Spotify oynatıcısı kapatıldı. Sofra kaydını dinlemeye devam edebilirsin.');}
  if(action==='spotify-settings')showMusicSettings();
  if(action==='gallery-more'){
    if(!catalogCursor)return;b.disabled=true;
    try{const value=await getPublicContent('table',catalogCursor);catalog=[...new Map([...catalog,...value.artworks].map(a=>[a.id,a])).values()];catalogCursor=value.catalogCursor;renderGallery();}catch(error){toast(backendErrorMessage(error));b.disabled=false;}
  }
  if(action==='daily-now'){viewRevision++;adminDate=null;adminEditor=null;showAdmin('daily',false);}
  if(action==='package-edit'){viewRevision++;adminDate=id;adminEditor=null;showAdmin('daily',true);}
  if(action==='artwork-new'){viewRevision++;artworkId=null;artworkEditor=null;selectedAsset=null;showAdmin('gallery',false);}
  if(action==='artwork-edit'){viewRevision++;artworkId=id;artworkEditor=null;showAdmin('gallery',false);}
  if(action==='asset-use'){viewRevision++;artworkId=null;artworkEditor=null;selectedAsset=id;showAdmin('gallery',false);}
  if(action==='artwork-hide' && isAdmin()){
    const revision=viewRevision,uid=user.uid;b.disabled=true;
    try{await manageContent({operation:'unpublishArtwork',id,version:Number(b.dataset.version)});await refreshOpenAdmin(revision,uid);await refreshPublic('table',true);toast('Eser yayından kaldırıldı; taslağı korunuyor.');}catch(error){toast(backendErrorMessage(error));b.disabled=false;}
  }
  if(action==='admin-more' && isAdmin()){
    rememberEditor();const kind=id, cursor=b.dataset.cursor,revision=viewRevision,uid=user.uid;
    const config={comments:['commentCursor','comments'],assets:['assetCursor','assets'],artworks:['artworkCursor','artworks'],packages:['packageCursor','packages']}[kind];
    if(!config)return;b.disabled=true;
    try{const value=await getAdminDashboard({commentStatus,[config[0]]:cursor,...(adminDate?{date:adminDate}:{})});
      if(!sameView(revision,uid) || !isAdmin())return;
      adminSnapshot={...adminSnapshot,[config[1]]:[...new Map([...(adminSnapshot[config[1]]||[]),...(value[config[1]]||[])].map(a=>[a.id||a.date,a])).values()],[config[0]]:value[config[0]]};
      showAdmin(currentAdminTab,false);
    }catch(error){toast(backendErrorMessage(error));b.disabled=false;}
  }
  if(['asset-delete','asset-restore'].includes(action) && isAdmin() && backendEnabled()) {
    const revision=viewRevision,uid=user.uid;
    const asset=action==='asset-delete'?adminSnapshot?.assets.find(a=>a.id===id):lastDeletedAsset;
    if(!asset || asset.id!==id)return;
    b.disabled=true;
    try {
      await manageContent({operation:action==='asset-delete'?'deleteAsset':'restoreAsset',assetId:id});
      if(user?.uid!==uid)return;
      if(action==='asset-delete'){
        lastDeletedAsset=asset;
        adminSnapshot.assets=adminSnapshot.assets.filter(a=>a.id!==id);
        if(selectedAsset===id)selectedAsset=null;
        if(artworkEditor?.assetId===id)artworkEditor.assetId='';
      }else{
        if(!adminSnapshot.assets.some(a=>a.id===id))adminSnapshot.assets.push(asset);
        lastDeletedAsset=null;
      }
      if(sameView(revision,uid))showAdmin(currentAdminTab,false);
    }catch(error){if(sameView(revision,uid))toast(backendErrorMessage(error));b.disabled=false;}
  }
  if(action==='asset-preview' && isAdmin() && backendEnabled()) {
    const ticket=++dashboardRequest,uid=user.uid;
    const asset=adminSnapshot?.assets.find(a=>a.id===id);if(!asset)return;
    b.disabled=true;
    try {
      const url=await getArtworkUrl(id);
      if(ticket!==dashboardRequest || user?.uid!==uid || !isAdmin() || !document.querySelector('#admin-dialog[open]'))return;
      openDialog('#admin-dialog',`<div class="admin-body asset-preview-body"><span class="eyebrow">GÖRSEL ÖNİZLEMESİ</span><h2>${esc(asset.name)}</h2><p class="asset-preview-meta">${asset.width} × ${asset.height} px · WebP</p><div class="asset-preview-stage"><img class="asset-preview-image" src="${esc(url)}" alt="${esc(asset.name)}" width="${asset.width}" height="${asset.height}" /></div><button class="btn" data-action="close">${icon('back')} Görsellere dön</button></div>`,'asset-preview');
    }
    catch(error){toast(backendErrorMessage(error));b.disabled=false;}
  }
  if(action==='moderate'){if(!isAdmin()){showAccount();return;}
    if(backendEnabled()) {
      b.disabled=true;const revision=viewRevision,uid=user.uid;
      try {
        await manageContent({operation:'moderateComment',commentId:id,status:b.dataset.status});
        await refreshOpenAdmin(revision,uid);
        await refreshPublic('table');
        if(b.dataset.status==='rejected'){
          toast(SOFRA_SHH,'sofra-shh');
        } else {
          toast('Yorum onaylandı ve masada yerini aldı.');
        }
      }
      catch(error){toast(backendErrorMessage(error));b.disabled=false;}
      return;
    }
    const c=demo.comments.find(c=>c.id===id);
    if(c&&['approved','rejected'].includes(b.dataset.status)){
      c.status=b.dataset.status;
      persist();
      renderTable();
      showAdmin('comments');
      if(c.status==='rejected'){
        toast(SOFRA_SHH,'sofra-shh');
      } else {
        toast('Not bu cihazda görünür hâle getirildi.');
      }
    }}
  if(action==='share-art'){try{const url=new URL(location.href);url.hash=`art-${id}`;await navigator.clipboard.writeText(url.href);toast('Bu eserin bağlantısı kopyalandı.');}catch{toast('Bağlantı kopyalanamadı. Adres çubuğundan paylaşabilirsin.');}}
  if(action==='about')openDialog('#account-dialog',`<div class="account-body about-body"><div class="brand">${brand}</div><h2>Küçük bir dijital sığınak.</h2><p>Dışarısı biraz bekleyebilir. Burada bir resimde oyalanabilir, bir şarkının içinde kalabilir, birkaç satırla kendine dönebilirsin.</p><div class="notice">Sofra, günün gürültüsüne küçük bir ara. Merak ettiğin bir kapıyı aç, sana iyi geleni yanında tut. Bir yere yetişmen gerekmiyor; burada biraz durman yeter.</div><button class="btn about-return" data-action="close">Sofraya dön ${icon('arrow')}</button></div>`,'about');
});

document.addEventListener('click',e=>{if(e.target.closest('.nav a')){document.body.classList.remove('mobile-nav-open');document.querySelector('[data-action="menu"]')?.setAttribute('aria-expanded','false');}});
document.addEventListener('submit',async e=>{
  const form=e.target;if(!form.dataset.form)return;e.preventDefault();
  const data=new FormData(form);
  if(form.dataset.form==='comment'){
    const name=String(data.get('name')||'').trim(),text=String(data.get('text')||'').trim();
    if(backendEnabled()) {
      if(!user){showAccount();return;}
      const button=form.querySelector('[type="submit"]');if(button.disabled)return;button.disabled=true;
      const revision=viewRevision,uid=user.uid;
      button.setAttribute('aria-busy','true');button.innerHTML='<span class="button-spinner" aria-hidden="true"></span> Sözün değerlendiriliyor…';
      const signature=JSON.stringify([name,text,form.dataset.id,form.dataset.tableKey]);
      if(form.dataset.signature!==signature){form.dataset.requestId=crypto.randomUUID();form.dataset.signature=signature;}
      const requestId=form.dataset.requestId;
      try {
        const result=await submitComment({artId:form.dataset.id,name,text,requestId,...(form.dataset.id==='table'?{tableKey:form.dataset.tableKey}:{})});
        if(user?.uid!==uid)return;
        if(result.status==='approved') {
          if(sameView(revision,uid)){
            if(form.dataset.id==='table')closeDialog(document.querySelector('#detail-dialog'));else showArt(form.dataset.id);
            toast('Sözün masaya ulaştı ve yerini aldı.');
          }
          // Approval is already committed. A failed list refresh must not turn
          // success into a submission error or leave the Night Table modal open.
          try{await refreshPublic(form.dataset.id);}catch{}
        } else if(result.status==='rejected') {
          if(sameView(revision,uid))toast(SOFRA_SHH,'sofra-shh');
        } else {
          if(!remotePending.some(c=>c.id===result.id))remotePending.push({id:result.id,artId:form.dataset.id,name,text,status:'pending'});
          if(sameView(revision,uid)){form.dataset.id==='table'?showTable():showArt(form.dataset.id);toast('Sözün masaya ulaştı. Onaydan sonra burada görünecek.');}
        }
      } catch(error){
        if(sameView(revision,uid))toast(backendErrorMessage(error));
      } finally {
        if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML='Sofraya bırak '+icon('send');}
      }
      return;
    }
    const check=checkComment({name,text,artId:form.dataset.id,previous:demo.comments,lastSubmitted});
    if(check==='invalid'){toast('Bir takma ad ve 1–500 karakterlik bir yorum yazabilirsin.');return;}
    if(check==='duplicate'){toast('Bu yorumu bu sohbete zaten bıraktın.');return;}
    if(check==='rate-limit'){toast('Biraz hızlı ilerliyoruz. 20 saniye bekleyip yeniden dene.');return;}
    const artId=form.dataset.id;if(artId!=='table'&&!artworks.some(a=>a.id===artId))return;
    demo.comments.push({id:crypto.randomUUID(),name,text,artId,status:'pending'});demo.comments=demo.comments.slice(-40);lastSubmitted=Date.now();
    try{sessionStorage.setItem('sofra-nickname',name);}catch{}
    persist();if(artId==='table')showTable();else showArt(artId);toast('Notun bu cihazda sana özel saklandı.');
  }
  if(form.dataset.form==='upload' && backendEnabled()) {
    if(!isAdmin()){showAccount();return;}
    if(uploadBusy)return;
    const file=data.get('image');
    if(!file || typeof file==='string')return;
    const uid=user.uid,revision=viewRevision;
    const fileKey=`${file.name}:${file.size}:${file.lastModified || 0}`;
    if(!pendingUpload || pendingUpload.fileKey!==fileKey || pendingUpload.uid!==uid) {
      pendingUpload={
        fileKey,
        uid,
        uploadId:(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():null
      };
    }
    const currentUploadId=pendingUpload.uploadId;
    uploadBusy=true;
    const setBusy=busy=>{
      const f=document.querySelector('[data-form="upload"]');if(!f)return;
      const button=f.querySelector('[type="submit"]');button.disabled=busy;button.setAttribute('aria-busy',String(busy));
      button.innerHTML=busy?'<span class="button-spinner" aria-hidden="true"></span> Yükleniyor…':'Görseli ekle';
      f.querySelector('[type="file"]').disabled=busy;
    };
    setBusy(true);
    try {
      const result=await uploadArtwork(file,currentUploadId);
      if(user?.uid!==uid)return;
      pendingUpload=null;
      if(sameView(revision,uid))selectedAsset=result.id;
      if(sameView(revision,uid) && isAdmin() && document.querySelector('#admin-dialog[open]')){await showAdmin(currentAdminTab);toast('Görselin güvenle eklendi.');}
    }
    catch(error){if(user?.uid===uid)toast(backendErrorMessage(error));}
    finally {uploadBusy=false;setBusy(false);}
  }
  if(form.dataset.form==='artwork'){
    if(!isAdmin())return;
    rememberEditor();const revision=viewRevision,uid=user.uid;
    const buttons=[...form.querySelectorAll('[type="submit"]')];buttons.forEach(b=>b.disabled=true);
    try{const result=await manageContent({operation:e.submitter?.name==='publish'?'publishArtwork':'saveArtwork',...(form.dataset.id?{id:form.dataset.id}:{}),version:Number(form.dataset.version),artwork:artworkEditor});
      if(user?.uid!==uid)return;
      if(sameView(revision,uid)){artworkId=result.id;artworkEditor=null;}
      await refreshOpenAdmin(revision,uid);await refreshPublic('table',true);toast(result.status==='published'?'Eser galeriye yayınlandı.':'Eser taslağı kaydedildi.');
    }catch(error){toast(backendErrorMessage(error));buttons.forEach(b=>b.disabled=false);}
  }
  if(form.dataset.form==='daily'){
    if(!isAdmin())return;
    const value=Object.fromEntries(['quote','question','artwork','songTitle','spotifyUrl'].map(k=>[k,String(data.get(k)||'').trim()]));
    if(value.spotifyUrl && e.submitter?.name!=='unschedule'){
      const track=spotifyTrackUrl(value.spotifyUrl);
      if(!track){toast('Yalnızca tek bir Spotify şarkısının bağlantısını ekleyebilirsin.');form.elements.spotifyUrl.focus();return;}
      value.spotifyUrl=track;
    }
    const date=form.dataset.date || null;
    const operation=e.submitter?.name==='unschedule'?'unschedulePackage':date?(e.submitter?.name==='publish'?'schedulePackage':'savePackage'):(e.submitter?.name==='publish'?'publishDaily':'saveDaily');
    const revision=viewRevision,uid=user.uid;
    const buttons=[...form.querySelectorAll('[type="submit"]')];buttons.forEach(b=>b.disabled=true);
    try{
      await manageContent({operation,...(operation==='unschedulePackage'?{}:{daily:value}),version:Number(form.dataset.version),...(date?{date}:{})});
      if(user?.uid!==uid)return;
      if(sameView(revision,uid))adminEditor=null;
      forcedOriginal=false;
      await refreshOpenAdmin(revision,uid);await refreshPublic('table',true);
      toast(operation==='schedulePackage'?'Günün sofrası için yayın planlandı.':operation==='unschedulePackage'?'Yayın planı kaldırıldı.':operation==='publishDaily'?'Günün sofrası yayınlandı.':'Taslağın kaydedildi.');
    }catch(error){toast(backendErrorMessage(error));buttons.forEach(b=>b.disabled=false);}
  }

});

function handleHash(){
  const match=location.hash.match(/^#art-([a-zA-Z0-9_-]+)$/);
  if(match){showArt(match[1]);return;}
  // Back/forward away from a shared artwork must also dismiss its modal.
  // Invalidate any artwork request still in flight before it can reopen it.
  viewRevision++;
  const detail=document.querySelector('#detail-dialog[open]');
  if(currentArtId && detail)closeDialog(detail);
}
window.addEventListener('hashchange',handleHash);
// Request-time server resolution also works when the site was closed at midnight.
setInterval(()=>{if(dayKey()!==displayedDay){if(backendEnabled())refreshPublic('table',true).catch(()=>{});else{displayedDay=dayKey();render();}}},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden && backendEnabled())refreshPublic('table',true).catch(()=>{});});
render();renderPlayer();handleHash();
refreshPublic('table',true).then(()=>{if(!document.querySelector('dialog[open]'))handleHash();}).catch(error=>{
  if(typeof error?.code==='string' && /^(functions|appCheck)\/[a-z-]+$/.test(error.code))console.warn('Sofra content connection',error.code);
  toast('Günün sofrasına bağlanamadık. Birazdan yeniden deneyebilirsin.');
});

// Restore and track Auth independently of gallery/player rendering.
observeSession(next => {
  const previousUser=user;
  if(previousUser?.uid!==next.user?.uid){remotePending=[];adminSnapshot=null;adminEditor=null;artworkEditor=null;artworkId=null;selectedAsset=null;lastDeletedAsset=null;pendingUpload=null;aiBusy=null;aiBusyContext=null;aiDraft=null;aiTicket++;dashboardRequest++;viewRevision++;}
  session = next; user = next.user;
  syncAccountUI();
  if (document.querySelector('#account-dialog[open]')?.dataset.view==='account' && !authBusy) {
    if(user && !previousUser)returnAfterSignIn();else showAccount();
  }
}, code => {console.warn('Sofra session verification',code);toast('Oturum yetkisi doğrulanamadı. Yönetim işlemleri kapalı.');})
  .catch(() => {
    session = { user: null, admin: false, providerId: null, loading: false, error: 'AUTH_UNAVAILABLE' };
    user = null; syncAccountUI();
    if(document.querySelector('#account-dialog[open]')?.dataset.view==='account')showAccount();
    toast('Oturum bilgileri yüklenemedi. Siteyi misafir olarak gezebilirsin.');
  });

 document.addEventListener('change',e=>{
  if(e.target.dataset.control==='package-date'){viewRevision++;rememberEditor();adminDate=e.target.value || null;adminEditor=null;showAdmin('daily',true);}
  if(e.target.dataset.control==='comment-status'){commentStatus=e.target.value;showAdmin('comments',true);}
 });
