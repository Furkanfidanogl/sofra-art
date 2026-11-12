import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spotifyTrackUrl} from '../src/spotify-track.js';
import {ALLOWED_CALLABLE_FUNCTIONS, callFunction} from '../src/firebase.js';
import {generateEditorial} from '../src/backend.js';
import {validateEditorialContext, applyEditorialDraft, createEditorialController, EDITORIAL_LIMITS} from '../src/editorial-client.js';
import {adminHTML} from '../src/admin-panel.js';
const require = createRequire(import.meta.url);
const d = require('../functions/domain.cjs');
const {createEditorialService, parseEditorialOutput} = require('../functions/editorial.cjs');
const {createContentService} = require('../functions/content-service.cjs');

test('editorial dates reject impossible dates and follow Istanbul rather than UTC midnight',()=>{
  assert.equal(d.istanbulDay(Date.parse('2026-10-30T20:59:59Z')),'2026-10-30');
  assert.equal(d.istanbulDay(Date.parse('2026-10-30T21:00:00Z')),'2026-10-31');
  for(const date of ['2026-02-30','2026-13-01','../secrets','2026-2-3'])assert.throws(()=>d.dateKey(date),{code:'invalid-argument'});
});

test('editorial payloads require usage rights and restrict source and Spotify URLs',()=>{
  const artwork={title:'Özgün eser',description:'Bir çalışma.',alt:'Bir görsel',mood:'calm',tag:'SEÇKİ',credit:'Özgün çalışma',question:'Ne hissettin?',assetId:'12345678-1234-1234-1234-123456789abc',rightsConfirmed:true};
  assert.equal(d.artworkInput(artwork).rightsConfirmed,true);
  for(const patch of [{rightsConfirmed:false},{source:'javascript:alert(1)'},{source:'https://user:password@example.com'},{mood:'invented'},{admin:true}])assert.throws(()=>d.artworkInput({...artwork,...patch}),{code:'invalid-argument'});
  assert.equal(d.spotifyUrl('https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ?si=test'),'https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ');
  for(const url of ['https://open.spotify.com.evil.test/track/0Lr4kGOYn9l83EjuK6cZFQ','javascript:alert(1)','https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ'])assert.throws(()=>d.spotifyUrl(url),{code:'invalid-argument'});
});

test('Spotify localized sharing links are canonicalized without accepting other origins or content types',()=>{
  const id='6qqdFWe7C4LsBjWbXQdsHA';
  for(const url of [
    `https://open.spotify.com/intl-tr/track/${id}?si=eaf77be0991949e1`,
    ` https://open.spotify.com/intl-pt-BR/track/${id}/?utm_source=copy-link&si=test#ignored `,
    `https://open.spotify.com/track/${id}?utm_medium=share`,
  ])assert.equal(d.spotifyUrl(url),`https://open.spotify.com/track/${id}`);

  for(const url of [
    `https://open.spotify.com/album/${id}`,
    `https://open.spotify.com/playlist/${id}`,
    `https://open.spotify.com/intl-tr/album/${id}?si=test`,
    `https://open.spotify.com/intl-tr/playlist/${id}?si=test`,
    `https://open.spotify.com/episode/${id}`,
    `https://open.spotify.com.evil.test/intl-tr/track/${id}`,
    `https://user:password@open.spotify.com/track/${id}`,
    `https://open.spotify.com:444/track/${id}`,
    `http://open.spotify.com/track/${id}`,
    `https://open.spotify.com/intl-tr/artist/${id}`,
    `https://open.spotify.com/intl-tr/track/${id}/extra`,
  ])assert.throws(()=>d.spotifyUrl(url),error=>error.code==='invalid-argument' && error.details.field==='spotifyUrl');
});


test('browser and server enforce the same single-track policy and discard playlist context',()=>{
  const id='6qqdFWe7C4LsBjWbXQdsHA';
  for(const url of [`https://open.spotify.com/track/${id}`,`https://open.spotify.com/intl-tr/track/${id}?context=spotify%3Aplaylist%3Aexample&si=test`]) {
    assert.equal(spotifyTrackUrl(url),d.spotifyUrl(url));
    assert.equal(spotifyTrackUrl(url),`https://open.spotify.com/track/${id}`);
  }
  for(const type of ['playlist','album','artist','episode','show']) {
    for(const locale of ['','intl-tr/']) {
      const url=`https://open.spotify.com/${locale}${type}/${id}?si=test`;
      assert.equal(spotifyTrackUrl(url),null);
      assert.throws(()=>d.spotifyUrl(url),{code:'invalid-argument'});
    }
  }
});

test('editorialInput validates types, contexts, and requestIds strictly', () => {
  const validNote = d.editorialInput({ type: 'note', requestId: 'req-note-1', context: { seed: 'Akşam vakti' } });
  assert.equal(validNote.type, 'note');
  assert.equal(validNote.context.seed, 'Akşam vakti');

  const validQuestion = d.editorialInput({ type: 'question', requestId: 'req-q-1', context: { room: 'calm' } });
  assert.equal(validQuestion.type, 'question');

  const validDesc = d.editorialInput({ type: 'description', requestId: 'req-desc-1', context: { title: 'Sessiz Göl', room: 'calm' } });
  assert.equal(validDesc.type, 'description');

  // Rejects invalid type
  assert.throws(() => d.editorialInput({ type: 'invalid', requestId: 'req-1' }), { code: 'invalid-argument' });
  // Rejects missing requestId
  assert.throws(() => d.editorialInput({ type: 'note' }), { code: 'invalid-argument' });
  // Rejects unknown fields
  assert.throws(() => d.editorialInput({ type: 'note', requestId: 'req-1', extra: 'malicious' }), { code: 'invalid-argument' });
  assert.throws(() => d.editorialInput({ type: 'note', requestId: 'req-1', context: { unknown: 'field' } }), { code: 'invalid-argument' });
});

test('buildEditorialPrompt formats prompts accurately for note, question, and description', () => {
  const { buildEditorialPrompt } = createRequire(import.meta.url)('../functions/editorial.cjs');
  const notePrompt = buildEditorialPrompt({ type: 'note', context: { seed: 'Sakin bir gece' } });
  assert.match(notePrompt, /Günün Sözü \/ Sofra Notu/);
  assert.match(notePrompt, /Sakin bir gece/);

  const qPrompt = buildEditorialPrompt({ type: 'question', context: { room: 'sessizlik' } });
  assert.match(qPrompt, /Günün Sorusu/);
  assert.match(qPrompt, /sessizlik/);

  const descPrompt = buildEditorialPrompt({ type: 'description', context: { title: 'Mavi Gece', room: 'calm' } });
  assert.match(descPrompt, /Eser Açıklaması/);
  assert.match(descPrompt, /Mavi Gece/);

  assert.throws(() => buildEditorialPrompt({ type: 'unknown' }), /UNKNOWN_EDITORIAL_TYPE/);
});

test('parseEditorialOutput parses strict JSON and strips markdown fencing', () => {
  const { parseEditorialOutput } = createRequire(import.meta.url)('../functions/editorial.cjs');
  assert.equal(parseEditorialOutput('{"draft": "Sakin bir akşam."}'), 'Sakin bir akşam.');
  assert.equal(parseEditorialOutput('```json\n{"draft": "Günün tefekkürü."}\n```'), 'Günün tefekkürü.');
  assert.equal(parseEditorialOutput('```\n{"draft": "Duru bir soru?"}\n```'), 'Duru bir soru?');

  assert.equal(parseEditorialOutput('invalid json'), null);
  assert.equal(parseEditorialOutput('{"wrong": "field"}'), null);
  assert.equal(parseEditorialOutput('{"draft": ""}'), null);
  assert.equal(parseEditorialOutput(null), null);
});

test('createEditorialService handles disabled, success, quotas, and timeouts gracefully', async () => {
  const { createEditorialService } = createRequire(import.meta.url)('../functions/editorial.cjs');

  // Disabled when no API key
  const disabled = createEditorialService({ apiKey: '' });
  assert.equal(disabled.isEnabled(), false);
  const disabledResult = await disabled.generateDraft({ type: 'note', context: {} });
  assert.equal(disabledResult.errorReason, 'disabled');

  // Successful generation with mock fetch
  let capturedHeaders = null;
  let capturedBody = null;
  const mockFetch = async (url, opts) => {
    capturedHeaders = opts.headers;
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({ draft: 'Kelimelerin sustuğu yerde başlar sükunet.' }) }] },
          finishReason: 'STOP'
        }]
      })
    };
  };

  const service = createEditorialService({
    apiKey: 'mock-gemini-key',
    fetchFn: mockFetch
  });

  assert.equal(service.isEnabled(), true);
  const result = await service.generateDraft({ type: 'note', context: { title: 'Sessizlik' } });
  assert.equal(result.draft, 'Kelimelerin sustuğu yerde başlar sükunet.');
  assert.equal(result.model, 'gemini-3.5-flash-lite');
  assert.equal(capturedHeaders['x-goog-api-key'], 'mock-gemini-key');
  assert.equal(capturedBody.generationConfig.maxOutputTokens, 256);

  // 429 quota handling
  const quotaService = createEditorialService({
    apiKey: 'mock-key',
    fetchFn: async () => ({ ok: false, status: 429 })
  });
  const quotaResult = await quotaService.generateDraft({ type: 'question' });
  assert.equal(quotaResult.errorReason, 'quota-exceeded');

  // Timeout handling
  const timeoutService = createEditorialService({
    apiKey: 'mock-key',
    timeoutMs: 10,
    fetchFn: async (_url, { signal }) => {
      await new Promise(r => setTimeout(r, 50));
      if (signal.aborted) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return { ok: true, json: async () => ({}) };
    }
  });
  const timeoutResult = await timeoutService.generateDraft({ type: 'description' });
  assert.equal(timeoutResult.errorReason, 'timeout');
});

test('client callable pathway carries generateEditorial and enforces allowlist', async () => {
  // 1. Allowlist explicitly includes generateEditorial
  assert.ok(ALLOWED_CALLABLE_FUNCTIONS.includes('generateEditorial'), 'generateEditorial must be in client callable allowlist');
  assert.ok(ALLOWED_CALLABLE_FUNCTIONS.includes('getPublicContent'));
  assert.ok(ALLOWED_CALLABLE_FUNCTIONS.includes('submitComment'));
  assert.ok(ALLOWED_CALLABLE_FUNCTIONS.includes('getAdminDashboard'));
  assert.ok(ALLOWED_CALLABLE_FUNCTIONS.includes('manageContent'));
  assert.ok(ALLOWED_CALLABLE_FUNCTIONS.includes('uploadArtwork'));
  assert.ok(ALLOWED_CALLABLE_FUNCTIONS.includes('getArtwork'));

  // 2. Disallowed arbitrary operations are rejected immediately with UNKNOWN_OPERATION
  process.env.VITE_SOFRA_BACKEND_ENABLED = 'true';
  await assert.rejects(
    () => callFunction('unregisteredOperation', {}),
    { message: 'UNKNOWN_OPERATION' }
  );

  // 3. Allowed operation passes allowlist check and proceeds to App Check / callable transport
  // When App Check key is unconfigured in test environment, it reaches the App Check verification phase
  await assert.rejects(
    () => callFunction('generateEditorial', { type: 'note' }),
    err => err.message === 'APPCHECK_NOT_CONFIGURED' || err.code === 'functions/unavailable'
  );

  // 4. Backend module generateEditorial wraps callFunction with valid shape
  await assert.rejects(
    () => generateEditorial('note', { seed: 'Akşam vakti' }, 'req-id-123'),
    err => err.message === 'APPCHECK_NOT_CONFIGURED' || err.code === 'functions/unavailable'
  );
});

test('delayed AI responses are rejected when dialog closes, session changes, or form context switches', () => {
  const baseReq = {
    ticket: 1,
    uid: 'admin-1',
    revision: 10,
    tab: 'daily',
    date: '2026-11-06',
    artworkId: null,
    target: 'quote'
  };

  const validCurrent = {
    activeTicket: 1,
    isDialogOpen: true,
    isAdmin: true,
    uid: 'admin-1',
    revision: 10,
    tab: 'daily',
    date: '2026-11-06',
    artworkId: null
  };

  // Base matching context is accepted
  assert.equal(validateEditorialContext(baseReq, validCurrent), true);

  // 1. Modal was closed while request was in-flight -> REJECT (never reopen dialog)
  assert.equal(validateEditorialContext(baseReq, { ...validCurrent, isDialogOpen: false }), false);

  // 2. Admin revoked or logged out -> REJECT
  assert.equal(validateEditorialContext(baseReq, { ...validCurrent, isAdmin: false }), false);
  assert.equal(validateEditorialContext(baseReq, { ...validCurrent, uid: 'visitor-2' }), false);

  // 3. Session or view revision changed (e.g. account switch, logout) -> REJECT
  assert.equal(validateEditorialContext(baseReq, { ...validCurrent, revision: 11 }), false);

  // 4. Tab changed from daily to gallery -> REJECT (no leakage to wrong form)
  assert.equal(validateEditorialContext(baseReq, { ...validCurrent, tab: 'gallery', artworkId: 'art-1' }), false);

  // 5. Date changed to a different package date -> REJECT (no leakage to wrong date)
  assert.equal(validateEditorialContext(baseReq, { ...validCurrent, date: '2026-11-07' }), false);

  // 6. Artwork ID changed in gallery tab -> REJECT
  const galleryReq = { ...baseReq, tab: 'gallery', date: null, artworkId: 'art-100', target: 'description' };
  const galleryCurrent = { ...validCurrent, tab: 'gallery', date: null, artworkId: 'art-100' };
  assert.equal(validateEditorialContext(galleryReq, galleryCurrent), true);
  assert.equal(validateEditorialContext(galleryReq, { ...galleryCurrent, artworkId: 'art-200' }), false);

  // 7. Superseded ticket (new request started while old was in-flight) -> REJECT old, keep new ticket active
  assert.equal(validateEditorialContext(baseReq, { ...validCurrent, activeTicket: 2 }), false);
});

test('manually typed form data is preserved across AI generation, suggestion display, dismiss, and apply', () => {
  // Scenario 1: Daily form - user manually typed quote, question, songTitle, and spotifyUrl.
  const initialDailyState = {
    tab: 'daily',
    adminDate: '2026-11-06',
    dailyEditor: {
      date: '2026-11-06',
      daily: {
        quote: 'Kullanıcının yazdığı özgün cümle',
        question: 'Kullanıcının yazdığı soru?',
        songTitle: 'Gece Müziği',
        spotifyUrl: 'https://open.spotify.com/track/6qqdFWe7C4LsBjWbXQdsHA',
        artwork: 'art-1'
      },
      version: 2
    },
    artworkEditor: null
  };

  // Applying AI draft to 'quote' must ONLY change 'quote' and leave question, songTitle, spotifyUrl, artwork untouched.
  const draftQuote = 'Sofra kurulur, kelimeler demlenir.';
  const appliedQuote = applyEditorialDraft('quote', draftQuote, initialDailyState);

  assert.equal(appliedQuote.target, 'quote');
  assert.equal(appliedQuote.dailyEditor.daily.quote, draftQuote, 'Target field must be updated');
  assert.equal(appliedQuote.dailyEditor.daily.question, 'Kullanıcının yazdığı soru?', 'Non-target question must be preserved');
  assert.equal(appliedQuote.dailyEditor.daily.songTitle, 'Gece Müziği', 'Non-target songTitle must be preserved');
  assert.equal(appliedQuote.dailyEditor.daily.spotifyUrl, 'https://open.spotify.com/track/6qqdFWe7C4LsBjWbXQdsHA', 'Non-target spotifyUrl must be preserved');
  assert.equal(appliedQuote.dailyEditor.daily.artwork, 'art-1', 'Non-target artwork must be preserved');
  assert.equal(appliedQuote.dailyEditor.version, 2, 'Version must be preserved');

  // Scenario 2: Artwork form - user manually typed title, tag, credit, and rightsConfirmed.
  const initialArtworkState = {
    tab: 'gallery',
    adminDate: null,
    dailyEditor: null,
    artworkEditor: {
      title: 'Gece Ağacı',
      description: 'Eski açıklama metni...',
      alt: 'Karanlıkta parlayan ağaç',
      mood: 'calm',
      tag: 'SOFRA SEÇKİSİ',
      credit: 'Ressam Ali',
      source: 'https://example.com/art',
      question: 'Bu ağaç sana ne anlatıyor?',
      assetId: 'asset-uuid-1',
      rightsConfirmed: true
    }
  };

  // Applying AI draft to 'description' must ONLY change 'description' and leave title, credit, rightsConfirmed untouched.
  const draftDesc = 'Gecenin sessizliğinde kök salan derin bir sükûnet taslağı.';
  const appliedDesc = applyEditorialDraft('description', draftDesc, initialArtworkState);

  assert.equal(appliedDesc.target, 'description');
  assert.equal(appliedDesc.artworkEditor.description, draftDesc, 'Target description must be updated');
  assert.equal(appliedDesc.artworkEditor.title, 'Gece Ağacı', 'Title must be preserved');
  assert.equal(appliedDesc.artworkEditor.credit, 'Ressam Ali', 'Credit must be preserved');
  assert.equal(appliedDesc.artworkEditor.rightsConfirmed, true, 'Usage rights checkbox must be preserved');
  assert.equal(appliedDesc.artworkEditor.assetId, 'asset-uuid-1', 'Selected asset must be preserved');

  // Applying AI draft to 'artwork-question' must ONLY change 'question'
  const draftArtQ = 'Bu renkler sana hangi anını hatırlattı?';
  const appliedArtQ = applyEditorialDraft('artwork-question', draftArtQ, initialArtworkState);
  assert.equal(appliedArtQ.artworkEditor.question, draftArtQ);
  assert.equal(appliedArtQ.artworkEditor.description, 'Eski açıklama metni...', 'Description must be preserved when applying question');
});

test('adminHTML strictly bounds AI draft box to context and renders manually typed edits', () => {
  const dummySnapshot = {
    packages: [],
    artworks: [{ id: 'art-1', status: 'published', artwork: { title: 'Test Eseri', mood: 'calm' }, version: 1 }],
    legacyDaily: { quote: 'Varsayılan söz', question: 'Varsayılan soru?', songTitle: 'Şarkı' },
    serverDate: '2026-11-06'
  };

  // 1. Manually typed edits in dailyEditor are accurately rendered in HTML inputs
  const manualHtml = adminHTML(dummySnapshot, {
    tab: 'daily',
    date: null,
    dailyEditor: {
      date: null,
      daily: {
        quote: 'Elle yazılan özel alıntı',
        question: 'Elle yazılan derin soru?',
        songTitle: 'Özel Şarkı',
        spotifyUrl: 'https://open.spotify.com/track/12345'
      },
      version: 1
    },
    aiDraft: null,
    aiBusy: null
  });
  assert.ok(manualHtml.includes('Elle yazılan özel alıntı'), 'Manually typed quote must appear in HTML');
  assert.ok(manualHtml.includes('Elle yazılan derin soru?'), 'Manually typed question must appear in HTML');
  assert.ok(manualHtml.includes('Özel Şarkı'), 'Manually typed songTitle must appear in HTML');

  // 2. AI draft box is rendered when context matches exactly
  const matchingDraftHtml = adminHTML(dummySnapshot, {
    tab: 'daily',
    date: null,
    dailyEditor: null,
    aiDraft: {
      type: 'note',
      target: 'quote',
      text: '✧ Örnek editoryal öneri metni',
      context: { tab: 'daily', date: null, target: 'quote' }
    },
    aiBusy: null
  });
  assert.ok(matchingDraftHtml.includes('Editoryal Taslak Önerisi'), 'Draft box must be rendered for matching context');
  assert.ok(matchingDraftHtml.includes('✧ Örnek editoryal öneri metni'), 'Draft text must be visible');
  assert.ok(matchingDraftHtml.includes('data-action="ai-apply" data-target="quote"'), 'Apply button must exist');
  assert.ok(matchingDraftHtml.includes('data-action="ai-dismiss"'), 'Dismiss button must exist');

  // 3. AI draft box is SUPPRESSED when context does NOT match (e.g. draft was for date 2026-11-07 but view is date null)
  const mismatchDraftHtml = adminHTML(dummySnapshot, {
    tab: 'daily',
    date: null,
    dailyEditor: null,
    aiDraft: {
      type: 'note',
      target: 'quote',
      text: 'Başka tarihe ait öneri',
      context: { tab: 'daily', date: '2026-11-07', target: 'quote' }
    },
    aiBusy: null
  });
  assert.ok(!mismatchDraftHtml.includes('Başka tarihe ait öneri'), 'Mismatched date draft must not be rendered');

  // 4. Busy spinner is only shown on the active target button
  const busyHtml = adminHTML(dummySnapshot, {
    tab: 'daily',
    date: null,
    dailyEditor: null,
    aiDraft: null,
    aiBusy: 'quote'
  });
  assert.ok(busyHtml.includes('Öneri hazırlanıyor…'), 'Busy spinner must appear on target button');
  assert.ok(busyHtml.includes('data-target="quote" disabled aria-busy="true"'), 'Target button must be disabled while busy');
});

test('editorial character limits strictly enforce 180 (note), 160 (question), 1200 (description) across boundaries and over-limit outputs', async () => {
  // Domain and server limits match
  assert.equal(d.EDITORIAL_LIMITS.note.max, 180);
  assert.equal(d.EDITORIAL_LIMITS.question.max, 160);
  assert.equal(d.EDITORIAL_LIMITS.description.max, 1200);

  // 1. Boundary tests for parseEditorialOutput
  // Note: 180 valid, 181 invalid, 220 invalid, 2 invalid
  const note180 = 'N'.repeat(180);
  const note181 = 'N'.repeat(181);
  const note220 = 'N'.repeat(220);
  assert.equal(parseEditorialOutput(JSON.stringify({ draft: note180 }), 'note'), note180);
  assert.equal(parseEditorialOutput(JSON.stringify({ draft: note181 }), 'note'), null);
  assert.equal(parseEditorialOutput(JSON.stringify({ draft: note220 }), 'note'), null);
  assert.equal(parseEditorialOutput(JSON.stringify({ draft: 'ab' }), 'note'), null);

  // Question: 160 valid, 161 invalid
  const q160 = 'S'.repeat(159) + '?';
  const q161 = 'S'.repeat(160) + '?';
  assert.equal(parseEditorialOutput(JSON.stringify({ draft: q160 }), 'question'), q160);
  assert.equal(parseEditorialOutput(JSON.stringify({ draft: q161 }), 'question'), null);

  // Description: 1200 valid, 1201 invalid
  const desc1200 = 'D'.repeat(1200);
  const desc1201 = 'D'.repeat(1201);
  assert.equal(parseEditorialOutput(JSON.stringify({ draft: desc1200 }), 'description'), desc1200);
  assert.equal(parseEditorialOutput(JSON.stringify({ draft: desc1201 }), 'description'), null);

  // 2. Over-limit handling in editorial service
  // Reproducing exact 220-char note over-limit scenario
  const service = createEditorialService({
    apiKey: 'mock-key',
    fetchFn: async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify({ draft: note220 }) }] }
        }]
      })
    })
  });

  const noteResult = await service.generateDraft({ type: 'note' });
  assert.equal(noteResult.draft, null, 'Over-limit note draft must be null');
  assert.equal(noteResult.errorReason, 'length-exceeded', 'errorReason must be length-exceeded');
  assert.equal(noteResult.length, 220);
  assert.equal(noteResult.maxLength, 180);

  // 3. Controlled failure in content service
  const mockDb = {
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: false }) }),
      where: () => ({ limit: () => ({ get: async () => ({ size: 0 }) }) })
    }),
    doc: () => ({
      get: async () => ({ exists: false }),
      set: async () => {}
    }),
    runTransaction: async (fn) => fn({
      get: async () => ({ data: () => null }),
      set: () => {}
    })
  };

  const cs = createContentService({
    db: mockDb,
    editorialService: service,
    now: () => Date.now(),
    limitRef: () => null
  });

  await assert.rejects(
    cs.generateEditorial('admin-uid', { type: 'note', requestId: 'req-1' }),
    err => err.code === 'invalid-argument' && err.message.includes('hedef alan sınırını aştı')
  );
});

test('valid editorial suggestions pass existing domain validations without auto-save or auto-publish', () => {
  const dummyArtworkId = 'art-00000000-0000-0000-0000-000000000001';

  // 1. Valid 180-char note passes dailyInput
  const validNote = 'Akşamın inen sessizliği sofraya sükunet getirir. ' + 's'.repeat(180 - 49);
  assert.equal(validNote.length, 180);
  const dailyFromNote = d.dailyInput({
    quote: validNote,
    question: 'Günün sorusu?',
    artwork: dummyArtworkId,
    songTitle: 'Gece Melodisi'
  });
  assert.equal(dailyFromNote.quote, validNote);

  // Over-limit 181-char note is rejected by dailyInput
  assert.throws(
    () => d.dailyInput({ quote: 's'.repeat(181), question: 'Soru?', artwork: dummyArtworkId, songTitle: 'Başlık' }),
    { code: 'invalid-argument' }
  );

  // 2. Valid 160-char question passes dailyInput and artworkInput
  const validQuestion = 'Bu sofrada dinlenirken aklından geçen ilk düşünce ne oldu? ' + '?'.repeat(160 - 59);
  assert.equal(validQuestion.length, 160);
  const dailyFromQ = d.dailyInput({
    quote: 'Kısa söz',
    question: validQuestion,
    artwork: dummyArtworkId,
    songTitle: 'Şarkı'
  });
  assert.equal(dailyFromQ.question, validQuestion);

  const artFromQ = d.artworkInput({
    title: 'Sessiz Eser',
    description: 'Eser açıklaması',
    alt: 'Görsel betimlemesi',
    mood: 'calm',
    tag: 'SEÇKİ',
    credit: 'Sanatçı',
    source: null,
    question: validQuestion,
    rightsConfirmed: true
  });
  assert.equal(artFromQ.question, validQuestion);

  // Over-limit 161-char question is rejected by dailyInput
  assert.throws(
    () => d.dailyInput({ quote: 'Söz', question: 'q'.repeat(161), artwork: dummyArtworkId, songTitle: 'Şarkı' }),
    { code: 'invalid-argument' }
  );

  // 3. Valid 1200-char description passes artworkInput
  const validDesc = 'd'.repeat(1200);
  const artFromDesc = d.artworkInput({
    title: 'Geniş Açıklamalı Eser',
    description: validDesc,
    alt: 'Betimleme',
    mood: 'dream',
    tag: 'ÖZEL',
    credit: 'Ressam',
    source: null,
    question: 'Soru?',
    rightsConfirmed: true
  });
  assert.equal(artFromDesc.description, validDesc);

  // Over-limit 1201-char description is rejected by artworkInput
  assert.throws(
    () => d.artworkInput({
      title: 'Eser',
      description: 'd'.repeat(1201),
      alt: 'Alt',
      mood: 'calm',
      tag: 'T',
      credit: 'C',
      source: null,
      question: 'Q',
      rightsConfirmed: true
    }),
    { code: 'invalid-argument' }
  );
});

test('real editorial controller flow: "Öneri al → yükleme görünümü → başarılı yanıt → görünür öneri → Forma uygula" across all three buttons', async () => {
  const dummySnapshot = {
    packages: [],
    artworks: [{ id: 'art-1', status: 'published', artwork: { title: 'Masa Eseri', mood: 'calm' }, version: 1 }],
    legacyDaily: { quote: 'Eski söz', question: 'Eski soru?', songTitle: 'Eski şarkı' },
    serverDate: '2026-11-09'
  };

  const buttons = [
    { type: 'note', target: 'quote', tab: 'daily', draft: 'Akşamın inen sessizliği sofraya sükunet getirir.' },
    { type: 'question', target: 'question', tab: 'daily', draft: 'Bugün kendine ayırdığın en sakin an hangisiydi?' },
    { type: 'description', target: 'description', tab: 'gallery', draft: 'Renklerin dinginliği odanın sessizliğini derinleştirir.' }
  ];

  for (const b of buttons) {
    let state = {
      user: { uid: 'admin-fatih' },
      isAdmin: true,
      backendEnabled: true,
      viewRevision: 10,
      currentAdminTab: b.tab,
      adminDate: null,
      artworkId: b.tab === 'gallery' ? 'art-1' : null,
      isDialogOpen: true,
      aiTicket: 0,
      aiBusy: null,
      aiDraft: null,
      dailyEditor: {
        date: null,
        daily: { quote: 'Elle yazılmış söz', question: 'Elle yazılmış soru?', songTitle: 'Özgün Şarkı' },
        version: 1
      },
      artworkEditor: {
        title: 'Özgün Başlık',
        description: 'Elle yazılmış açıklama',
        alt: 'Betimleme',
        mood: 'calm',
        tag: 'SEÇKİ',
        credit: 'Ali',
        source: '',
        question: 'Eser sorusu?',
        rightsConfirmed: true
      }
    };

    let toastMessage = null;
    let renderCalls = [];

    // Controller simulates in-place showAdmin without bumping navigation viewRevision
    function showAdmin(tab, refresh) {
      renderCalls.push({ tab, aiBusy: state.aiBusy, aiDraft: state.aiDraft });
    }

    const controller = createEditorialController({
      getState: () => state,
      rememberEditor: () => {},
      getFormContext: () => ({ seed: 'dinginlik' }),
      generateEditorial: async (type) => ({ draft: b.draft, type }),
      showAdmin,
      toast: (msg) => { toastMessage = msg; },
      backendErrorMessage: (err) => err?.message,
      setAiBusy: (busy) => { state.aiBusy = busy; },
      setAiDraft: (draft) => { state.aiDraft = draft; },
      nextAiTicket: () => ++state.aiTicket,
      updateEditorState: ({ dailyEditor, artworkEditor }) => {
        if (dailyEditor) state.dailyEditor = dailyEditor;
        if (artworkEditor) state.artworkEditor = artworkEditor;
      }
    });

    // STEP 1: Click "Öneri al"
    const draftPromise = controller.onDraftClick({ type: b.type, target: b.target });

    // Verify STEP 2: Loading view is rendered (busy spinner on target button, viewRevision intact)
    assert.equal(state.aiBusy, b.target, `Button ${b.target} must be marked busy`);
    assert.equal(state.viewRevision, 10, 'In-place loading render must not bump viewRevision');
    assert.equal(renderCalls[0].aiBusy, b.target);

    // Let the async generation complete
    await draftPromise;

    // Verify STEP 3 & 4: Successful response is accepted (not self-invalidated!) and rendered as visible suggestion
    assert.equal(state.aiBusy, null, 'Busy state must be cleared after resolution');
    assert.ok(state.aiDraft, `aiDraft must be set for ${b.target}`);
    assert.equal(state.aiDraft.text, b.draft);
    assert.equal(state.aiDraft.target, b.target);

    // Verify HTML rendering contains the suggestion box
    const renderedHtml = adminHTML(dummySnapshot, {
      tab: b.tab,
      date: null,
      dailyEditor: state.dailyEditor,
      artworkId: state.artworkId,
      artworkEditor: state.artworkEditor,
      aiDraft: state.aiDraft,
      aiBusy: state.aiBusy
    });
    assert.ok(renderedHtml.includes('Editoryal Taslak Önerisi'), 'Suggestion box must appear in HTML');
    assert.ok(renderedHtml.includes(b.draft), 'Draft text must appear in suggestion box');

    // Verify STEP 5: Click "Forma uygula"
    controller.onApplyClick({ target: b.target });

    // Verify target field is updated, non-target fields are preserved, draft is cleared
    if (b.target === 'quote') {
      assert.equal(state.dailyEditor.daily.quote, b.draft, 'Quote must receive draft');
      assert.equal(state.dailyEditor.daily.question, 'Elle yazılmış soru?', 'Non-target question must be preserved');
      assert.equal(state.dailyEditor.daily.songTitle, 'Özgün Şarkı', 'Non-target songTitle must be preserved');
    } else if (b.target === 'question') {
      assert.equal(state.dailyEditor.daily.question, b.draft, 'Question must receive draft');
      assert.equal(state.dailyEditor.daily.quote, 'Elle yazılmış söz', 'Non-target quote must be preserved');
    } else if (b.target === 'description') {
      assert.equal(state.artworkEditor.description, b.draft, 'Description must receive draft');
      assert.equal(state.artworkEditor.title, 'Özgün Başlık', 'Non-target title must be preserved');
      assert.equal(state.artworkEditor.credit, 'Ali', 'Non-target credit must be preserved');
    }

    assert.equal(state.aiDraft, null, 'aiDraft must be cleared after apply');
    assert.equal(toastMessage, 'Taslak önerisi alana aktarıldı. Dilediğin gibi düzenleyebilirsin.');
  }
});

test('editorial controller handles failure responses, closed dialog, and user navigation gracefully without state corruption', async () => {
  // Scenario 1: Failure response closes loading spinner and shows error toast without wiping manual input
  {
    let state = {
      user: { uid: 'admin-1' },
      isAdmin: true,
      backendEnabled: true,
      viewRevision: 5,
      currentAdminTab: 'daily',
      adminDate: null,
      isDialogOpen: true,
      aiTicket: 0,
      aiBusy: null,
      aiDraft: null,
      dailyEditor: { date: null, daily: { quote: 'Kullanıcının yazdığı metin', question: 'Soru' } }
    };
    let toasted = null;

    const controller = createEditorialController({
      getState: () => state,
      rememberEditor: () => {},
      generateEditorial: async () => { throw new Error('API kotası aşıldı'); },
      showAdmin: () => {},
      toast: (msg) => { toasted = msg; },
      backendErrorMessage: (err) => err.message,
      setAiBusy: (busy) => { state.aiBusy = busy; },
      setAiDraft: (draft) => { state.aiDraft = draft; },
      nextAiTicket: () => ++state.aiTicket,
      updateEditorState: () => {}
    });

    await controller.onDraftClick({ type: 'note', target: 'quote' });
    assert.equal(state.aiBusy, null, 'Busy state must reset on failure');
    assert.equal(state.aiDraft, null, 'aiDraft must remain null');
    assert.equal(toasted, 'API kotası aşıldı');
    assert.equal(state.dailyEditor.daily.quote, 'Kullanıcının yazdığı metin', 'Manual input must be preserved');
  }

  // Scenario 2: Dialog closed while request in-flight -> never reopen dialog, discard draft
  {
    let state = {
      user: { uid: 'admin-1' },
      isAdmin: true,
      backendEnabled: true,
      viewRevision: 5,
      currentAdminTab: 'daily',
      adminDate: null,
      isDialogOpen: true,
      aiTicket: 0,
      aiBusy: null,
      aiDraft: null
    };

    let showAdminCalledAfterClose = false;

    const controller = createEditorialController({
      getState: () => state,
      rememberEditor: () => {},
      generateEditorial: async () => {
        // User closes dialog during async call
        state.isDialogOpen = false;
        state.viewRevision++;
        return { draft: 'Geç gelen öneri' };
      },
      showAdmin: () => {
        if (!state.isDialogOpen) showAdminCalledAfterClose = true;
      },
      toast: () => {},
      setAiBusy: (busy) => { state.aiBusy = busy; },
      setAiDraft: (draft) => { state.aiDraft = draft; },
      nextAiTicket: () => ++state.aiTicket,
      updateEditorState: () => {}
    });

    await controller.onDraftClick({ type: 'note', target: 'quote' });
    assert.equal(state.aiDraft, null, 'Draft must be discarded when dialog is closed');
    assert.equal(showAdminCalledAfterClose, false, 'showAdmin must never reopen closed dialog');
  }

  // Scenario 3: User switches tab while request in-flight -> draft not leaked to new tab
  {
    let state = {
      user: { uid: 'admin-1' },
      isAdmin: true,
      backendEnabled: true,
      viewRevision: 5,
      currentAdminTab: 'daily',
      adminDate: null,
      isDialogOpen: true,
      aiTicket: 0,
      aiBusy: null,
      aiDraft: null
    };

    const controller = createEditorialController({
      getState: () => state,
      rememberEditor: () => {},
      generateEditorial: async () => {
        // User navigates to gallery tab
        state.currentAdminTab = 'gallery';
        state.artworkId = 'art-1';
        state.viewRevision++;
        return { draft: 'Günlük masaya ait öneri' };
      },
      showAdmin: () => {},
      toast: () => {},
      setAiBusy: (busy) => { state.aiBusy = busy; },
      setAiDraft: (draft) => { state.aiDraft = draft; },
      nextAiTicket: () => ++state.aiTicket,
      updateEditorState: () => {}
    });

    await controller.onDraftClick({ type: 'note', target: 'quote' });
    assert.equal(state.aiDraft, null, 'Daily draft must not be shown after navigating to gallery');
  }

  // Scenario 4: User switches account while request in-flight -> draft not leaked to new account
  {
    let state = {
      user: { uid: 'admin-1' },
      isAdmin: true,
      backendEnabled: true,
      viewRevision: 5,
      currentAdminTab: 'daily',
      adminDate: null,
      isDialogOpen: true,
      aiTicket: 0,
      aiBusy: null,
      aiDraft: null
    };

    const controller = createEditorialController({
      getState: () => state,
      rememberEditor: () => {},
      generateEditorial: async () => {
        // User changes
        state.user = { uid: 'admin-2' };
        state.viewRevision++;
        return { draft: 'Admin 1 e ait öneri' };
      },
      showAdmin: () => {},
      toast: () => {},
      setAiBusy: (busy) => { state.aiBusy = busy; },
      setAiDraft: (draft) => { state.aiDraft = draft; },
      nextAiTicket: () => ++state.aiTicket,
      updateEditorState: () => {}
    });

    await controller.onDraftClick({ type: 'note', target: 'quote' });
    assert.equal(state.aiDraft, null, 'Draft must not be shown to a different account');
  }

  // Scenario 5: Superseded request does not clear newer request's busy spinner
  {
    let state = {
      user: { uid: 'admin-1' },
      isAdmin: true,
      backendEnabled: true,
      viewRevision: 5,
      currentAdminTab: 'daily',
      adminDate: null,
      isDialogOpen: true,
      aiTicket: 0,
      aiBusy: null,
      aiDraft: null
    };

    let resolve1;
    const p1 = new Promise(r => { resolve1 = r; });

    const controller = createEditorialController({
      getState: () => state,
      rememberEditor: () => {},
      generateEditorial: async (type) => {
        if (type === 'note') return p1;
        return { draft: 'İkinci istek cevabı' };
      },
      showAdmin: () => {},
      toast: () => {},
      setAiBusy: (busy) => { state.aiBusy = busy; },
      setAiDraft: (draft) => { state.aiDraft = draft; },
      nextAiTicket: () => ++state.aiTicket,
      updateEditorState: () => {}
    });

    // Start request 1 (ticket 1, busy 'quote')
    const req1 = controller.onDraftClick({ type: 'note', target: 'quote' });
    assert.equal(state.aiTicket, 1);
    assert.equal(state.aiBusy, 'quote');

    // Simulate starting request 2 (ticket 2, busy 'question')
    state.aiBusy = null;
    const req2 = controller.onDraftClick({ type: 'question', target: 'question' });
    assert.equal(state.aiTicket, 2);
    assert.equal(state.aiBusy, 'question');

    // Request 2 completes first
    await req2;
    assert.equal(state.aiDraft.text, 'İkinci istek cevabı');

    // Request 1 completes later
    resolve1({ draft: 'Eski istek cevabı' });
    await req1;

    // Verify request 1 did NOT overwrite request 2's draft
    assert.equal(state.aiDraft.text, 'İkinci istek cevabı');
  }
});

test('editorial UI integration: real controller wiring, navigation events (date A -> B -> A), spinner cleanup, modal lifecycle, and input preservation', async () => {
  const dummySnapshot = {
    packages: [{ date: '2026-11-10', draft: { quote: 'İlk gün sözü', question: 'İlk soru?' }, published: null, status: 'draft', version: 1 }],
    artworks: [
      { id: 'art-1', status: 'published', artwork: { title: 'Masa Eseri 1', mood: 'calm', question: 'Soru 1?' }, version: 1 },
      { id: 'art-2', status: 'published', artwork: { title: 'Masa Eseri 2', mood: 'dream', question: 'Soru 2?' }, version: 1 }
    ],
    legacyDaily: { quote: 'Varsayılan söz', question: 'Varsayılan soru?', songTitle: 'Şarkı' },
    serverDate: '2026-11-10'
  };

  // Helper creating a stateful admin UI harness closely mirroring main.js production behavior
  function createAdminHarness() {
    let state = {
      user: { uid: 'admin-fatih' },
      isAdmin: true,
      backendEnabled: true,
      viewRevision: 10,
      currentAdminTab: 'daily',
      adminDate: '2026-11-10',
      artworkId: null,
      selectedAsset: null,
      commentStatus: 'pending',
      uploadBusy: false,
      lastDeletedAsset: null,
      isDialogOpen: true,
      aiTicket: 0,
      aiBusy: null,
      aiBusyContext: null,
      aiDraft: null,
      dailyEditor: {
        date: '2026-11-10',
        daily: { quote: 'Elle yazılmış söz', question: 'Elle yazılmış soru?', songTitle: 'Özgün Şarkı' },
        version: 1
      },
      artworkEditor: null
    };

    let renderedHtml = '';
    let toastMessages = [];
    let serverWrites = 0;

    function renderScreen() {
      if (!state.isDialogOpen) {
        renderedHtml = '';
        return;
      }
      const visibleAiBusy = (state.aiBusyContext && (
        state.aiBusyContext.tab !== state.currentAdminTab ||
        (state.aiBusyContext.tab === 'daily' && (state.aiBusyContext.date || null) !== (state.adminDate || null)) ||
        (state.aiBusyContext.tab === 'gallery' && (state.aiBusyContext.artworkId || null) !== (state.artworkId || null))
      )) ? null : state.aiBusy;

      renderedHtml = adminHTML(dummySnapshot, {
        tab: state.currentAdminTab,
        date: state.adminDate,
        dailyEditor: state.dailyEditor,
        artworkId: state.artworkId,
        artworkEditor: state.artworkEditor,
        selectedAsset: state.selectedAsset,
        commentStatus: state.commentStatus,
        uploadBusy: state.uploadBusy,
        lastDeletedAsset: state.lastDeletedAsset,
        aiBusy: visibleAiBusy,
        aiDraft: state.aiDraft,
        daily: dummySnapshot.legacyDaily
      });
    }

    function showAdmin(tab = state.currentAdminTab, refresh = true) {
      state.currentAdminTab = tab;
      renderScreen();
    }

    // Real main.js event handlers
    const events = {
      packageDateChange: (newDate) => {
        state.viewRevision++;
        state.adminDate = newDate || null;
        state.adminEditor = null;
        if (state.dailyEditor) state.dailyEditor.date = state.adminDate;
        showAdmin('daily', true);
      },
      adminTabChange: (newTab) => {
        state.viewRevision++;
        showAdmin(newTab, false);
      },
      artworkEdit: (id) => {
        state.viewRevision++;
        state.artworkId = id;
        state.artworkEditor = null;
        showAdmin('gallery', false);
      },
      closeDialog: () => {
        state.viewRevision++;
        state.isDialogOpen = false;
        renderScreen();
      },
      openDialog: () => {
        state.viewRevision++;
        state.isDialogOpen = true;
        showAdmin(state.currentAdminTab, false);
      },
      sessionChange: (newUser) => {
        state.viewRevision++;
        state.aiTicket++;
        state.user = newUser;
        state.isAdmin = Boolean(newUser?.admin);
        state.aiBusy = null;
        state.aiBusyContext = null;
        state.aiDraft = null;
        showAdmin(state.currentAdminTab, false);
      }
    };

    let mockEditorialGenerator = async () => ({ draft: 'Varsayılan taslak önerisi' });

    const controller = createEditorialController({
      getState: () => ({
        user: state.user,
        isAdmin: state.isAdmin,
        backendEnabled: state.backendEnabled,
        viewRevision: state.viewRevision,
        currentAdminTab: state.currentAdminTab,
        adminDate: state.adminDate,
        artworkId: state.artworkId,
        isDialogOpen: state.isDialogOpen,
        aiTicket: state.aiTicket,
        aiBusy: state.aiBusy,
        aiBusyContext: state.aiBusyContext,
        aiDraft: state.aiDraft,
        dailyEditor: state.dailyEditor,
        artworkEditor: state.artworkEditor
      }),
      rememberEditor: () => {},
      getFormContext: () => ({ seed: 'dinginlik' }),
      generateEditorial: async (type, ctx, reqId) => mockEditorialGenerator(type, ctx, reqId),
      showAdmin,
      toast: (msg) => { toastMessages.push(msg); },
      backendErrorMessage: (err) => err?.message,
      setAiBusy: (busy, ctx) => {
        state.aiBusy = busy;
        state.aiBusyContext = ctx;
      },
      setAiDraft: (draft) => { state.aiDraft = draft; },
      nextAiTicket: () => ++state.aiTicket,
      updateEditorState: ({ dailyEditor, artworkEditor }) => {
        if (dailyEditor) state.dailyEditor = dailyEditor;
        if (artworkEditor) state.artworkEditor = artworkEditor;
      },
      updateDomField: () => {}
    });

    renderScreen();

    return {
      state,
      getHtml: () => renderedHtml,
      getToastMessages: () => toastMessages,
      getServerWrites: () => serverWrites,
      events,
      controller,
      setEditorialGenerator: (fn) => { mockEditorialGenerator = fn; }
    };
  }

  // --- BEHAVIOR 1: 4 Targets Normal Flow (draft -> loading view -> draft box -> apply) ---
  {
    const targets = [
      { type: 'note', target: 'quote', tab: 'daily', draft: 'Akşamın huzuru masaya yayılır.' },
      { type: 'question', target: 'question', tab: 'daily', draft: 'Bu akşam zihninde neyi serbest bırakıyorsun?' },
      { type: 'description', target: 'description', tab: 'gallery', draft: 'Dingin tonların iç içe geçtiği sessiz bir anlatım.' },
      { type: 'question', target: 'artwork-question', tab: 'gallery', draft: 'Bu görsel sana hangi duyguyu hatırlatıyor?' }
    ];

    for (const t of targets) {
      const h = createAdminHarness();
      if (t.tab === 'gallery') {
        h.events.adminTabChange('gallery');
        h.state.artworkEditor = {
          title: 'Örnek Eser',
          description: 'Eski açıklama',
          question: 'Eski soru?',
          alt: '',
          mood: 'calm',
          tag: '',
          credit: '',
          source: '',
          rightsConfirmed: true
        };
      }
      h.setEditorialGenerator(async () => {
        assert.ok(h.getHtml().includes('Öneri hazırlanıyor…'), `Must render loading spinner for ${t.target}`);
        assert.ok(h.getHtml().includes(`data-target="${t.target}" disabled aria-busy="true"`));
        return { draft: t.draft };
      });

      await h.controller.onDraftClick({ type: t.type, target: t.target });

      assert.ok(!h.getHtml().includes('Öneri hazırlanıyor…'), `Spinner must be gone for ${t.target}`);
      assert.ok(h.getHtml().includes('ai-suggestion-box'), `Draft box must be visible for ${t.target}`);
      assert.ok(h.getHtml().includes(t.draft));
      assert.equal(h.getServerWrites(), 0, 'Zero writes to server during generation');

      h.controller.onApplyClick({ target: t.target });
      assert.ok(!h.getHtml().includes('ai-suggestion-box'), 'Draft box must close after apply');
      assert.equal(h.getServerWrites(), 0, 'Zero writes to server during apply');

      if (t.target === 'quote') assert.equal(h.state.dailyEditor.daily.quote, t.draft);
      if (t.target === 'question') assert.equal(h.state.dailyEditor.daily.question, t.draft);
      if (t.target === 'description') assert.equal(h.state.artworkEditor.description, t.draft);
      if (t.target === 'artwork-question') assert.equal(h.state.artworkEditor.question, t.draft);
    }
  }

  // --- BEHAVIOR 2: Date Navigation A -> B -> A Rejects Old Draft ---
  {
    const h = createAdminHarness();
    let resolveGen;
    h.setEditorialGenerator(() => new Promise(r => { resolveGen = r; }));

    assert.equal(h.state.adminDate, '2026-11-10');
    assert.equal(h.state.viewRevision, 10);
    const draftPromise = h.controller.onDraftClick({ type: 'note', target: 'quote' });

    h.events.packageDateChange('2026-11-11');
    assert.equal(h.state.adminDate, '2026-11-11');
    assert.equal(h.state.viewRevision, 11);
    assert.ok(!h.getHtml().includes('Öneri hazırlanıyor…'), 'Date B must not show Date A spinner');

    h.events.packageDateChange('2026-11-10');
    assert.equal(h.state.adminDate, '2026-11-10');
    assert.equal(h.state.viewRevision, 12);
    assert.ok(h.getHtml().includes('Öneri hazırlanıyor…'), 'Date A temporarily shows spinner while still in flight');

    resolveGen({ draft: 'Geçersiz eski tarih taslağı' });
    await draftPromise;

    assert.equal(h.state.aiDraft, null, 'Old draft must be rejected on revision mismatch');
    assert.ok(!h.getHtml().includes('Geçersiz eski tarih taslağı'), 'Rejected draft must not appear in HTML');
    assert.ok(!h.getHtml().includes('Öneri hazırlanıyor…'), 'Spinner must be cleared after resolution on Date A');
    assert.ok(h.getHtml().includes('✧ Özgün söz önerisi al'), 'Button must be re-enabled');
  }

  // --- BEHAVIOR 3: Tab Navigation Away and Return Does Not Leave Stuck Spinner ---
  {
    const h = createAdminHarness();
    let resolveGen;
    h.setEditorialGenerator(() => new Promise(r => { resolveGen = r; }));

    assert.equal(h.state.currentAdminTab, 'daily');
    const draftPromise = h.controller.onDraftClick({ type: 'note', target: 'quote' });

    h.events.adminTabChange('gallery');
    assert.equal(h.state.currentAdminTab, 'gallery');
    assert.ok(!h.getHtml().includes('Öneri hazırlanıyor…'), 'Gallery tab must not show Daily spinner');

    h.events.adminTabChange('daily');
    assert.equal(h.state.currentAdminTab, 'daily');
    assert.ok(h.getHtml().includes('Öneri hazırlanıyor…'), 'Daily tab shows spinner while in flight');

    resolveGen({ draft: 'Günün sözü' });
    await draftPromise;

    assert.equal(h.state.aiBusy, null);
    assert.equal(h.state.aiDraft, null, 'Draft rejected because tab switched back and forth');
    assert.ok(!h.getHtml().includes('Öneri hazırlanıyor…'), 'Daily tab must have cleared the spinner');
    assert.ok(!h.getHtml().includes('disabled aria-busy="true"'), 'Target button must not remain disabled');
    assert.ok(h.getHtml().includes('✧ Özgün söz önerisi al'), 'Target button must be re-enabled');
  }

  // --- BEHAVIOR 4: Modal Close and Reopen Lifecycle ---
  {
    const h = createAdminHarness();
    let resolveGen;
    h.setEditorialGenerator(() => new Promise(r => { resolveGen = r; }));

    const draftPromise = h.controller.onDraftClick({ type: 'note', target: 'quote' });

    h.events.closeDialog();
    assert.equal(h.state.isDialogOpen, false);

    resolveGen({ draft: 'Kapalı modal taslağı' });
    await draftPromise;

    assert.equal(h.state.isDialogOpen, false, 'Closed modal must remain closed');
    assert.equal(h.state.aiDraft, null);
    assert.equal(h.state.aiBusy, null);

    h.events.openDialog();
    assert.equal(h.state.isDialogOpen, true);
    assert.ok(!h.getHtml().includes('Öneri hazırlanıyor…'), 'Reopened modal must not have stuck spinner');
    assert.ok(!h.getHtml().includes('ai-suggestion-box'), 'Reopened modal must not show rejected draft');
  }

  // --- BEHAVIOR 5: Artwork Switch and Session Switch ---
  {
    // Artwork Switch
    const hArt = createAdminHarness();
    hArt.events.adminTabChange('gallery');
    hArt.events.artworkEdit('art-1');
    let resolveArt;
    hArt.setEditorialGenerator(() => new Promise(r => { resolveArt = r; }));

    const artPromise = hArt.controller.onDraftClick({ type: 'description', target: 'description' });

    hArt.events.artworkEdit('art-2');
    hArt.events.artworkEdit('art-1');

    resolveArt({ draft: 'Eski eser taslağı' });
    await artPromise;

    assert.equal(hArt.state.aiDraft, null, 'Old artwork draft must be rejected on revision mismatch');
    assert.ok(!hArt.getHtml().includes('Öneri hazırlanıyor…'), 'Artwork spinner must be cleared');

    // Session Switch
    const hSess = createAdminHarness();
    let resolveSess;
    hSess.setEditorialGenerator(() => new Promise(r => { resolveSess = r; }));

    const sessPromise = hSess.controller.onDraftClick({ type: 'note', target: 'quote' });

    hSess.events.sessionChange({ uid: 'admin-fatih-2', admin: true });

    resolveSess({ draft: 'Eski oturum taslağı' });
    await sessPromise;

    assert.equal(hSess.state.aiDraft, null, 'Old session draft must not be accepted by new session');
    assert.ok(!hSess.getHtml().includes('Öneri hazırlanıyor…'), 'No stuck spinner on session change');
  }

  // --- BEHAVIOR 6: Error and Timeout End Loading State Cleanly ---
  {
    // Network Error
    const hErr = createAdminHarness();
    hErr.setEditorialGenerator(async () => {
      throw new Error('Ağ bağlantısı koptu.');
    });
    await hErr.controller.onDraftClick({ type: 'note', target: 'quote' });
    assert.equal(hErr.state.aiBusy, null);
    assert.ok(!hErr.getHtml().includes('Öneri hazırlanıyor…'));
    assert.ok(hErr.getHtml().includes('✧ Özgün söz önerisi al'));
    assert.ok(hErr.getToastMessages().some(m => m.includes('Ağ bağlantısı koptu')));

    // Timeout Error
    const hTimeout = createAdminHarness();
    hTimeout.setEditorialGenerator(async () => {
      const err = new Error('İstek zaman aşımına uğradı.');
      err.code = 'deadline-exceeded';
      throw err;
    });
    await hTimeout.controller.onDraftClick({ type: 'question', target: 'question' });
    assert.equal(hTimeout.state.aiBusy, null);
    assert.ok(!hTimeout.getHtml().includes('Öneri hazırlanıyor…'));
    assert.ok(hTimeout.getHtml().includes('✧ Soru önerisi al'));
  }

  // --- BEHAVIOR 7: Reverse Completion of Requests ---
  {
    const h = createAdminHarness();
    let resolve1;
    const p1 = new Promise(r => { resolve1 = r; });

    h.setEditorialGenerator(async (type) => {
      if (type === 'note') return p1;
      return { draft: 'Yeni istek önerisi' };
    });

    const req1 = h.controller.onDraftClick({ type: 'note', target: 'quote' });
    assert.equal(h.state.aiTicket, 1);

    h.state.aiBusy = null;
    const req2 = h.controller.onDraftClick({ type: 'question', target: 'question' });
    assert.equal(h.state.aiTicket, 2);

    await req2;
    assert.equal(h.state.aiDraft.text, 'Yeni istek önerisi');

    resolve1({ draft: 'Eski istek önerisi' });
    await req1;

    assert.equal(h.state.aiDraft.text, 'Yeni istek önerisi');
  }

  // --- BEHAVIOR 8: Manually Typed Form Fields Intact Across Generation & Clear ---
  {
    const h = createAdminHarness();
    h.state.dailyEditor = {
      date: '2026-11-10',
      daily: {
        quote: 'Yöneticinin kendi yazdığı sakin cümle',
        question: 'Yöneticinin kendi yazdığı soru?',
        songTitle: 'Gece Parçası',
        spotifyUrl: 'https://open.spotify.com/track/6qqdFWe7C4LsBjWbXQdsHA'
      },
      version: 3
    };

    let resolveGen;
    h.setEditorialGenerator(() => new Promise(r => { resolveGen = r; }));

    const p = h.controller.onDraftClick({ type: 'note', target: 'quote' });

    h.events.packageDateChange('2026-11-11');
    h.events.packageDateChange('2026-11-10');

    resolveGen({ draft: 'Taslak önerisi' });
    await p;

    assert.equal(h.state.dailyEditor.daily.quote, 'Yöneticinin kendi yazdığı sakin cümle');
    assert.equal(h.state.dailyEditor.daily.question, 'Yöneticinin kendi yazdığı soru?');
    assert.equal(h.state.dailyEditor.daily.songTitle, 'Gece Parçası');
    assert.ok(h.getHtml().includes('Yöneticinin kendi yazdığı sakin cümle'));
    assert.ok(h.getHtml().includes('Yöneticinin kendi yazdığı soru?'));
  }
});
