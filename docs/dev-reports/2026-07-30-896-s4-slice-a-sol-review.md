# PR #996 (#896 슬4 Slice A) 적대검증 — 도달성

- 검증 시각: 2026-07-30 KST
- 검증 시작 head: `feat/896-s4-quantity-sync-config` / `ccdaef305`
- 최종 재검증 head: `f2ef5e9be`
- 비교 기준: `main` / merge-base `bd0c0f6c148`
- 질문: **이 PR이 바꾼 표면 전체에서 실 사용자 경로로 재현 가능한 결함이 있는가?**
- 조사 방식: 5 agents가 금액·잠금, fallback·비-S03, 실 catalog·증거,
  migration·교차검증, 통합 판정을 병렬 분담해 결과를 교차 대조

## 최종 판정

**있다. 최신 PR head에도 병합 차단 결함 4건이 남아 있다.**

가장 직접적인 결함은 현재 실 catalog에서 즉시 도달한다. 기존 S-03 수식은 `싱글 실링`
4개 모델을 모두 합산하지만, V28 seed와 새 evaluator는 `AC072BSCPBH2SY` 하나만
source로 계산한다. 거래처가 나머지 세 모델 중 하나를 1개 주문하면
`ADP-F075SP` 1개와 `79,200원`이 화면 합계·최종 확인·서버 payload에서 사라진다.

또한 합법적인 설정값의 소수 수량이 주문 전송의 정수 계약과 충돌하고, target 교체 뒤
과거 주문을 복원하면 구 target과 신 target이 함께 전송되며, target catalog가 없는
fallback 환경에서는 경고 후에도 펌프 없는 주문을 보낼 수 있다.

조사 중 확인한 열린 PR #984와의 Flyway `V28` 충돌은 별도 PM commit
`f2ef5e9be`가 seed를 `V29`로 옮겨 최신 head에서 해소됐다. SQL 본문은 바뀌지
않았으므로 나머지 4건에는 영향이 없다.

## 결함

### 결함 1 — 실 S-03 source 4개 중 3개가 설정 계산에서 누락되어 금액과 발송 line이 사라진다

#### 실 사용자 경로

거래처 사용자가 주문 앱 로그인 → `싱글중대형` 화면 → 다음 `싱글 실링` 중 하나의
수량을 `1`로 입력 → 주문 확인 → 전송:

- `AC090BSCPBH2SY`
- `AC130BSCPHH2SY`
- `AC145BSCPHH2SY`

#### 재현 절차

1. 공유 실데이터를 수정하지 않고
   `GET http://127.0.0.1:8080/api/v1/partner-orders/bootstrap`을 조회했다.
2. HTTP 200 응답의 `singleSets` 288행 전체에서 legacy와 동일하게 이름·모델에
   `실링`이 있는 source를 추출했다.
3. 각 source 수량을 실제 legacy 합산식과 V29 규칙을 소비한 새 evaluator에 각각 넣고,
   실제 target 가격 `79,200원`과 주문 line을 대조했다.

실 catalog:

| id | model | name | price |
|---|---|---|---:|
| 싱글 실링61 | `AC072BSCPBH2SY` | 싱글 실링 | 1,430,000 |
| 싱글 실링62 | `AC090BSCPBH2SY` | 싱글 실링 | 1,490,000 |
| 싱글 실링63 | `AC130BSCPHH2SY` | 싱글 실링 | 1,730,000 |
| 싱글 실링64 | `AC145BSCPHH2SY` | 싱글 실링 | 1,860,000 |
| 실링용 드레인펌프75 | `ADP-F075SP` | 실링용 드레인펌프 | 79,200 |

#### 관측된 잘못된 결과

| 입력 | legacy 펌프 수량/소계 | 설정 펌프 수량/소계 | 차이 |
|---|---:|---:|---:|
| `AC090=1` | 1 / 79,200 | 0 / 0 | **-79,200** |
| `AC130=1` | 1 / 79,200 | 0 / 0 | **-79,200** |
| `AC145=1` | 1 / 79,200 | 0 / 0 | **-79,200** |
| 네 source 각각 1 | 4 / 316,800 | 1 / 79,200 | **-237,600** |
| `AC072=4`, 나머지 각각 1 | 7 / 554,400 | 4 / 316,800 | **-237,600** |

예를 들어 `AC090=1`이면 기존 payload에 있던 아래 line이 새 경로에서는 완전히
사라진다.

```json
{"section":"SINGLE","model":"ADP-F075SP","qty":1,"price":79200}
```

#### 파일:행 근거

- legacy는 이름·모델에 `실링`이 있는 모든 행을 합산:
  `clients/web/order-app/index.html:5208-5214`
- V29는 `AC072BSCPBH2SY` 하나만 source로 seed:
  `services/product-service/src/main/resources/db/migration/V29__seed_s03_quantity_sync_rule.sql:29-34,60-64`
- client도 source가 정확히 하나여야 한다고 제한:
  `clients/web/order-app/src/quantitySync.ts:130-132,171-175`
- evaluator는 rule에 든 source model만 합산:
  `clients/web/order-app/src/quantitySync.ts:181-197`
- 화면 금액은 실제 단가 × 수량:
  `clients/web/order-app/index.html:2935-2940`
- 수량 0인 target은 발송 line에서 생략:
  `clients/web/order-app/index.html:6637-6654`

### 결함 2 — API가 허용하는 소수 설정과 주문 전송의 정수 계약이 충돌한다

#### 실 사용자 경로

`products.admin` 수정 권한이 있는 `MASTER`/`MANAGER`/`DEVELOPER`가 공식 규칙 API에서
S-03 source `factor=0.5`, target `multiplier=1`, `roundingMode=NONE`으로 교체 →
거래처 사용자가 주문 앱 `싱글중대형` 화면에서 `AC072BSCPBH2SY` 수량 `1` 입력 →
최종 주문 전송.

#### 재현 절차

1. API 저장 계약에 유효한 `0.5`를 source factor로 사용했다. 서버 validator는
   `0 < 값 <= 1000`, 소수 scale 4 이하를 허용하고 `NONE`도 허용한다.
2. 새 evaluator에 source 수량 `1`을 넣으면 target `ADP-F075SP=0.5`가 된다.
3. 화면·`buildSendRows()`에는 `0.5 × 79,200 = 39,600원`이 표시·구성된다.
4. 최종 전송 shim은 같은 line을 정수 검증하며 거부한다.

공유 실데이터 write 금지 때문에 실제 PUT·주문 전송은 하지 않았고, 공식 저장
validator와 실제 client evaluator/전송 함수를 같은 입력으로 대조했다.

#### 관측된 잘못된 결과

관리 API가 정상 규칙으로 받아들이는 설정으로 거래처 주문이 최종 전송되지 않는다.
사용자는 최종 확인 화면에서 `ADP-F075SP / 0.5 / 39,600원`을 본 뒤
`주문 ... 품목의 수량이 올바르지 않습니다` 오류를 받는다.

#### 파일:행 근거

- 소수 factor/multiplier 및 `NONE` 저장 허용:
  `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java:223-233,455-458`
- 설정 API 수정 권한과 PUT 경로:
  `services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java:64-70`
- evaluator가 `NONE`이면 소수를 그대로 target 수량으로 사용:
  `clients/web/order-app/src/quantitySync.ts:191-202`
- 소수 수량도 화면 금액과 send row에 포함:
  `clients/web/order-app/index.html:2937,6637-6654,6772-6779`
- 최종 전송은 정수 수량만 허용:
  `clients/web/order-app/src/samhanApi.ts:207-228,360-371`

### 결함 3 — target 설정 교체 뒤 저장 주문을 복원하면 구 target과 신 target이 함께 남는다

#### 실 사용자 경로

1. 거래처 사용자가 기존 S-03 target `ADP-F075SP` 상태에서
   `AC072BSCPBH2SY=1` 주문을 저장한다.
2. 권한 있는 관리자가 공식 PUT으로 S-03 target을 실 catalog의 활성 SINGLE_SET 품목
   `AIM-N01`로 교체한다.
3. 거래처 사용자가 다시 로그인 → `저장내역` 화면 → 위 주문의 `복원` 클릭 →
   최종 주문 확인·전송.

실 API read-only 조회에서 대체 target은
`호환중계기(EHP용)66 / AIM-N01 / 18,150원 / ACTIVE / BOTH / singleSets`로 확인했다.

#### 재현 절차

1. 기존 snapshot에 source `AC072=1`과 자동 target `ADP=1`이 직렬화되는 상태를 구성했다.
2. 현재 ready 규칙의 target만 `AIM-N01`로 바꿨다.
3. `applySnapshot()`의 실제 순서대로 `singleQty`를 복원한 뒤
   `recomputeSingleDerived()`를 호출했다.
4. 새 writer는 `AIM-N01=1`만 쓰고 과거 자동 target `ADP-F075SP=1`을 0으로 정리하지
   않았다.

#### 관측된 잘못된 결과

기대 target line은 `AIM-N01 × 1 = 18,150원` 하나다. 실제 send state에는
`AIM-N01 × 1`과 `ADP-F075SP × 1`이 함께 남아 target 소계가 `97,350원`이 된다.
구 target 금액 **79,200원 과다**이며 두 line 모두 최종 payload에 들어간다.

#### 파일:행 근거

- snapshot이 `singleQty` 전체를 저장:
  `clients/web/order-app/index.html:9188-9211`
- 복원 시 저장된 Map을 그대로 되살린 뒤 재계산:
  `clients/web/order-app/index.html:9480-9513,9536-9547`
- 설정 writer는 현재 target만 쓰고 이전 target을 clear하지 않음:
  `clients/web/order-app/index.html:5196-5205`
- 남은 두 양수 행을 모두 발송:
  `clients/web/order-app/index.html:6637-6663`

### 결함 4 — target catalog가 없는 fallback은 경고만 하고 펌프 없는 주문 전송을 허용한다

#### 실 사용자 경로

배포 순서상 source `AC072BSCPBH2SY`는 있지만 target `ADP-F075SP`가 아직 없는 정상
API 생성 상태 → V29가 규칙 생성을 NOTICE와 함께 건너뜀 → 거래처 사용자 로그인 →
`싱글중대형`에서 `AC072=1` 입력 → catalog 경고를 본 상태로 주문 확인·전송.

#### 재현 절차

1. 정식 Product 생성 API로 만들 수 있는 source-only catalog 상태를 전제로 V29 분기를
   따라갔다. raw SQL 전용 죽은 컬럼은 필요하지 않다.
2. 규칙 부재로 설정 bridge가 error가 되어 legacy 분기로 내려가는 것을 확인했다.
3. legacy는 source 수량 `1`을 계산하지만 target row가 없어서
   `SS_CEILING_PUMP_ID=null`이다.
4. `setSingleDerivedQty_()`는 경고를 기록할 뿐 fallback model key에 수량을 쓰지 않는다.
5. 주문 readiness에는 catalog 경고나 누락 target 검사가 없어 최종 전송이 활성화된다.

#### 관측된 잘못된 결과

사용자에게 catalog 경고는 보이지만 주문은 계속 진행된다. 최종 payload에는 source
`AC072`만 있고 필요한 `ADP-F075SP × 1` line이 없다. 정상 실 catalog 가격 기준으로
**79,200원과 펌프 1개가 누락**된다.

이는 “규칙 부재 경고 + legacy 계산 유지”라는 보고와 다르다. legacy 식으로 계산을
시도하기는 하지만 target catalog가 없으면 계산 결과를 주문 상태에 기록하지 못한다.

#### 파일:행 근거

- V29의 source/target 부재 시 seed skip:
  `services/product-service/src/main/resources/db/migration/V29__seed_s03_quantity_sync_rule.sql:29-46`
- 규칙 오류 시 legacy 분기:
  `clients/web/order-app/index.html:5196-5215,5580-5596`
- target id가 없으면 경고만 기록하고 수량은 쓰지 않음:
  `clients/web/order-app/index.html:5615-5628`
- 주문 활성 조건에 catalog/파생품 누락 검사가 없음:
  `clients/web/order-app/index.html:6447-6462`
- 0 또는 없는 target은 send row에서 빠지고 실제 전송은 계속됨:
  `clients/web/order-app/index.html:6637-6663,6746-6816`

### 라운드 중 해소 — 열린 PR #984와의 Flyway `V28` 충돌

#### 실 사용자 경로

개발책임자가 시작 head `ccdaef305`의 PR #996과 열린 PR #984를 모두 순차 병합·배포
→ 두 번째 변경을 포함한
`product-service`가 기동 → 거래처 사용자가 주문 앱 로그인 또는 상품·수량 규칙 API를
사용.

#### 재현 절차

요청된 방식 그대로 `git ls-remote --heads origin`으로 원격 24개 head를 열거하고,
각 SHA에 `git ls-tree -r --name-only <sha>
services/product-service/src/main/resources/db/migration`을 실행했다.

시작 head의 충돌 원문:

```text
feat/896-s4-quantity-sync-config
  V28__seed_s03_quantity_sync_rule.sql
fix/ecount-import-model-code-merge
  V27__allow_skipped_main_candidate_status.sql
  V28__add_product_lineage.sql
wip/984-r4-product-lineage-unverified
  V28__add_product_lineage.sql
```

`gh pr view 984`의 현재 head는
`eeebd20b7a30b4ff7d54f6d59bd4703f2fd75ed6`, 상태는 `OPEN`이다.

#### 시작 head에서 관측된 잘못된 결과

두 PR을 함께 둔 migration 집합에는 Flyway version `28`이 두 개다. 병합 순서와
무관하게 두 번째 배포의 `product-service`는 중복 version 검증에서 기동하지 못하고,
거래처 bootstrap·상품·수량 규칙 경로가 서비스 불가가 된다.

Docker 실행 금지에 따라 실제 기동 로그는 만들지 않았지만, 동일 migration 위치의
동일 version 두 파일은 Flyway가 실행 전에 거부하는 확정 충돌이다.

#### 최신 head 재검증

별도 PM commit `f2ef5e9be`가 #996 seed를
`V29__seed_s03_quantity_sync_rule.sql`로 옮겼다. 원격 24개 head를 다시 열거한 결과
V29 소유자는 최신 #996 하나뿐이었다. 따라서 이 결함은 최신 PR head에서 해소됐다.

#### 파일:행 근거

- 최신 #996 migration version:
  `services/product-service/src/main/resources/db/migration/V29__seed_s03_quantity_sync_rule.sql:1`
- #984 현재 원격 tree:
  `services/product-service/src/main/resources/db/migration/V28__add_product_lineage.sql`
- 시작 head의 잘못된 원문과 최신 정정:
  `docs/dev-reports/2026-07-30-896-s4-slice-a.md:174-207,341-489`

## 각도별 판정

### 1. 금액 동일성 — 실패

- `AC072` 단독, 현재 seed `1 × 1 / NONE`에서는 입력
  `0, 1, 4, 77, 999999`, 옵션 조합과 다른 세트 동시 선택을 확장 대조해 전후 수량·금액
  차이가 없었다.
- 화면 입력은 음수·소수를 제거하고 `0..999999` 정수로 정규화하므로 현재 seed의
  AC072 단독 경로에는 반올림 경계가 없다
  (`clients/web/order-app/index.html:2975-3000`).
- 그러나 네 개의 실제 S-03 source를 함께 보면 `AC090/130/145`에서 즉시 결함 1이
  재현된다. 따라서 보고서의 네 입력값은 S-03 전체를 대표하지 못한다.
- 공식 API가 허용하는 소수 설정에서는 결함 2가 재현된다.

### 2. 수동 잠금과 설정 충돌 — 별도 회귀 없음, target 교체 복원 경로는 실패

- 현재 target `ADP-F075SP`와 현재 seed에서 source
  `0/1/4/77/999999` × 수동 target `미입력/0/1/77/999999` 25조합은 잠금을 보존했다.
- 싱글 옵션 변경 시 전체 single lock을 지우는 정책은 base와 동일하다
  (`clients/web/order-app/index.html:5143-5155`).
- 다만 `AC090/130/145`에서 target을 수동 잠근 뒤 옵션을 바꾸면 잠금 해제 후 0이 되는
  현상은 결함 1의 추가 실사용 재현 경로다.
- 설정 target 자체가 교체된 뒤 저장 주문을 복원하는 경로는 결함 3처럼 구·신 target이
  함께 남는다.

### 3. 조용한 0 — 부분 통과, target 부재 경로 실패

- 규칙 조회 실패 또는 규칙 형식 오류이고 실제 target row가 존재하면 경고 후 legacy
  계산으로 복귀하며 `0/1/4/77`에서 수량을 유지했다.
- source/target catalog 누락은 설정 evaluator 단계에서 error와 경고를 낸다.
- 그러나 target row 자체가 없는 배포 상태에서는 경고가 있어도 legacy 결과를 Map에
  기록하지 못하고, 주문 차단 없이 잘못된 payload를 전송한다(결함 4).

### 4. S-03 이외 19개 계열 — 무영향

- base 대비 `index.html` diff는 S-03 writer, 경고 표시, 로그인 후 규칙 load에만 있다.
  `C-05`/`C-08` 이중 writer, `H-07` 차감식, `C-09` 분기보드 계산 본문은 바뀌지 않았다.
- `npx vitest run src/__tests__/legacy-quantity-golden.test.ts`:
  **1 file / 73 tests 통과**.
- 이 각도에서 실사용 도달 결함은 확인하지 못했다.

### 5. seed와 실 catalog — 품목 존재·API 생성성 통과, source 완전성 실패

read-only 실측:

```text
GET http://localhost:8088/api/v1/partner-orders/bootstrap
HTTP 200
singleSets=288
AC072BSCPBH2SY: price=1,430,000
ADP-F075SP:     price=79,200
```

product-service 내부 모델코드 조회에서도 두 행은 `ACTIVE / BOTH / singleSets`였다.
V29의 `model_code/status/is_deleted` 조건을 만족한다. 또한 정식 Product 생성 API와
시트 동기화 모두 같은 `modelCode`, `ACTIVE`, `isDeleted=false`, estimate exposure를
만들 수 있으므로 fixture의 이 두 행은 raw SQL로만 만들 수 있는 상태가 아니다.

다만 실 catalog의 S-03 source는 한 행이 아니라 네 행이므로 seed와 fixture의
source 완전성은 실패한다(결함 1).

API 생성성 근거:

- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/CreateProductRequest.java:20-40`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:469-503`
- `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:372-392`
- `shared/common/src/main/java/com/samhanair/logis/common/entity/BaseEntity.java:42-43`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1212-1265,1343`

### 6. migration 번호 — 시작 head 실패, 최신 head 통과

시작 head에서는 열린 PR #984와 #996이 모두 V28을 소유했다. 최신
`f2ef5e9be`는 #996을 V29로 이동했다. 원격 24개 head 전체를 다시 열거한 결과
V29는 #996만 소유하므로 현재 번호 충돌은 없다.

## 증거 무결성 대조 결과

### 1. shadow의 수량 JSON은 재현되지만 S-03 전체 대조가 아니다

`npx vite-node scripts/quantity-sync-s03-shadow.mjs` 출력은 보고서
`slice-a.md:89,220`과 일치했다. 그러나 fixture와 shadow는 `싱글 실링61 /
AC072BSCPBH2SY` 하나만 선택한다
(`singleSetsBootstrap.fixture.json:16`,
`quantity-sync-s03-shadow.mjs:12,22`).

보고서 `slice-a.md:17-23`의 “288행 중 S-03 source/target 행을 그대로 보존한 subset”과
`:306`의 “실링 source 수량을 합산한 동작 유지”는 실제 source 네 행과 일치하지 않는다.
정정 문구는 **“AC072BSCPBH2SY 단독 입력에서만 전후 수량이 일치했다”**여야 한다.

### 2. `8,958,400원`은 펌프 77개 소계가 아니라 source 2개를 포함한 화면 전체 합계다

shadow는 다음 합성 단가를 사용한다.

```js
const unitPrice = 8958400 / 77;
```

근거: `clients/web/order-app/scripts/quantity-sync-s03-shadow.mjs:28,41-44`.

원출처 하네스는 source를 `1 → 2`, target을 수동 `77`로 만든 뒤 target 행 소계가 아닌
`#singleTotal`을 읽었다
(`qa/playwright/scripts/qa-963-sol2-fix.mjs:56-78,122-135`,
`docs/dev-reports/2026-07-28-963-legacy-quantity-loss.md:539-551`).

실 가격 계산:

```text
source: 2 × 1,430,000 = 2,860,000
target: 77 ×   79,200 = 6,098,400
전체:                    8,958,400
```

따라서 보고서 `slice-a.md:89-100,220-225`의 target 77개 소계는
`8,958,400원`이 아니라 **`6,098,400원`**이다. 입력 `0/1/4/77`의 올바른 target
소계는 **`0 / 79,200 / 316,800 / 6,098,400`**이다.

shadow payload도 실제 `calcSetUnitPrice()`, `explodeSendSets_()`, `buildSendRows()`를
호출하지 않고 `{section, model, qty}`만 합성한다. 정정 판정은
**“선택한 AC072의 수량·model/qty projection은 같지만, 보고된 실측 금액과 실제
payload 경로는 측정하지 않았다”**이다.

### 3. migration 중복 원문은 최신 보고서에서 정정됐다

시작 head의 보고서 `slice-a.md:181-207`은 #984를 함께 놓은 결과를
`DUPLICATE VERSIONS: none`으로 제시한다. 현재 #984 head에는
`V28__add_product_lineage.sql`이 있으므로 당시 실제 결과는 `V28` 두 개였다.

최신 보고서 §11(`slice-a.md:341-489`)은 이 불일치를 명시하고 V29로 정정했다.
재실측에서도 원격 24개 head 중 V29 소유자는 최신 #996 하나뿐이므로 migration
증거는 현재 재현된다.

### 4. 변경 파일 `git` 원문은 현재 PR HEAD 상태가 아니다

보고서 `slice-a.md:138-168,320-335,441-446`는 신규 파일을 `??`로 제시한다.
검증 시작 head와 최신 head의 clean worktree에서는 모두 tracked였다.
`git diff --numstat bd0c0f6c148...f2ef5e9be`의 실제 변경은 **15파일,
+1,991/-8**이며 보고서 자체도 `+489/-0`이다. 해당 표가 작업 중간 시점의 측정이라면
그 시점의 commit/tree를 붙여야 하며, 현재 HEAD 원문이라는 표기는 정정해야 한다.

## 이 라운드가 보지 않은 것

- 요청에서 제외한 테스트 강도, mock 충실도, 가드 구멍, 문서의 일반적 완성도는
  조사·판정하지 않았다. 위 문서 항목은 오직 원문/실측 수치가 재현되는지에 한정했다.
- Docker와 공유 실데이터 write를 금지한 지시에 따라 Flyway 실제 기동, 규칙 PUT,
  실제 주문 전송은 수행하지 않았다. 해당 결함은 원격 tree, 공식 저장 validator,
  실제 client 계산·payload 함수의 동일 입력 대조로 판정했다.
- `product-service` 외 Gradle 범위, 배포 인프라의 복구 동작, 외부 연동사가 잘못된
  주문 line을 받은 뒤의 후속 회계·물류 처리는 조사하지 않았다.
- 모바일 전용 레이아웃, 접근성, 성능, 보안, 시각 디자인은 조사하지 않았다.
- S-03 이외 19개 계열은 변경 diff와 73개 golden으로 무영향을 확인했지만, 각 계열의
  모든 화면 조합을 실제 브라우저에서 다시 주문 전송하는 전체 E2E는 수행하지 않았다.

## 불변식 준수

- 코드 수정 없음.
- git add/commit/push/checkout 없음.
- Docker 실행 없음.
- 공유 실데이터 write 및 실제 주문 전송 없음.
