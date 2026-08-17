# PR #1254 CI 실패 수정 보고서

## ① 환경 확인

요청된 원문 명령:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD                 # 13e1c0bf3
git rev-parse --abbrev-ref HEAD    # fix/notice-banner-layout-and-wording
git status --porcelain             # 비어 있어야 한다
```

실행 결과 원문:

```text
13e1c0bf37ea4e2b8acc90bd91f4406ad56524b0
fix/notice-banner-layout-and-wording
```

`git status --porcelain`은 빈 출력이었습니다.

## ② PM 진단 검증 결과

PM 진단은 **맞았습니다**.

- 기존 파일: `playwright/1254-arologis-production-electron.spec.ts`
- Electron 실기동, 로그인, 실 API 경로, 네이티브 스크롤을 검증하는 라이브 성격의 스펙입니다.
- 파일명에는 `-real-qa` 접미사가 없어 mock hard gate에 실제로 포함됐습니다.
- 기존 mock 목록: `Total: 671 tests in 126 files`
- 해당 스펙 매치: `MATCH_COUNT=1`

## ③ `testIgnore` 원문

`clients/desktop/playwright.config.ts`의 원문:

```ts
testIgnore: [
  '**/manual/**',
  '**/full-qa/**',
  '**/audit/**',
  '**/phase-2-4-real-qa/**',
  '**/*-real-qa.spec.ts',
  '**/*-real-qa/**',
  '**/1131-r10-sol-review/**',
  '**/1131-r2-adversarial/1131-r2-live-readonly.spec.ts',
  '**/1131-r5-adversarial/1131-r5-live.spec.ts',
  '**/1131-r6-adversarial/1131-r6-live.spec.ts',
  '**/1151-final-reconv.spec.ts',
  '**/1151-postmerge-sol-reconv.spec.ts',
  '**/full-menu-contract/**',
]
```

저장소의 실제 원문에는 위 배열 사이에 설명 주석이 있으며, 제외 패턴의 핵심은 `**/*-real-qa.spec.ts`와 `**/*-real-qa/**`입니다. `testIgnore`는 변경하지 않았습니다.

## ④ 고친 것

스펙 파일명을 다음과 같이 변경했습니다.

```text
1254-arologis-production-electron.spec.ts
→ 1254-arologis-production-electron-real-qa.spec.ts
```

파일명만 변경했으며, 스펙 본문은 변경하지 않았습니다. `--no-sandbox` Linux 조건도 그대로 유지됩니다.

## ⑤ mock 스위트 `--list` 전후 카운트

변경 전 원문:

```text
EXIT=0
TOTAL_CHROMIUM_LIST_LINES=671
MATCH_COUNT=1
Total: 671 tests in 126 files
```

변경 후 원문:

```text
EXIT=0
TOTAL_CHROMIUM_LIST_LINES=670
MATCH_COUNT=0
Total: 670 tests in 125 files
```

mock 스위트에서 해당 라이브 스펙이 빠졌고, 전체 카운트는 정확히 1 test/1 file만 줄었습니다. 다른 스펙을 제외하도록 `testIgnore`를 넓히지 않았습니다.

## ⑥ mock으로 옮긴 단정과 못 옮긴 것

이번 변경에서 mock으로 옮긴 단정은 **0건**입니다.

옮기지 못한 단정은 다음 5가지입니다.

- Electron 실제 프로세스 기동
- 실제 로그인 및 실 배포 경로 접근
- updater 상태 IPC 주입 후 배너 표시
- 배너 밖 날짜 입력의 포커스 유지
- 내부 재시도 버튼 클릭 및 네이티브 스크롤 스타일 확인

현재 mock fixture/경로만으로는 이 통합 단정들을 동등하게 재현할 수 없어, 라이브 스펙에 보존했습니다.

## ⑦ 라이브 스펙 로컬 실행 결과

공유 real-QA 하네스의 추적 집합 보호 때문에 새 파일명은 아직 Git 추적 목록에 없어 최초 공식 명령은 차단됐습니다. 커밋/스테이징 없이 다음 허용된 명시 실행을 사용했습니다.

```powershell
$env:REAL_QA_ALLOW_UNTRACKED='1'
npx playwright test --config=playwright.real-qa.config.ts --reporter=line --timeout=60000 playwright/1254-arologis-production-electron-real-qa.spec.ts
```

핵심 원문:

```text
Running 1 test using 1 worker
[1/1] [renderer] › playwright\1254-arologis-production-electron-real-qa.spec.ts:12:1
[SCOPE-REDUCTION-QA] {"dateFocused":true,"retryCount":1,"stackState":{"role":null,"scrollable":null,"overflowY":"visible"}}
1 passed (3.9s)
```

## ⑧ 잃으면 안 되는 것 유지

- `신뢰 루트` 0건 표기를 유지했습니다. 아로로지스 단위 테스트의 신뢰 루트 관련 케이스가 통과했습니다.
- `보안인증서` 표기를 유지했습니다. 아로로지스 단위 테스트의 사용자 표기 케이스가 통과했습니다.
- 운영 패키지 인증서 프롬프트 진리표 4조합을 포함한 관련 단위 테스트가 통과했습니다.
- Linux `--no-sandbox` 조치는 라이브 스펙 본문에서 변경하지 않았습니다.

## ⑨ 회귀

```text
design-system
Test Files 32 passed (32)
Tests      285 passed (285)

arologis-desktop
Test Files 21 passed (21)
Tests      99 passed (99)
```

두 패키지 전체 단위 테스트 모두 종료 코드 0입니다.

## ⑩ 프로세스 회수

라이브 Electron은 테스트의 `finally`에서 종료됐습니다. 실행 후 worktree `w1253`를 명령줄에 포함한 잔여 Electron/Vite/Node 프로세스는 0개입니다. 이번 작업에서 시작한 격리 Docker 컨테이너도 0개이며, 기존 컨테이너는 회수하지 않았습니다.

## ⑪ 최종 `git status --porcelain` 원문

```text
 D clients/desktop/playwright/1254-arologis-production-electron.spec.ts
?? docs/qa/1254-ci-fix-report.md
```

새 파일은 `*-real-qa` 규칙에 따라 무시되어 PM이 후속 스테이징 시 rename으로 반영해야 합니다. 요청대로 이 세션에서는 `git add`, `git commit`, `git push`를 실행하지 않았습니다.
