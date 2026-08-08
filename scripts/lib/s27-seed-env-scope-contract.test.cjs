const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const startScript = read('infrastructure/scripts/start-local-full.ps1');

test('RED-A: -RunSeed still enables the shared seed toggle', () => {
  assert.match(startScript, /if \(\$RunSeed\)[\s\S]*?SAMHAN_SEED_TEST_DATA\s*=\s*'true'/);
  assert.match(startScript, /Get-Content \$EnvSeedFile[\s\S]*?Set-Item "env:\$name" \$value/);
});

test('RED-B: seed toggle is restored in a finally scope', () => {
  assert.match(startScript, /\$seedEnvWasDefined\s*=\s*Test-Path\s+['"]?env:SAMHAN_SEED_TEST_DATA/);
  assert.match(startScript, /\$seedEnvOriginalValue\s*=\s*\[Environment\]::GetEnvironmentVariable\(['"]SAMHAN_SEED_TEST_DATA['"],\s*['"]Process['"]\)/);
  assert.match(startScript, /try\s*\{[\s\S]*?if \(\$RunSeed\)[\s\S]*?\}\s*finally\s*\{[\s\S]*?if \(\$seedEnvWasDefined\)[\s\S]*?Set-Item\s+['"]env:SAMHAN_SEED_TEST_DATA['"][\s\S]*?Remove-Item\s+['"]env:SAMHAN_SEED_TEST_DATA['"]/);
});

test('RED-B: restoration is unconditional for -RunSeed and no -RunSeed', () => {
  const runSeedAssignment = startScript.match(/if \(\$RunSeed\)[\s\S]*?SAMHAN_SEED_TEST_DATA\s*=\s*'true'/);
  assert.ok(runSeedAssignment, 'the explicit seed override must remain gated by -RunSeed');
  assert.match(startScript, /finally\s*\{[\s\S]*?if \(\$seedEnvWasDefined\)/);
});
