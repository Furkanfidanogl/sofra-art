import {escapeHTML as esc} from './demo-store.js';
import {moods,artworks as originals} from './content.js';
const labels={draft:'Taslak',published:'Yayında',hidden:'Yayından kaldırıldı',scheduled:'Yayın planlandı',pending:'Onay bekliyor',approved:'Onaylandı',rejected:'Reddedildi'};
export const reasonLabels={
  'quota-limit':'Saatlik bütçe sınırı aşıldı',
  'quota-exceeded':'Gemini API kotası aşıldı (429)',
  'safety-blocked':'Model güvenlik filtresi tetiklendi',
  'timeout':'Model zaman aşımına uğradı',
  'api-error':'Model API hatası',
  'schema-mismatch':'Model şema uyuşmazlığı',
  'evaluation-error':'Değerlendirme hatası',
  'disabled':'Gemini moderasyonu kapalı / anahtar yok',
  'explicit-content':'Açık küfür/argo filtresi (otomatik ret)',
  'review-disagreement':'İki bağlam değerlendirmesi uyuşmadı; yönetici incelemesi gerekiyor',
};
export function commentStatusLabel(c, now = Date.now()) {
  if (c.status === 'pending') {
    if (c.moderation) {
      if (c.moderation.reason === 'disabled') return 'İnceleme bekliyor · Servis kapalı';
      if (c.moderation.errorReason === 'quota-limit') return 'İnceleme bekliyor · Kota aşımı';
      if (c.moderation.errorReason) return 'İnceleme bekliyor · Sistem hatası';
      if (c.moderation.decision === 'unclear') return 'İnceleme bekliyor · Model belirsiz';
      return 'İnceleme bekliyor';
    }
    const age = now - (c.createdAt || 0);
    if (age >= 0 && age < 30000) {
      return 'Değerlendiriliyor…';
    }
    return 'İnceleme bekliyor · Eski kayıt';
  }
  return labels[c.status] || c.status;
}
const input=(label,name,value='',max=160,type='text')=>`<label><span class="field-label">${label}</span><input class="input" name="${name}" type="${type}" value="${esc(value)}" ${max?`maxlength="${max}"`:''} ${type==='url'?'':'required'} /></label>`;
const area=(label,name,value,max)=>`<label><span class="field-label">${label}</span><textarea class="input" name="${name}" maxlength="${max}" required>${esc(value||'')}</textarea></label>`;
const select=(label,name,options)=>`<div><label class="field-label" for="admin-${name}">${label}</label><select id="admin-${name}" class="input" name="${name}">${options}</select></div>`;
const more=(kind,cursor)=>cursor?`<button class="btn panel-more" type="button" data-action="admin-more" data-id="${kind}" data-cursor="${esc(cursor)}">Daha fazlasını göster</button>`:'';
const aiDraftBox=(type,target,ui)=>{
  if(!ui?.aiDraft || ui.aiDraft.target!==target)return '';
  if(ui.aiDraft.context){
    const ctx=ui.aiDraft.context;
    if(ctx.tab!==ui.tab)return '';
    if(ui.tab==='daily' && (ctx.date||null)!==(ui.date||null))return '';
    if(ui.tab==='gallery' && (ctx.artworkId||null)!==(ui.artworkId||null))return '';
  }
  return `<div class="ai-suggestion-box" role="region" aria-label="Editoryal taslak önerisi"><div class="ai-suggestion-header"><span class="ai-suggestion-badge">✧ Editoryal Taslak Önerisi</span><button class="text-link ai-suggestion-dismiss" type="button" data-action="ai-dismiss">Kapat</button></div><p class="ai-suggestion-text">${esc(ui.aiDraft.text)}</p><div class="ai-suggestion-actions"><button class="btn btn-primary" type="button" data-action="ai-apply" data-target="${esc(target)}">Forma uygula</button><button class="btn" type="button" data-action="ai-dismiss">Vazgeç</button></div><p class="panel-help">Bu öneri kaydedilmedi. "Forma uygula" diyerek metni form kutusuna aktarabilir, dilediğin gibi düzenleyebilirsin.</p></div>`;
};
const aiTrigger=(type,target,label,ui)=>{
  const busy=ui?.aiBusy===target;
  return `<div class="field-ai-row"><button class="text-link ai-draft-btn" type="button" data-action="ai-draft" data-type="${esc(type)}" data-target="${esc(target)}" ${busy?'disabled aria-busy="true"':''}>${busy?'<span class="button-spinner" aria-hidden="true"></span> Öneri hazırlanıyor…':`✧ ${esc(label)}`}</button></div>`;
};
export function adminHTML(s,ui) {
  const tabs=[['daily','Günün sofrası'],['gallery','Galeri'],['comments','Yorumlar'],['uploads','Görseller']];
  let body='';
  const works=s.artworks || originals.map(a=>({id:a.id,status:'published',artwork:a,version:0}));
  if(ui.tab==='daily') {
    const selected=ui.date?(s.selectedPackage?.date===ui.date?s.selectedPackage:(s.packages||[]).find(p=>p.date===ui.date)):null;
    const draft=ui.dailyEditor?.date===ui.date?ui.dailyEditor:null;
    const value=draft?.daily || (ui.date?selected?.draft || selected?.published:s.legacyDaily) || ui.daily;
    const version=draft?.version ?? (ui.date?selected?.version:s.version) ?? 0;
    body=`<div class="daily-planning"><label><span class="field-label">Hazırlanacak gün · Türkiye saati</span><input class="input" type="date" data-control="package-date" value="${esc(ui.date||'')}" /></label><button class="text-link" data-action="daily-now">Şu anki sofrayı düzenle</button></div><p class="panel-help">${ui.date?`${esc(ui.date)} için hazırlanıyor. Planlanan sofra Türkiye saatiyle 00.00’dan itibaren görünür. ${selected?.status==='scheduled'?'Bu günün yayını planlı; taslağı değiştirmek planı değiştirmez.':''}`:'Bu alan şu anki sofrayı hemen yayınlar. İleri bir gün hazırlamak için tarih seç.'}</p>
    <form class="admin-form" data-form="daily" data-version="${version}" data-date="${esc(ui.date||'')}">
      ${area('Günün sözü · Kaynağını doğruladığın alıntı veya özgün not','quote',value.quote,180)}
      ${aiTrigger('note','quote','Özgün söz önerisi al',ui)}
      ${aiDraftBox('note','quote',ui)}
      ${input('Günün sorusu','question',value.question,160)}
      ${aiTrigger('question','question','Soru önerisi al',ui)}
      ${aiDraftBox('question','question',ui)}
      ${select('Günün eseri','artwork',works.filter(a=>a.status==='published').map(a=>`<option value="${esc(a.id)}" ${value.artwork===a.id?'selected':''}>${esc(a.artwork.title)}</option>`).join(''))}
      ${input('Günün müzik başlığı','songTitle',value.songTitle,70)}
      <label><span class="field-label">Spotify şarkı bağlantısı · İsteğe bağlı</span><input class="input" type="url" name="spotifyUrl" value="${esc(value.spotifyUrl||'')}" placeholder="https://open.spotify.com/track/…" maxlength="200" /></label>
      <p class="panel-help">Yalnızca tek bir şarkının Spotify bağlantısını ekle. Bağlantı boşsa özgün Sofra kaydı çalar.</p>
      <div class="panel-actions"><button class="btn" type="submit">Taslağı kaydet</button><button class="btn btn-primary" type="submit" name="publish" value="true">${ui.date?'Bu güne yayın planla':'Şimdi yayınla'}</button>${ui.date && selected?.status==='scheduled'?'<button class="btn" type="submit" name="unschedule" value="true" formnovalidate>Yayın planını kaldır</button>':''}</div>
    </form>
    <div class="panel-list-heading"><h3>Hazırlanan sofralar</h3><span class="panel-help">Bugün: ${esc(s.serverDate||'')}</span></div><div class="package-list">${(s.packages||[]).map(p=>`<button class="panel-record" data-action="package-edit" data-id="${p.date}"><span><strong>${esc(p.date)}</strong><small>${esc(p.draft?.question||p.published?.question||'')}</small></span><span class="admin-status">${labels[p.status]}</span></button>`).join('') || '<p class="panel-help">Henüz tarihli sofra yok. Yukarıdan bir gün seçerek başlayabilirsin.</p>'}</div>${more('packages',s.packageCursor)}`;
  }
  if(ui.tab==='gallery') {
    const record=works.find(a=>a.id===ui.artworkId);
    const a=ui.artworkEditor || record?.artwork || {title:'',description:'',alt:'',mood:'calm',tag:'SOFRA SEÇKİSİ',credit:'',source:'',question:'Bu görsel sana ne hissettirdi?',assetId:ui.selectedAsset||'',rightsConfirmed:false};
    body=`<div class="panel-list-heading"><h3>${record?'Eseri düzenle':'Yeni eser'}</h3><button class="text-link" data-action="artwork-new">Yeni eser hazırla</button></div>
    <form class="admin-form" data-form="artwork" data-id="${esc(record?.id||'')}" data-version="${record?.version||0}">
      ${input('Eserin başlığı','title',a.title,100)}
      ${select('Görsel','assetId',`${record && originals.some(o=>o.id===record.id)?`<option value="" ${!a.assetId?'selected':''}>Mevcut seçki görseli</option>`:'<option value="">Yüklenmiş bir görsel seç</option>'}${a.assetId && !(s.assets||[]).some(v=>v.id===a.assetId)?`<option value="${esc(a.assetId)}" selected>Bu eserin kayıtlı görseli</option>`:''}${(s.assets||[]).map(v=>`<option value="${esc(v.id)}" ${a.assetId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}`)}
      <p class="panel-help">Yeni bir dosya eklemek için Görseller sekmesini kullan. Görsel listesinden eski dosyaları da yükleyebilirsin.</p>
      ${area('Eser açıklaması','description',a.description,1200)}
      ${aiTrigger('description','description','Açıklama önerisi al',ui)}
      ${aiDraftBox('description','description',ui)}
      ${input('Görsel betimlemesi · Erişilebilirlik','alt',a.alt,240)}
      <div class="panel-field-row">${select('Hangi odada?','mood',moods.filter(m=>m.id!=='all').map(m=>`<option value="${m.id}" ${a.mood===m.id?'selected':''}>${esc(m.label)}</option>`).join(''))}${input('Kısa etiket','tag',a.tag,60)}</div>
      ${input('Sanatçı / kaynak / kullanım hakkı bilgisi','credit',a.credit,240)}
      <label><span class="field-label">Kaynak bağlantısı · İsteğe bağlı</span><input class="input" name="source" type="url" value="${esc(a.source||'')}" maxlength="500" placeholder="https://…" /></label>
      ${input('Eserin altında sorulacak soru','question',a.question,160)}
      ${aiTrigger('question','artwork-question','Soru önerisi al',ui)}
      ${aiDraftBox('question','artwork-question',ui)}
      <label class="panel-checkbox"><input type="checkbox" name="rightsConfirmed" ${a.rightsConfirmed?'checked':''} required /><span>Görseli yayımlama hakkım var; kaynak ve atıf bilgilerini kontrol ettim.</span></label>
      <div class="panel-actions"><button class="btn" type="submit">Taslağı kaydet</button><button class="btn btn-primary" type="submit" name="publish" value="true">${record?.status==='published'?'Değişiklikleri yayınla':'Galeriye yayınla'}</button></div>
    </form>
    <div class="panel-list-heading"><h3>Galeri içerikleri</h3></div><div class="artwork-records">${works.map(w=>`<article class="panel-record"><button data-action="artwork-edit" data-id="${esc(w.id)}"><strong>${esc(w.artwork.title)}</strong><small>${esc(labels[w.status])} · ${esc(moods.find(m=>m.id===w.artwork.mood)?.label||'')}</small></button>${w.status==='published'?`<button class="text-link" data-action="artwork-hide" data-id="${esc(w.id)}" data-version="${w.version}">Yayından kaldır</button>`:''}</article>`).join('')}</div>${more('artworks',s.artworkCursor)}`;
  }
  if(ui.tab==='comments') {
    const nowTime=s.serverTime || Date.now();
    body=`<label><span class="field-label">Yorum durumu</span><select class="input" data-control="comment-status">${['pending','approved','rejected','all'].map(status=>`<option value="${status}" ${ui.commentStatus===status?'selected':''}>${status==='all'?'Bekleyen ve onaylı':labels[status]}</option>`).join('')}</select></label><div class="admin-comment-list">${(s.comments||[]).map(c=>`<article class="admin-comment"><div class="row"><small>${esc(c.name)} · ${c.artId==='table'?'Gece Masası':esc(works.find(a=>a.id===c.artId)?.artwork.title||c.artId)}${c.packageDate?' · '+esc(c.packageDate):''}</small><span class="admin-status">${commentStatusLabel(c,nowTime)}</span></div>${c.question?`<p class="panel-help">${esc(c.question)}</p>`:''}<p>${esc(c.text)}</p>${c.moderation?.errorReason||c.moderation?.reason?`<p class="panel-help moderation-note" style="color:var(--text-subtle);font-size:0.8rem">Moderasyon nedeni: ${esc(reasonLabels[c.moderation.errorReason||c.moderation.reason]||c.moderation.errorReason||c.moderation.reason)} (${esc(c.moderation.model||'gemini')})</p>`:(!c.moderation&&c.status==='pending'&&nowTime-(c.createdAt||0)>=30000?`<p class="panel-help moderation-note" style="color:var(--text-subtle);font-size:0.8rem">Moderasyon notu: Moderasyon kaydı bulunmayan bekleyen yorum (manuel inceleme gerekiyor).</p>`:'')}<div class="comment-tools">${c.status!=='approved'?`<button class="approve" data-action="moderate" data-id="${esc(c.id)}" data-status="approved">Onayla</button>`:''}${c.status!=='rejected'?`<button data-action="moderate" data-id="${esc(c.id)}" data-status="rejected">Gizle</button>`:''}</div></article>`).join('') || '<p class="panel-help">Bu durumda bir yorum yok.</p>'}</div>${more('comments',s.commentCursor)}`;
  }
  if(ui.tab==='uploads') {
    body=`<form class="admin-form" data-form="upload"><label><span class="field-label">Yeni görsel</span><input class="input upload-input" type="file" name="image" accept="image/jpeg,image/png,image/webp" required ${ui.uploadBusy?'disabled':''} /></label><small>JPEG, PNG veya WebP · En fazla 20 MB</small><button class="btn btn-primary upload-submit" type="submit" aria-busy="${ui.uploadBusy}" ${ui.uploadBusy?'disabled':''}>${ui.uploadBusy?'<span class="button-spinner" aria-hidden="true"></span> Yükleniyor…':'Görseli ekle'}</button></form><p class="panel-help">Dosyalar burada özel kalır. Galeriye yayınladığında ziyaretçilere açılır.</p>${ui.lastDeletedAsset?`<div class="asset-undo" role="status"><span>Görsel listeden kaldırıldı.</span><button class="text-link" data-action="asset-restore" data-id="${esc(ui.lastDeletedAsset.id)}">Geri al</button></div>`:''}<div class="admin-assets">${(s.assets||[]).map(a=>`<div class="panel-record"><button class="text-link" data-action="asset-preview" data-id="${esc(a.id)}">${esc(a.name)}</button><div class="asset-row-actions"><button class="btn" data-action="asset-use" data-id="${esc(a.id)}">Eser hazırla</button><button class="asset-delete" data-action="asset-delete" data-id="${esc(a.id)}" aria-label="${esc(a.name)} — sil">Sil</button></div></div>`).join('')}</div>${more('assets',s.assetCursor)}`;
  }
  return `<div class="admin-body"><span class="eyebrow">SOFRA ART · YÖNETİM MASASI</span><h2>Bugün sofrada ne var?</h2><div class="notice">İçeriğini hazırla, taslağını sakla; hazır olduğunda yayınla.</div><div class="admin-tabs" role="group" aria-label="Yönetim bölümleri">${tabs.map(([id,label])=>`<button class="admin-tab ${ui.tab===id?'active':''}" data-action="admin-tab" data-id="${id}">${label}</button>`).join('')}</div>${body}</div>`;
}
