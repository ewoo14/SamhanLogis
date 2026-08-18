# PR #1250 / 이슈 #1239 라운드 fix 보고서

## ① 환경 확인

요청 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1250
git rev-parse HEAD                 # 32186b848 (main 최신화 직후)
git rev-parse --abbrev-ref HEAD    # feat/daily-closing-amount-edit
git status --porcelain
```

실행 결과 원문:

```text
32186b848c7ec4e435752d0abce6038129767738
feat/daily-closing-amount-edit
?? clients/desktop/playwright/1250-sol-r1-real-qa/
```

기존 미추적 라이브 QA 디렉터리는 보존했다. `git add`, commit, push는 하지 않았다.

## ② RED 원문 4건

1. 결함 1 원문: `2026/08/14-15` 화면은 단가 105·출고가 200·할인율 48이었으나 저장 후 재조회가 출고가 520,300·할인율 100으로 변했다.
2. 결함 2 RED 원문:

```text
BusinessException: 출고가·단가·할인율 계산 근거가 일치하지 않습니다.
at DailyClosingAmountUpdateService.validateCalculation(DailyClosingAmountUpdateService.java:130)
```

3. 결함 3 원문: `discountRate=-1920.9680934076493` 저장 후 재조회 화면이 `-19,209,700%`로 표시됐다.
4. 결함 4 원문: `login=200`, `auth_me_gateway=200`, `menu_catalog_gateway=401`, `menu_catalog_auth_direct=200`.

RED 테스트는 결함 2의 정상 조합 통과·모순 조합 400 양방향, 결함 1의 저장 출고가 우선, 결함 3의 5개 비율 경계를 추가했다. 결함 2의 기존 RED 실행은 HTTP 400 메시지와 위 stack trace 원문을 남겼고, 수정 후 해당 스위트가 통과했다.

## ③ 근원

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java`: 기존 검증이 실제 화면의 반올림 퍼센트 조합을 허용하지 않았고 `releasePrice`를 audit 근거로만 사용했다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/DailyClosingRowResponse.java`: 재조회 시 상품 원천 출고가와 계산 할인율을 우선해 편집값을 잃었다.
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx`: 응답 할인율을 `<=1`이면 소수로 추정해 음수·소수 비율을 100배 변환했고, 입력 표시도 정수 반올림이었다.
- `services/api-gateway/src/main/resources/application.yml`의 `/auth/admin/menu-catalog` 라우트: 일반 Samhan 직원 토큰에 Arologis 전용 secret을 지정했다.

## ④ 고친 것

- `slip_lines.daily_closing_release_price`와 `daily_closing_discount_rate`를 추가하는 `V120` migration을 만들었다. 할인율 저장 축은 소수(50%=0.5), 조회 축은 퍼센트다.
- 일마감 저장 시 단가와 출고가·할인율을 함께 영속화하고, 조회·복사 시 영속화한 계산 근거를 우선한다.
- 화면은 응답 할인율을 항상 퍼센트로 읽고, rate 입력은 최대 12자리 소수 표시를 유지한다.
- 서버 검증은 화면 반올림 오차 범위만 허용하고, 실제 불일치(`0.6`)는 계속 400이다.
- 메뉴 catalog 라우트는 Arologis 전용 secret 지정 없이 일반 gateway JWT secret을 사용한다.

## ⑤ 할인율 왕복 전수표

| 저장 소수 | 재조회 퍼센트 | 결과 |
|---:|---:|---|
| 0 | 0 | 통과 |
| 0.5 | 50 | 통과 |
| -1920.9680934076493 | -192096.80934076493 | 통과 |
| 1.01 | 101 | 통과 |
| 0.123456789 | 12.3456789 | 통과 |

테스트: `DailyClosingRowResponseTest` parameterized 5 cases. DB column은 `NUMERIC(30,18)`으로 소수부를 보존한다.

## ⑥ 금액 4단계 비교표

| 단계 | 수량 | 단가 | 공급가 | VAT | 합계 | 출고가 | 할인율 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 편집 전 | 2 | 기존 조회값 | 기존 조회값 | 기존 조회값 | 기존 조회값 | 기존 조회값 | 기존 조회값 |
| 편집 중 | 2 | 105 | 190 | 20 | 210 | 200 | 48 화면값 |
| 저장 payload | 2 | 105 | 서버 단가 | 서버 계산 | 서버 계산 | 200 | 0.475 |
| 저장 후 재조회 기대값 | 2 | 105 | 190 | 20 | 210 | 200 | 47.5 |

금액 4칸은 단가 기준 수량 분리 계산을 유지한다. 출고가·할인율도 저장값을 우선해 동일 계약으로 수렴한다.

## ⑦ 결함 4 판정

`infrastructure/.env.local`에 `SAMHAN_JWT_SECRET`, `SAMHAN_AROLOGIS_JWT_SECRET`, `SAMHAN_GATEWAY_ATTESTATION`이 모두 존재했고 최신 키 이름을 확인했다. 메뉴 catalog gateway 라우트만 `SAMHAN_AROLOGIS_JWT_SECRET`을 명시하고 일반 auth-service 직원 토큰을 검증하므로 코드 탓으로 판정했다. 직접 auth 200과 gateway 401 차이도 이 경로와 일치한다. 값 자체는 보고서에 노출하지 않았다.

## ⑧ 잃으면 안 되는 것 유지

단가 기준 금액 정본, 출고가 편집 시 단가 유지, CONFIRMED·DELIVERED·COMPLETED 허용, 회계전표 수정 금지, 세 편집 열과 계산 열 분리, 출고전표 원본 단가·감사로그, 선결제 할인·구제품 0.5·카드 3%, 약정DC 미사용, 운임·절삭 비제외, #1230 다중선택·정렬·필터를 유지했다.

## ⑨ 캡처

라이브 스펙은 `clients/desktop` 패키지에서 실행하도록 구성돼 있고 `resolveQaShotsDir()`를 사용한다. 그러나 확인 시 `5517=false`, `28086=false`였고 공유 write 방지를 위해 앱·격리 컨테이너를 기동하지 않았다. 따라서 이번 라운드에는 `-real-qa` 캡처를 생성하지 않았다. Playwright launch error는 발생하지 않았다.

## ⑩ 회귀

- 통과: slip-service 핵심 단위 테스트 및 `DailyClosingRowResponseTest` 왕복 전수.
- 통과: `api-gateway` `JwtAuthenticationGatewayFilterFactoryTest`.
- 통과: `DailyClosingPage.test.tsx` 27 tests.
- 통과: `AppLayout.menuCatalog.test.tsx` 포함 화면 테스트.
- 통과: `tsc -p tsconfig.node.json --noEmit`, `tsc -p tsconfig.web.json --noEmit`, `git diff --check`.
- 미확정: slip-service 전체 테스트 묶음은 180초 실행 제한으로 timeout됐다. 개별 핵심 스위트는 통과했다.
- real-QA 공용 scope 검사는 기존 미추적 `1250-sol-r1-real-qa.spec.ts` 때문에 실패했다. PM의 merge 전 추적 반영 대상이며 이번 라운드에서 `git add`하지 않았다.

## ⑪ 증거 무결성 자기 고지

라이브 공유 데이터에 write를 남기지 않았다. 라이브 캡처·실 API 왕복을 실행했다고 주장하지 않으며, 테스트·설정·정적 환경 판정과 미실행 사유를 구분해 기록했다.

## ⑫ 프로세스 회수

이번 라운드가 기동한 앱 서버·컨테이너는 0개다. Gradle 테스트의 일회성 daemon은 각 실행 종료 시 자동 회수됐고, 최종적으로 라운드 전부터 존재한 VS Code Java/Gradle 및 Codex node 프로세스만 남겼다.

## ⑬ `git status --porcelain` 원문

```text
 M clients/desktop/src/renderer/routes/DailyClosingPage.tsx
 M services/api-gateway/src/main/resources/application.yml
 M services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/DailyClosingRowResponse.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateServiceTest.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/web/dto/DailyClosingRowResponseTest.java
?? clients/desktop/playwright/1250-sol-r1-real-qa/
?? docs/qa/1250-sol-r1-real-qa/
?? services/slip-service/src/main/resources/db/migration/V120__preserve_daily_closing_reference_amounts.sql
```
