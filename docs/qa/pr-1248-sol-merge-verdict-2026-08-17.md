# PR #1248 CODEX SOL 머지 판정 — 이슈 #1237 영업수수료 정산 계산

## ① 환경 확인

요청한 명령을 작업 시작 시 그대로 실행한 원문이다.

```text
> git rev-parse HEAD
b60d1335fc3b97b941a9f93a5637025d70e40c82

> git rev-parse --abbrev-ref HEAD
feat/gas-missing-19

> git status --porcelain
?? clients/desktop/playwright/1248-merge-verdict-real-qa/
?? clients/desktop/playwright/1248-merge-verdict-sol2-real-qa/
?? docs/qa/1248-merge-verdict-real-qa/
?? docs/qa/1248-merge-verdict-sol2-real-qa/

> gh pr checks 1248
Frontend Desktop (typecheck + lint + build)  fail
GitGuardian Security Checks                  fail
하네스 거짓 green 가드 (docs/qa 관할)       fail
#910 문서 계약 테스트 (docs/dev-reports 관할) pass
App Build Version Guard (scripts/app-build-version, #910/#928) pass
Config Audit Guard (다운스트림 URL/포트 정합, #745) pass
Credential Plaintext Guard (SP-08-8) pass
Desktop Playwright (mock 회귀 hard gate) pass
Detox Android (arologis-mobile, AVD) pass
Detox Android (mobile v4, AVD) pass
Frontend DS (typecheck + lint + build + storybook) pass
Frontend Mobile (삼한 모바일 · typecheck + jest) pass
Frontend Mobile-Public (typecheck + lint + test + build) pass
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run) pass
Frontend Order-App (typecheck + test + build) pass
Internal Chat Desktop (typecheck + lint + test + build) pass
JUnit 테스트 결과 13개 pass
Local Stack Port Resolver Guard (#1113) pass
Notion Runtime Zero Guard (SP-08-7) pass
Playwright (web + electron + mobile emul) pass
S1 logging opt-in 계약 (docs/local-stack 관할) pass
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것) pass
빌드 + 테스트 13개 pass
자격 평문 비공개 가드 (docs 관할, SP-08-8) pass
```

`gh pr checks`는 실패 check가 있어 종료코드 1이었다. 시작 전부터 있던 위 미추적 4개 디렉터리는 삭제·추적·커밋하지 않았다.

## ② CI 카운트

`gh pr view 1248 --json statusCheckRollup`을 다시 집계한 현재값은 **성공 43 / 전체 46, 실패 3**이다. 따라서 직전 라운드의 `CI 46/46` 주장은 현재 HEAD check 상태와 다르다.

| check | 상태 | 원문 요약 |
|---|---:|---|
| Frontend Desktop | FAILURE | `SalesCommissionSettlementDetailPage.test.tsx → setTimeout(resolve, 0)` 때문에 1 failed / 2462 passed |
| 하네스 거짓 green 가드 | FAILURE | 같은 H-4 위반, `flushZeroDelayTasks()` 사용 요구 |
| GitGuardian Security Checks | FAILURE | 외부 check FAILURE. 이 실행에서는 dashboard 상세 판정을 만들지 않았다 |

로컬 관련 검증은 accounting+gateway Gradle `BUILD SUCCESSFUL`, 화면 Vitest `7/7`, desktop typecheck 성공이었다. 이는 GitHub의 43/46을 46/46으로 바꾸지 않는다.

## ③ 게이트웨이 격리 배포와 공유 스택 구분

PR HEAD에서 `clean bootJar`로 다시 만든 JAR과 실제 컨테이너 `/app/app.jar`의 SHA-256이 일치했다.

| 대상 | 호스트 빌드 SHA-256 | 격리 컨테이너 SHA-256 | 일치 |
|---|---|---|---:|
| api-gateway | `edda9e40a5d7d6972d7dd5279f86a8c226dea08cc4b7694169f9c118775c12bb` | 동일 | 예 |
| accounting-service | `d62b9a1e02725ad1e7e6f68e40b04310c5919d8cc436215a7ef271deaf96c5a8` | 동일 | 예 |

격리 포트는 gateway `28637`, accounting `29647`, Vite `59647`, PostgreSQL `50637`이었다. accounting DB는 공유 `accounting_db`를 읽기 전용 `pg_dump`하여 격리 PostgreSQL에 복원했고, 쓰기는 격리 DB에만 남겼다.

| 대상 | 로그인 | `/auth/admin/menu-catalog` | 구분 |
|---|---:|---:|---|
| 공유 스택 `127.0.0.1:8080` | 200 | **401** | 옛 gateway 코드가 배포된 상태 |
| PR HEAD 격리 gateway | 200 | **200** | PR 변경 적용 JAR |

첫 격리 시도에서 gateway가 공유 auth 컨테이너 DNS를 못 찾아 `java.net.UnknownHostException: Failed to resolve 'd15168e4ca21'`로 로그인 500을 냈다. `samhan-net` 연결 후 재시작하자 로그인 200이 됐다. 다음에는 accounting discovery를 꺼 두어 권한 조회가 `No instances available for auth-service`로 403을 냈고, 실제 배포와 같이 Eureka를 연결하자 200이 됐다. 두 원문은 격리 배포 구성 문제이며 PR 코드 결함으로 세지 않았다.

코드 차이는 `services/api-gateway/src/main/resources/application.yml:229-236`에서 메뉴 catalog 라우트의 Arologis 전용 secret을 제거하고 일반 직원 JWT를 쓰게 한 것이다. **공유 스택 401은 미배포 문제, PR HEAD 격리 스택 200은 코드 수정 효과**로 분리된다.

## ④ 응답 순서 뒤집기 실제 시도

Playwright route에서 A의 응답 전달을 늦추고 B를 빠르게 전달했다. 디바운스 대기만 한 것이 아니라 A 요청 발생을 확인한 뒤 B를 입력했고, 세 조합 모두 응답이 실제 `B → A` 순으로 도착했다.

| 회 | A(느림) | B(빠름) | 지연 조합 | 실제 응답 순서 | 응답 후 입력 | 화면 계산 결과 | 저장값 / 재조회 |
|---:|---:|---:|---|---|---:|---:|---:|
| 1 | 101 | 202 | A 응답 +900ms, B 전송 전 +40ms | 202 → 101 | 202 | **1,234,567.000000** | **101.000000 / 101.000000** |
| 2 | 3030 | 4040 | A 응답 +1300ms, B 전송 전 +140ms | 4040 → 3030 | 4040 | **101.000000** | **101.000000 / 101.000000** |
| 3 | 50505 | 60606 | A 응답 +700ms, B 전송 전 +20ms | 60606 → 50505 | 60606 | **101.000000** | **101.000000 / 101.000000** |

추가로 A의 upstream 전송 자체를 1000ms 늦춘 `717171 → 828282`에서도 응답은 `828282 → 717171`, 입력은 `828282`였지만 화면은 `101.000000`, 저장·재조회도 `101.000000`이었다. 캡처에는 `정산 계산 저장에 실패했습니다.` 배너도 보인다.

**판정:** 순번 변수는 `SalesCommissionSettlementDetailPage.tsx:79, 98-106`에 있으나, 실화면에서는 B 계산 결과가 남지 않았다. 디바운스가 아니라 느린 네트워크에서 재현되는 도달 결함이다.

## ⑤ 자릿수 15~20 전수표

| 자리 | 입력 화면 | 요청 본문 | 저장 응답 | 재조회 | 안내/판정 |
|---:|---|---|---|---|---|
| 15 | `999999999999999.000000` | `999999999999999` | `999999999999999` | `999999999999999.000000` | 수치는 보존, 문자열 불일치 |
| 16 | `9999999999999999` | `9999999999999999` | `9999999999999999` | `9999999999999999.000000` | 수치는 보존, 문자열 불일치 |
| 17 | `99999999999999999` | `99999999999999999` | `99999999999999999` | `99999999999999999.000000` | 수치는 보존, 문자열 불일치 |
| 18 | `999999999999999999` | `999999999999999999` | `999999999999999999` | `999999999999999999.000000` | 수치는 보존, 문자열 불일치 |
| 19 | `9999999999999999999` | 요청 없음 | 저장 없음 | 직전 18자리 유지 | `정수부는 18자리까지` alert, 조용히 자르지 않음 |
| 20 | `99999999999999999999` | 요청 없음 | 저장 없음 | 직전 18자리 유지 | 같은 alert, 조용히 자르지 않음 |

15~18자리의 **숫자 정밀도는 보존**됐다. 그러나 화면 표시가 `₩… .000000`이고 재조회가 `.000000`을 붙여 “네 곳이 한 자리도 다르지 않다”는 조건은 실패한다. 통화 화면에 소수 6자리가 노출되는 별도 도달 결함이다.

## ⑥ 레거시 손계산 vs 구현 대조

레거시 GAS R-18 원문은 `tools/legacy-gas/영업수수료 계산/Index.html:297-340`이다.

```javascript
297 function getExpenseRate() {
298   if (expMode === 'manual') {
299     return parseNum(document.getElementById('f_exp_manual').value) / 100;
301   return 0.08;
318 function xround(n) {
319   return (n < 0 ? -1 : 1) * Math.round(Math.abs(n));
331 var card = payMethod === '카드결제' ? xround(-total * 0.03) : 0;
332 var sales = total - equip + card;
333 var expense = xround(sales * -expenseRate);
334 var wht = whtApply ? xround(sales * -0.033) : 0;
335 var dogup = xround(install * -0.08);
336 var safety = -safetyInput;
337 var subtotal = sales + expense + wht + dogup + safety;
338 var payout = subtotal - prepaid;
339 var supply = xround(subtotal / 1.1);
340 var vat = subtotal - supply;
```

`Index.html:311-315`의 “천단위”는 `toLocaleString` 표시용이며 천 원 단위 반올림이 아니다. 계산은 각 카드·제경비·원천징수·설치비와 공급가에서 **원 단위 HALF_UP**을 순서대로 한다. 판매비(화면명 제경비) 토글/비율은 `sales = total - equipment + card` 다음, 원천징수 전의 `expense = xround(sales * -expenseRate)` 자리에 들어간다.

독립 표본: total 1,234,567 / equipment 234,567 / prepaid 100,000 / install 123,456 / safety 7,890 / 카드 / 원천징수 적용 / 기본 제경비 8%.

| 항목 | 손계산 | 구현 저장 응답 | 일치 |
|---|---:|---:|---:|
| 카드 3% | -37,037 | -37,037 | 예 |
| sales | 962,963 | 962,963 | 예 |
| 제경비 8% | -77,037 | -77,037 | 예 |
| 원천징수 3.3% | -31,778 | -31,778 | 예 |
| 설치비 8% | -9,876 | -9,876 | 예 |
| 안전관리비 | -7,890 | -7,890 | 예 |
| subtotal | 836,382 | 836,382 | 예 |
| 지급액 | 736,382 | 736,382 | 예 |
| 공급가액 | 760,347 | 760,347 | 예 |
| 부가세 | 76,035 | 76,035 | 예 |

구현 원문은 `SalesCommissionSettlementCalculator.java:25-50`이고 레거시 순서와 결과가 일치한다. 수기 토글과 `12.5` 입력도 화면에서 보였고 요청에는 `0.125`로 들어갔다.

## ⑦ 금액 4단계

화면 단일 표본에서 응답/재조회가 폼을 다시 덮는 현상까지 그대로 기록했다.

| 단계 | 총액 | 지급액 | 공급가액 | 부가세 |
|---|---:|---:|---:|---:|
| 입력 화면(관측 시점) | **1,234,568.000000** | - | - | - |
| 계산 결과 화면 | **1,234,567.000000** | 1,135,802.000000 | 1,032,547.000000 | 103,255.000000 |
| 저장 요청 본문 | **1234567** | 계산값 | 계산값 | 계산값 |
| 저장 응답 | **1234567** | 1135802.000000 | 1032547 | 103255.000000 |
| 저장 후 재조회 | **1234567.000000** | 1135802.000000 | 1032547.000000 | 103255.000000 |

입력 화면과 계산 결과가 서로 다른 것은 실제 사용자 도달 결함이다. 복합 입력에서도 연속 요청 본문이 다음처럼 교대로 이전 필드를 잃었다.

```text
장비대 입력 후: total=1234567 equipment=234567 prepaid=0 install=0 safety=0
선지급 입력 후: total=1234567 equipment=0      prepaid=100000 install=0 safety=0
설치비 입력 후: total=1234567 equipment=234567 prepaid=0 install=123456 safety=0
안전비 입력 후: total=1234567 equipment=0      prepaid=100000 install=0 safety=7890
```

`SalesCommissionSettlementDetailPage.tsx:80-91`이 재조회된 settlement로 폼 전체를 다시 쓰고, `:98-102`가 매 성공마다 query를 invalidate하는 경로에서 재현됐다.

## ⑧ 역할별 접근 상태값

| 역할 | 로그인 | 목록 | 계산 |
|---|---:|---:|---:|
| MASTER | 200 | 200 | 200 |
| MANAGER | 200 | 200 | 200 |
| ACCOUNTANT | 200 | 200 | 200 |
| SALES | 200 | 403 | 403 |
| WAREHOUSE | 200 | 403 | 403 |
| DISPATCH | 200 | 403 | 403 |
| INVENTORY | 200 | 403 | 403 |
| DEVELOPER | 200 | 403 | 403 |
| STAFF | 200 | 403 | 403 |
| DRIVER | 200 | 403 | 403 |

## ⑨ 기존 DRAFT 경로

| 경로 | 상태값 |
|---|---:|
| 빈 DRAFT 생성 | 201 |
| 목록 조회 | 200 |
| 상세 조회 | 200 |
| 두 번째 빈 DRAFT 생성 | 201 |
| 확정 | 200 |
| 빈 금액 계산(0 처리) | 200 |
| 형식 오류 `1,000` | 400 `INVALID_INPUT` |

## ⑩ 캡처

모두 `resolveQaShotsDir()`에 `QA_SHOTS_DIR`과 명시적 `QA_ALLOW_OVERWRITE=1`을 전달해 `_local` 밖에 생성했다. 페이지 고유 heading `정산 계산`과 해당 DRAFT 링크를 먼저 단정했다.

- `docs/qa/1248-merge-verdict-sol2-final/screenshots/01-before-immediate-recalculation-real-qa.png`
- `docs/qa/1248-merge-verdict-sol2-final/screenshots/02-after-immediate-recalculation-real-qa.png`
- `docs/qa/1248-merge-verdict-sol2-final/screenshots/03-whole-network-inversion-before-reload-real-qa.png`

앞/뒤 두 장에서 0 → 1,234,567 즉시 재계산과 `.000000` 노출을 확인할 수 있다. 세 번째는 입력 `828282`, 결과 `101.000000`, 저장 실패 배너를 함께 보여 준다.

## ⑪ 도달 결함

### 결함 1 — 연속 필드 입력이 재조회 응답으로 유실됨

1. MANAGER 로그인 → 회계 → 영업수수료 정산 → 빈 DRAFT 상세.
2. 총액, 장비대, 선지급, 설치비, 안전관리비를 차례로 입력한다.
3. 각 자동계산 성공 뒤 query invalidate/refetch가 폼 전체를 이전 snapshot으로 덮는다.
4. 다음 요청 본문에서 직전 입력 필드가 0으로 되돌아가며, 모든 입력을 동시에 저장할 수 없다.

### 결함 2 — A/B 응답 역전에서 마지막 입력 B 결과가 남지 않음

1. A 요청을 보낸 뒤 B를 입력한다.
2. A 응답을 700~1300ms 늦춰 B가 먼저 오게 한다.
3. 세 조합 모두 입력칸은 B지만 계산 결과는 이전 값이고 저장·재조회도 B가 아니다.
4. 추가 whole-network 역전에서는 저장 실패 배너까지 노출된다.

### 결함 3 — 통화 입력·결과·재조회에 `.000000`이 노출됨

15~18자리 수치는 틀어지지 않지만 저장 후 입력칸과 통화 결과가 `1234567.000000`, `₩1,234,567.000000`처럼 표시된다. 요청/저장 응답/재조회 문자열도 한 자리 그대로 일치하지 않는다.

## ⑫ 증거 무결성 자기 고지

- `git add/commit/push`는 전혀 실행하지 않았다.
- 시작 전 미추적 4개 디렉터리는 다른 라운드 산출물로 간주해 삭제하지 않았다.
- 본 라운드는 기존 미추적 `1248-merge-verdict-sol2-real-qa.mjs`의 포트와 진단만 수정해 실행했다. PR 코드 파일은 수정하지 않았다.
- 캡처와 `results.json`, 본 보고서는 금지 지시 때문에 미추적 상태이며 GitHub에서 이미지가 자동 렌더링된다고 주장하지 않는다.
- 응답 역전 3회 표는 완료된 실행의 `results.json`을 즉시 읽은 원문에서 옮겼다. 그 뒤 upstream 상태를 추가하려던 진단 재실행이 첫 race에서 timeout하며 같은 `results.json`을 부분 결과로 덮었다. 캡처 3은 완료 실행의 파일로 남아 있다. 이 사실을 숨기지 않는다.
- CI는 46/46이 아니라 43/46이다. 관련 local green을 CI green으로 대체하지 않았다.

## ⑬ 프로세스 회수

이 라운드와 선행 잔여의 `qa1248-*` 격리 컨테이너 및 Vite 포트 59637/59647 프로세스를 회수했다.

```text
QA1248_CONTAINER_REMAINDER=0
QA_VITE_PORT_REMAINDER=0
```

공유 스택에는 write를 남기지 않았고 공유 컨테이너는 중지하지 않았다.

## ⑭ 판정

**머지 불가 — 도달 결함 3건.**

계산식 자체와 15~18자리 숫자 정밀도, 역할 접근, 기존 DRAFT 경로, 메뉴 gateway 코드는 확인됐다. 그러나 실 사용자가 화면에서 여러 금액을 입력하면 값이 유실되고, 느린 응답 역전에서 마지막 입력 B의 결과가 남지 않으며, 저장 후 통화 표시가 `.000000`으로 변한다. 유일한 질문에 대한 답은 **“예, 실 사용자가 화면을 통해 도달할 수 있는 결함이 남아 있다”**이다.
