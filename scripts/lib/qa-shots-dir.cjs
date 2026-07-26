/**
 * QA 라이브 캡처 저장 경로 결정 (CommonJS 버전, 루트 공유).
 *
 * clients/desktop/playwright/support/qa-screenshot-dir.ts 와 동일 계약이다 — 그 파일은
 * clients/desktop/playwright 패키지 전용이라, 그 밖(clients/*\/scripts, 루트 scripts/)의
 * .cjs 캡처 스크립트는 이 루트 공유 버전을 쓴다(2026-07-26 하네스 재수렴 라운드 G3).
 *
 * 기본값은 커밋된 디렉토리 밑의 `_local/` 서브폴더(`.gitignore` 의 `**\/_local/` 규칙으로
 * 항상 제외 대상)다. `docs/qa/<slug>/*.png`(커밋된 원본)는 이 함수가 절대 건드리지 않는다.
 * 의도적으로 새 확정 증거를 남기려면 QA_SHOTS_DIR 환경변수로 원하는 경로를 명시한다.
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

module.exports = { resolveQaShotsDir }
