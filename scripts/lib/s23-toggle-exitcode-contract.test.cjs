const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('standard seed entry points wire the common toggle to both services', () => {
  const template = read('infrastructure/env-templates/.env.dev-seed');
  const compose = read('infrastructure/docker-compose.local-all.yml');

  assert.match(template, /^SAMHAN_SEED_TEST_DATA=true\s*$/m);
  assert.match(compose, /product-service:[\s\S]*?SAMHAN_SEED_TEST_DATA:\s*\$\{SAMHAN_SEED_TEST_DATA:-false\}/);
  assert.match(compose, /inventory-service:[\s\S]*?SAMHAN_SEED_TEST_DATA:\s*\$\{SAMHAN_SEED_TEST_DATA:-false\}/);
});

test('inventory seed fail-fast does not promise impossible recovery', () => {
  const source = read('services/inventory-service/src/main/java/com/samhanair/logis/inventory/seed/ProductSeedIntegrityValidator.java');

  assert.match(source, /soft-deleted/);
  assert.match(source, /자동 복구 불가|복구할 수 없습니다/);
  assert.doesNotMatch(source, /product-service를 먼저 공통 seed toggle로 기동하고 product seed 완료 후 재고 seed를 재시도/);
});

test('launch-local-stack fails when bootJar fails before compose succeeds', () => {
  const source = read('scripts/launch-local-stack.ps1');

  assert.match(source, /\$buildExitCode\s*=\s*\$LASTEXITCODE/);
  assert.match(source, /buildExitCode\s*-ne\s*0/);
});

for (const relative of ['scripts/stop-local-stack.ps1', 'infrastructure/scripts/stop-local-full.ps1']) {
  test(`${relative} propagates compose down failure`, () => {
    const source = read(relative);

    assert.match(source, /\$downExitCode\s*=\s*\$LASTEXITCODE/);
    assert.match(source, /downExitCode\s*-ne\s*0/);
  });
}
