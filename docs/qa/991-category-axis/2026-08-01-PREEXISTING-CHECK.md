# PR #991 선재성 판정

- 조사 기준일: 2026-08-01
- 대상 HEAD: `730b22b58`
- 비교 기준: `origin/main`
- 상태: 조사 진행 중
- 제한: 코드·Git·Docker·공유 DB 쓰기 없이 읽기 전용으로 판정

## 조사 기록

산출물을 먼저 생성했다. 이후 `origin/main`과 현재 HEAD의 판정 경로 차이, main 반례 재현 결과, 최종 판정 및 확인하지 못한 사항을 순차 기록한다.

- `git rev-parse HEAD` = `730b22b58a5f37f57edb59533711202f85570340`.
- 로컬 비교 ref `git rev-parse origin/main` = `77774a1175743b69518d13cd0f6ab90b9d13b0ab`.
- 관련 최소 경로 diff에서 product-service의 label resolver·제품 rename 계약은 동일하고, `MonthEndCloseService`의 판정 입력/우선순위가 변경됐음을 확인했다.
- 실행 중인 `samhan-postgres`에 `docker exec ... psql ... -c "SQL"` 형식으로만 접근했고, 각 조회에서 `SET default_transaction_read_only=on`을 먼저 실행했다.

## `origin/main`과 현재 HEAD의 판정 경로 차이

### `origin/main`

1. 회계 매출전표 라인은 `productName`만 저장한다. `modelName`/`categoryKey` 필드가 없고 생성 경로도 `lr.productName()`만 넘긴다.
   - `origin/main:services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlipLine.java:40-42,62-70`
   - `origin/main:services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAccountingSlipCreateAttemptService.java:91-105`
2. 일마감은 `productName/itemName` 라벨을 key로 모은 뒤 그 라벨만 `resolveByLabelBulk`에 보내고, 반환된 `productId`로 가격·고정DC를 읽는다.
   - `origin/main:services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:345-400,416-424`
3. product-service는 라벨에서 토큰을 추출한 뒤 catalog exposed 식별자 → alias → unique-LIKE 순서로 해소한다.
   - `origin/main:services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:299-330`
4. catalog exposed 식별자 조회는 `model_code` exact를 먼저 찾고, 실패하면 `model_name` exact로 fallback한다. 따라서 해당 제품의 `modelCode`가 애초부터 null이면 첫 조회는 보호 장치가 되지 않고 현재 이름만으로 확정한다.
   - `origin/main:services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:43-63`
5. 제품 PATCH는 현재 활성 `modelName` 중복만 검사하여 `modelName`을 바꾸고 `modelCode`는 건드리지 않는다. 순차적으로 A를 rename한 뒤 B가 과거 이름을 재사용할 수 있다.
   - `origin/main:services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:509-527`
   - `origin/main:services/product-service/src/main/java/com/samhanair/logis/product/web/dto/UpdateProductRequest.java:16-33`

### 현재 HEAD (`730b22b58`)

1. 회계 매출전표 라인·allocation에 원천의 별도 `modelName`/`categoryKey` snapshot을 보존한다.
   - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlipLine.java:41-43,73-83`
   - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAccountingSlipCreateAttemptService.java:91-109`
2. 일마감은 `productName` label뿐 아니라 보존 `modelName`도 축에 넣고, 모든 snapshot 모델을 `lookupByModel`로 exact 조회한다.
   - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:360-375,401-408,501-511`
   - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductClient.java:138-170`
3. exact 모델 결과의 `modelCode`가 null이면 그 결과를 즉시 유효 match로 반환한다. 따라서 label이 모델명을 전혀 포함하지 않아도 snapshot `modelName` 재사용만으로 B가 확정된다.
   - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:513-526`
4. 그 match의 `productId`가 가격·고정DC 조회에 사용된다.
   - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:401-456,564-600`

차이의 핵심은 main의 이름 fallback 자체가 새로 생긴 것이 아니라, **fallback에 투입되는 입력이 main의 `productName/itemName` 라벨에서 이 PR의 별도 snapshot `modelName`까지 확대**됐다는 점이다.

## main 반례 재현 시도

공유 DB를 바꾸지 않고 `product_db`의 실제 `modelCode IS NULL` 제품 두 개를 A/B로 골라 CTE projection에서만 다음 상태를 만들었다.

- A: 과거 모델명 `AR06TXEAAWKNEU-12`, 품명 `삼성 윈드프리 6평형`, 현재 가격 출고 720,000원/배송 600,000원.
- 가상 1단계: A의 모델명을 `AR06TXEAAWKNEU-12-RENAMED`로 변경.
- 가상 2단계: 별도 제품 B(품명 `삼성 윈드프리 5평형`)가 A의 과거 모델명 `AR06TXEAAWKNEU-12`를 재사용. B 가격은 출고 600,000원/배송 500,000원.

### main에 같은 취약 원리가 있는지

main resolver 입력 label token이 과거 모델명 `AR06TXEAAWKNEU-12`인 경우를 `ProductRepository.java:56-63` 순서 그대로 조회했다.

- `model_code = AR06TXEAAWKNEU-12`: 0건.
- fallback `model_name = AR06TXEAAWKNEU-12`: B 1건.
- 결과: main도 A가 아니라 B의 가격(600,000원/500,000원)을 확정할 수 있다.

즉 `modelCode`가 없는 제품에서는 “exposed modelCode 우선”이 rename/reuse 방어가 아니며, **라벨 토큰이 과거 모델명인 main 입력에는 같은 위험이 선재**한다.

### 이 PR이 실제 입력 범위를 넓혔는지

같은 실제 과거 원천 라인의 저장값은 `modelName=AR06TXEAAWKNEU-12`, `productName=삼성 윈드프리 6평형`이었다. 위 가상 rename/reuse 상태에서 두 경로를 각각 실측했다.

| 경로 | 입력 | exact | alias | LIKE/모델 exact | 결과 |
|---|---|---:|---:|---:|---|
| main label-only | `삼성 윈드프리 6평형` | 0 | 0 | LIKE 3후보 | `AMBIGUOUS` — B 확정 안 함 |
| 현재 HEAD snapshot exact | `AR06TXEAAWKNEU-12` | 해당 없음 | 해당 없음 | model exact 1건 | B 확정, B 가격 사용 |

main의 label extractor는 이 표본의 품명에서 모델 토큰을 얻지 못해 정제된 전체 품명을 사용한다(`origin/main:services/product-service/src/main/java/com/samhanair/logis/product/service/ModelTokenExtractor.java:45-57`). 반면 현재 HEAD는 라벨과 독립된 snapshot 모델명을 exact 조회한다. 따라서 동일한 실제 원천 라인에 대해 main은 다른 제품을 확정하지 않지만 현재 HEAD는 확정한다.

이 표본은 직전 확정 4,189라인을 다시 세지 않고, 그 확정 집합에서 이미 확인된 실제 null-code 원천 한 줄을 사용한 최소 반례다.

## 최종 판정 — **이 PR이 악화**

`origin/main`에도 같은 취약 원리가 있다. main의 label token이 과거 `modelName`이면 `modelCode` exact 실패 후 현재 `modelName` fallback이 이름을 재사용한 B를 반환하고, B의 가격·고정DC를 확정할 수 있다. 따라서 “main에는 없었다”가 아니므로 **이 PR이 도입**은 아니다.

그러나 main 일마감은 과거 `productName/itemName` 라벨만 판정 입력으로 사용한다. 이 PR은 원천의 별도 `modelName` snapshot을 회계 축에 보존하고 label보다 우선하는 exact 조회를 추가했으며, exact 제품의 `modelCode == null`도 즉시 확정한다. 실제 null-code 원천 표본에서 main은 품명 label 3후보로 `AMBIGUOUS`였지만 현재 HEAD는 재사용된 snapshot 이름으로 B 1건을 확정했다. 따라서 “main과 노출 범위가 같다”도 아니므로 **선재** 단독 판정은 아니다.

결론적으로 위험의 **원리는 선재**하지만, PR #991이 label에 모델 토큰이 없던 실제 원천까지 위험 표면을 넓혔으므로 셋 중 판정은 **이 PR이 악화**다.

판정 근거 요약:

- main의 선재 fallback: `origin/main:services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:56-63`.
- main의 label-only 소비: `origin/main:services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:345-400,416-424`.
- 이 PR의 snapshot 모델 exact 추가: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:360-375,401-408,501-526`.
- 실측: 동일 가상 rename/reuse에서 main 실제 저장 label은 exact 0/alias 0/LIKE 3후보로 미확정, 현재 HEAD snapshot 모델은 exact 1건으로 B 확정. B의 가격은 출고 600,000원/배송 500,000원으로 A의 720,000원/600,000원과 달랐다.

## 확인하지 못한 것

- 공유 DB에 실제 PATCH/전표 mutation을 실행하지 않았다. rename/reuse는 읽기 전용 CTE projection으로만 재현했다.
- `origin/main` 바이너리를 별도로 빌드·기동하지 않았다. main 판정은 `git show origin/main:<path>`로 읽은 실제 소스 순서를 SQL에 동일하게 투영했다.
- 직전 판정의 4,189라인 수를 재검증하지 않았다. 사용자 지시대로 확정 수치는 그대로 두고 그 집합의 실제 표본 한 줄만 사용했다.
- 다른 결함(B-*·R-03), 전체 변경 파일, 전체 테스트 스위트는 확인하지 않았다.
- 로컬 `origin/main` ref를 네트워크 fetch로 갱신하지 않았다. 작업 시작 시 주어진 저장소의 `origin/main` (`77774a117`)을 기준으로 판정했다.
