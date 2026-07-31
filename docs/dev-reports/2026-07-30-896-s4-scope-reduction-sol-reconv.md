# PR #996 (#896 슬4) 범위 축소 재수렴 적대검증

- 검증 대상: `feat/896-s4-quantity-sync-config`
- 대상 HEAD: `16bb7189673618b03cbda4f2a2827a6e5cdec81f`
- 비교 기준: `origin/main` (`1dc22645c...`)
- 판정일: 2026-07-30
- 최종 판정: **FAIL — F-01~F-04의 원래 경로는 모두 소멸했지만, 축소 표면에 실 사용자 도달 결함 2건과 조건부 배포 차단 1건이 남아 있다.**

## 1. 조사 구성

독립된 5개 역할로 조사했다.

| 역할 | 조사 범위 |
|---|---|
| 재현 추적 | 직전 F-01~F-04 재현 절차 재실행과 경로 소멸 판정 |
| 회귀 대조 | S-03 및 나머지 19개 계열의 수량·금액·전송 payload를 `main`과 대조 |
| 서버·seed | 정수 계약 validator, V29 seed, 관리자 쓰기 경로 |
| 통합·증거 | shadow 실패·지연·404, PR #984 migration, 증거 무결성 |
| 독립 적대검증 | 전체 도달 사슬 재검토와 반례 탐색 |

실행 환경의 동시 작업 슬롯이 4개이므로 1차 4개 역할을 병렬 수행한 뒤 완료된 슬롯에 제5 적대검증을 즉시 투입했다. 다섯 역할은 서로 독립된 근거와 원출력을 제출했다.

## 2. 각도별 판정

| 각도 | 판정 | 근거 요약 |
|---|---|---|
| F-01~F-04 원래 경로 | **PASS** | evaluator 호출, 동적 target 교체, 주문 차단 guard가 사용자 경로에서 제거됐다. 네 경로 모두 아래 원출력대로 소멸했다. |
| 제거 후 기존 계산 | **PASS** | `origin/main`과 현재 `index.html`의 실사용 차이는 비동기 shadow 조회 23줄뿐이다. H-01~H-08, S-01~S-03, C-01~C-09의 20계열 65개 경계 시나리오에서 수량·금액·payload 불일치가 0건이었다. |
| shadow의 사용자 방해 | **PASS** | 로그인 완료가 조회를 기다리지 않으며 오류를 내부 흡수한다. 404·실패·5초 timeout은 화면, 수량, 주문 버튼, payload에 연결되지 않고 로그인당 단일 상태 로그만 남긴다. |
| 서버 정수 계약 validator | **PASS** | `BigDecimal` 최종 곱을 검사하므로 `0.28 × 25 = 7.00`, `0.1 × 10 = 1.0`을 허용하며 `FLOOR`도 소수 계수를 허용한다. 저장 가능해야 할 규칙을 거부하는 실 사용자 경로를 찾지 못했다. |
| V29·관리자 설정 경로 | **FAIL** | 저장된 설정이 주문에 반영되지 않는 경로와, enabled seed가 품목 관리 쓰기를 409로 차단하는 경로가 있다. |
| 열린 PR #984와 migration | **조건부 FAIL** | 파일명 충돌은 없지만 #996의 V29가 먼저 적용되면 뒤늦게 들어오는 #984의 V27·V28이 기본 `outOfOrder=false`에서 product-service 기동을 막는다. |

## 3. F-01~F-04 직전 재현 절차 재실행

재실행 원출력은 다음과 같다.

```json
{
  "F01": {
    "disabled": false,
    "missingMapSize": 1,
    "unrelatedOrder": {
      "model": "SI-AL700a",
      "quantity": 1,
      "subtotal": 25000
    }
  },
  "F02": {
    "sourceQuantity": 3,
    "targetQuantity": 3,
    "manualLock": false
  },
  "F03": {
    "oldTargetQuantity": 1,
    "newTargetQuantity": 0,
    "targetSubtotal": 79200,
    "sendModels": [
      "AC072BSCPBH2SY",
      "ADP-F075SP"
    ]
  },
  "F04": {
    "legacyPumpQty": 0,
    "legacyPumpSubtotal": 0,
    "caseDistinctSourceQuantity": 1
  }
}
```

| 직전 결함 | 동일 절차의 현재 결과 | 경로 판정 |
|---|---|---|
| F-01 — reset 뒤 누락 Map이 S-03 무관 25,000원 주문 차단 | 누락 Map이 1건 남아 있어도 버튼은 `disabled=false`이고 SI-AL700a 1개·25,000원 주문을 만든다. `checkOrderReady()`와 클릭 handler에 누락 Map 차단 조건이 없다. | **경로가 없어졌다.** |
| F-02 — 합법 십진 계수를 브라우저가 오판 | 사용자 경로에서 evaluator를 호출하지 않는다. AC072 3개는 기존 계산대로 ADP 3개·237,600원이며 합계 4,527,600원을 전송할 수 있다. 브라우저 오판이나 전체 거부가 없다. | **원래 경로가 없어졌다.** 다만 설정 자체를 무시해 생기는 별도 결함 R-01이 있다. |
| F-03 — 저장 주문 복원 시 구·신 target 97,350원 혼입 | 동적 target 교체가 없다. 기존 ADP 1개·79,200원만 남고 신규 target 수량은 0이다. | **경로가 없어졌다.** |
| F-04 — 대소문자만 다른 품목을 source로 오인해 79,200원 과다 | 대소문자 무시 evaluator가 사용자 계산에 연결되지 않는다. 대소문자만 다른 신규 품목 1개는 legacy의 `실링` source가 아니므로 ADP 수량·금액은 0원이다. | **경로가 없어졌다.** |

F-01 절차에는 별도의 잔여 현상이 있다. reset 뒤 누락 Map과 ADP 경고 문구가 남고, 이어서 SI-AL700a만 선택해도 오래된 경고가 보인다. 그러나 주문 차단은 없고 이 reset·경고 코드는 `origin/main`과 동일하다. 현재 브랜치가 `main`에 더한 `index.html` 변경은 shadow 조회뿐이므로, 이 라운드의 변경 표면 결함에는 계상하지 않았다.

파일 근거:

- `clients/web/order-app/index.html:5184-5203` — 기존 S-03 실링 합계와 ADP 수량 계산
- `clients/web/order-app/index.html:5206-5210` — 재계산 시 누락 Map 초기화
- `clients/web/order-app/index.html:5223-5228` — 세트 전송 품목의 재계산 trigger 제외
- `clients/web/order-app/index.html:6408-6422` — 현재 주문 준비 판정
- `clients/web/order-app/index.html:6673` — reset 경로
- `clients/web/order-app/index.html:6706-6710` — 현재 주문 클릭 경로
- `clients/web/order-app/src/__tests__/quantitySyncS03Harness.cjs:133-159` — F-01 재현 상태와 주문 준비 판정

## 4. 기존 하드코딩 계산의 `main` 대조

현재 `index.html`과 `origin/main`의 실사용 계산 함수 묶음을 각각 추출해 비교했다. 다음 영역의 함수 본문 해시는 동일했다.

- H-01~H-08, S-01~S-03, C-01~C-09의 파생 수량 계산
- 단가·소계 계산
- `explodeSendSets_()`
- `buildSendRows()`
- `aggregateSendRows()`

20계열과 옵션 경계를 합친 65개 시나리오의 `mismatchCount`는 0이었다. S-03은 별도로 source mask 15개 × 수량 0·1·4·77의 60개 조합을 재실행했고, legacy와 shadow 대조값의 수량·금액·payload가 전부 같았다. 대표 최대 조합인 mask `1111`, source별 수량 77에서도 ADP 308개와 총액 525,663,600원이 일치했다.

파일 근거:

- `clients/web/order-app/index.html:5168-5203` — 싱글 실링·드레인펌프 계산
- `clients/web/order-app/index.html:5206-5209` — 싱글 파생 계산 진입점
- `clients/web/order-app/index.html:5621-5687` — 홈·상업용 파생 계산
- `clients/web/order-app/index.html:6050-6057` — 세트 전송 행 분해
- `clients/web/order-app/index.html:6425-6710` — 전송 행 집계·생성·주문
- `clients/web/legacy-quantity-golden/legacyQuantityBoundary.js` — 20계열 경계 대조 기준

## 5. 확인된 결함

### R-01 — 저장 가능한 수량 동기화 설정이 주문에 반영되지 않는다

**실 사용자 경로**

수량 동기화 관리자 API로 유효한 규칙을 저장한 뒤, 주문 사용자가 해당 source 품목을 주문하는 경로다. PUT 응답에는 `enabled`, source factor, target multiplier가 정상 저장된 규칙으로 반환되지만, 응답이나 조회 계약에는 이 규칙이 관측 전용이라 주문에 반영되지 않는다는 상태가 없다.

**재현 절차**

1. 관리자 권한으로 `PUT /api/v1/quantity-sync-rules/SINGLE_S03_CEILING_DRAIN_PUMP`를 호출한다.
2. AC072 source factor를 `0.28`, ADP target multiplier를 `25`, rounding을 `NONE`, 규칙을 enabled로 저장한다. 최종 계수는 정수 `7.00`이어서 서버 validator가 허용한다.
3. 주문 앱에 로그인하고 AC072 1개를 선택한다.
4. 설정 조회 완료 뒤 화면 수량·금액과 전송 payload를 확인한다.

**관측된 잘못된 결과**

저장된 규칙이라면 ADP는 7개여야 하므로 AC072 1,430,000원 + ADP 554,400원 = **1,984,400원**이어야 한다. 실제 사용자 경로는 기존 하드코딩으로 ADP 1개만 만들어 AC072 1,430,000원 + ADP 79,200원 = **1,509,200원**을 표시·전송한다. 설정한 결과보다 **475,200원 누락**된다.

이는 직전 F-02의 “브라우저 소수 오판 후 거부”와 다른 도달 사슬이다. F-02의 evaluator 오판은 사라졌지만, 정상 저장·조회된 운영 설정이 무효라는 새 표면은 남았다. 범위 축소를 되돌리라는 판단이 아니라, 현재 API·응답·사용자 동작 사이의 관측 가능한 불일치를 결함으로 판정한다.

**파일:행 근거**

- `services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java:65-70` — 관리자 PUT
- `services/product-service/src/main/java/com/samhanair/logis/product/service/QuantitySyncRuleService.java:273-295` — 검증·저장·응답
- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySyncRuleResponse.java:12-24` — enabled·계수 응답, 관측 전용 상태 없음
- `clients/web/order-app/src/main.ts:56-78` — 조회 결과를 상태로만 보관
- `clients/web/order-app/index.html:5184-5203` — 실제 주문은 기존 ADP 수량 계산 사용
- `clients/web/order-app/index.html:5545-5557` — 조회 결과는 shadow 로그로만 사용
- `clients/web/order-app/src/__tests__/fixtures/singleSetsBootstrap.fixture.json:16` — AC072 단가 1,430,000원
- `clients/web/order-app/src/__tests__/fixtures/singleSetsBootstrap.fixture.json:20` — ADP 단가 79,200원

### R-02 — 관측용 V29 enabled 규칙이 품목 관리 쓰기를 409로 차단한다

**실 사용자 경로**

품목 관리자가 데스크톱 `/products/estimate-items`에서 V29가 참조하는 4개 실링 source 또는 ADP target의 `견적 노출`·`주문 노출`을 해제하거나, 같은 resulting-state guard를 타는 단종·삭제를 수행하는 경로다.

**재현 절차**

1. V29가 실제 카탈로그의 대상 5개 품목을 찾아 `SINGLE_S03_CEILING_DRAIN_PUMP`를 `enabled=TRUE`로 seed한 상태로 시작한다.
2. `/products/estimate-items`에서 AC072 또는 ADP의 `견적 노출`이나 `주문 노출`을 끈다.
3. 화면이 `PATCH /api/v1/products/{modelCode}/usage`로 변경 상태를 저장한다.
4. product-service가 활성 수량 동기화 규칙의 resulting-state guard를 실행한다.

**관측된 잘못된 결과**

주문 계산에는 사용하지 않는 shadow 규칙인데도 저장이 HTTP 409로 거부된다. 화면에는 **“수량 동기화 규칙이 이 품목을 참조하고 있어 상태를 변경할 수 없습니다: SINGLE_S03_CEILING_DRAIN_PUMP”**가 표시된다. 이 데스크톱 화면에는 해당 규칙을 비활성화할 경로도 없다. 금액 계산 전의 관리 쓰기 차단이므로 원 단위 금액은 없다.

공유 DB에 V29를 적용하지 않았으므로 HTTP 실측은 하지 않았다. 다만 `enabled=TRUE` seed → UI PATCH → enabled 규칙 조회 → 정확한 409 예외·화면 alert까지 정적으로 닫힌 도달 사슬이다.

**파일:행 근거**

- `services/product-service/src/main/resources/db/migration/V29__seed_s03_quantity_sync_rule.sql:53-76` — enabled 규칙과 source·target seed
- `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:228-264` — 견적·주문 노출 토글
- `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:1231-1253` — usage 변경 mutation
- `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:1778-1782` — 서버 오류 alert
- `clients/desktop/src/renderer/api/productCatalogApi.ts:463-479` — usage PATCH
- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductCatalogController.java:234-245` — usage endpoint
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:603-614` — usage 변경과 guard 호출
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:741-755` — 참조 규칙 409 분기
- `services/product-service/src/main/java/com/samhanair/logis/product/service/QuantitySyncRuleService.java:174-192` — enabled 참조 규칙 조회

### R-03 — #996 선배포 뒤 #984 배포 시 product-service가 기동하지 않는다

**실 사용자 경로**

PR #996이 먼저 머지·배포되어 운영 migration 이력에 V29가 기록된 다음, 열린 PR #984의 V27·V28을 포함한 product-service를 배포하는 경로다. 기동 실패 뒤 품목 목록·수량 설정 조회를 요청하는 모든 사용자가 영향을 받는다.

**재현 절차**

1. #996만 먼저 배포해 V29를 적용한다.
2. 이후 #984의 V27·V28이 포함된 product-service를 기동한다.
3. Flyway가 이미 적용된 V29보다 낮은 미적용 V27·V28을 발견한다.

**관측된 잘못된 결과**

기본 `outOfOrder=false`, `validateOnMigrate=true`에서 migration 검증·적용이 실패해 product-service가 기동하지 않는다. 요청이 금액 계산 전에 실패하므로 원 단위 금액은 없다. 반대로 #984의 V27·V28 후 #996의 V29 순서에는 이 충돌이 없다.

이 결함은 두 PR의 파일명 충돌이 아니라 **머지·배포 순서에 따른 실행 충돌**이다. 운영 배포와 DB 적용은 금지 조건 때문에 수행하지 않았으며, 따라서 조건부 배포 차단으로 분리 판정했다.

**파일:행 근거**

- `git ls-remote --heads origin` — #996 head `16bb71896...`, #984 head `98e3c0dab...`, main `1dc22645c...`
- `git ls-tree 16bb71896...` — product-service migration V26, V29
- `git ls-tree 98e3c0dab...` — product-service migration V26, V27, V28
- `git ls-tree origin/main` — product-service migration V26
- `services/product-service/src/main/resources/application.yml:32-35` — Flyway 활성, `out-of-order` override 없음
- `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md:55` — 운영 기본값 `outOfOrder=false`, `validateOnMigrate=true`

## 6. shadow 방해 여부와 validator

`completeLogin()`은 `loadSingleS03QuantitySync_()`의 Promise를 기다리지 않고 즉시 기존 화면을 렌더한다. main bridge와 renderer 양쪽이 실패를 흡수하며, 조회 결과는 상태 저장·custom event·단일 `console.info` 외에는 사용되지 않는다. 해당 event listener도 없다. 따라서 설정 API의 실패·404·5초 timeout이 화면을 멈추거나 오류를 보이거나 주문을 막는 경로는 찾지 못했다.

서버 validator는 source factor와 target multiplier의 정확한 `BigDecimal` 곱이 정수인지 검사한다. source 수량이 각각 독립 정수인 SUM 규칙에서 이 조건은 필요한 동시에 충분하며, `FLOOR` 정책은 검사 대상에서 제외된다. 직전 F-02의 서버측 절반에 해당하는 합법 십진 규칙의 과잉 거부는 확인되지 않았다.

파일 근거:

- `clients/web/order-app/index.html:5545-5557` — shadow 조회와 로그
- `clients/web/order-app/index.html:8538-8571` — non-awaited 로그인 완료 경로
- `clients/web/order-app/src/main.ts:61-82` — bridge 실패 흡수와 상태 저장
- `clients/web/order-app/src/samhanApi.ts:23-27` — 5초 timeout
- `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java:190-241` — 규칙 호환성 검증 진입
- `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java:458-480` — 정확한 최종 정수 계약

## 7. 증거 무결성 대조

### EI-01 — 축소 보고서의 기준 HEAD가 실제 축소 commit이 아니다

`docs/dev-reports/2026-07-30-896-s4-scope-reduction.md:4`는 기준 HEAD를 `5f76c40cf`로 적었다. 그러나 그 commit의 `index.html`에는 `configuredSingleS03_`, `clearSingleS03DerivedQty_`, `hasSingleCatalogBlockingError_`가 남아 있고 `main.ts`에도 evaluator bridge가 있다. 축소 tree는 다음 commit인 `16bb71896`이다. 보고서가 설명하는 코드와 기재한 기준 SHA가 일치하지 않는다.

### EI-02 — F-01 증거가 “동일한 재현 순서”를 수행하지 않았다

축소 보고서 `:81`은 직전과 동일한 재현 순서를 실행했다고 적었다. 현재 하네스 `clients/web/order-app/src/__tests__/quantitySyncS03Harness.cjs:133-159`는 누락 Map을 미리 넣고 준비된 필드를 `checkOrderReady()`에 전달한다. 실제 사용자 순서인 AC072 입력 → reset → SI-AL700a 입력 → 주문 클릭을 실행하지 않는다. 보고서 `:114`의 “누락 Map을 남긴 채”라는 제한된 설명과 원출력은 재현 가능하지만, `:81`의 전체 순서 실행 주장은 과장되어 있다.

### EI-03 — 현재 PR 설명이 축소된 코드 계약과 반대다

`gh pr view 996`의 현재 제목은 “수량 동기화를 하드코딩에서 칩 기반 설정으로”이고, 본문 불변식은 “편집 결과가 실제 계산에 반영돼야 한다 — 저장만 되고 안 쓰이면 안 된다”라고 적혀 있다. HEAD `16bb71896`은 의도적으로 계산을 하드코딩에 유지하고 저장 결과를 shadow 관측에만 사용한다. 리뷰 대상의 공개 설명과 실제 계약이 서로 반대다.

### 재현된 증거

- HEAD numstat: 9 files, `+375/-203`으로 축소 보고서와 일치
- F-01~F-04 원출력: 본 보고서 3절 JSON과 동일
- S-03 shadow: 60개 조합 모두 수량·금액·payload 동일
- `git ls-remote`와 `git ls-tree`: #996 V29, #984 V27·V28, main V26 확인

V29가 “관측 전용”이라는 설명은 주문 계산에 한해서만 성립한다. R-02의 품목 쓰기 guard는 실제 상태 변경이므로, 이 부작용을 생략한 blanket 표현도 증거 해석 시 주의해야 한다.

## 8. 이 라운드가 보지 않은 것

- 검증 품질, 테스트 충분성, 코드 스타일, 설계 미관은 판정하지 않았다. 유일하게 증거 무결성만 대조했다.
- Docker, V29 실제 적용, 공유 실데이터 write, 운영 배포, 실제 브라우저 HTTP 409 실측은 수행하지 않았다.
- #996→#984 순서의 운영 Flyway 실패는 금지 조건상 직접 실행하지 않았고, remote tree·현재 설정·명시된 Flyway 기본값으로 닫힌 조건부 경로만 판정했다.
- H-07·C-09 재설계, 나머지 19개 계열의 설정 전환, 범위 축소 결정의 타당성은 검토하지 않았다.
- 보안, 성능, 접근성, 시각 디자인, 이 요청 범위 밖 서비스의 회귀는 보지 않았다.
- 코드는 수정하지 않았고 git add·commit·push·checkout 및 `docs/handoff/CURRENT-WORK.md` 변경을 하지 않았다. 이 보고서 파일만 생성했다.
