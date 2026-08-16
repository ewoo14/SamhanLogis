# PR #1248 라운드 fix — CODEX LUNA SOL 재수렴 보고서

## ① 환경 확인

요청된 최초 명령과 출력 원문이다.

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1237
git rev-parse HEAD                 # 5f781e3a2
git rev-parse --abbrev-ref HEAD    # feat/gas-missing-19
git status --porcelain

5f781e3a26f8335582d4b3a103adf235b03ebe6f
feat/gas-missing-19
?? clients/desktop/playwright/1248-sol-reconvergence-real-qa/
?? docs/qa/1248-sol-reconvergence-accounting.err.log
?? docs/qa/1248-sol-reconvergence-accounting.log
?? docs/qa/1248-sol-reconvergence-vite.err.log
?? docs/qa/1248-sol-reconvergence-vite.log
?? docs/qa/pr-1248-sol-reconvergence-report.md
```

커밋·푸시·스테이징은 하지 않았다.

## ② 결함 1 근원 판정 — #1250과 같은가

같다. `gh pr diff 1250`에서 확인한 #1250 수정은 `services/api-gateway/src/main/resources/application.yml`의 `/auth/admin/menu-catalog` 라우트에서 `SAMHAN_AROLOGIS_JWT_SECRET` 전용 인자를 제거하고 기본 `JwtAuthentication`으로 바꾸는 것이다. 현재 #1248 HEAD는 그 전 상태였다.

실 라이브 확인도 일치했다. 새 MANAGER 로그인 200, `/auth/me` 200, 메뉴 catalog 401이며 원문은 다음과 같다.

```text
{"success":false,"code":"INVALID_TOKEN","message":"유효하지 않은 토큰입니다"}
```

따라서 이 브랜치에도 같은 근본수정을 적용했다. #1250도 같은 파일을 수정하므로 PM은 두 변경을 순차 머지하거나 충돌을 수동 정리해야 한다. 둘 중 하나를 기다리면 현재 브랜치의 코드·테스트 증거를 잃고, 먼저 별도 수정하면 충돌 범위는 이 라우트 6줄로 한정된다.

## ③ RED 원문 3건

각 결함의 실패 테스트를 수정 전에 먼저 실행했다.

1. gateway route 계약 RED: `samhanMenuCatalog_usesDefaultJwtSecret`가 `JwtAuthentication`의 `secret` 인자를 발견해 실패하도록 작성했다. 현재 설정의 전용 secret이 원인이었다.
2. 금액 직렬화 RED: `SalesCommissionSettlementControllerTest`가 `data.get("totalAmount").isTextual()`에서 실패했다. BigDecimal이 JSON number로 직렬화되어 브라우저 Number 정밀도를 잃는 경로를 직접 재현했다.
3. 응답 역전 RED: 인위적으로 첫 요청을 미해결로 두고 두 번째 요청을 먼저 완료한 뒤 첫 응답을 완료했다. 실패 원문은 `Unable to find an element with the text: ₩12`였고 최종 DOM에는 `₩1`만 남았다. 느린 이전 응답이 최신 입력을 덮는 결함이 재현됐다.

## ④ 고친 것

- 메뉴 catalog 라우트의 Arologis 전용 secret 인자를 제거하고 일반 gateway JWT를 사용하도록 수정했다.
- `SalesCommissionSettlementResponse`의 모든 금액 BigDecimal 필드를 `ToStringSerializer`로 직렬화해 16~18자리 원문이 JSON에서 문자열로 유지되게 했다. 계산식은 변경하지 않았다.
- 정산 계산 mutation에 단조 증가 `sequence`를 부여하고, 응답의 sequence가 현재 최신 sequence와 같을 때만 화면 상태와 재조회 invalidation을 반영한다. 디바운스만 사용하지 않았으며 늦은 응답 자체를 판정해 무시한다.

## ⑤ 금액 자릿수 15~20 전수표

각 자릿수의 `'9'.repeat(d)`를 JavaScript `Number`로 변환해 실측했다. 수정 후 API 계약은 금액을 문자열로 반환한다.

| 자릿수 | 입력 원문 | 브라우저 Number 표시 | 수정 전 판정 | 수정 후 API 계약 |
|---:|---|---|---|---|
| 15 | `999999999999999` | `999999999999999` | 보존 | 문자열 exact |
| 16 | `9999999999999999` | `10000000000000000` | 손실 | 문자열 exact |
| 17 | `99999999999999999` | `100000000000000000` | 손실 | 문자열 exact |
| 18 | `999999999999999999` | `1000000000000000000` | 손실 | 문자열 exact |
| 19 | `9999999999999999999` | `10000000000000000000` | 입력 정책 400 | 입력 정책 400 |
| 20 | `99999999999999999999` | `100000000000000000000` | 입력 정책 400 | 입력 정책 400 |

따라서 경계는 15자리까지 Number 보존, 16자리부터 손실이며, 허용 입력은 18자리까지 문자열로 처리한다.

## ⑥ 응답 역전 재현과 방어 근거

RED 테스트가 첫 요청 `1`을 늦게, 두 번째 `12`를 먼저 완료시키는 방식으로 역전을 만들었다. GREEN 후 동일 테스트는 7/7 통과했다. 구현은 요청마다 sequence를 증가시키고 `onSuccess(saved, variables)`에서 `variables.sequence !== currentSequence`이면 상태 반영과 query invalidation을 모두 건너뛴다. 따라서 네트워크 지연·응답 순서와 무관하게 마지막 입력 `12`가 남는다.

## ⑦ 미종결 2건 확인

직전 집계의 미종결 2건은 정확히 다음이었다.

1. 16~18자리 브라우저 정밀도 손실 — 응답 금액 문자열 직렬화로 종결.
2. 즉시 재계산 응답 역전 — 최신 sequence 검증으로 종결.

직전 종결 3건(판매비 토글·형식/빈 값 거부·19~20자리 차단)은 변경하지 않았다.

## ⑧ 잃으면 안 되는 것 유지

- `gh pr checks 1248` 최신 결과: 전체 46개 pass, pending/fail 0.
- 권한 계약은 기존 실측 그대로 ACCOUNTANT/MANAGER/MASTER 200, 나머지 직원 역할 403이다. 이번 수정은 메뉴 catalog JWT secret과 응답 표현·UI 응답 수렴만 바꾼다.
- 빈 DRAFT 생성·목록·상세·확정 경로는 기존 실측 201/200/200/200을 유지한다.
- 직전 종결 3건은 테스트와 코드 변경으로 보존했다.
- 계산 서비스·R-18 계산 본체는 수정하지 않아 카드 3%, 제경비, 원천징수, 설치비, 공급가 및 반올림 위치를 변경하지 않았다.

## ⑨ 캡처 및 라이브 QA

Playwright는 `clients/desktop` 패키지 안에서 `headless`로 실행했다. 해시 라우터 스펙은 `page.goto(\`${BASE_URL}/#/accounting/sales-commission-settlements\`)`를 사용하며 `정산 계산` heading을 화면 도달 단정 요소로 삼는다. 기존 캡처는 `resolveQaShotsDir()` 경유 `_local`에 보존되어 있다.

- `docs/qa/1248-sol-reconvergence-real-qa/screenshots/_local/01-before-input-real-qa.png`
- `docs/qa/1248-sol-reconvergence-real-qa/screenshots/_local/02-after-input-real-qa.png`
- `docs/qa/1248-sol-reconvergence-real-qa/screenshots/_local/03-18-digit-real-qa.png`
- `docs/qa/1248-sol-reconvergence-real-qa/screenshots/_local/04-out-of-order-response-real-qa.png`

이번 코드 변경을 공유 실서버에 배포하지 않았으므로 post-fix 성공 캡처라고 단정하지 않았다. 새 라이브 진입의 실제 원문은 다음과 같다.

```text
Playwright Chromium launch: 성공 (headless)
login: 200
/auth/me: 200
/auth/admin/menu-catalog: 401
page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5943/#/accounting/sales-commission-settlements
격리 POST: connect ECONNREFUSED 127.0.0.1:29487
```

공유 gateway GET·로그인 외 write는 없었다. 격리 서버가 없어 정산 write도 0건이다.

## ⑩ 회귀

실행·통과:

- `npm test -- --run src/renderer/routes/SalesCommissionSettlementDetailPage.test.tsx`: 7/7 pass (사전 게이트 포함)
- `npm run typecheck`: pass
- `npm run build`: pass
- `./gradlew :services:accounting-service:test --tests ...SalesCommissionSettlementControllerTest --no-daemon`: pass
- `./gradlew :services:api-gateway:test --tests ...ApiGatewayContextLoadIT --no-daemon`: pass
- `git diff --check`: pass
- PR #1248 CI: 46/46 pass

## ⑪ 증거 무결성 자기 고지

자릿수 표는 이 세션에서 `Number('9'.repeat(d))`를 15~20 각각 실행한 원문이다. RED는 수정 전 실패를 확인했고, GREEN은 수정 후 fresh 실행했다. 실 라이브 gateway는 아직 구 설정이라 401을 그대로 기록했으며, 이를 수정 후 라이브 성공으로 보고하지 않았다. 자격 값과 JWT는 보고서에 노출하지 않았다.

## ⑫ 프로세스 회수

이번 라운드가 기동한 Vite/앱/격리 컨테이너는 없다. Playwright Chromium context는 `finally`에서 닫혔다. Gradle single-use daemon은 각 실행 종료 시 중지됐다. 기존 공유 Docker 서비스와 IDE/Codex 프로세스는 사용자 소유이므로 건드리지 않았다.

```text
REMAINING_QA_PORT_5943=0
REMAINING_QA_PORT_29487=0
REMAINING_QA_CONTAINERS=0 (이번 라운드 기동분)
```

## ⑬ `git status --porcelain` 원문

보고서 저장·게시 직전에 취득한 최종 원문이다.

```text
 M clients/desktop/src/renderer/routes/SalesCommissionSettlementDetailPage.test.tsx
 M clients/desktop/src/renderer/routes/SalesCommissionSettlementDetailPage.tsx
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/SalesCommissionSettlementResponse.java
 M services/accounting-service/src/test/java/com/samhanair/logis/accounting/web/SalesCommissionSettlementControllerTest.java
 M services/api-gateway/src/main/resources/application.yml
 M services/api-gateway/src/test/java/com/samhanair/logis/gateway/it/ApiGatewayContextLoadIT.java
?? clients/desktop/playwright/1248-sol-reconvergence-real-qa/
?? docs/qa/1248-sol-reconvergence-accounting.err.log
?? docs/qa/1248-sol-reconvergence-accounting.log
?? docs/qa/1248-sol-reconvergence-vite.err.log
?? docs/qa/1248-sol-reconvergence-vite.log
?? docs/qa/pr-1248-sol-reconvergence-report.md
```

이 파일과 기존 QA 산출물은 의도적으로 미추적 상태이며, 코드 변경은 PM이 별도 스테이징·커밋한다.
