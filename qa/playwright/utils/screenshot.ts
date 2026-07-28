import { Page, TestInfo } from '@playwright/test';
import * as fs from 'node:fs';
import { mkdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { hostname, networkInterfaces } from 'node:os';
import { basename, dirname, isAbsolute, join, normalize, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const _dirname = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

/** 이 파일(qa/playwright/utils) 기준 레포의 커밋 QA 증거 루트 전체. */
const DOCS_QA_ROOT = resolve(_dirname, '../../../docs/qa');

function hasExplicitOverwriteIntent(): boolean {
  return ['1', 'true', 'yes'].includes(
    String(process.env['QA_ALLOW_OVERWRITE'] ?? '').trim().toLowerCase(),
  );
}

/** 존재하지 않는 하위 경로도 기존 부모의 junction/symlink를 물리 경로로 풀어낸다. */
function resolvePhysicalPath(candidateDir: string): string {
  let current = resolve(candidateDir);
  const missingParts: string[] = [];

  while (!fs.existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    missingParts.unshift(basename(current));
    current = parent;
  }

  return join(fs.realpathSync.native(current), ...missingParts);
}

/**
 * 이 머신에 실제로 바인딩된 non-internal IPv4 주소 전부(로컬 전용 조회 — 네트워크
 * I/O 없음). 2026-07-28 R5 재수렴 결함3 — 고정 별칭 목록은 "열거"라서 어댑터가 늘
 * 때마다 다시 뚫린다. 자세한 배경은 scripts/lib/qa-shots-dir.cjs 의 동명 함수 주석 참조.
 */
function getSelfLanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4') addresses.push(entry.address.toLowerCase());
    }
  }
  return addresses;
}

/**
 * 자기 자신을 가리키는 UNC admin-share(`\\localhost\D$\...`, `\\127.0.0.1\D$\...`,
 * `\\<컴퓨터명>\D$\...`, `\\<자기 LAN IP>\D$\...`)를 등가의 드라이브 문자 표기
 * (`D:\...`)로 통일한다(2026-07-28 R4 결함3 + R5 재수렴 결함3) — 자세한 배경은
 * scripts/lib/qa-shots-dir.cjs 의 동명 함수 주석 참조. 다른 호스트를 가리키는
 * admin-share 는 실제로 다른 물리 머신이므로 변환하지 않는다.
 */
function normalizeUncAdminShareToDrive(candidateDir: string): string {
  const match = /^\\\\([^\\]+)\\([A-Za-z])\$(\\.*)?$/.exec(candidateDir);
  if (!match) return candidateDir;
  const host = (match[1] ?? '').toLowerCase();
  const isKnownAlias = host === 'localhost' || host === '127.0.0.1' || host === '.' || host === hostname().toLowerCase();
  const isSelf = isKnownAlias || getSelfLanAddresses().includes(host);
  if (!isSelf) return candidateDir;
  return `${match[2]}:${match[3] ?? '\\'}`;
}

function normalizePhysicalPath(candidateDir: string): string {
  const isWindows = process.platform === 'win32';
  const withoutExtendedPrefix = isWindows && candidateDir.startsWith('\\\\?\\UNC\\')
    ? `\\\\${candidateDir.slice('\\\\?\\UNC\\'.length)}`
    : isWindows && candidateDir.startsWith('\\\\?\\')
      ? candidateDir.slice('\\\\?\\'.length)
      : candidateDir;
  const withoutUncAdminShare = isWindows ? normalizeUncAdminShareToDrive(withoutExtendedPrefix) : withoutExtendedPrefix;
  const normalized = normalize(withoutUncAdminShare);
  const root = parse(normalized).root;
  const comparable = normalized === root ? normalized : normalized.replace(/[\\/]+$/, '');
  return isWindows ? comparable.toLowerCase() : comparable;
}

function isWithin(parentDir: string, candidateDir: string): boolean {
  const candidateRelative = relative(parentDir, candidateDir);
  return (
    candidateRelative === '' ||
    (candidateRelative !== '..' &&
      !candidateRelative.startsWith(`..${sep}`) &&
      !isAbsolute(candidateRelative))
  );
}

function isWithinPhysical(parentDir: string, candidateDir: string): boolean {
  return isWithin(
    normalizePhysicalPath(resolvePhysicalPath(parentDir)),
    normalizePhysicalPath(resolvePhysicalPath(candidateDir)),
  );
}

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
  const trimmed = override && override.trim().length > 0 ? override.trim() : undefined;
  const dir =
    trimmed ? resolve(trimmed) : join(resolve(committedDir), '_local');

  if (trimmed && isWithinPhysical(DOCS_QA_ROOT, dir) && !hasExplicitOverwriteIntent()) {
    throw new Error(
      `[QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다: ${dir}. ` +
        '명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.',
    );
  }

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
