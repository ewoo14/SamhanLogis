# #1116 결과 기반 `docs/qa` 오염 가드 타당성 조사

## 조사 범위와 결론 요약

구현은 하지 않았다. 현재 가드, S20~S22 보고서, GitHub Actions 워크플로, Playwright/Vitest 설정과 Git 추적·무시 상태만 조사했다.

결과 기반 검사는 **현재 CI에 추가할 수 있고, 실제로 실행된 테스트가 남긴 최종 오염을 언어와 경로 조립 방식에 무관하게 잡는 최종 방어선으로 유효하다.** 그러나 현 정적 가드의 완전 대체재는 아니다. 현재 가드가 정의한 추적 writer 후보 344개 중 일반 CI 명령으로 실제 실행되는 것은 29개뿐이고 315개는 실행되지 않는다. 또한 `git status --porcelain -- docs/qa`는 ignored 파일과 테스트가 종료 전에 복구한 쓰기를 보지 못하므로 “위조할 수 없다”는 표현은 성립하지 않는다.

## A. 지금 CI에서 성립하는가

### A1. `docs/qa`의 커밋 파일 수와 “변경 없음”의 의미

2026-08-08 현재 다음 명령의 결과는 **7,658개**다.

```text
git ls-files docs/qa
tracked_count=7658
```

따라서 결과 가드의 계약은 “`docs/qa`가 비어 있다”가 아니라 **체크아웃 시점의 7,658개 추적 파일과 비교해 수정·삭제된 파일이 없고, 새 non-ignored 파일도 없다**는 뜻이다. GitHub-hosted runner의 새 checkout은 깨끗하므로 CI에서는 단순 post-check가 가능하다. 로컬에서는 실행 전부터 있던 변경과 테스트가 만든 변경을 구분하려면 사전 상태를 저장해 비교해야 한다.

제안된 명령은 tracked 변경과 non-ignored untracked 파일은 표시하지만 ignored 파일은 표시하지 않는다. 저장소에는 다음 무시 규칙이 실제로 있다.

- `**/_local/`
- `docs/qa/**/_results.json`
- 일부 과거 QA PNG 경로의 개별 ignore

즉 정상 격리 출력인 `_local`이 안 보이는 것은 의도와 맞지만, 위반 writer가 ignored 경로에 쓰면 같은 이유로 안 보인다. `--untracked-files=all`을 붙여도 ignored 파일은 나타나지 않는다. 따라서 이 검사는 “최종 Git 오염”에는 정확하지만 모든 실제 쓰기 시도를 증명하는 불변식은 아니다.

### A2. 테스트 실행 잡과 post-check 가능성

각 GitHub Actions 잡은 `actions/checkout@v4` 이후 같은 잡의 step들이 같은 작업 디렉터리를 계속 사용한다. 따라서 **각 잡의 마지막 테스트 직후** `git status --porcelain -- docs/qa`를 실행할 수 있다. 다만 잡마다 runner와 checkout이 분리되므로 한 잡의 마지막에 둔 단일 검사는 다른 잡의 오염을 볼 수 없다. matrix도 cell마다 별도 검사해야 한다. 실패한 테스트 뒤에도 진단하려면 post-check step에 `if: always()`가 필요하다.

현재 테스트를 실행하는 경로는 다음과 같다.

| workflow | 테스트 실행 잡 |
|---|---|
| `.github/workflows/ci.yml` | `build-and-test` matrix, `credential-plaintext-guard`, `app-build-version-guard`, `frontend-ds`, `frontend-desktop`, `frontend-order-app`, `frontend-mobile-public`, `frontend-mobile`, `frontend-mobile-staff` |
| `.github/workflows/qa-e2e.yml` | `playwright`, `desktop-playwright` (`detox-*` 두 잡은 현재 typecheck/config만 하고 Detox test는 실행하지 않음) |
| `.github/workflows/harness-guard.yml` | `harness-false-green-guard` |
| `.github/workflows/docs-guard.yml` | `round-910-doc-contract`, `docs-contract-specs` |
| `.github/workflows/arologis-ci.yml` | `backend`, `desktop`, `mobile` |
| `.github/workflows/nightly-slip-it.yml` | `slip-it-nightly` matrix |
| `.github/workflows/deploy-estimate-app.yml` | `build` |
| `.github/workflows/deploy-order-app.yml` | `deploy`의 `npm test --if-present` 및 배포 후 smoke test |

위 잡들에는 checkout이 있고 테스트 후에도 workspace가 남는다. 따라서 기술적 배치 자체는 가능하다. 단, `qa-e2e.yml`의 `playwright` 잡처럼 테스트 step 하나가 `|| true`인 경우에도 뒤의 hard gate와 post-check는 계속 실행할 수 있다.

### A3. 정상적으로 `docs/qa`를 수정하는 CI 경로

현재 workflow의 실제 `run:`/action 경로에서 **커밋 증거인 `docs/qa` 추적 파일을 정상 갱신하는 CI 경로는 발견하지 못했다.** 워크플로의 `docs/qa` 언급은 주로 trigger와 정적 스캔 설명이다. Playwright의 자동 실패 screenshot/report는 `test-results` 또는 `playwright-report`로 가며 artifact로 업로드된다.

가드 대상 QA 스크립트 중 정상 재실행 출력은 resolver를 통해 `_local`로 보내도록 설계되어 있고 `_local`은 Git ignored다. 그러므로 현재 CI에는 tracked `docs/qa` 변경 예외가 필요하지 않다. 향후 증거 생성·커밋용 workflow를 추가한다면 그 잡은 일반 테스트 잡과 분리하거나, 사전 baseline과 명시적 허용 경로를 둬야 한다.

## B. 무엇을 잃는가

### B1. CI에서 실행되지 않는 정적 가드 관할

현재 가드의 `discoveredEvidenceWriters()`를 코드 수정 없이 메모리에서 실행하고, CI checkout과 같은 tracked 파일만 남겼다. 이어 `clients/desktop` 기본 Playwright 설정의 실제 `--list` 결과와 workflow의 명시적 Node 테스트를 대조했다.

| 항목 | 파일 수 |
|---|---:|
| 현재 가드의 tracked writer 후보 모집단 | 344 |
| 일반 CI에서 실제 실행되는 후보 | 29 |
| 일반 CI에서 실행되지 않는 후보 | **315** |

29개는 기본 Desktop Playwright mock 스펙 28개와 `clients/desktop/scripts/qa-output-path-guard.test.cjs` 1개다. 나머지 315개에는 다음이 포함된다.

- `clients/desktop/playwright` 아래 217개: 대다수 `*-real-qa`·수동 캡처 경로이며 기본 `playwright.config.ts`의 `testIgnore`에 걸린다.
- `clients/desktop/scripts` 15개와 desktop 루트 QA 스크립트 3개
- mobile/mobile-staff 캡처 2개, estimate/order app 캡처 11개
- `docs/qa` 안의 실행 스크립트 9개
- `qa/playwright` generator/helper 12개
- 루트 `scripts`의 generator/load-test 계열 39개
- `tools/manual-capture` 10개

이 344개는 가드 자체가 G9에서 사용하는 “스캔 파일” 모집단이다. 정규식 discovery의 과대 포함도 그 숫자에 포함되므로 “344개 모두 실제 실행 시 반드시 쓰기 발생”을 뜻하지는 않는다. 그러나 **정적 가드를 결과 가드로 교체하면 최소 315개는 CI에서 실행조차 되지 않아 검사 표면에서 빠진다**는 결론은 변하지 않는다.

S21/S22가 기록한 현재 정적 분석의 알려진 미탐도 그대로 확인됐다. quoted Batch 목적지, 도움말 문자열 marker 우회, Python `Path('docs') / 'qa'`, Batch `%OUT%` 목적지는 미래 위반을 green으로 만들 수 있다. 마지막 두 형태는 현재 tracked Python 6개·Batch 2개에는 0건이지만 미래 변경 방어는 아니다. 결과 가드는 이 파일들이 실제 실행될 때에는 동적 경로까지 잡지만, 실행되지 않는 315개에는 효력이 없다.

조사 중 병렬 작업자가 추가한 S23 보고서도 반영했다. S23은 S22 이후에도 Python 주석의 `"""`가 뒤 writer 코드를 숨기는 미탐, 기본 `execFileSync` buffer 초과 후 skip basename 아래 tracked writer를 놓치는 미탐, 동일 unreadable 경고 21회 반복을 재현했다. 이는 정적 분석을 계속 정밀화하는 비용이 구조적이라는 근거를 강화하지만, 동시에 결과 검사만으로는 CI 미실행 파일을 보지 못한다는 위 결론을 바꾸지는 않는다. S23 반영 후 현재 가드로 census를 다시 실행해도 수치는 344/29/315로 동일했다.

### B2. 범인 추적성

`git status --porcelain -- docs/qa`는 **변경된 목적지 파일명**은 알려 준다. tracked 파일이면 `git diff -- docs/qa`로 내용 차이도 볼 수 있고, non-ignored untracked 파일도 경로가 나온다. 따라서 “무엇이 더러워졌는가”는 바로 알 수 있다.

그러나 “어느 테스트/소스가 썼는가”는 알려 주지 않는다. 목적지 문자열이 소스에 직접 있으면 `rg`로 역추적할 수 있지만, 이번 문제의 핵심인 동적 조립 경로는 그 방법이 통하지 않을 수 있다. 병렬 실행이나 여러 테스트가 같은 파일을 건드린 경우에는 테스트 분할·bisect 또는 실행 중 파일 이벤트 추적이 추가로 필요하다.

또한 post-check는 최종 상태만 본다. 테스트가 파일을 쓴 뒤 삭제하거나 원문으로 복구하거나 `git restore/clean`을 실행하면 결과가 깨끗하다. ignored 경로 쓰기도 기본 status에는 안 보인다. 따라서 결과 검사는 언어 독립적이지만 **쓰기 주체 추적 도구도 아니고, 적대적 코드에 대해 위조 불가능한 감사 로그도 아니다.**

### B3. 로컬 개발자 경험

정적 가드는 대상 테스트나 제품 서버를 실제 실행하지 않아도 새 source의 명백한 위반을 잡고, 위반 source 파일명을 직접 출력한다. 현재 전용 Vitest 실행은 S21/S22 측정 기준 약 25초다.

결과 가드는 실행한 테스트에 대해서는 정규식 오차단이 없고 언어·확장자 추가도 신경 쓰지 않아도 된다. 반면 개발자는 관련 테스트와 그 의존성·브라우저·서비스를 실제로 실행한 뒤에야 피드백을 받는다. 수동 real-QA·generator처럼 CI와 일상 테스트에서 실행되지 않는 파일은 로컬에서도 사람이 직접 그 스크립트를 돌리지 않으면 아무 판정이 없다. 또 로컬 작업트리에 기존 `docs/qa` 변경이 있으면 단순 post-check는 범인을 잘못 지목하므로 사전 baseline 비교가 필요하다.

## C. 정적·결과 가드 병행 가능성

병행은 가능하며 역할을 다음처럼 분리하는 것이 타당하다.

1. 정적 가드는 명백한 직접 리터럴과 명백한 write primitive만 검사한다. 완전한 언어 파서처럼 행동하려 하지 않고, 복잡한 주석·문자열·상수 전이에서 확신이 없으면 차단하지 않도록 줄인다.
2. 결과 가드는 테스트를 실제 실행하는 **각 잡마다** 마지막 테스트 직후 최종 `docs/qa` 오염을 검사한다. 이것이 실행된 경로의 동적 조립·신규 언어·신규 확장자 미탐을 받는다.
3. 정적 가드는 CI 미실행 315개, 특히 real-QA·수동 generator 표면을 계속 담당한다. 결과 가드는 이 표면을 대체한다고 주장하지 않는다.
4. 결과 가드의 계약은 “tracked 변경 + non-ignored untracked 잔재 0”으로 정확히 적는다. 모든 쓰기 시도 탐지나 위조 불가능성을 요구한다면 Git status post-check가 아니라 실행 중 filesystem 감시 또는 쓰기 sandbox가 필요하다.
5. 잡별 post-check가 중복되는 운영비가 부담되면 우선 `frontend-desktop`, `desktop-playwright`, `harness-false-green-guard`처럼 현 가드 모집단을 실제로 실행하는 잡에 적용하고, 이후 다른 테스트 잡으로 넓힐 수 있다. 다만 이 단계적 적용 범위를 문서에 명시해야 한다.

## 권고

**정적 가드를 결과 기반 검사로 교체하지 말고, 정적 가드를 느슨한 1차 가드로 축소한 뒤 결과 검사를 실행된 테스트의 최종 방어선으로 병행할 것을 권고한다.** 제안의 장점인 언어 독립성과 동적 경로 탐지는 실제이며 21라운드 정규식 수렴 실패를 완화한다. 그러나 현재 관할 344개 중 315개가 CI에서 실행되지 않아 단독 대체 시 방어 범위가 급감하고, ignored 경로와 실행 중 복구 때문에 “위조 불가”도 아니다. 즉 이 대안은 좋은 보강책이지만 현재 계약의 단독 대체재로는 타당하지 않다.
