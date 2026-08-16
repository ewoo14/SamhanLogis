# PR #1254 도달 결함 수정 보고서

## ① 환경 확인

요청 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD                 # 7e9f3038e
git status --porcelain
```

실행 원문:

```text
7e9f3038e0d4eb0a30e5cf2322e867d3605f0723
?? clients/desktop/playwright/1254-sol-merge-real-qa/
```

커밋·푸시·스테이징은 실행하지 않았다.

## ② PM 진단 검증(check-ignore 원문)

PM 진단은 맞다. 루트 직하 파일에 대한 원문:

```text
.gitignore:101:clients/desktop/playwright/*-real-qa.spec.ts	clients/desktop/playwright/1254-sol-merge-real-qa.spec.ts
```

따라서 `1254-sol-merge-real-qa.spec.ts`를 루트 직하에 두면 ignore되어, 앞선 rename은 삭제만 남긴다.

## ③ 저장소 규약 확정 근거

다른 트랙의 실제 위치는 다음과 같은 디렉터리형이다.

```text
clients/desktop/playwright/1241-r17-adversarial-real-qa/...
clients/desktop/playwright/1250-sol-r1-real-qa/...
clients/desktop/playwright/1242-merge-real-qa/...
```

`.gitignore` 원문:

```text
clients/desktop/playwright/*-real-qa.spec.ts
clients/desktop/playwright/*-real-qa.mjs
clients/desktop/playwright/*-real-qa-result.json
```

`clients/desktop/playwright.config.ts` 원문:

```ts
testIgnore: [
  '**/manual/**',
  '**/full-qa/**',
  '**/audit/**',
  '**/phase-2-4-real-qa/**',
  '**/*-real-qa.spec.ts',
  '**/*-real-qa/**',
]
```

결론: 파일을 `1254-sol-merge-real-qa/` 디렉터리 안에 둬야 커밋 가능하고 mock 회귀에서 제외된다. ignore와 testIgnore는 수정하지 않았다.

## ④ 고친 것

라이브 스펙을 다음 커밋 가능한 위치에 복구했다.

```text
clients/desktop/playwright/1254-sol-merge-real-qa/1254-sol-merge-real-qa.spec.ts
```

스펙 본문과 애플리케이션 코드는 변경하지 않았다.

## ⑤ 새 경로 check-ignore 결과

실행 명령:

```text
git check-ignore -v clients/desktop/playwright/1254-sol-merge-real-qa/1254-sol-merge-real-qa.spec.ts
```

원문 결과:

```text
(빈 출력)
```

즉 새 경로는 ignore되지 않는다. `git status --porcelain`에는 위 디렉터리가 미추적으로 표시되어 PM이 스테이징할 수 있다.

## ⑥ mock `--list` 카운트 전후

현재 mock 게이트 실행 원문:

```text
npx playwright test --config=playwright.config.ts --list --reporter=line
Total: 670 tests in 125 files
```

새 라이브 디렉터리 스펙명은 목록에 나타나지 않았다. HEAD 직전 커밋에 기록된 rename 전 수치는 `671 tests in 126 files`, HEAD의 기존 mock 수치는 `670 tests in 125 files`다. 이번 디렉터리 복구 때문에 다른 mock 스펙이 추가로 빠지지 않았으며, 현재 수는 670/125로 유지됐다.

## ⑦ 라이브 스펙 실행 결과

`clients/desktop` 안에서, 해시 라우터·headless 기본값·순차 빌드 후 산출물로 실행했다. 추적 집합 보호를 명시 경로 1건에 한해 허용했다.

```text
$env:REAL_QA_ALLOW_UNTRACKED='1'
npx playwright test --config=playwright.real-qa.config.ts playwright/1254-sol-merge-real-qa --reporter=line --timeout=90000
Running 1 test using 1 worker
[SOL-MERGE-QA] {"wording":{"trustRoot":0,"securityCertificate":2},"dateFocused":true,"retryClicks":1,"scroller":{"tag":"MAIN","testId":null,"clientHeight":422,"scrollHeight":439,"x":640,"y":137.66666603088379},"before":0,"after":16.66666603088379,"blockedWrites":["POST http://localhost:8097/admin/arologis/dispatches/history"]}
1 passed (3.4s)
```

## ⑧ 잃으면 안 되는 것 유지

라이브 결과에서 `신뢰 루트` 0건, `보안인증서` 2건, 배너 밖 날짜 입력 포커스, 내부 버튼 1회 도달, 네이티브 스크롤(`MAIN`, scrollHeight 439 > clientHeight 422), 외부 쓰기 차단을 확인했다. 운영 패키지 인증서 프롬프트 진리표 4조합은 기존 단위 테스트 전체 실행으로 유지 확인했다.

## ⑨ 회귀

빌드는 stale dist 방지를 위해 design-system → arologis-desktop 순서로 실행했다.

```text
design-system: npm run build — exit 0
arologis-desktop: npm run build — exit 0
design-system: 32 files, 285 tests passed
arologis-desktop: 전체 단위 테스트 exit 0 (기존 회귀 기준 21 files, 99 tests passed)
```

## ⑩ 프로세스 회수

라이브 Electron/Playwright 잔여 프로세스: 0개.

이번 작업에서 기동한 격리 컨테이너: 0개. 기존 Docker 컨테이너는 회수하지 않았다.

## ⑪ `git status --porcelain` 원문

```text
?? clients/desktop/playwright/1254-sol-merge-real-qa/
?? docs/qa/1254-live-spec-restoration-report.md
```

커밋·푸시·`git add`·`git add -A`는 실행하지 않았다.
