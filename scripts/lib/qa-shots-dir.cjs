/**
 * QA 라이브 캡처 저장 경로 결정 (CommonJS 버전, 루트 공유).
 *
 * clients/desktop/playwright/support/qa-screenshot-dir.ts 와 동일 계약이다 — 그 파일은
 * clients/desktop/playwright 패키지 전용이라, 그 밖(clients/*\/scripts, 루트 scripts/,
 * tools/manual-capture/)의 .cjs 캡처 스크립트는 이 루트 공유 버전을 쓴다(2026-07-26 하네스
 * 재수렴 라운드 G3, tools/manual-capture 는 2026-07-27 H1 흡수에서 편입).
 *
 * 기본값은 `<committedDir>/_local` 이고(#938 D-1 확정 계약, real-QA·mock 공통),
 * `QA_SHOTS_DIR` 가 레포의 커밋 QA 증거 루트(docs/qa/** 전체 — 자기 슬러그·타 슬러그·
 * 루트 자체 불문)를 가리키면 `QA_ALLOW_OVERWRITE=1` 없이는 차단한다(2026-07-27 이슈
 * #863 D-3 — 자세한 배경은 .ts 파일 헤더 주석 참조).
 *
 * @param {string} committedDir 기존 커밋 캡처가 있는(또는 있을) 절대경로
 * @returns {string} 이번 실행에서 실제로 스크린샷을 써야 할 절대경로(디렉토리는 이미 생성됨)
 */
const fs = require('node:fs')
const path = require('node:path')

/** 이 파일(scripts/lib) 기준 레포의 커밋 QA 증거 루트 전체. */
const DOCS_QA_ROOT = path.resolve(__dirname, '../../docs/qa')

function hasExplicitOverwriteIntent() {
  return ['1', 'true', 'yes'].includes(String(process.env['QA_ALLOW_OVERWRITE'] ?? '').trim().toLowerCase())
}

function isWithin(parentDir, candidateDir) {
  const relative = path.relative(parentDir, candidateDir)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function resolveQaShotsDir(committedDir) {
  const committed = path.resolve(committedDir)
  const override = process.env['QA_SHOTS_DIR']
  const trimmed = override && override.trim().length > 0 ? override.trim() : undefined
  const dir = trimmed ? path.resolve(trimmed) : path.join(committed, '_local')

  if (trimmed && isWithin(DOCS_QA_ROOT, dir) && !hasExplicitOverwriteIntent()) {
    throw new Error(
      `[QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다: ${dir}. ` +
        '명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.',
    )
  }

  fs.mkdirSync(dir, { recursive: true })
  return dir
}

module.exports = { resolveQaShotsDir }
