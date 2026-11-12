// Secure in-memory live evaluation of gemini-3.5-flash-lite using trusted operator credentials.
// The secret is read strictly in memory and NEVER logged or exported.
// Usage: node --env-file=.env.admin.local scripts/eval-gemini-live.cjs

const { loadContext } = require('./firebase-context.cjs');
const { createModerationService } = require('../functions/moderation.cjs');

const TEST_CASES = require('../checks/fixtures/moderation-live.json');
const {createHash}=require('node:crypto');
const {SYSTEM_INSTRUCTION}=require('../functions/moderation.cjs');

(async () => {
  const ctx = await loadContext();
  const token = await ctx.api.getAccessToken();
  const res = await fetch(`https://secretmanager.googleapis.com/v1/projects/${ctx.projectId}/secrets/GEMINI_API_KEY/versions/latest:access`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error(`SECRET_FETCH_FAILED_${res.status}`);
  const data = await res.json();
  const rawKey = Buffer.from(data.payload.data, 'base64').toString('utf8').trim();

  const model = 'gemini-3.5-flash-lite';
  const service = createModerationService({
    apiKey: () => rawKey,
    model
  });

  console.log(`Starting live model evaluation on ${TEST_CASES.length} cases with model: ${model}...\n`);

  const results = [];
  let falsePositives = 0;
  let falseNegatives = 0;
  let unnecessaryQueues=0,technicalErrors=0;

  for (const c of TEST_CASES) {
    const start = Date.now();
    let modResult;
    try {
      modResult = await service.evaluateComment({ text: c.text, name:c.name, question: c.question || 'Bu eser sana ne hissettirdi?' });
    } catch (err) {
      modResult = { decision: 'unclear', errorReason: err.message };
    }
    const duration = Date.now() - start;

    const isMatch=c.expected.includes(modResult.decision)&&!modResult.errorReason;
    if(c.category==='valid'&&modResult.decision==='false')falsePositives++;
    if(c.category==='valid'&&modResult.decision==='unclear')unnecessaryQueues++;
    if(!['valid','uncertain'].includes(c.category)&&modResult.decision==='true')falseNegatives++;
    if(modResult.errorReason)technicalErrors++;

    results.push({
      id:c.id,
      category: c.category,
      expected: c.expected,
      decision: modResult.decision,
      model: modResult.model || model,
      reason: modResult.reason || modResult.errorReason || null,
      durationMs: duration,
      pass: isMatch
    });

    console.log(`[${c.category}] => Karar: "${modResult.decision}" (Beklenen: "${c.expected}") in ${duration}ms | Model: ${modResult.model || model}`);
  }

  const distribution = results.reduce((acc, r) => {
    acc[r.decision] = (acc[r.decision] || 0) + 1;
    return acc;
  }, {});

  const report = {
    evaluatedAt: new Date().toISOString(),
    model,
    caseCount: results.length,
    corpusSha256:createHash('sha256').update(JSON.stringify(TEST_CASES)).digest('hex'),
    policySha256:createHash('sha256').update(SYSTEM_INSTRUCTION).digest('hex'),
    limitation:"Bounded synthetic corpus; no production comment writes; not a universal error-rate guarantee.",
    failedCases:results.filter(r=>!r.pass).map(r=>r.id),
    unnecessaryQueues,technicalErrors,
    distribution,
    falsePositives,
    falseNegatives,
    results
  };

  const fs = require('node:fs');
  const path = require('node:path');
  const reportsDir = path.resolve(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, 'live-gemini-eval.json'), JSON.stringify(report, null, 2), 'utf8');

  console.log('\n=== CANLI GEMINI EVALUATION RAPORU ===');
  console.log(`Model: ${model}`);
  console.log(`Toplam Vaka: ${results.length}`);
  console.log(`Karar Dağılımı:`, distribution);
  console.log(`Yanlış Ret (False Positive): ${falsePositives}`);
  console.log(`Kaçak (False Negative): ${falseNegatives}`);
  console.log(`Rapor kaydedildi: reports/live-gemini-eval.json`);
  console.log(`Unnecessary queues: ${unnecessaryQueues}; technical errors: ${technicalErrors}`);
  if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(err => {
  console.error('LIVE_EVAL_FAILED:', err.message);
  process.exitCode = 1;
});
