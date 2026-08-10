# PR #1154 R18 — CI 회복 전용 라운드

## 원인

R16 스펙이 R15의 커밋 fixture 디렉터리(`docs/qa/2026-08-09-1154-r15/raw`)를 생성 입력 CSV의 쓰기 목적지로 재사용했습니다. R17 스펙도 회계 reimport raw 쓰기 상수가 같은 커밋 경로를 기본값으로 가리켰습니다. 목적지가 실행 중 생성 파일인지 커밋 fixture인지 상수 수준에서 분리되지 않아 H-2/G3a가 잡았습니다.

## 고친 상수 목록

| 파일 | 전 | 후 |
| --- | --- | --- |
| `clients/desktop/playwright/1154-r16-scale-and-channel-fix-real-qa/1154-r16-scale-and-channel-fix-real-qa.spec.ts` | `rawDir = path.join(root, 'docs/qa/.../r15/raw')` 후 R16 CSV를 직접 write | `r16RawDir = resolveQaShotsDir(path.join(root, 'docs/qa/.../r15/raw'))`; R16 CSV는 `_local`에 write. R15 CSV는 `readR15Fixture()`에서 읽기 전용으로 분리 |
| `clients/desktop/playwright/1154-r17-input-fidelity-real-qa/1154-r17-input-fidelity.spec.ts` | `ACCOUNTING_RAW = env ?? path.join(root, 'docs/qa/.../r15/raw')` | `ACCOUNTING_RAW = resolveQaShotsDir(env ?? path.join(root, 'docs/qa/.../r15/raw'))` |

R17 디렉터리와 스펙은 요청대로 untracked 상태를 유지했습니다.

## 제거한 파일

- `docs/qa/2026-08-09-1154-r15/raw/거래처-Excel다운로드_R16_BULK_1000.csv`
- `docs/qa/2026-08-09-1154-r15/raw/거래처-Excel다운로드_R16_BLANK.csv`

R15 고정 fixture 6개는 삭제하지 않았습니다.

## 가드 검증 원문

요청 명령(`npx vitest run ...`)은 초기 기준 실행에서 `124051ms` 무출력 timeout이 발생했습니다. `npx --no-install`도 동일하게 장시간 수집되어, 최종 판정은 동일한 로컬 Vitest 바이너리를 직접 호출해 수행했습니다.

```text
cd clients/desktop
.\\node_modules\\.bin\\vitest.cmd run src/renderer/test-utils/harness-false-green-guard.test.ts --pool=forks --poolOptions.forks.singleFork=true --no-file-parallelism --reporter=verbose
```

로컬 삭제 파일이 아직 `git ls-files`에 남는 동안에는 가드 자체의 `realpath` 검사가 삭제 파일을 읽으려 해 실패했습니다. 삭제 2개를 검증 중 인덱스에만 반영한 뒤, 최종 작업 트리 삭제 상태를 복원하고 실행했습니다. 실제 실행 원문:

```text
RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/tpartner/clients/desktop
✓ ... H-2: 캡처 목적지로 쓰이는 docs/qa 경로 상수는 전부 resolveQaShotsDir 를 경유한다
✓ ... G3a: clients/**/scripts·루트 scripts/ 의 JS/CJS/MJS 캡처 목적지도 _local 격리를 거친다

Test Files  1 passed (1)
Tests       62 passed (62)
Start       00:18:47
Duration    101.88s (transform 128ms, setup 0ms, collect 461ms, tests 100.94s, environment 0ms, prepare 187ms)
```

종료 코드: `0`.

## 두 스펙 수집 원문

R16 — 공유 real-QA 설정:

```text
Listing tests:
  [renderer] › 1154-r16-scale-and-channel-fix-real-qa\1154-r16-scale-and-channel-fix-real-qa.spec.ts:29:1 › PR #1154 R16 실 HTTP와 관리자 화면에서 1000건 전량 확인
Total: 1 test in 1 file
```

R17 — 스펙 전용 설정(`playwright/1154-r17-input-fidelity-real-qa/playwright.config.ts`):

```text
Listing tests:
  [chromium] › 1154-r17-input-fidelity.spec.ts:45:1 › PR #1154 R17 실 HTTP 입력 충실도 (fix 전)
  [chromium] › 1154-r17-input-fidelity.spec.ts:118:1 › PR #1154 R17 정본 XLSX 7253건 실 HTTP 회귀
Total: 2 tests in 1 file
```

두 명령 모두 종료 코드 `0`입니다. 자격증명·실서버가 필요한 실제 QA 실행은 하지 않았습니다.

## 타입 검증

```text
clients/desktop/.\node_modules\.bin\tsc.cmd --noEmit
clients/desktop/.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.node.json
clients/desktop/.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.web.json
```

세 명령 모두 종료 코드 `0`입니다.

## 못 한 것

- 자격증명과 실서버가 필요한 R16/R17 실제 Playwright 실행은 하지 않았습니다.
- 커밋·push·main 병합은 하지 않았습니다.
- 프로덕션 코드와 가드 테스트는 변경하지 않았습니다.
