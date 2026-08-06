# PR #1082 · 이슈 #1051 — SOL 5.6 3차 적대검증 (R2 재수렴)

> 검증 HEAD: `0756306aa5b2fbd7a649999ff894f3f4de84c283`  
> 판정: **도달 결함 2건 · 머지 불가**  
> 제한 준수: git 쓰기 0, 라이브 HTTP 요청 0, DB 쓰기 0, 컨테이너 재빌드·재시작 0

## 1. 도달 결함

### D3-1 — S/V가 저장된 정상 주문은 memo만 수정해도 여전히 422

#### 실 사용자 도달 경로

1. 본사 `MASTER`·`MANAGER`·`SALES`가 `supply_amount` 또는 `vat_amount`가 저장된 주문 상세을 연다.
2. 화면은 GET 응답의 `supplyAmount`·`vatAmount`·`lineTotal`을 수정 폼에 그대로 채운다.
3. 사용자가 memo만 바꾸고 저장한다.
4. 화면은 세 금액을 그대로 PUT하지만 GET 응답에는 `authority`가 없으므로 `authority=null`이다.
5. 서버는 `supplyAmount != null || vatAmount != null` 조건에서 `PARTNER_ORDER_UPDATE_INVALID_LINE` 422를 반환한다.

#### 근거 원문

- `PartnerOrderDetailResponse.LineResponse`에는 `supplyAmount`·`vatAmount`·`lineTotal`은 있으나 `authority` 필드가 없다.
- `SalesPartnerOrderDetailPage.toEditLines`는 GET의 세 금액을 그대로 담고 `authority: line.authority ?? null`로 둔다.
- 저장 payload도 세 금액을 그대로 보내고 `authority: line.authority ?? null`을 보낸다.
- `PartnerOrderUpdateService.validateLines`는 authority가 없고 S 또는 V가 하나라도 있으면 422를 낸다.
- 현 테스트 `all_three_amounts_without_authority_are_rejected`는 이 422 자체를 기대한다. 그러나 그 payload 모양이 정상 GET→memo 편집→PUT과 동일하다는 왕복 축을 단정하지 않는다.

읽기 전용 DB 원문:

```text
 active_lines | lines_with_s_or_v | orders_with_s_or_v
--------------+-------------------+--------------------
         2052 |                 3 |                  2
```

```text
2026/06/08-1980 | DRAFT |  ar15txeaawkneu-07  | 1636363.00 | 163637.00 | 1800000.00
2026/07/30-1    | DRAFT | AR-EH05             |   12650.00 |   1265.00 |   13915.00
2026/07/30-1    | DRAFT | AWR-WE13N           |   82500.00 |   8250.00 |   90750.00
```

`2026/06/08-1980`은 사고로 변경된 QA 주문이라 건수 판정 근거로 삼지 않는다. 그러나 `2026/07/30-1` 두 라인과 코드 경로가 독립적으로 도달성을 입증한다.

#### 원인

R2는 `lineTotal`만 있는 legacy 왕복만 허용했다. 저장된 S/V를 GET이 노출하면서 그 금액의 권위는 노출·복원하지 않는 기존 왕복 계약은 그대로라, S/V가 있는 주문은 정상 화면 payload와 “권위 없는 금액 조작 payload”를 구별할 수 없다.

### D3-2 — 기존 라인만 있는 memo 저장이 product-service 장애에 새로 종속됨

#### 실 사용자 도달 경로

1. 본사 사용자가 기존 주문에서 memo만 바꾼다.
2. 주문의 품목·라인 신원은 바뀌지 않았다.
3. product-service가 일시 장애·timeout·회로 차단 상태다.
4. R2의 `toLines`는 기존 라인 매칭 전에 요청의 모든 modelCode를 `lookupByModelCodes`로 조회한다.
5. `ProductClient.lookupByModelCodes`는 fail-soft가 아니므로 `INTERNAL_ERROR`를 던지고 저장 전체가 실패한다.

R2 직전에는 기존 composite key가 일치하는 라인은 기존 `productId`를 먼저 보존했고, 카탈로그 조회는 신규·교체 라인에만 필요했다. R2가 orphan 자동 복구를 위해 전체 라인을 선조회하면서 정상 기존 라인 저장까지 새 장애 경계에 포함됐다.

#### 원인

“기존 ID 보존”과 “조회 성공 시 orphan 자가 복구”가 하나의 필수 카탈로그 조회로 결합됐다. 조회 실패와 미해소, 기존 정상 ID, orphan ID가 서로 다른 상태인데 저장 가능성은 모두 조회 성공 하나에 종속된다.

## 2. 핵심 각도 판정

### lineTotal-only 우회

`lineTotal`만 임의 값으로 바꾸고 S/V와 authority를 생략해도 저장 금액을 그 값으로 바꿀 수 없다.

- authority가 없으면 `toLine`은 `PRICE` 권위를 선택한다.
- `PRICE` 경로는 `lineTotal`을 사용하지 않고 `deliveryPrice × quantity`로 합계를 다시 만든다.
- 따라서 lineTotal-only 값은 무시된다. 금액을 바꾸려면 별도의 정상 편집 필드인 `deliveryPrice` 또는 `quantity`를 바꿔야 한다.

단, 현 R2 테스트는 성공과 memo만 단정하고 저장 후 금액 불변을 직접 단정하지 않아 이 축의 회귀 방어는 미완성이다.

### orphan 오복구

현재 표본에서는 오복구를 재현하지 못했다.

```text
활성 products                         3,183
model_code 공백                        100
정확 중복 model_name 그룹                0
정확 중복 model_code 그룹                0
노출키(model_code ?? model_name) 중복 그룹 0
trim 차이 model_name/model_code 행         0 / 0
공백 제거+소문자 정규화 시 변형 그룹        1그룹 2행
  SI-AL600a / SI-AL600A
```

조회는 trim 후 정확 일치이며 대소문자·내부 공백을 접어 매칭하지 않는다. 따라서 위 변형 2행은 서로 오복구되지 않는다. 활성 exact model_name/model_code에는 각각 partial unique index도 있다. 현재 활성 주문라인 2,052개를 활성 카탈로그와 같은 우선순위로 대조한 결과 orphan 3, R2 복구 가능 2, 응답키 불일치 0, 미해소 1이었다. 복구 대상 건수는 PR #1097 정리 예정 데이터와 겹치므로 결함 수로 세지 않았다.

## 3. fix 지시서 — 불변식만

### I-1 정상 왕복과 금액 조작을 분리한다

- 정상 GET에서 받은 라인의 S/V/T를 사용자가 바꾸지 않고 memo·납기·비고 등 다른 필드만 수정한 PUT은 authority 부재만으로 거절하지 않는다.
- 이 경우 저장 전후 `deliveryPrice`, `quantity`, S, V, T는 정확히 보존된다.
- 기존 라인의 S/V/T 중 하나라도 실제로 달라졌는데 authority가 없으면 422이며 주문 전체는 원자적으로 불변이다.
- 신규·교체 라인이 S/V/T를 보내면서 authority가 없으면 422이며 주문 전체는 원자적으로 불변이다.
- authority가 명시된 금액 편집은 해당 권위와 S+V=T 계약을 따른다.
- lineTotal-only 임의값은 authority 없이 저장 금액을 바꿀 수 없다.

### I-2 기존 ID 보존과 orphan 복구의 장애 경계를 분리한다

- 품목 신원이 바뀌지 않은 기존 라인은 카탈로그 조회가 실패해도 기존 `productId`를 보존하며, memo 등 독립 필드 저장이 가능하다.
- 카탈로그 조회가 성공하고 기존 ID가 현재 카탈로그 ID와 다를 때는 정확히 그 카탈로그 ID로 자가 복구된다.
- 신규·교체 라인은 카탈로그에서 정확히 해소되지 않으면 저장되지 않는다.
- 카탈로그 장애·미해소 때 임의 또는 synthetic ID를 새로 만들지 않는다.
- 어느 실패에서도 헤더·라인 일부만 저장되지 않는다.

### 양방향 RED

1. S/V/T가 있는 기존 주문 GET payload에서 memo만 변경, authority 없음 → 성공; 금액·품목 ID 불변.
2. 같은 payload에서 S 또는 V 또는 T 하나만 변경, authority 없음 → 422; DB 전체 불변.
3. lineTotal만 공격값으로 변경, deliveryPrice·quantity 고정, authority 없음 → 공격값이 저장 합계를 바꾸지 못함.
4. authority를 명시한 각 PRICE/SUPPLY/VAT/TOTAL 편집 → 권위별 계산 결과와 S+V=T 저장.
5. 기존 라인 + memo 변경 + 카탈로그 장애 → 성공; 기존 productId 보존.
6. 기존 orphan 라인 + 카탈로그 성공 → canonical productId로 복구.
7. 신규·교체 라인 + 카탈로그 장애 또는 미해소 → 실패; 기존 주문 전체 불변.
8. 동일/유사 모델 표본(대소문자 차이, 앞뒤·내부 공백 차이, model_code 공백 fallback) → 정확 식별자 외 품목으로 붙지 않음.

## 4. 실행 검증과 하류

실행 명령은 파이프 없이 종료코드 0을 직접 확인했다.

```text
.\gradlew.bat :services:partner-order-service:test
  --tests com.samhanair.logis.partnerorder.it.PartnerOrderUpdateIT
  --tests com.samhanair.logis.partnerorder.it.PartnerOrderConvertIT
  --tests com.samhanair.logis.partnerorder.it.Phase26cConvertReserveIT
  --no-daemon

BUILD SUCCESSFUL in 54s (`--rerun-tasks`, 15 tasks executed)
PartnerOrderUpdateIT      17 / failures 0 / errors 0 / skipped 0
PartnerOrderConvertIT     13 / failures 0 / errors 0 / skipped 0
Phase26cConvertReserveIT   7 / failures 0 / errors 0 / skipped 0
```

```text
.\gradlew.bat :services:product-service:test
  --tests com.samhanair.logis.product.service.ProductServiceTest.lookupByModelCodes_fallsBackToModelNameWhenModelCodeIsBlank
  --no-daemon

BUILD SUCCESSFUL in 26s (`--rerun-tasks`, 15 tasks executed)
ProductServiceTest 1 / failures 0 / errors 0 / skipped 0
```

하류 코드는 R2 전후 동일하게 `PartnerOrderLine.productId`를 `inventoryClient.reserve(productId, ...)`에 전달한다. 복구된 라인은 canonical ID가 reserve로 전달되고 기존 convert IT·reserve IT는 통과했다. D3-1 때문에 S/V 주문의 화면 저장이 전환 전 단계에서 막히는 문제는 남지만, 이미 canonical ID인 주문의 기존 전표 전환 경로 자체에서 새 실패는 확인되지 않았다.

## 5. 조합 커버리지와 미판정

- 테스트로 확인: SALES/CONFIRMED의 memo·수량·품목 교체·라인 추가·soft-delete 교체, MANAGER/CONFIRMED memo, MASTER/CONFIRMED 저장, PARTNER/CONFIRMED 403, SALES/DRAFT orphan 복구.
- 미확인 조합: MASTER/DRAFT, MANAGER/DRAFT, PARTNER/DRAFT, 각 역할×각 상태의 금액만·품목교체·라인추가·라인삭제·수량만 전 조합.
- 현재 데스크톱 UI에는 라인 추가·삭제 조작이 없어 그 두 항목은 실 사용자 UI 도달성을 입증하지 않았다.
- 라이브 HTTP PUT/POST는 전혀 실행하지 않았다. 실제 컨테이너 버전의 저장·전환 동작은 판정하지 않았다.
- PR #1097 이후 시더 삭제 결과는 보지 않았다.
- 병합 전환, 견적→주문 생성, revision restore 전체 회귀는 이번 변경의 직접 경로 외라 전수 실행하지 않았다.

## 6. 증거 무결성

R2의 정정값을 `slip_db` SELECT로 재확인했다.

```text
2026/05/30-2 | 3c4ceb75-1e26-4e9d-a879-cccb1df7a477
```

`d2-recovery.md:364`와 `r1-axis-a-recovery.md:177`은 기존 잘못된 원문을 보존한 채 정정절을 붙였고, 정정값은 실제 DB와 일치한다. 이번 라운드에서 추가 증거 무결성 위반은 발견하지 못했다.
