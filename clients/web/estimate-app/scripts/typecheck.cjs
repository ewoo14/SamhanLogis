'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveBuildAppVersion } = require('../../../../scripts/app-build-version.cjs');

// 릴리스 모드에서는 #910 공통 resolver가 명시 버전 누락을 거부한다.
resolveBuildAppVersion({ variable: 'VITE_APP_VERSION' });

const roots = ['server.js', 'lib', 'routes', 'scripts', 'public'];
const files = [];

function collect(relativePath) {
  const absolutePath = path.join(__dirname, '..', relativePath);
  if (fs.statSync(absolutePath).isFile()) {
    if (absolutePath.endsWith('.js') || absolutePath.endsWith('.cjs')) files.push(absolutePath);
    return;
  }
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    collect(path.join(relativePath, entry.name));
  }
}

for (const root of roots) collect(root);

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `${file} syntax check failed\n`);
    process.exitCode = result.status || 1;
  }
}

if (!process.exitCode) process.stdout.write(`typecheck OK: ${files.length} JavaScript files\n`);
