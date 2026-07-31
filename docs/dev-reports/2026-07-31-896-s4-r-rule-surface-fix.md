# PR #996 / Issue #896 슬라이스 4 — R-01·R-02·A-01 rule surface fix

작성일: 2026-07-31  
작업 범위: 관측 전용(shadow-only) 수량 동기화 규칙의 목록·생성 표면  
판정: **PASS — R-01·R-02·A-01 fix 및 전체 회귀 통과**

## 1. 전제와 원문 결함 근거

선행 최종 재수렴 보고서 `docs/dev-reports/2026-07-30-896-s4-final-reconv.md`의 원문을 기준으로 고쳤다.

- R-01: 관리자 `POST /api/v1/quantity-sync-rules`로 S-03 `factor=0.28`, `multiplier=25`를 다시 만들 수 있었다. 설정 계수는 7이지만 주문 경로는 legacy 수량 1을 계속 사용해, AC072 1,430,000원 + ADP 1, 79,200원 = 1,509,200원이 되고 설정상 1,984,400원과 475,200원 차이가 났다.
- R-02: 관리자 API로 만든 `enabled=true` S-03이 품목 노출 PATCH의 enabled-rule guard에 들어가 409를 반환했다. shadow 규칙이 실제 품목 상태 변경을 차단한 것이다.
- A-01: `partnerSelfService=true`인 전역 목록 API가 거래처 자기 범위 대조 없이 관리자 규칙을 반환했다. 현재 스키마에는 거래처 소유 범위가 없으므로 안전한 self-service 범위를 만들 수 없었다.

실제 주문 수량 결정 경로와 legacy 계산은 변경하지 않았다. C-01·C-02는 이번 라운드에서 수정하지 않았다.

## 2. RED-first 원문과 fix

### R-01 — 생성 경로가 legacy와 다른 S-03을 저장하지 않음

#### RED 원문

먼저 추가한 Java 검증 테스트와 실 HTTP 테스트가 현재 코드에서 실패했다.

```text
QuantitySyncRuleValidationTest > S03_legacy_수량과_다른_계수는_shadow_설정으로_저장할_수_없다() FAILED
    java.lang.AssertionError at QuantitySyncRuleValidationTest.java:598

QuantitySyncRuleSurfaceFixIT > R01_관리자_POST는_legacy_수량과_다른_S03을_저장하지_않는다() FAILED
    org.opentest4j.AssertionFailedError: expected: 400 but was: 201

34 tests completed, 2 failed
3 tests completed, 3 failed
```

최초 통합 RED의 R-02 403은 제품 guard가 아니라 테스트 요청의 `X-User-Id` 누락으로 동적 권한이 거부된 fixture 오류였다. 실제 관리자 요청 헤더를 fixture에 보완한 뒤 R-02를 다시 판정했다.

#### 변경 요지

- `QuantitySyncRuleValidator`에 S-03 legacy parity 검증을 추가했다.
- S-03은 target 하나만 허용하고, 모든 source에 대해 `factor × multiplier == 1`이어야 저장·교체된다.
- order-app의 `selectSingleS03Rule`도 같은 계수를 확인한다. 이미 저장된 잘못된 seed/raw 행이 있더라도 shadow 관측 대상으로 선택하지 않는다.
- evaluator나 legacy 주문 payload에는 연결하지 않았다.

#### 실 데이터 실측

- 실 POST 시도: **1건** (`factor=0.28`, `multiplier=25`)
- HTTP 결과: **400 1건**, `legacy` 메시지 포함
- 활성 규칙 저장: **0건**
- 정상 fixture shadow 조합: source 4개 × 비공집합 조합 15개 × 수량 4종 = **60건**
- 60건의 수량·소계·전송 payload 동일: **60/60**
- 정상 주문 차단: **0건**
- 이전 보고서의 반례 차액 475,200원은 이제 잘못된 S-03 생성 자체를 400으로 거부한다. 실제 legacy 주문 수량 계산은 여전히 하드코딩 경로가 결정한다.

#### 검증

```text
QuantitySyncRuleValidationTest: tests=33 failures=0 errors=0 skipped=0
QuantitySyncRuleSurfaceFixIT R01: 통과
order-app quantitySyncS03.test.ts: 17 passed
shadow harness: resultCount=60, allQuantityEqual=true, allSubtotalEqual=true, allPayloadEqual=true
```

### R-02 — enabled shadow S-03이 정상 품목 상태 변경을 차단하지 않음

#### RED 원문

선행 재수렴 보고서에서 관리자 POST로 만든 enabled S-03 뒤 품목 노출 PATCH가 다음 guard 메시지로 409가 되는 것이 확인됐다.

```text
수량 동기화 규칙이 이 품목을 참조하고 있어 상태를 변경할 수 없습니다
```

추가한 실 HTTP 테스트의 최초 실행 원문도 남긴다.

```text
QuantitySyncRuleSurfaceFixIT > R02_관리자_POST로_만든_유효한_enabled_S03도_품목_노출_PATCH를_차단하지_않는다() FAILED
    org.opentest4j.AssertionFailedError: expected: 200 but was: 403
```

이 403은 위에서 확인한 fixture 인증 헤더 누락이었다. `X-User-Role: MASTER`와 `X-User-Id`를 실제 관리자 요청처럼 추가하고 현재 guard를 재실행한 뒤 fix 검증을 완료했다.

#### 변경 요지

- `QuantitySyncRuleService`의 품목 상태·카테고리·구성품 무결성 guard에서 S-03(`ruleKey` 또는 `legacyRef=S-03`)만 shadow-only 예외로 필터링했다.
- generic enabled 규칙의 기존 guard는 유지했다. 따라서 실제 수량 규칙의 무결성 보호 범위를 넓게 해제하지 않았다.
- S-03의 수량 결정, 전표 payload, 사용자 경고·차단은 변경하지 않았다.

#### 실 데이터 실측

- 실 POST로 품목 **2건**과 유효한 enabled S-03 **1건** 생성
- 동일 품목의 관리자 usage PATCH: **1건**
- HTTP 200 허용: **1건**
- S-03 때문에 차단된 정상 PATCH: **0건**
- order-app의 무관한 25,000원 주문 readiness 단정: `disabled=false`, 차단 **0건**

#### 검증

```text
QuantitySyncRuleSurfaceFixIT R02: 통과
QuantitySyncRuleProductDiscontinueIT 및 product-service 전체 회귀: 통과
```

### A-01 — 조회자의 범위 밖 규칙을 응답하지 않음

#### RED 원문

현재 controller annotation을 대상으로 먼저 작성한 권한 테스트와 실 HTTP 테스트가 실패했다.

```text
QuantitySyncRuleControllerPermissionTest > listEndpointIsNotPartnerSelfServiceWithoutPartnerScope() FAILED
    org.opentest4j.AssertionFailedError at QuantitySyncRuleControllerPermissionTest.java:20

QuantitySyncRuleSurfaceFixIT > A01_범위없는_전역_규칙목록은_PARTNER에_응답하지_않는다() FAILED
    org.opentest4j.AssertionFailedError: expected: 403 but was: 200
```

#### 변경 요지

- `GET /api/v1/quantity-sync-rules`에서 `partnerSelfService=true`를 제거했다.
- 거래처 소유 범위를 표현할 스키마가 없는 상태에서 전역 목록을 거래처에 노출하지 않고 deny-by-default로 처리했다.
- 관리자 목록은 유지했다. 관리자 API로 만든 유효 규칙 1건은 관리자 요청에서 200으로 확인된다.

#### 실 데이터 실측

- 실 POST로 활성 규칙 **1건** 생성
- MASTER 목록 조회: **200 1건**, 해당 ruleKey 포함
- PARTNER 목록 조회: **403 1건**
- PARTNER에 노출된 규칙: **0건**
- 자기 범위 밖 규칙 응답: **0/1 요청**

#### 검증

```text
QuantitySyncRuleControllerPermissionTest: tests=1 failures=0 errors=0 skipped=0
QuantitySyncRuleSurfaceFixIT A01: 통과
order-app 전체 테스트: 통과
```

## 3. 정상 경로 차단 수량

이번 fix가 정상 경로를 막지 않는지 실제 fixture 기준으로 세었다.

| 경로 | 실측 전체 | 차단/실패 | 결과 |
|---|---:|---:|---|
| legacy와 다른 S-03 관리자 생성 | 1 | 1 의도적 400 | 잘못된 설정 저장 방지 |
| 정상 enabled S-03 뒤 관리자 usage PATCH | 1 | 0 | 200 허용 |
| S-03 shadow 수량·소계·payload 조합 | 60 | 0 | 60/60 동일 |
| 무관한 25,000원 정상 주문 readiness | 1 | 0 | `disabled=false` |
| 파트너 전역 목록 요청 | 1 | 0건 노출 | 403 deny |

차단되어야 하는 잘못된 설정 1건을 제외하면, 정상 주문·정상 품목 상태 변경 차단은 **0건**이다.

## 4. 전체 테스트 결과

모든 Gradle 검증은 `--rerun-tasks --no-build-cache --no-daemon`으로 실행해 `UP-TO-DATE`·`FROM-CACHE`를 성공 근거로 사용하지 않았다.

```text
product-service 전체:
BUILD SUCCESSFUL in 3m 9s
61 test result files; tests=621 failures=0 errors=0 skipped=0

order-app 전체:
Test Files 20 passed (20)
Tests 243 passed (243)

order-app typecheck:
tsc -p tsconfig.json --noEmit  → exit code 0

S-03 shadow harness:
resultCount=60
allQuantityEqual=true
allSubtotalEqual=true
allPayloadEqual=true
```

추가한 Java 단정은 Linux CI에서도 같은 PostgreSQL HTTP 상태·정수 count·문자열 계약을 검사하며 Windows 경로, 줄바꿈, 로컬 파일 구분자에 의존하지 않는다. TypeScript 단정도 숫자·Map·JSON 계약만 검사한다.

## 5. 이번에 안 본 것

- **C-01**: soft-delete된 QA 거래처가 실 관리자 목록·집계·복원에 잔존하는 문제. 다음 라운드 범위.
- **C-02**: soft-delete된 QA 세션 접속 토큰이 만료 전까지 유효한 문제. 다음 라운드 범위.
- 라이브 QA, 실 배포 환경의 HTTP 확인, 공유 backend stack 재기동은 수행하지 않았다.
- Docker 이미지 재빌드와 공유 DB write는 수행하지 않았다. 통합 테스트는 `postgres:16-alpine` 기반 격리 Testcontainers만 사용했고, fixture 생성은 실제 API POST 경로를 사용했다.
- 파트너 자기 범위 기능 자체는 스키마·계약이 없어 구현하지 않았다. 이번 라운드는 범위 없는 전역 노출을 차단하는 단계다.
- 이미 운영 DB에 존재하는 잘못된 규칙의 물리적 정리·soft-delete는 수행하지 않았다. order-app shadow 선택 방어는 추가했지만, 실제 수량 결정 경로는 여전히 legacy다.

## 6. 변경 파일 목록

### 신규 파일

- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleSurfaceFixIT.java`
- `docs/dev-reports/2026-07-31-896-s4-r-rule-surface-fix.md`

### 수정 파일

- `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/QuantitySyncRuleService.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidationTest.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleControllerPermissionTest.java`
- `clients/web/order-app/src/quantitySync.ts`
- `clients/web/order-app/src/__tests__/quantitySyncS03.test.ts`

### `git status --porcelain` 원문

```text
[미실행]
```

개발책임자의 이번 라운드 지시가 `git` 명령(add/commit/push/checkout/stash 포함) 전면 금지이므로 `git status --porcelain`도 실행하지 않았다. 따라서 실제 status 원문은 확보하지 않았으며, 위 목록은 이번 세션에서 직접 추가·수정한 파일 목록이다.

