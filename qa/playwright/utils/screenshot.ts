import { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * QA 라이브 캡처 저장 경로 결정 — `docs/qa/**` 커밋 스크린샷 덮어쓰기 방지.
 *
 * 계약은 `clients/desktop/playwright/support/qa-screenshot-dir.ts` ·
 * `scripts/lib/qa-shots-dir.{mjs,cjs,sh}` 와 동일하다(기본 `<커밋디렉토리>/_local`,
 * 의도적 승격은 `QA_SHOTS_DIR` opt-in). 이 저장소의 확립된 관례대로 **패키지마다
 * 자체 구현을 두고 함수명만 `resolveQaShotsDir` 로 통일**한다 — `qa/playwright` 는
 * 자체 package.json/tsconfig(`strict`, `allowJs` 미설정)를 가진 별도 패키지라
 * 루트 `scripts/lib/qa-shots-dir.mjs`(타입 선언 없는 JS)를 직접 import 하면
 * `npm run typecheck`(qa-e2e.yml) 가 선언 파일 부재로 깨진다. 같은 이유로
 * `clients/desktop/src/main/capture.ts` 도 이 계약을 인라인으로 갖고 있다.
 *
 * @param committedDir 기존 커밋 캡처가 있는(또는 있을) 절대경로
 * @returns 이번 실행에서 실제로 스크린샷을 써야 할 절대경로(디렉토리는 이미 생성됨)
 */
function resolveQaShotsDir(committedDir: string): string {
  const override = process.env['QA_SHOTS_DIR'];
  const dir =
    override && override.trim().length > 0 ? resolve(override) : join(committedDir, '_local');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 스크린샷 캡처 helper.
 * docs/qa/<slice>/*.png 규칙 (PR QA 첨부 의무).
 *
 * 실제 기록 위치는 resolveQaShotsDir 가 정한다 — 기본은 `_local/` 격리라
 * 재실행이 커밋된 확정 증거를 덮어쓰지 않는다(2026-07-27 재수렴 4차 X1).
 *
 * 사용 예: await captureForQa(page, testInfo, 'auth/partner-bizgate-happy');
 */
export async function captureForQa(
  page: Page,
  testInfo: TestInfo,
  slug: string,
): Promise<string> {
  const repoRoot = process.env.QA_REPO_ROOT ?? join(process.cwd(), '..', '..');
  const shotsDir = resolveQaShotsDir(join(repoRoot, 'docs', 'qa', 'phase7-e2e'));
  const target = join(shotsDir, `${slug}.png`);
  await mkdir(dirname(target), { recursive: true });
  await page.screenshot({ path: target, fullPage: true });
  await testInfo.attach(slug, { path: target, contentType: 'image/png' });
  return target;
}
