# #896 P1 — #1143 세트 구성품 비중·반올림 데이터 계약 설계안

- 작성일: 2026-08-08
- 성격: 설계안 작성 라운드
- 기준 계획: `docs/dev-reports/2026-08-08-896-migration-plan.md` §1.3 P1
- 범위: 스키마, 초기값, 계산 경로, 기초품목 화면 계약, 검증 관문
- 비범위: 코드·Flyway 작성/실행, DB 쓰기, 화면 구현, Docker/Git 조작, 신규 데이터 조사

## 0. 결론과 불변식

P1의 최소 착지점은 다음 두 곳이다.

1. 기존 `bundle_component`에는 구성행별 `자동 배분`/`고정금액` 모드, 자동 배분 가중치, 세트 문맥 고정 납품가를 둔다.
2. 신설 `bundle_allocation_policy`에는 세트별 실내기:실외기 비중, 반올림 단위·방식, 잔차 정책과 효력일을 둔다.

모든 값을 `bundle_component`에 반복 저장하면 반올림 정책과 그룹 비중이 구성행마다 중복된다. 반대로 모든 값을 신설 테이블에 두면 기존 구성행 식별자를 한 번 더 복제해야 한다. 따라서 **기존 구성행 확장 + 정책 테이블 1개 신설**이 P1 계획을 따르는 최소안이다.

이 설계가 지켜야 할 불변식은 다음과 같다.

- 대표 세트 납품가가 배분의 유일한 총액이다. 구성품 납품가를 또 하나의 전역 납품가로 만들지 않는다.
- 고정 구성품 금액을 먼저 차감하고, 남은 금액만 자동 구성품에 배분한다.
- `고정 합계 + 실내기 배분 합계 + 실외기 배분 합계 = 대표 세트 납품가`가 원 단위로 성립한다.
- 기존 271세트는 현행 `isHousehold` 판정과 현행 `Product.deliveryPrice` 사용 결과를 데이터로 고정한 뒤, 계산 경로만 바꿔도 구성품별 금액이 한 건도 달라지지 않아야 한다.
- 상업멀티는 정책을 만들지 않고 지금처럼 구성품 전역 납품가를 그대로 사용한다.
- 신규 테이블 엔티티는 `BaseEntity`를 상속하고 7개 감사 필드와 soft delete를 사용한다. hard delete와 FK cascade delete는 사용하지 않는다.

## 1. 스키마

### 1.1 구성행: 기존 `bundle_component` 확장

| 컬럼 | 형식 | null/default | 의미 |
|---|---|---|---|
| `allocation_mode` | `VARCHAR(24)` | `NULL`, DB default 없음 | `WEIGHTED_BODY` 또는 `FIXED_COMPONENT`. `NULL`은 P1 비대상/레거시 경로 |
| `allocation_weight` | `NUMERIC(19,6)` | `NULL`, DB default 없음 | `WEIGHTED_BODY`가 같은 실내/실외 그룹 안에서 나뉘는 상대 가중치 |
| `fixed_allocation_amount` | `NUMERIC(19,0)` | `NULL`, DB default 없음 | `FIXED_COMPONENT`의 세트 문맥 배분용 고정금액(원) |

`fixed_allocation_amount`가 필요한 이유는 명확하다. 비중만 저장하면 다수 실내·실외기의 전역 가격 의존은 제거할 수 있지만, 판넬·리모컨·자재·가정용 벽걸이처럼 원금액을 유지하는 구성품의 **세트 문맥 금액**은 표현할 수 없다. 이 값은 두 번째 제품 납품가가 아니라 대표 세트 납품가를 나누기 위한 문맥 고정금액이다. 고정값을 계속 `products.delivery_price`에서 읽으면 재현 불일치 원인 후보 중 고정부품 문맥 문제는 남는다.

`allocation_mode IS NULL`은 무조건 오류가 아니라 의도적인 호환 경계다. 초기 271세트 밖의 상업멀티·비대상 세트가 현재 동작을 유지하게 한다. 정책이 존재하는 세트에서는 모든 활성 구성행의 mode가 반드시 채워져야 하며, 이 완전성은 서비스 검증과 마이그레이션 검증기가 강제한다.

### 1.2 세트 정책: `bundle_allocation_policy` 신설

| 컬럼 | 형식 | null/default | 의미 |
|---|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` | 내부 식별자. 화면에는 노출하지 않음 |
| `bundle_product_id` | `UUID` | NOT NULL, `products(id)` FK | 정책 대상 부모 BUNDLE |
| `indoor_weight` | `NUMERIC(19,6)` | NOT NULL, DB default 없음 | 실내기 그룹 비중 |
| `outdoor_weight` | `NUMERIC(19,6)` | NOT NULL, DB default 없음 | 실외기 그룹 비중 |
| `round_unit` | `INTEGER` | NOT NULL, default `1000` | 원 단위 반올림 간격. 레거시 초기값 1,000원 |
| `rounding_mode` | `VARCHAR(16)` | NOT NULL, default `HALF_UP` | 비율 계산의 반올림 방식 |
| `remainder_policy` | `VARCHAR(32)` | NOT NULL, default `LEGACY_OUTDOOR_ALIGN_LAST` | 레거시 실외기 단위 정렬과 그룹 마지막 행 잔차 흡수 |
| `effective_from` | `DATE` | NOT NULL, DB default 없음 | 정책 효력 시작일 |
| 감사 필드 7개 | `TIMESTAMP/VARCHAR/BOOLEAN` | `BaseEntity` 계약 | 생성·수정·삭제 감사와 soft delete |

초기 271행의 `effective_from`은 이관 도출본에 명시적으로 `2000-01-01`을 넣는다. 컬럼 default로 두지 않는 이유는 신규 정책이 실수로 역사 전체에 적용되는 것을 막기 위해서다.

`LEGACY_OUTDOOR_ALIGN_LAST`의 계산 의미는 다음과 같이 고정한다.

1. 남은 금액에서 실내기 몫을 `round_unit`/`HALF_UP`으로 반올림한다.
2. 실외기 몫은 `남은 금액 - 실내기 몫`으로 잡는다.
3. 실외기 몫을 `round_unit` 경계에 맞추기 위해 필요한 잔차를 실내기 몫과 이동한다. 이는 현재 `BundleExpander.java:365-393`의 동작을 일반화한 것이다.
4. 각 그룹 내부에서는 마지막 활성 구성행이 잔차를 흡수한다. 마지막 행은 `display_order ASC NULLS LAST, id ASC`로 결정해 실행마다 같게 한다.

### 1.3 DDL 초안 — 실행 금지

현재 product-service Flyway의 최고 번호는 `V32__bundle_components_manual.sql`이다. 따라서 **현재 작업 디렉터리 기준 다음 번호 후보는 V33**이다. 구현 직전 병렬 작업의 번호 점유를 다시 확인해야 하며, 이 문서에서는 파일을 만들거나 실행하지 않는다.

```sql
-- DRAFT ONLY: V33__bundle_allocation_contract.sql
ALTER TABLE bundle_component
    ADD COLUMN allocation_mode VARCHAR(24),
    ADD COLUMN allocation_weight NUMERIC(19,6),
    ADD COLUMN fixed_allocation_amount NUMERIC(19,0),
    ADD CONSTRAINT chk_bc_allocation_contract CHECK (
        (allocation_mode IS NULL
            AND allocation_weight IS NULL
            AND fixed_allocation_amount IS NULL)
        OR
        (allocation_mode = 'WEIGHTED_BODY'
            AND allocation_weight IS NOT NULL
            AND allocation_weight >= 0
            AND fixed_allocation_amount IS NULL)
        OR
        (allocation_mode = 'FIXED_COMPONENT'
            AND allocation_weight IS NULL
            AND fixed_allocation_amount IS NOT NULL
            AND fixed_allocation_amount >= 0)
    );

CREATE TABLE bundle_allocation_policy (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_product_id   UUID          NOT NULL REFERENCES products(id),
    indoor_weight       NUMERIC(19,6) NOT NULL,
    outdoor_weight      NUMERIC(19,6) NOT NULL,
    round_unit          INTEGER       NOT NULL DEFAULT 1000,
    rounding_mode       VARCHAR(16)   NOT NULL DEFAULT 'HALF_UP',
    remainder_policy    VARCHAR(32)   NOT NULL DEFAULT 'LEGACY_OUTDOOR_ALIGN_LAST',
    effective_from      DATE          NOT NULL,
    created_at          TIMESTAMP     NOT NULL,
    created_by          VARCHAR(50)   NOT NULL,
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN       NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_bap_weights CHECK (
        indoor_weight > 0 AND outdoor_weight > 0
        AND scale(indoor_weight) <= 6
        AND scale(outdoor_weight) <= 6
    ),
    CONSTRAINT chk_bap_round_unit CHECK (round_unit BETWEEN 1 AND 1000000),
    CONSTRAINT chk_bap_rounding_mode CHECK (rounding_mode IN ('HALF_UP')),
    CONSTRAINT chk_bap_remainder_policy CHECK (
        remainder_policy IN ('LEGACY_OUTDOOR_ALIGN_LAST')
    )
);

CREATE UNIQUE INDEX ux_bap_bundle_effective_active
    ON bundle_allocation_policy (bundle_product_id, effective_from)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_bap_bundle_latest_active
    ON bundle_allocation_policy (bundle_product_id, effective_from DESC)
    WHERE is_deleted = FALSE;
```

0 가중치는 DB에서 표현할 수 있게 두되 화면 저장은 거부한다. 이관 도출 중 0이 나오면 다음처럼 판정한다.

- 같은 그룹의 가중치가 전부 0이면 자동 균등 배분 후보로 별도 보고하고, 승인 전 정책을 활성화하지 않는다.
- 양수와 0이 섞이면 0행의 배분액은 0원으로 정의한다.
- 이 규칙이 현행 결과와 다르면 `금액 회귀 0` 관문에서 마이그레이션을 중단한다.

## 2. 초기값 전략 — 기존 271세트 무변경

### 2.1 도출 입력과 고정 규칙

도출 스크립트는 기존 271개 `SINGLE_SET + BUNDLE + EXPAND + 활성 INDOOR/OUTDOOR 보유` 세트만 대상으로 한다. Google을 다시 읽지 않고 P0 불변 입력과 현재 product DB 스냅샷만 사용한다.

각 세트에 대해 다음 순서로 초기값을 만든다.

1. 부모 `name + model_code + spec_text`에 현재 `BundleExpander.isHousehold()`의 분기 순서(`BundleExpander.java:434-455`)를 그대로 적용한다.
2. 판정이 가정용이면 정책을 `indoor_weight=6`, `outdoor_weight=4`로, 아니면 `4`, `6`으로 만든다.
3. 모든 정책은 `round_unit=1000`, `rounding_mode=HALF_UP`, `remainder_policy=LEGACY_OUTDOOR_ALIGN_LAST`, `effective_from=2000-01-01`로 만든다.
4. 현재 `BundleExpander.java:298-317`과 동일한 분류를 적용한다. 일반 실내기·실외기는 `WEIGHTED_BODY`, 패널·리모컨·자재·받침대·부속과 가정용 벽걸이 실내기는 `FIXED_COMPONENT`로 만든다.
5. `WEIGHTED_BODY.allocation_weight`에는 현재 계산이 가중치로 쓰는 구성품의 전역 `products.delivery_price`를 스냅샷한다.
6. `FIXED_COMPONENT.fixed_allocation_amount`에도 현재 계산이 고정금액으로 쓰는 구성품의 전역 `products.delivery_price`를 스냅샷한다.
7. 도출 결과에는 부모 모델, 구성품 모델, 현행 household 판정, mode, 값, 원본 제품 ID가 아닌 사용자용 모델 식별자, 입력 SHA를 남긴다. UUID는 검증기 내부 조인에만 사용하고 보고서·화면에는 노출하지 않는다.

이 전략은 이름 휴리스틱을 런타임에서 제거하되 **그 휴리스틱의 2026-08-08 판정 결과를 데이터로 구워 넣는 것**이다. 이후 품목명이 바뀌어도 비중이 조용히 6:4↔4:6으로 바뀌지 않는다.

### 2.2 271세트 밖의 값

- 상업멀티 72세트: 정책 행을 만들지 않고 구성행의 세 allocation 컬럼도 `NULL`로 둔다. 기존 전역 구성품 단가 반환 경로를 유지한다.
- 실내·실외를 모두 갖지 않은 나머지 싱글 세트 1개: P1 정책을 만들지 않는다. 기존 fallback/override 예외 동작을 유지한다.
- `KEEP` BUNDLE과 단품: P1 비대상이며 값은 `NULL`이다.
- 신규 SINGLE_SET: 정책과 모든 활성 구성행의 mode/value가 완결되지 않으면 활성 저장을 거부한다.

### 2.3 구운 뒤 금액이 안 바뀌는지 증명

구현 라운드에서는 **같은 입력에 대해 구경로와 신경로를 동시에 계산하는 비교기**를 먼저 만든다. 비교 단위는 총액만이 아니라 다음 전체다.

- 부모 모델과 선택 옵션
- 구성품 모델·종류·수량·표시 순서
- 구성품별 단가
- 구성품별 `수량 × 단가`
- 세트별 구성품 합계

계획된 검증 명령은 다음과 같다. 파일·테스트 클래스는 구현 라운드 산출물이며 현재 존재한다고 가정하지 않는다.

```powershell
Set-Location C:\dev\Samhan-Public

# 271세트 도출 완전성: 누락/중복/분류 불가/0가중치 보고, DB 쓰기 없음
node .\scripts\migration\derive-896-p1-allocation.mjs `
  --mode verify --expected-bundles 271 `
  --out .\build\reports\896-p1-derived.json

# 같은 fixture를 현행 하드코딩 경로와 데이터 경로로 계산해 상세행 diff 0 강제
.\gradlew.bat :services:product-service:test `
  --tests "com.samhanair.logis.product.it.BundleAllocationMigrationParityIT"

# 도출본 기준 상세 JSON 직접 비교. 출력이 있거나 exit code가 0이 아니면 불합격
node .\scripts\migration\compare-896-p1-allocation.mjs `
  --before .\build\reports\896-p1-before.json `
  --after  .\build\reports\896-p1-after.json `
  --fail-on-diff
```

필수 집계는 `정책 271`, `현행 household 판정 누락 0`, `정책 대상 mode 미설정 0`, `구성 상세행 금액 diff 0`, `세트 합계 diff 0`이다. 한 항목이라도 다르면 계산 경로를 전환하지 않는다.

## 3. 계산 경로 전환

### 3.1 `BundleExpander` 변경 접점

구현 시 변경할 정확한 접점은 다음과 같다.

| 현재 위치 | 현재 동작 | 설계상 전환 |
|---|---|---|
| `BundleExpander.java:98-120` | 구성행과 구성품 `Product.deliveryPrice`로 `Part.price` 생성 | 정책 대상은 mode·weight·fixed price를 함께 적재. `FIXED_COMPONENT`만 문맥 고정가를 초기 가격으로 사용 |
| `BundleExpander.java:123-129` | `SINGLE_SET`이면 무조건 하드코딩 재배분 | 유효 정책이 있는 SINGLE_SET만 데이터 계약 계산기로 전달. 정책 없는 상업멀티·비대상은 현행 경로 유지 |
| `BundleExpander.java:298-317` | `isHousehold`와 종류/이름으로 weighted/fixed 분류 | mode가 정본. 이름 휴리스틱은 이관 도출기에만 남고 런타임에서는 제거 |
| `BundleExpander.java:326-335` | 6:4/4:6 상수와 전역 고정부품 가격 | 정책의 indoor/outdoor weight와 구성행 fixed price 사용 |
| `BundleExpander.java:338-363` | `Part.price`를 그룹 가중치로 재사용 | `allocation_weight`만 가중치로 사용. 마지막 행은 결정적 순서로 잔차 흡수 |
| `BundleExpander.java:365-393` | 1,000원/HALF_UP/실외기 정렬 하드코딩 | `round_unit`, `rounding_mode`, `remainder_policy` 사용 |
| `BundleExpander.java:434-455` | 런타임 이름 기반 household 판정 | 신규 계산 경로에서는 호출하지 않음. 도출 스크립트의 초기값 생성 근거로만 보존 |

대표 세트 납품가의 선택은 바꾸지 않는다. `BundleExpander.java:82-86`처럼 화면 `setUnitOverride`가 있으면 그것을, 없으면 부모 `Product.deliveryPrice`를 쓴다.

정책 조회는 가격 선택 기준일을 명시적으로 받아 `effective_from <= 기준일` 중 최신 활성 행을 선택해야 한다. 초기 정책이 하나뿐인 동안 결과는 같지만, 시스템 시계로 암묵 선택하면 과거 가격 벌 재현이 불가능하므로 금지한다. 기준일을 전달하지 않는 기존 호출의 호환 규칙은 §6의 미확정 사항이다.

### 3.2 문맥 가격과 전역 가격 — 83건 답변

**비중 컬럼이 생긴다는 사실만으로 83건이 자동 해소되지는 않는다.** 사례 유형별로 다르다.

| 유형 | 명시 비중의 효과 | 추가로 필요한 것 |
|---|---|---|
| 실내기 1 + 실외기 1 | 원가중치는 결과에서 덮어써지므로 영향 없음 | 세트 대표 납품가와 그룹 비중만 정확하면 됨 |
| 복수 실내기/실외기 | 세트 문맥 `allocation_weight`를 넣으면 전역 `delivery_price` 가중치 의존을 제거할 수 있음 | 83건을 세트·구성행에 조인해 문맥값을 가중치로 변환해야 함 |
| 고정부품 | 비중 대상이 아니므로 `allocation_weight`로는 해결 불가 | `fixed_allocation_amount`에 세트 문맥 고정금액 필요 |
| 실내/실외 한쪽 누락 | 현재 재배분 자체가 실행되지 않거나 override에서 예외 | 정책 비대상 유지 또는 별도 업무 규칙 결정 필요 |

따라서 원인 후보를 구조적으로 수용하는 데는 `allocation_weight + fixed_allocation_amount + mode`가 모두 필요하다. 그러나 어떤 값을 구울지는 83건 분류와 개발책임자 선택 전에는 확정할 수 없다.

### 3.3 상업멀티

상업멀티는 그대로 둔다. 상업멀티 구성 탭 안의 복수 문맥값 그룹은 두 가격 벌 모두 0개이고 현재 레거시와 백엔드 모두 세트 대표가를 재배분하지 않는다. 정책 행을 만들지 않으며 `BundleExpander.java:123-135`의 구성품별 전역 단가 경로를 유지한다.

## 4. 기초품목 화면/API에 필요한 것 — 구현하지 않음

설정 위치는 `/products/catalog`의 세트 상세 구성품 목록이다. `/products/estimate-items`는 세트 검색·대표 납품가 사용만 담당하고 내부 배분 정책을 편집하지 않는다.

현재 `ProductFormPage.tsx:940-966` 구성품 행에 다음 계약이 필요하다.

- 납품가 입력 모드: `자동`/`고정가` 토글
- 자동일 때: `납품가 [자동] 비중 [6]` 형태의 비중 입력
- 고정가일 때: `납품가 [금액]원`, 비중 입력 비활성
- 정책 영역: `실내기:실외기 비중`, `반올림 단위 [1,000]원`
- 계산 미리보기: 대표 납품가, 고정합계, 자동배분 잔액, 구성품별 결과, 잔차 수신 행
- 상업멀티: “구성품 전역 납품가 사용·재배분 안 함”을 표시하고 P1 비중 필드를 비활성

복수 실내기 또는 복수 실외기가 있는 세트에서 행의 `비중`은 **같은 그룹 내부 가중치**이고, 실내기:실외기 총비중은 정책 값이다. 화면은 두 층을 혼동하지 않도록 그룹 헤더와 행 입력을 함께 보여야 한다. 1+1 세트에서는 그룹 비중이 곧 사용자가 보는 6:4 또는 4:6이다.

`productCatalogApi.ts:248-290` 계열 구성품 DTO에는 다음이 추가로 필요하다.

- 구성행: `allocationMode`, `allocationWeight`, `fixedAllocationAmount`
- 세트 정책: `indoorWeight`, `outdoorWeight`, `roundUnit`, `roundingMode`, `remainderPolicy`, `effectiveFrom`
- 응답 미리보기: `calculatedDeliveryPrice`, `remainderReceiver`, `validationErrors`

저장 검증은 정책 대상 구성행 mode 전건 설정, 양수 UI 가중치, 고정가 0원 이상, 실내/실외 그룹 존재, 고정합계가 대표 납품가를 넘지 않음을 검사해야 한다. 사용자가 보는 오류에는 UUID 대신 세트·구성품 모델명과 행 위치를 사용한다.

## 5. 검증 관문

### 5.1 단계별 검증표

| 단계 | 검증 | 합격값 |
|---|---|---|
| 스키마 | Flyway schema test, CHECK/부분 unique/FK, 신규 엔티티 `BaseEntity` 상속 | 위반 0, hard delete 경로 0 |
| 초기값 도출 | 271 후보와 정책/구성행 도출 수, household 판정 재실행 | 정책 271, 누락·중복·분류불가 0 |
| 현행 무변경 | 구 계산기 vs 데이터 계산기의 구성 상세행 비교 | 단가·수량·행합계·세트합계 diff 0 |
| 계산 단위 | 가정 6:4, 비가정 4:6, 복수 그룹, 고정부품, 0가중치, 한쪽 누락, 임의 round unit, 마지막 잔차 | 명세와 전건 일치 |
| 재현기 | 저장된 비인상 141/인상 132 그룹 재실행 | 계산 가능 그룹 불일치 0 또는 승인된 예외 전건 근거 |
| P0 상세 골든 | 같은 커밋의 sheet `run2`와 DB 모드 `01`~`06` | 파일 SHA 6/6 일치, 상세행 diff 0 |
| 상업멀티 | 전환 전후 구성품 단가 배열 | diff 0 |

P0 골든 대조 명령은 계획서 §1.9와 같은 형식을 사용한다.

```powershell
Set-Location C:\dev\Samhan-Public
1..6 | ForEach-Object {
  $prefix = '{0:d2}-' -f $_
  $before = Get-ChildItem .\docs\qa\896-parity-run2\sheet\run2\$prefix*.json
  $after = Get-ChildItem .\docs\qa\896-post-migration-output\$prefix*.json
  if ((Get-FileHash $before).Hash -ne (Get-FileHash $after).Hash) {
    Write-Output "DIFF: $($before.Name)"
  }
}
```

출력이 한 줄이라도 있으면 불합격이다. 총액만 같은 것도 불합격이며 구성품 모델·수량·단가·행합계가 모두 같아야 한다.

### 5.2 금액 회귀 0의 증명 범위

금액 회귀 0은 두 층으로 증명한다.

1. **전환 자체 무변경:** 동일 DB·동일 대표 세트가·동일 옵션에서 하드코딩 계산과 데이터 계산의 271세트 상세행이 전부 같다.
2. **이관 목표 parity:** P0의 저장된 sheet 골든과 최종 DB 소비자 출력 `01`~`06`이 바이트 단위로 같다.

현재 83건 때문에 두 기준선이 서로 다를 가능성이 있다. 이 경우 둘을 동시에 0으로 만들 수 있다고 가정하면 안 된다. 먼저 전환 자체 diff 0으로 안전하게 데이터 경계를 만들고, 83건의 정본 선택을 받은 뒤 P0 parity 정책을 별도 효력일로 적용하거나 초기값을 재작성해야 한다. 어느 쪽을 택할지는 다음 절에서 확정하지 않는다.

## 6. 개발책임자 확인이 필요한 것 — 확정하지 못한 것

### 6.1 재현 불일치 83건 — 선택 필요, 본 설계안은 선택하지 않음

| 선택지 | 의미 | 대가/위험 |
|---|---|---|
| A. 현행 백엔드 무변경을 정본으로 유지 | 271세트에 현재 전역 단가 기반 가중치·고정가를 구워 즉시 상세금액 diff 0. 83건은 승인된 legacy 차이로 남김 | #1093 무변경은 충족하지만 P1 계획의 `불일치 83→0` 종료 기준과 P0 sheet parity를 충족하지 못함 |
| B. 시트 문맥값을 정본으로 즉시 전환 | 83건을 분류해 복수 그룹은 문맥 가중치, 고정부품은 문맥 고정가로 적재 | P0 parity 가능성이 높아지지만 현재 백엔드 상세금액이 바뀔 수 있어 “전환 직후 한 건도 안 바뀜”과 충돌할 수 있음 |
| C. 2단계 효력 정책 | 첫 정책은 A로 무변경 전환하고, 승인된 기준일부터 B 성격의 정책으로 전환 | 즉시 무변경과 향후 parity를 분리할 수 있으나 구성행 가중치도 버전화해야 할 가능성이 생겨 현재 최소 스키마보다 커지고 소비자가 기준일을 반드시 전달해야 함 |

83건은 먼저 P1 계획서대로 `1+1 덮어쓰기`, `복수 실내/실외`, `고정부품`, `한쪽 그룹 누락`으로 전건 분류돼야 한다. 분류 결과 없이 A/B/C를 선택하거나, 83을 일괄 비중 문제로 처리해서는 안 된다.

### 6.2 그 밖에 확정하지 못한 것과 업무 의미

1. `effective_from`을 선택할 기준일이 견적 작성일, 주문 납기일, 가격 이력 효력일 중 무엇인지 확정되지 않았다. 시스템 현재시각을 암묵적으로 쓰는 것은 금지해야 한다.
2. 비인상/인상 두 가격 벌에서 구성행 가중치가 달라질 때 가중치도 버전 관리할지, 하나의 구조 가중치로 통일할지 확정되지 않았다. 후자만 현재 최소 스키마로 표현된다.
3. 실내기 또는 실외기 한쪽이 없는 세트에서 고정가를 그대로 반환할지, 저장/전개를 거부할지 확정되지 않았다. 현재 레거시는 반환하고, 명시 override가 있는 백엔드는 예외를 던진다.
4. 비중과 고정합계가 구성행 **단가** 기준인지 `default_qty`를 곱한 **금액** 기준인지 업무 문장만으로 확정되지 않았다. 현행 `BundleExpander`는 단가 기준이므로 초기 271세트 무변경 도출은 단가 기준으로 한다.
5. 0원 자동 가중치를 균등배분 신호로 허용할지 데이터 오류로 막을지 확정되지 않았다. 본 DDL은 이관 검출을 위해 저장은 허용하지만 화면 신규 입력은 거부하는 보수적 경계를 제안한다.

위 항목 가운데 P1 계산 경로 활성화를 직접 막는 것은 83건의 정본 선택과 기준일 전달 계약이다. 나머지는 초기 271세트 무변경 검증에서 실제 충돌이 발견될 때 활성화 관문으로 승격한다.

## 7. 이번 설계 라운드의 신규 파일

- `docs/dev-reports/2026-08-08-896-p1-ratio-contract-design.md`
