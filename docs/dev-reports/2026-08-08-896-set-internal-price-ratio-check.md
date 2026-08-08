# #896 세트 내부 단가 비율 배분 구현 확인

> 조사일: 2026-08-08 (KST)  
> 범위: `product_db`, `product-service`, 견적 저장 경로, 데스크톱 견적품목/기초품목 화면, `clients/web/estimate-app`, `tools/legacy-gas/종합견적서`, 저장된 CSV 11종  
> 방식: DB `SELECT`만 수행. 코드·DB·Docker·외부 Google Sheet는 변경하거나 재기동하지 않았다.

## 0. 결론

**부분적으로 있다.** 정확한 상태는 다음 두 문장을 함께 봐야 한다.

1. **자동 비율 배분 실행 코드는 구현돼 있다.** 싱글 세트(`SINGLE_SET`)를 구성품으로 전개할 때 세트 단가에서 고정부품 절대 단가를 먼저 빼고, 나머지를 가정용은 실내기:실외기 **6:4**, 비가정용은 **4:6**으로 자동 배분한다. 견적 저장 경로가 이 코드를 실제 호출한다.
2. **세트별 비율을 저장·편집하는 기제는 없다.** `product_db`에 가격 비율/지분/가중치 컬럼이 없고, 데스크톱 화면에도 비율 필드가 없다. 6:4/4:6은 `BundleExpander`와 두 레거시 화면 코드에 하드코딩된 공통 정책이다. 상업멀티는 이 재배분을 하지 않는다.

따라서 개발책임자 답변의 “세트 내부에서는 자동으로 몇 대 몇 비율”을 **싱글 세트 공통 6:4/4:6 자동 계산**이라는 뜻으로 보면 구현돼 있다. 반면 **세트마다 별도 비율을 설정하는 기능**이라는 뜻이면 구현돼 있지 않다.

## 1. ① 세트 내부 구성품 단가를 비율로 배분하는 기제가 있는가

### 1.1 있다 — 싱글 세트 런타임 자동 배분

견적 저장의 실제 호출 사슬은 다음과 같다.

- `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java:85-87` — BUNDLE 견적 라인은 `product-service` 전개 결과로 저장하고, 요청 단가를 배분 기준으로 쓴다고 명시한다.
- 같은 파일 `:132-150` — `productClient.expand(..., unitPrice)`를 호출하고 반환된 구성품별 `unitPrice`를 견적 라인 단가로 사용한다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ProductClient.java:306-325,338-343` — 화면 단가를 `setUnitOverride`로 담아 `POST /products/internal/expand`를 호출한다.
- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductInternalController.java:310-334` — 이 endpoint가 `BundleExpander.expand()`를 호출한다. 주석에도 “옵션 선별 + 6:4 재배분”과 “화면 단가 base”가 명시돼 있다.

실제 계산은 `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java`에 있다.

- `:82-86` — 기준 세트 단가는 화면의 `setUnitOverride`, 없으면 부모 `Product.deliveryPrice`이다.
- `:98-120` — 구성 관계를 읽고 각 구성품의 초기 단가는 해당 구성품 `Product.deliveryPrice`로 잡는다.
- `:123-129` — `ProductCategory.SINGLE_SET`만 `redistribute()`한다. 다른 세트는 구성품 개별 단가를 유지한다.
- `:298-317` — 선택된 구성품을 실내기·실외기·고정부품으로 나눈다. 가정용 벽걸이 실내기 본체도 고정부품 쪽으로 옮겨 원단가를 유지한다.
- `:326-335` — 가정용은 `ratioIn=6`, `ratioOut=4`, 비가정용은 `4`, `6`으로 정하고 고정부품 합계를 선차감한 뒤 양 그룹에 배분한다.
- `:338-363` — 한 그룹 안에 구성품이 여러 개면 **기존 구성품 절대 단가 비례**로 다시 나누고, 기존 단가 합이 0이면 균등 배분하며, 마지막 행이 잔차를 흡수한다.
- `:365-393` — 세트 잔액을 비율로 나누고 천 원 단위로 반올림·보정한다.
- `:503-516` — 전개 옵션에는 패널·리모컨·자재와 `setUnitOverride`만 있고 비율 입력은 없다.

통합 테스트도 이 계약을 고정한다.

- `services/product-service/src/test/java/com/samhanair/logis/product/it/BundleExpanderIT.java:115-127` — 가정용 1,000,000원을 실내 600,000원, 실외 400,000원으로 검증한다.
- 같은 파일 `:131-142` — 비가정 4way를 실내 400,000원, 실외 600,000원으로 검증한다.
- 같은 파일 `:434-453` — 복수 실내기를 기존 200,000:100,000의 비율로 400,000:200,000으로 배분하고 총액 보존을 검증한다.

### 1.2 없다 — 세트별 저장/편집 비율

`product_db`의 `information_schema.tables`로 확인한 public 기본 테이블 전수는 21개다.

```text
branch_pipe_lookup
bundle_component
categories
classification
ecount_alias_reservations
flyway_schema_history
material_price
odu_recommendation_lookup
price_change_schedule
price_history
product_aliases
product_audit_logs
product_edit_requests
product_estimate_exposure
product_sheet_sync_generation
product_spec
products
quantity_sync_rule
quantity_sync_source
quantity_sync_target
spec_key_template
```

이 가운데 세트·구성품·견적품목·단가와 직접 관련된 구조는 다음과 같다.

| 테이블 | 관련 컬럼 | 판정 |
|---|---|---|
| `bundle_component` | `bundle_product_id`, `component_product_code`, `default_qty`, `qty_mode`, `component_kind`, `component_variant`, `is_default`, `spec_text`, `display_order` | 구성·수량·종류·특징만 있다. 가격·비율 없음 |
| `products` | `product_type`, `bundle_mode`, `release_price`, `delivery_price`, `set_material_key`, `fixed_discount_rate`, `estimate_category`, `display_order` 등 | 제품 전역 가격만 있다. 세트-구성품 문맥 비율 없음 |
| `product_estimate_exposure` | `product_id`, `estimate_category`, `display_order` | 견적 노출·순서만 있다 |
| `price_history` | `product_id`, `effective_date`, `release_price`, `delivery_price`, `set_material_key` | 제품·시점별 전역 가격만 있다 |
| `material_price` | `material_key`, `name`, `price`, `option_label`, `computed_formula` | 자재 절대 가격/수식이며 구성품 배분 비율이 아니다 |
| `price_change_schedule` | `category`, `effective_date`, `default_pre_change` | 가격 버전 선택 시점/기본값이며 배분 비율이 아니다 |
| `quantity_sync_rule` | `rule_key`, `estimate_category`, `aggregation`, `condition_json` 등 | 수량 동기화 규칙이다 |
| `quantity_sync_source` | `rule_id`, `source_product_id`, `factor` | 수량 계수이며 가격 비율이 아니다 |
| `quantity_sync_target` | `rule_id`, `target_product_id`, `multiplier`, `rounding_mode` | 수량 배수이며 가격 비율이 아니다 |

전체 public 컬럼명에서 `ratio/share/weight/factor/multiplier/percent/allocation/distribution/proportion` 계열을 검색했을 때 가격 배분 후보는 없었다. 나온 것은 `quantity_sync_source.factor`, `quantity_sync_target.multiplier`, 그리고 이름만 우연히 일치하는 `product_sheet_sync_generation.generation`뿐이다. `product_spec.spec_key`와 `products.tags`에도 가격/비율/배분 계열 활성 키는 0건이었다.

### 1.3 상업멀티에는 비율 배분이 없다

- `BundleExpander.java:123-129` — 싱글 세트가 아니면 `redistribute()`를 호출하지 않는다.
- `BundleExpanderIT.java:398-415` — 상업멀티 구성품 4,000,000원과 1,500,000원을 그대로 유지하는 테스트가 있다.
- `EstimateCatalogInternalController.java:291-318,335-350` — 구성품 응답의 단가는 `bundle_component` 행 자체가 아니라 구성품 모델로 조인한 전역 `Product.deliveryPrice/releasePrice`이다.

즉 상업멀티의 세트 총액을 구성품 합계로 맞추는 자동 비율 배분은 현재 없다.

## 2. ② 지금 데이터가 채워져 있는가

### 2.1 세트별 가격 비율 설정 데이터

**0세트다.** 저장할 컬럼/테이블 자체가 없으며, 6:4/4:6은 데이터가 아니라 코드 상수다.

혼동하기 쉬운 수량 동기화 테이블도 현재 활성 데이터가 모두 0행이다.

| 테이블 | 활성 행 |
|---|---:|
| `quantity_sync_rule` | 0 |
| `quantity_sync_source` | 0 |
| `quantity_sync_target` | 0 |

따라서 이 테이블의 `factor`/`multiplier`가 현재 가격 배분 값을 대신하고 있지도 않다.

### 2.2 하드코딩 정책이 적용될 수 있는 현재 세트 수

현재 DB의 활성 데이터 실측은 다음과 같다.

| 항목 | 수 |
|---|---:|
| 활성 `products` | 3,083 |
| 활성 BUNDLE | 344 |
| `SINGLE_SET` + BUNDLE + EXPAND | 272 |
| 위 272세트 중 활성 구성품 보유 | 272 |
| 위 272세트 중 `INDOOR`와 `OUTDOOR` 종류를 모두 보유 | 271 |
| `COMMERCIAL_MULTI` + BUNDLE + EXPAND | 72 |
| 활성 `bundle_component` | 1,598 |

따라서 저장된 “비율 설정 세트”는 0이지만, 코드상 공통 정책의 현재 구조 후보는 싱글 세트 272개이고 그중 실내·실외 종류가 모두 있는 세트는 271개다. 이 수치는 구조 후보 수이지 실제 견적에서 한 번이라도 전개됐다는 사용 이력 수가 아니다. 옵션 필터링 뒤 실제 적용된 세트 수는 이번 자료로 확정할 수 없다.

가격 데이터는 전역 형태로는 채워져 있다.

| 항목 | 활성 행 |
|---|---:|
| `price_history` | 2,201 (`2000-01-01` 1,082 + `2026-04-01` 1,119) |
| `material_price` | 28 |
| `price_change_schedule` | 4 |
| `product_estimate_exposure` | 863 |

활성 구성 관계 1,598행 중 1,596행은 활성 구성품 제품으로 조인되고 `delivery_price`가 존재한다. 미해소 구성품은 2행이다. 그러나 이 가격은 세트 문맥 가격이 아니라 구성품 제품의 전역 가격이다.

## 3. ③ 비율 설정 자리에는 지금 무엇이 있는가

### 3.1 싱글 세트

싱글 세트 총액은 다음 순서로 나뉜다.

1. 화면 견적 단가(`setUnitOverride`)를 대표 세트 단가로 사용한다. 없으면 부모 제품의 `delivery_price`를 쓴다.
2. 패널·리모컨·자재 옵션으로 포함 구성품을 고른다.
3. 고정부품은 각 구성품 제품의 전역 `delivery_price`를 그대로 유지하고 그 합계를 대표 세트 단가에서 먼저 뺀다.
4. 남은 금액을 가정용 6:4, 비가정용 4:6으로 실내/실외 그룹에 나눈다.
5. 그룹 안에 여러 구성품이 있으면 각 구성품의 기존 전역 `delivery_price`를 가중치로 사용한다. 전부 0이면 균등 배분한다.
6. 천 원 단위 반올림 후 마지막 구성품이 잔차를 흡수해 세트 총액을 보존한다.

### 3.2 상업멀티·KEEP·단품

- 상업멀티: 세트 총액을 나누지 않는다. 구성품 모델별 전역 `delivery_price`를 그대로 반환한다 (`BundleExpander.java:123-135`).
- BUNDLE `KEEP`: 부모 세트 한 줄과 부모 세트 단가만 반환한다 (`BundleExpander.java:89-95`).
- 단품: 제품 한 줄과 해당 단가만 반환한다 (`BundleExpander.java:89-91`).

### 3.3 데스크톱 화면에서 편집 가능한 필드

#### 견적품목 관리 `/products/estimate-items`

`clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:1021-1129`의 실제 표 필드는 모델명, 품목명, 분류, 카테고리, 노출 설정, 변동DC, 고정DC%, 표시순서, 세트 여부다. 페이지 설명도 기초품목 참조·판매 노출·표시순서 관리라고 되어 있다 (`:1149-1152`).

**구성품 단가, 납품가 오버라이드, 비율, 가중치 편집 필드는 없다.**

#### 기초품목 관리 `/products/catalog` → 품목 상세

- 가격: 판매가, 매입가, 출고가, 배송가를 제품 단위로 편집한다 (`ProductFormPage.tsx:804-845`). DB의 `delivery_price`는 이 화면에서 “배송가”로 표기된다.
- 세트 구성품: 모델코드, 수량, 종류를 편집하고 행을 추가·삭제한다 (`ProductFormPage.tsx:940-966`).
- API DTO에는 `qtyMode`, `componentVariant`, `isDefault`, `specText`, `displayOrder`도 존재한다 (`productCatalogApi.ts:248-290`). 그러나 현재 구성품 편집 UI에 노출되는 것은 모델코드·수량·종류뿐이다.
- 가격 비율/지분/가중치 필드는 UI와 DTO 모두 없다.

## 4. ④ 레거시 시트/GAS는 어떻게 하는가

### 4.1 실제 CSV 확인 결과

확인한 로컬 스냅샷은 다음 경로다.

```text
C:/Users/user/AppData/Local/Temp/claude/C--dev-Samhan-Public/
  cdbb83c4-61fe-4c24-ba6f-7688e70e25fa/scratchpad/live_sheet/
  cdbb83c4-61fe-4c24-ba6f-7688e70e25fa/scratchpad/live_sheet_inc/
```

- 접미사 없는 6종 최종 수정: 2026-08-08 15:34:51~15:46:55 KST
- `_단가인상` 5종 최종 수정: 2026-08-08 15:47:24~15:47:28 KST
- Google Sheet에는 접근하지 않았고 위 파일만 열었다.

**가격 배분용 비율 열은 없다. 구성품마다 절대 금액이 적혀 있다.**

주요 원시 열은 다음과 같다.

| CSV | 구성/가격 열 | 실제 값 형태 |
|---|---|---|
| `싱글 구성품.csv` 및 `_단가인상` | C 모델명, F 출고가, H/I 중복 납품가, M 세트, N 구성품 특징 | 구성품 행마다 원 단위 절대 출고가·납품가 |
| `상업멀티 구성.csv` 및 `_단가인상` | B 모델명, D 출고가, F 납품가, I 세트 | 구성품 행마다 원 단위 절대 출고가·납품가 |

`싱글 구성품`의 세트 연결 행 1,451개 중 마지막 납품가(I열)에 절대 금액이 있는 행은 1,449개다. 같은 구성품 모델이 세트 문맥별로 서로 다른 마지막 납품가를 가진 모델 그룹은 이 탭만 보면 105개다. 예:

- `AC060CXAPBH1`: CSV 4행 `AC060CS6PBH1SY`에서 910,000원, 144행 `AC060CS4PBH2SY`에서 820,000원, 657행 `AP060CAPPBH1S`에서 900,000원.

여섯 탭의 모든 양수 출고가·모든 납품가 셀을 `(모델, 가격필드)`로 묶어 다시 센 결과는 개발책임자 요청의 선행 수치와 일치했다.

| 벌 | 고유 `(모델, 가격필드)` 그룹 | 문맥별 복수 절대값 그룹 |
|---|---:|---:|
| 접미사 없는 6종 | 2,226 | **141** |
| `_단가인상` 5종 + 공통 `구형` | 2,226 | **132** |

예를 들어 `PC6NUNK1NW` 납품가는 접미사 없는 `홈멀티` 70행에서 104,060원이고 `싱글 구성품`의 여러 세트 행에서는 128,000원이다. 이것은 저장된 가격 비율이 아니라 문맥별 절대값이다.

`상업멀티 구성`의 세트 연결 행은 188개이고 188개 모두 절대 납품가가 있다. 이 탭 안에서는 같은 모델의 복수 납품가 그룹이 0개다.

`홈멀티`와 `상업멀티` 상단에 `조합비`라는 비율성 문자열은 있지만, 구성품 가격 행의 배분 열이 아니며 `explodeSetParts()`가 읽는 가격 비율 원천도 아니다. `고정DC` 역시 할인율이지 세트 총액의 구성품 지분이 아니다.

### 4.2 레거시 코드가 절대 금액과 하드코딩 비율을 함께 쓰는 방식

#### CSV 파싱

- `tools/legacy-gas/종합견적서/Code.js:620-643` — 중복 `납품가` 중 마지막 열을 `price`, `출고가`를 `listPrice` 절대값으로 읽는다.
- `clients/web/estimate-app/lib/code.js:931-978` — 동일하게 마지막 `납품가`를 구성품 `price`로 읽고, `setModel`·특징과 같은 행에 보존한다.
- 두 코드의 `SINGLE_PARTS_NAME`은 현재 저장소 사본 기준 `_단가인상` 탭이다 (`tools/.../Code.js:52`, `clients/web/estimate-app/lib/code.js:131`). 저장된 라이브 정본 전환이 이 저장소 사본에 반영됐는지는 이 조사만으로 확정하지 않는다.

#### 싱글 세트 전개

- GAS 사본 `tools/legacy-gas/종합견적서/index.html:4780-4832` — 선택된 구성품의 초기 단가를 시트의 절대 `partUnitPrice(p)`로 잡는다.
- 같은 파일 `:4839-4867` — 가정용 6:4, 비가정용 4:6을 하드코딩하고 고정부품 절대 단가 합계를 선차감한다.
- 같은 파일 `:4869-4885` — 그룹 내 복수 구성품은 시트 절대 단가 비례로 나눈다.
- `clients/web/estimate-app/views/index.ejs:5199-5252,5259-5287,5289-5305` — 웹 견적앱에도 같은 계산이 있다.
- `tools/.../index.html:3077-3103` — 잔액 비율 배분과 천 원 단위 보정 함수다.

즉 레거시의 원천 시트는 **비율 열을 저장하지 않고 구성품별 절대 금액을 저장**한다. 실행 시 싱글 세트에 한해서 그 절대 금액을 고정부품 금액·그룹 내부 가중치로 쓰면서, 실내/실외 그룹 총액은 코드 상수 6:4 또는 4:6으로 다시 계산한다.

#### 상업멀티 전개

- GAS 사본 `tools/.../index.html:6791-6829` — 구성품별 `getRealCommPrice(p.model)` 절대 단가를 그대로 반환한다.
- 웹 견적앱 `clients/web/estimate-app/views/index.ejs:7221-7263` — 동일하다.

상업멀티에는 세트 총액 비율 배분이 없다.

## 5. 확정하지 못한 것

1. 개발책임자의 “몇 대 몇 비율”이 현재 공통 6:4/4:6을 뜻하는지, 아니면 세트마다 별도 비율을 저장해야 한다는 뜻인지는 문장만으로 확정할 수 없다. 현재 구현 상태만 분리해 보고했다.
2. 싱글 구성품 CSV의 제목이 같은 두 `납품가` 열 중 첫 열의 업무 의미는 코드와 CSV에 설명이 없어 모른다. 현재 파서는 마지막 열만 실행 가격으로 쓴다.
3. 현재 DB의 271개 구조 후보가 실제 업무 견적에서 모두 한 번 이상 전개됐는지는 사용 이력을 조회하지 않아 모른다.
4. 옵션 선택 뒤 실내기 또는 실외기가 빠져 재배분이 실행되지 않거나 오류가 나는 실제 세트가 몇 개인지는 정적 구조 수만으로 확정할 수 없다.
5. 저장소의 GAS/웹앱 사본은 `_단가인상`을 기본 탭으로 지칭한다. 핸드오프에 기록된 라이브 정본의 접미사 없는 탭 전환이 현재 저장소 사본에 반영되지 않은 이유와 실제 운영 배포 SHA는 이번 로컬 읽기 전용 조사로 확정하지 못했다.

## 6. 신규 파일

- `docs/dev-reports/2026-08-08-896-set-internal-price-ratio-check.md`
