import {moods,readings} from './content.js';
import {escapeHTML as esc} from './demo-store.js';
import {imageSource,imageAttributes,HERO_SIZES} from './responsive-image.js';
import {icon,brand} from './icons.js';

const pinterestUrl = 'https://tr.pinterest.com/SofraVibes/';

export function pageTemplate({d,art,account,dateLabel,playing=false,savedOnly=false,savedCount=0,currentMood='all',backend=false,defaultQuestion='Bugün sana iyi gelen küçücük şey neydi?'}){
  return `
    <header class="site-header"><div class="wrap header-inner">
      <a class="brand" href="#main" aria-label="Sofra Art ana sayfa">${brand}</a>
      <nav class="nav" aria-label="Ana menü">
        <a href="#main" class="active">Günün Dozu</a><a href="#night">Gece Masası</a><a href="#library">Karanlık Kütüphane</a>
      </nav>
      <div class="header-actions"><button class="icon-button" data-action="saved" aria-label="Kaydettiklerim">${icon('bookmark')}</button>
      <button class="btn login-button" data-action="account" aria-busy="${account.loading}" ${account.loading?'disabled aria-label="Hesabın yükleniyor"':''}>${icon('user')}<span class="account-label ${account.loading?'account-label-loading':''}">${esc(account.label)}</span></button>
      <button class="icon-button mobile-menu" data-action="menu" aria-label="Menüyü aç" aria-expanded="false">${icon('menu')}</button></div>
    </div></header>
    <main id="main" class="wrap">
      <div class="intro-line">
        <span class="intro-right"><i class="dot" aria-hidden="true"></i>${esc(dateLabel)} <span aria-hidden="true">/</span> İLK SOFRA</span>
        <a class="intro-pinterest" href="${pinterestUrl}" target="_blank" rel="noopener noreferrer" aria-label="Sofra Art Pinterest (yeni sekme)">Pinterest ${icon('arrow')}</a>
      </div>
      <section class="hero" aria-label="Günün Dozu">
        <img src="${esc(imageSource(art.image))}" ${imageAttributes(art.image,HERO_SIZES)} alt="${esc(art.alt)}" fetchpriority="high" decoding="async" />
        <div class="hero-content"><div class="hero-kicker">${icon('star')} GÜNÜN DOZU · NO. 001</div>
          <h1>Biraz dur.<br><em>Bir şey hisset.</em></h1>
          <p class="hero-description">Sanat, müzik ve kısa okumalar için küçük bir mola. Günün eserini keşfet, şarkısını dinle, Gece Masası’na bir not bırak.</p>
          <div class="hero-buttons"><a class="btn btn-primary" href="#night">Sofraya göz at ${icon('down')}</a><button class="btn btn-ghost" data-action="random">Beni şaşırt ${icon('arrow')}</button></div>
          <a class="hero-scroll" href="#daily">${icon('down')} BUGÜNÜN SOFRASINDA NE VAR?</a>
        </div>
        <button class="icon-button hero-art-button" data-action="art" data-id="${art.id}" ${!art.id?'disabled':''} aria-label="Günün eserini incele">${icon('arrow')}</button>
        <div class="hero-art-caption">${esc(art.title)}<span>GÜNÜN ESERİ · SOFRA SEÇKİSİ</span></div>
      </section>
      <section id="daily" class="daily-strip" aria-label="Günün sözü, şarkısı ve eseri">
        <div class="daily-item"><span class="eyebrow daily-label">${icon('star')} GÜNÜN SÖZÜ</span><p class="daily-quote">“${esc(d.quote)}”</p><span class="daily-credit">${esc(d.quoteCredit)}</span></div>
        <div class="daily-item"><span class="eyebrow daily-label">${icon('sound')} GÜNÜN ŞARKISI</span><div class="daily-song"><div class="album-disc"><img src="${imageSource('/images/moon-terrace.webp')}" ${imageAttributes('/images/moon-terrace.webp','48px')} alt="" decoding="async" width="48" height="48" /></div><div><p class="song-title">${esc(d.songTitle)}</p><p>${d.spotifyUrl?'Spotify seçkisi':esc(d.songArtist)+' · Ambient çalışma'}</p></div><button class="icon-button play-small" data-action="play" aria-label="Günün şarkısını oynat">${icon(playing?'pause':'play')}</button></div><span class="daily-credit">${d.spotifyUrl?'Spotify üzerinden dinle · Oynatma koşulları hesabına ve tarayıcına bağlıdır.':'Sofra için özgün kayıt · Kulaklıkla daha güzel.'}</span></div>
        <button class="daily-item" ${!art.id?'disabled':''} data-action="art" data-id="${art.id}" style="text-align:left"><span class="eyebrow daily-label">${icon('moon')} GÜNÜN ESERİ</span><div class="daily-art"><img src="${esc(imageSource(art.image))}" ${imageAttributes(art.image,'49px')} alt="" decoding="async" loading="lazy" width="49" height="55" /><span class="daily-art-title">${esc(art.title)}</span>${icon('arrow')}</div><span class="daily-credit">Biraz daha yakından bak.</span></button>
      </section>
      <section id="night" class="night-section">
        <div class="section-heading night-heading"><div><span class="eyebrow"><i class="status-dot"></i> BİR SANDALYE DE SANA AYIRDIK</span><h2>Gece Masası</h2><p>Şu an Sofra’da konuşulanlar…</p></div><span class="pill">${icon('moon')} Bugünün sorusu</span></div>
        <div class="night-board"><div class="night-question"><span class="eyebrow">İÇİNDEN GEÇENİ BIRAK.</span><h3>${esc(d.question || defaultQuestion)}</h3><p>Bir cümle de olur, uzun bir hikâye de.<br>Burada herkes kendi sesiyle var.</p><div class="small-stamp">${icon('leaf')} Birbirimize nazik davranıyoruz.</div></div>
        <div class="night-comments"><div id="table-preview"></div><button class="comment-input-trigger" data-action="table"><span>Senin aklından ne geçiyor?</span>${icon('send')}</button><p class="table-note">${backend?'Yorumlar, Sofra’nın huzurunu koruyan özenli bir süzgeçten geçerek masada yerini alır.':'Notların bu cihazda sana özel kalır.'}</p></div></div>
      </section>
      <section id="quiz" class="quiz-section" aria-label="Ruh hâli testi"><div class="quiz-copy"><span class="eyebrow">KENDİNE RASTLA · 3 SORU / 1 DAKİKA</span><h2>Bugün hangi tablonun<br>içindesin?</h2><p>Birkaç küçük seçim. Ruh hâline açılan<br>bir pencere. Doğru cevap yok.</p><button class="btn btn-primary" data-action="quiz">Kendimi keşfet ${icon('arrow')}</button></div><div class="quiz-art" aria-hidden="true"><span class="quiz-spark">✧</span><span class="quiz-tiny-star">✳</span><div class="floating-frame frame-one"><img src="${imageSource('/images/quiet-lake.jpg')}" ${imageAttributes('/images/quiet-lake.jpg','135px')} alt="" loading="lazy" decoding="async" width="117" height="157" /></div><div class="floating-frame frame-two"><img src="${imageSource('/images/moon-terrace.webp')}" ${imageAttributes('/images/moon-terrace.webp','135px')} alt="" loading="lazy" decoding="async" width="135" height="180" /></div><div class="floating-frame frame-three"><img src="${imageSource('/images/wanderer.webp')}" ${imageAttributes('/images/wanderer.webp','135px')} alt="" loading="lazy" decoding="async" width="117" height="157" /></div></div></section>
      <section id="library" class="library"><div class="section-heading"><div><span class="eyebrow">KARANLIK KÜTÜPHANE · GÖRSEL ODALAR</span><h2>Biraz kaybolmak iyi gelir.</h2><p>Bugün hangi odada kalmak istersin?</p></div><button class="saved-filter ${savedOnly?'active':''}" data-action="saved">${icon('bookmark')} Kaydettiklerim <span id="saved-count">${savedCount}</span></button></div>
      <div class="rooms" role="group" aria-label="Ruh hâline göre filtrele">${moods.map(m=>`<button class="room-button ${currentMood===m.id?'selected':''}" data-action="filter" data-id="${m.id}" aria-pressed="${currentMood===m.id}"><span aria-hidden="true">${m.symbol}</span>${esc(m.label)}</button>`).join('')}</div><div class="gallery-grid" id="gallery"></div>
      <div class="gallery-bottom"><span>${icon('leaf')} Bir algoritmanın değil, bir hissin peşindeyiz.</span><button class="text-link" data-action="random">Rastgele bir kapı aç ${icon('arrow')}</button></div></section>
      <section id="reading" class="reading-section"><div class="section-heading"><div><span class="eyebrow">KARANLIK KÜTÜPHANE · OKUMA ODASI</span><h2>Bir fincanlık okumalar.</h2><p>Uzun günlere, kısa düşünceler.</p></div><span class="pill">1–2 dakikalık molalar</span></div>
      <div class="reading-grid">${readings.map((r,i)=>`<button class="reading-card" data-action="reading" data-id="${r.id}"><div class="reading-category">${esc(r.category)}<span>0${i+1} / ${r.time}</span></div><h3>${esc(r.title)}</h3><p>${esc(r.intro)}</p><span class="text-link">Biraz oku ${icon('arrow')}</span></button>`).join('')}</div></section>
      <section class="manifesto" aria-label="Sofra hakkında"><span class="star" aria-hidden="true">✳</span><h2>Herkesin bir yere yetiştiği dünyada,<br><em>burası biraz durmak için.</em></h2><p>Sofra, bir görüntünün, bir şarkının ya da tek bir cümlenin<br>günü değiştirebileceğine inanan küçük bir köşe.<br>İyi ki uğradın. Bir sandalye hep var.</p></section>
      <footer class="site-footer"><div class="footer-brand"><a href="#main" class="brand" aria-label="Başa dön">${brand}</a><p>Sanat. Müzik. Biraz da kendin.</p></div><div><div class="footer-links"><a href="${pinterestUrl}" target="_blank" rel="noopener noreferrer">Pinterest ${icon('arrow')}</a><button data-action="about">Sofra hakkında</button><a href="/gizlilik/">Gizlilik ve verilerin</a><button data-action="spotify-settings">Müzik tercihleri</button></div><p class="footer-bottom">SOFRA ART · SANAT. MÜZİK. BİRAZ DA KENDİN.</p></div></footer>
    </main>`;
}
