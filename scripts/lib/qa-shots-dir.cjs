/**
 * QA 라이브 캡처 저장 경로 결정 (CommonJS 버전, 루트 공유).
 *
 * clients/desktop/playwright/support/qa-screenshot-dir.ts 와 동일 계약이다 — 그 파일은
 * clients/desktop/playwright 패키지 전용이라, 그 밖(clients/*\/scripts, 루트 scripts/,
 * tools/manual-capture/)의 .cjs 캡처 스크립트는 이 루트 공유 버전을 쓴다(2026-07-26 하네스
 * 재수렴 라운드 G3, tools/manual-capture 는 2026-07-27 H1 흡수에서 편입).
 *
 * 기존 `resolveQaShotsDir` 호출의 `_local/` 계약은 유지한다. Desktop Playwright
 * mock은 `resolveMockQaShotsDir`를 사용해 overwrite 가드를 함께 적용한다.
 *
 * @param {string} committedDir 기존 커밋 캡처가 있는(또는 있을) 절대경로
 * @returns {string} 이번 실행에서 실제로 스크린샷을 써야 할 절대경로(디렉토리는 이미 생성됨)
 */
const fs = require('node:fs')
const path = require('node:path')

function resolveQaShotsDir(committedDir) {
  const override = process.env['QA_SHOTS_DIR']
  const dir =
    override && override.trim().length > 0 ? path.resolve(override) : path.join(committedDir, '_local')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function hasExplicitOverwriteIntent() {
  return ['1', 'true', 'yes'].includes(String(process.env['QA_ALLOW_OVERWRITE'] ?? '').trim().toLowerCase())
}

function isWithin(parentDir, candidateDir) {
  const relative = path.relative(parentDir, candidateDir)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function resolveMockQaShotsDir(committedDir) {
  const committed = path.resolve(committedDir)
  const override = process.env['QA_SHOTS_DIR']?.trim()
  const dir = override ? path.resolve(override) : path.join(committed, '_local')

  if (override && isWithin(committed, dir) && !hasExplicitOverwriteIntent()) {
    throw new Error(
      `[QA 출력 경로 가드] mock 캡처의 커밋 경로 overwrite 시도를 차단했습니다: ${dir}. ` +
        '명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.',
    )
  }

  fs.mkdirSync(dir, { recursive: true })
  return dir
}

module.exports = { resolveMockQaShotsDir, resolveQaShotsDir }
