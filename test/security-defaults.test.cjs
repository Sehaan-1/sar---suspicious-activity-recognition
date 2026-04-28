const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('server and worker do not embed development secret fallbacks', () => {
  const files = [
    'server.ts',
    'server/db.ts',
    'ai_worker/worker.py',
    'src/pages/Login.tsx',
  ];

  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /sar-dev-secret-change-in-prod/);
    assert.doesNotMatch(source, /sar-dev-ingest-key-change-in-prod/);
    assert.doesNotMatch(source, /admin123/);
  }
});

test('runtime entry points fail closed when shared secrets are missing', () => {
  const serverSource = read('server.ts');
  const workerSource = read('ai_worker/worker.py');

  assert.match(serverSource, /validateRequiredEnv\(\)/);
  assert.match(serverSource, /requireEnv\('JWT_SECRET'\)/);
  assert.match(serverSource, /requireEnv\('INGEST_API_KEY'\)/);
  assert.match(workerSource, /Missing required environment variable: INGEST_API_KEY/);
});

test('package exposes an automated test script', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.test, 'node test/run-tests.cjs');
});
