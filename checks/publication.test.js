import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {allowedFile}=createRequire(import.meta.url)('../scripts/check-publication.cjs');
test('public inventory excludes credentials, private history and generated reports',()=>{
  for(const file of ['.env','.env.local','functions/.env.production','functions/service-account.json','src/credentials.json','reports/release.json','private-archive/history.bundle','docs/DAY4_CLOSEOUT.md','ROADMAP.md','.openai/hosting.json','.github/workflows/unreviewed.yml','public/data.jsonl','public/private.key','scripts/operator.log'])assert.equal(allowedFile(file),false,file);
  for(const file of ['.env.example','README.md','SECURITY.md','docs/PRODUCTION_GO_LIVE.md','docs/screenshots/account.png','.github/workflows/quality.yml','functions/authorization.cjs','src/main.js','public/fonts/LICENSE-DM-Sans.txt','scripts/check-secrets.cjs'])assert.equal(allowedFile(file),true,file);
});
