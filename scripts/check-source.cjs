const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let count = 0;
function check(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) check(file);
    else if (entry.isFile() && /\.(?:js|cjs|mjs)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
      count++;
    }
  }
}
for (const name of ['src', 'functions', 'scripts', 'checks', 'integration']) check(path.join(root, name));
console.log(`Syntax checked ${count} JavaScript files.`);
