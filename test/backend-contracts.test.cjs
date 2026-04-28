const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('backend exposes health and API-key camera status contracts', () => {
  const source = read('server.ts');

  assert.match(source, /app\.get\('\/api\/health'/);
  assert.match(source, /service: 'backend'/);
  assert.match(source, /app\.patch\('\/api\/cameras\/:id\/status', requireApiKey/);
  assert.match(source, /ONLINE/);
  assert.match(source, /RETRYING/);
  assert.match(source, /OFFLINE/);
});

test('runtime paths use DATA_DIR-backed DB, config, and media locations', () => {
  const pathsSource = read('server/paths.ts');
  const dbSource = read('server/db.ts');
  const serverSource = read('server.ts');

  assert.match(pathsSource, /process\.env\.DATA_DIR/);
  assert.match(pathsSource, /sar\.db/);
  assert.match(pathsSource, /config\.json/);
  assert.match(pathsSource, /media/);
  assert.match(dbSource, /getDbPath\(\)/);
  assert.match(serverSource, /getConfigPath\(\)/);
  assert.match(serverSource, /getMediaPath\(\)/);
});

test('analytics and config contracts remain available', () => {
  const source = read('server.ts');

  assert.match(source, /app\.get\('\/api\/dashboard\/events-per-day'/);
  assert.match(source, /GROUP BY day/);
  assert.match(source, /app\.get\('\/api\/config', requireAuthOrApiKey/);
  assert.match(source, /app\.put\('\/api\/config', requireAuth/);
});

test('stream contract is reverse-proxy friendly', () => {
  const serverSource = read('server.ts');
  const feedsSource = read('src/pages/Feeds.tsx');
  const dashboardSource = read('src/pages/Dashboard.tsx');
  const roiSource = read('src/components/ROIEditorModal.tsx');

  assert.match(serverSource, /app\.get\('\/stream\/:cameraId'/);
  assert.match(serverSource, /WORKER_STREAM_BASE/);
  assert.doesNotMatch(feedsSource, /localhost:5001/);
  assert.doesNotMatch(dashboardSource, /localhost:5001/);
  assert.match(roiSource, /\/stream\/\$\{camera\.camera_id\}/);
});
