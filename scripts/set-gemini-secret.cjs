// Trusted operator secret setup. Uses the verified operator email in .env.admin.local.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadContext } = require('./firebase-context.cjs');

(async () => {
  await loadContext();
  const cliBinary = path.join(process.env.FIREBASE_CLI_PACKAGE_PATH, 'lib/bin/firebase.js');
  const result = spawnSync(
    process.execPath,
    [
      cliBinary,
      'functions:secrets:set',
      'GEMINI_API_KEY',
      '--project',
      process.env.SOFRA_FIREBASE_PROJECT_ID || 'sofra-512816',
      '--account',
      process.env.SOFRA_OPERATOR_EMAIL || process.env.SOFRA_ADMIN_EMAIL,
    ],
    { stdio: 'inherit', cwd: path.resolve(__dirname, '..'), env: process.env }
  );
  process.exitCode = result.status ?? 1;
})().catch(error => {
  console.error('SECRET_SETUP_FAILED', error.message);
  process.exitCode = 1;
});
