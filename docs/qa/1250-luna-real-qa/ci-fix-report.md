# PR #1250 CI 실패 3건 수정 보고서

## ① 환경 확인

요청 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1250
git rev-parse HEAD                 # 6c5fb5be6 (main 최신화 직후)
git rev-parse --abbrev-ref HEAD    # feat/daily-closing-amount-edit
git status --porcelain
```

실행 원문:

```text
6c5fb5be68d488340c802d2edde97cceeb71589a
feat/daily-closing-amount-edit
```

초기 `git status --porcelain`은 빈 출력이었다.

## ② ⓐ 하네스 가드 근원과 수정

CI 원문은 다음 2건이었다.

```text
AssertionError: 커밋 QA 증거로 직접 쓰는 경로 상수 발견 — resolveQaShotsDir() 경유 필수
1250-daily-closing-amount-real-qa/1250-daily-closing-amount-real-qa.spec.ts → const shots

AssertionError: 커밋 QA 증거로 직접 쓰는 경로 상수 발견(clients/**/scripts, 루트 scripts/) — _local 격리 필수
같은 파일 → const shots
```

해당 스펙의 `path.resolve(.../docs/qa/...)` 직접 목적지와 `fs.mkdirSync(shots)`를 제거하고 `resolveQaShotsDir(path.resolve(...))`로 교체했다. 캡처·README 출력은 모두 반환된 `shots`를 계속 사용한다.

## ③ 같은 워크트리 다른 스펙 전수 확인

PR에 포함된 `1250-luna-real-qa`, `1250-sol-r1-real-qa`의 두 스펙은 모두 `resolveQaShotsDir()`를 이미 경유했다. 직접 목적지 위반은 위 일마감 스펙 1건뿐이었다.

## ④ tools/s14-probes 연쇄 여부

CI의 `tools/s14-probes/source/deep/mjs-writer.mjs`, `python-writer.py`, `ts-writer.ts`는 하네스 테스트가 G3a 판정을 위해 임시 생성하는 fixture다. 테스트의 `finally`에서 `tools/s14-probes`를 삭제한다. 실제 위반 목록은 `const shots` 1건뿐이며 fixture는 수정하지 않았다.

로컬 실행:

```text
src/renderer/test-utils/harness-false-green-guard.test.ts
Test Files  1 passed (1)
Tests       62 passed (62)
```

## ⑤ ⓑ Frontend Desktop 근원과 main 대조

실패한 기존 CI job 원문:

```text
Test Files  1 failed | 299 passed (300)
Tests       2 failed | 2456 passed | 2 skipped (2460)
H-2: ... 1250-daily-closing-amount-real-qa/... → const shots
G3a: ... 같은 파일 → const shots
```

따라서 typecheck·lint·build의 소스 컴파일 문제가 아니라 Vitest 하네스가 같은 경로 위반을 두 번 검출한 것이다. `origin/main...HEAD` diff와 실패 로그를 대조해 PR이 추가한 라이브 스펙의 직접 경로 상수가 근원임을 확인했다.

수정 후 로컬:

```text
DailyClosingPage.test.tsx + harness-false-green-guard.test.ts
Test Files  2 passed (2)
Tests       89 passed (89)
npm run typecheck  exit 0
npm run lint       exit 0 (기존 warning 196, error 0)
npm run build      exit 0
```

## ⑥ ⓒ GitGuardian 판정

`origin/main...HEAD` diff를 직접 점검했다.

- `.env`/`.env.local` 변경: 0건
- 자격값·비밀값 리터럴 추가: 0건
- 로그인·attestation 값: 모두 `resolveQaCredential(...)` 런타임 조회
- 추가된 고엔트로피 상수: `isolatedJarSha256` 64자리 digest 1건

마지막 digest는 자격증명이 아닌 격리 DB 증거 메타데이터지만 GitGuardian이 비밀 후보로 오탐할 수 있는 유일한 리터럴이었다. 사용자 도달 계약과 무관하므로 해당 증거 필드만 제거했다. 임의의 “상시 오탐” 면제가 아니며, diff에서 실제 후보를 제거한 판정이다.

## ⑦ 잃으면 안 되는 것 유지

애플리케이션 코드와 금액 계산 경로는 변경하지 않았다. 거래처원장 36668.67, 전표요약 110006, 단가 100원×2 → 공급가 182/VAT 18/합계 200, 저장 후 출고가·할인율 보존, 정상 조합 저장·모순값 400, 음수/큰 할인율 왕복, menu_catalog 200, V123 fresh 84개, 회계전표 수정 금지, 운임·절삭, #1230 다중선택·정렬·필터는 모두 기존 검증 산출을 유지한다.

## ⑧ 회귀

```text
SAMHAN_GATEWAY_ATTESTATION: infrastructure/.env.local에서 프로세스 환경으로 주입
slip-service 관련 테스트 5개 지정 실행: BUILD SUCCESSFUL
18 actionable tasks: 3 executed, 15 up-to-date
```

지정 테스트: `SlipLineAmountContractTest`, `DailyClosingAmountUpdateServiceTest`, `DailyClosingRowResponseTest`, `PartnerLedgerSalesResponseTest`, `SlipSummaryAuthoritativeAmountsTest`.

## ⑨ 프로세스 회수

이번 작업이 기동한 장기 프로세스와 격리 컨테이너는 없다. Gradle 단일 사용 daemon은 종료 메시지 후 회수됐다. 워크트리 경로를 가진 잔여 node/java/electron 프로세스 0개, 이번 작업의 격리 컨테이너 0개다. 기존 공유 스택 및 다른 라운드 컨테이너는 사용자 작업 범위이므로 중지하지 않았다.

## ⑩ 최종 `git status --porcelain` 원문

```text
 M clients/desktop/playwright/1250-daily-closing-amount-real-qa/1250-daily-closing-amount-real-qa.spec.ts
 M clients/desktop/playwright/1250-sol-r1-real-qa/1250-sol-r1-real-qa.spec.ts
?? docs/qa/1250-luna-real-qa/ci-fix-report.md
```

`git add`, `git commit`, `git push`는 실행하지 않았다.
