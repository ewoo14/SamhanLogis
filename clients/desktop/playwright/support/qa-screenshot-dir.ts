/**
 * QA 라이브 캡처 저장 경로 결정 — `docs/qa/**` 커밋 스크린샷 덮어쓰기 방지.
 *
 * 배경 (2026-07-25, #902 슬라이스 4회 반복 후 확정):
 *   `docs/qa/<slug>/*.png` 는 PR 리뷰가 참조하는 "확정 증거"다. 그런데 라이브QA
 *   스펙이 같은 파일명으로 하드코딩된 경로에 `page.screenshot()` 을 찍으면,
 *   스펙을 다시 실행할 때마다(재검증·회귀 확인·다음 라운드) 그 확정 증거가
 *   매번 새 캡처로 덮어써진다. 리뷰어 입장에서는 "라이브QA 를 실행하면 커밋된
 *   증거가 오염된다"는 딜레마가 되고, 실제로 이 슬라이스에서 리뷰어가 그 이유로
 *   라이브QA 실행 자체를 포기한 사례가 2회 있었다 — 머지 게이트 ③(라이브QA 실서버
 *   실행)을 구조적으로 차단하는 결과였다.
 *
 * 해법 — real-QA와 mock 출력 경로를 분리한다(이슈 #863):
 *   - real-QA용 `resolveQaShotsDir`는 커밋된 디렉터리를 기본 대상으로 유지한다.
 *   - mock용 `resolveMockQaShotsDir`는 커밋 디렉터리 밑의 `_local/`을 기본값으로
 *     사용한다. `QA_SHOTS_DIR`가 커밋 경로 또는 그 하위이면
 *     `QA_ALLOW_OVERWRITE=1` 없이는 즉시 차단한다.
 *
 * @param committedDir 기존 커밋 캡처가 있는(또는 있을) 절대경로 — 보통
 *   `path.resolve(_dirname, '../../../../docs/qa/<slug>')` 형태로 계산해 전달한다.
 * @returns 이번 실행에서 실제로 스크린샷을 써야 할 절대경로(디렉토리는 이미 생성됨).
 */
import * as fs from 'fs'
import * as path from 'path'

export function resolveQaShotsDir(committedDir: string): string {
  const override = process.env['QA_SHOTS_DIR']
  const dir = override && override.trim().length > 0 ? path.resolve(override) : path.resolve(committedDir)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function hasExplicitOverwriteIntent(): boolean {
  return ['1', 'true', 'yes'].includes(
    String(process.env['QA_ALLOW_OVERWRITE'] ?? '').trim().toLowerCase(),
  )
}

function isWithin(parentDir: string, candidateDir: string): boolean {
  const relative = path.relative(parentDir, candidateDir)
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

export function resolveMockQaShotsDir(committedDir: string): string {
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
