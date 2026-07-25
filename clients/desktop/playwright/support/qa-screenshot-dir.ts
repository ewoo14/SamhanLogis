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
 * 해법 — 출력 경로 분리 (이슈 #863 제안과 동일 방향):
 *   - 기본값은 커밋된 디렉토리 밑의 `_local/` 서브폴더다. `.gitignore` 가
 *     `docs/qa/**\/_local/` 을 제외 대상으로 지정하므로, 이 경로는 몇 번을
 *     다시 캡처해도 git 이 추적하는 파일은 단 1바이트도 바뀌지 않는다
 *     (`git status`/`git diff` 에 아예 나타나지 않는다).
 *   - `docs/qa/<slug>/*.png` (커밋된 원본)는 이 함수가 절대 건드리지 않는다 —
 *     기존 문서·PR 참조 경로가 그대로 유효하다.
 *   - 이번 라운드처럼 "새 캡처를 확정 증거로 PR 에 올리겠다"는 의도적 결정이
 *     있을 때만 `QA_SHOTS_DIR` 환경변수로 원하는 경로(신규 파일명 권장)를
 *     명시적으로 지정한다. 우발적 재실행은 기본값(`_local/`)이라 안전하고,
 *     의도적 승격은 opt-in 이라 되돌릴 수 없는 덮어쓰기가 없다.
 *
 * @param committedDir 기존 커밋 캡처가 있는(또는 있을) 절대경로 — 보통
 *   `path.resolve(_dirname, '../../../../docs/qa/<slug>')` 형태로 계산해 전달한다.
 * @returns 이번 실행에서 실제로 스크린샷을 써야 할 절대경로(디렉토리는 이미 생성됨).
 */
import * as fs from 'fs'
import * as path from 'path'

export function resolveQaShotsDir(committedDir: string): string {
  const override = process.env['QA_SHOTS_DIR']
  const dir =
    override && override.trim().length > 0
      ? path.resolve(override)
      : path.join(committedDir, '_local')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
