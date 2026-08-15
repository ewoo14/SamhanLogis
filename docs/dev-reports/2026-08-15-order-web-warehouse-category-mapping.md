# 주문서웹 창고 결정 — 레거시 9조건과 품목분류 대응 정찰

> 조사일: 2026-08-15  
> 범위: `decideWarehouseCode_` 하나, 구현·설계 제안 제외  
> 정본: `docs/decisions/2026-08-15-order-web-warehouse-by-category.md:1-61`  
> DB: 로컬 공유 `product_db`, 모든 조회를 `BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;`로 실행  
> 식별자: UUID는 조회 산출물과 본문에서 제외하고 모델 식별자만 사용

## 1. 결론

레거시 `HOME`/`SINGLE`에 대응하는 축은 있다. 레거시 UI는 홈멀티 행에 `section:'HOME'`을 붙이고(`tools/legacy-gas/거래처 발송 주문서/index.html:6201-6215`), 싱글 세트를 구성품으로 전개한 각 행에 `section:'SINGLE'`을 붙인다(`tools/legacy-gas/거래처 발송 주문서/index.html:6217-6242`). 우리 쪽 대응은 다음과 같다.

| 레거시 섹션 | 우리 1차 축 | 실제 값 | 우리 상세 분류 축 |
|---|---|---|---|
| `HOME` | `Product.productCategory` | `HOME_MULTI` | `classification.estimate_category=HOME_MULTI` 아래 L/M/S |
| `SINGLE` | `Product.productCategory` | `SINGLE_SET` + 전개 구성품 `SINGLE_PART` | 두 값 모두 `classification.estimate_category=SINGLE_SET` 아래 L/M/S |

근거는 `ProductCategory` 실제 enum(`services/product-service/src/main/java/com/samhanair/logis/product/domain/ProductCategory.java:8-15`), 시트 카테고리→분류 탭 매핑(`services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1817-1824`), L/M/S 모델(`services/product-service/src/main/java/com/samhanair/logis/product/domain/Classification.java:22-70`)이다. `EstimateCategory`는 주문/견적 노출 탭 축이며 실제 값은 `HOME_MULTI`, `SINGLE_SET`, `COMMERCIAL_MULTI`, `LEGACY`, `OTHER`이다(`services/product-service/src/main/java/com/samhanair/logis/product/domain/EstimateCategory.java:8-21`). `products.estimate_category` 단일 컬럼은 V18 이후 deprecated이고 신규 코드는 읽거나 쓰지 않는다(`services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:239-258`).

핵심 결과는 **현재 분류값을 아래와 같이 직접 대응시키면 레거시와 같은 집합이 아니다**이다.

- 비교 모수: 삭제되지 않은 `HOME_MULTI`/`SINGLE_SET`/`SINGLE_PART` 742개
- 레거시 이름 조건으로 상일(2): 517개
- 현재 L/M/S 분류값으로 상일(2): 495개
- 양쪽 모두 상일: 490개
- 양쪽 모두 초월(00003): 220개
- **상일(2) → 초월(00003): 27개**
- **초월(00003) → 상일(2): 5개**
- **창고가 달라지는 상품: 합계 32개**

따라서 9개 개념 조건 중 단일 분류값과 실제 집합이 모두 같은 완전한 1:1은 `1등급` 하나다. 나머지는 한 조건이 여러 분류값으로 갈라지거나, 실제 데이터 차집합이 있어 모두 `부분`이다. `없음`인 조건은 없다.

## 2. 우리 품목분류 체계와 실제 값

### 2.1 서로 다른 세 축

| 축 | 저장 위치 | 역할 | 이번 창고 결정과의 관계 |
|---|---|---|---|
| 물리 카테고리 | `products.category_id → categories` | 재고/시리얼 관리용 트리 | 너무 넓다. `INDOOR_WALL`, `INDOOR_CEILING` 등만으로 9조건 전부를 표현하지 못한다. 모델은 `services/product-service/src/main/java/com/samhanair/logis/product/domain/Category.java:19-68` |
| 시트 출처 카테고리 | `products.product_category` | 홈/싱글세트/싱글부품/상업/구형 등 출처 | 레거시 `HOME`/`SINGLE` 섹션에 대응하는 1차 축. 모델은 `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:225-232` |
| 견적 품목 L/M/S | `products.cat_l_id/cat_m_id/cat_s_id → classification` | 탭별 상세 품목분류 | 9조건의 구체 대응값이 있는 축. FK는 `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:140-158`, 스키마는 `services/product-service/src/main/resources/db/migration/V20__add_product_classification.sql:6-57` |

공유 DB의 물리 카테고리 실제 값은 `HVAC`, `INDOOR`, `INDOOR_WALL`, `INDOOR_CEILING`, `OUTDOOR`, `PIPING`, `CONTROL`, `SERVICE`, `ECOUNT_MIG2`, `UNCLASSIFIED`였다. 초기 시드 근거는 `services/product-service/src/main/resources/db/migration/V2__seed_product_categories.sql:5-12`이며, 운영 중 `SERVICE`, `ECOUNT_MIG2`, `UNCLASSIFIED`가 추가되어 있다.

### 2.2 DB 실제 분포

| `product_category` | 삭제 제외 전체 | `status=ACTIVE` | L분류 있음 | 활성 노출 있음 |
|---|---:|---:|---:|---:|
| `(NULL)` | 1,963 | 1,963 | 0 | 0 |
| `COMMERCIAL_MULTI` | 342 | 321 | 342 | 342 |
| `HOME_MULTI` | 120 | 106 | 120 | 120 |
| `OLD` | 37 | 37 | 37 | 37 |
| `SINGLE_PART` | 346 | 346 | 346 | 8 |
| `SINGLE_SET` | 276 | 209 | 276 | 276 |

이번 비교 모수 742개(`HOME_MULTI` 120 + `SINGLE_SET` 276 + `SINGLE_PART` 346)는 모두 L/M/S 분류가 있다. 상태별로는 `ACTIVE` 661, `DISCONTINUED` 64, `NOT_FOR_SALE` 14, `OUT_OF_STOCK` 3이다. 레거시 UI가 시트 행에 섹션을 부여해 판단하고 현재 카탈로그 조회도 상태 필터가 선택 사항이므로(`services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:80-125`), 본 정찰은 `is_deleted=false` 전체를 모수로 삼았다.

## 3. 9개 조건 대응표

`냉방전용`과 `냉전`은 같은 냉방 전용 개념의 두 표기로 묶어 1개 조건으로 계산했다. 따라서 홈 인피니트 1개 + 싱글 개념 조건 8개 = 9개다.

판정 기준에서 `1:1`은 **레거시 한 조건 ↔ 단일 분류값이고 실제 상품 집합도 동일**함을 뜻한다. 여러 분류값으로 갈리거나 실제 차집합이 있으면 `부분`이다.

| 레거시 조건 | 우리 분류축 | 대응 값 | 대응 여부 |
|---|---|---|---|
| `HOME` + 인피니트 | `HOME_MULTI`의 M | `실내기 > 1-Way 인피니트`, `판넬 > 인피니트` | **부분** — 2개 M값이고 실제로 레거시 23개/분류 22개 |
| `SINGLE` + 360 | `SINGLE_SET`의 L | `360` | **부분** — 단일 값이지만 실제로 레거시 32개/분류 23개 |
| `SINGLE` + 1등급 | `SINGLE_SET`의 M | `1등급` (`4way 냉난방`, `냉난방 스탠드`의 하위 M) | **1:1** — 양쪽 39개, 차집합 0 |
| `SINGLE` + 냉방전용 또는 냉전 | `SINGLE_SET`의 L | `4way 냉방전용`, `1way 냉방전용`, `냉전 스탠드`, `냉전 벽걸이` | **부분** — 실제 집합은 양쪽 96개로 같지만 하나로 통합된 분류값이 아님 |
| `SINGLE` + 1way | `SINGLE_SET`의 L | `1way 냉난방`, `1way 냉방전용` | **부분** — 실제 집합은 양쪽 33개로 같지만 2개 분류값 |
| `SINGLE` + 덕트 | `SINGLE_SET`의 L | `덕트` | **부분** — 레거시 8개/분류 7개 |
| `SINGLE` + 비스포크 | `SINGLE_SET`의 L | `비스포크 스탠드` | **부분** — 레거시 24개/분류 28개 |
| `SINGLE` + 벽걸이 | `SINGLE_SET`의 L | `냉난방 벽걸이`, `냉전 벽걸이` | **부분** — 레거시 109개/분류 94개 |
| `SINGLE` + 가정용 에어컨 | `SINGLE_SET`의 L | `가정용 에어컨` | **부분** — 레거시 231개/분류 223개 |

### 3.1 요청된 두 경계 확인

- **`냉방전용`과 `냉전`은 우리 분류에서 하나로 표현되지 않는다.** 분류 생성 로직은 냉방 전용 여부를 두 철자로 함께 인식하지만(`services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1938-1939`), 4way/1way에는 `냉방전용`, 스탠드/벽걸이에는 `냉전`이라는 서로 다른 L명을 저장한다(`services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1948-1984`). 현재 데이터 집합은 두 표기를 묶으면 96개로 동일하지만, 분류값 자체는 4개다.
- **`1way`는 모델명 일부에만 머물지 않고 실제 저장 분류값이다.** 현재 `SINGLE_SET` L에 `1way 냉난방` 15개와 `1way 냉방전용` 18개가 연결되어 있다. 다만 최초 분류 적재는 품명+모델코드의 `1way`를 읽어 이 값을 만든다(`services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1929-1939`, `1956-1958`). 즉 현재 판정에 사용할 수 있는 분류값이지만, 생성 이력은 문자열 분류에서 왔다.

## 4. 실제 상품 집합 대조

### 4.1 조건별 건수

| 조건 | 레거시 적중 | 분류 적중 | 교집합 | 레거시만 | 분류만 |
|---|---:|---:|---:|---:|---:|
| HOME 인피니트 | 23 | 22 | 22 | 1 | 0 |
| SINGLE 360 | 32 | 23 | 22 | 10 | 1 |
| SINGLE 1등급 | 39 | 39 | 39 | 0 | 0 |
| SINGLE 냉방전용/냉전 | 96 | 96 | 96 | 0 | 0 |
| SINGLE 1way | 33 | 33 | 33 | 0 | 0 |
| SINGLE 덕트 | 8 | 7 | 7 | 1 | 0 |
| SINGLE 비스포크 | 24 | 28 | 24 | 0 | 4 |
| SINGLE 벽걸이 | 109 | 94 | 94 | 15 | 0 |
| SINGLE 가정용 에어컨 | 231 | 223 | 223 | 8 | 0 |

조건별 합은 한 상품이 `벽걸이`와 `가정용 에어컨`처럼 여러 조건에 동시에 걸릴 수 있으므로 합산하면 안 된다. 주문 전체의 `some` 의미로 합집합을 비교한 결과가 517 대 495, 최종 차이 32개다. 원문은 빈 주문이면 초월을 반환하고(`tools/legacy-gas/거래처 발송 주문서/Code.js:1831-1833`), HOME/SINGLE 조건 중 하나라도 맞으면 상일(2), 아니면 초월(00003)을 반환한다(`tools/legacy-gas/거래처 발송 주문서/Code.js:1846-1872`).

### 4.2 🚨 창고가 달라지는 상품 32개

아래는 개별 상품 기준 차집합이다. 실제 주문에서는 이 상품이 들어가더라도 다른 상품이 상일 조건에 적중하면 주문 전체는 계속 상일이다. 따라서 표의 변경은 **해당 상품이 유일한 적중 후보인 주문**에서 발생한다.

#### 상일(2) → 초월(00003): 27개

| 모델 식별자 | 품명 | 현재 분류 L > M | 레거시 적중 근거 |
|---|---|---|---|
| `AR-CH01` | 무선리모컨 인피니트(솔라셀) | 부자재 > 리모컨 | HOME 인피니트 |
| `AC060CXAPBH1` | 360 CST UV 실외기 | 냉난방 스탠드 > 프레스티지 | 360 |
| `AC072CXAPBH1` | 360 CST UV 실외기 | 냉난방 스탠드 > 프레스티지 | 360 |
| `AC090CXAPBH1` | 360 CST UV 실외기 | 4way 냉난방 > 프레스티지 | 360 |
| `AC100CXAPBH1` | 360 CST UV 실외기 | 4way 냉난방 > 프레스티지 | 360 |
| `AC100CXAPHH1` | 360 CST UV 실외기 | 4way 냉난방 > 프레스티지 | 360 |
| `AC110CXAPBH1` | 360 CST UV 실외기 | 냉난방 스탠드 > 프레스티지 | 360 |
| `AC110CXAPHH1` | 360 CST UV 실외기 | 냉난방 스탠드 > 프레스티지 | 360 |
| `AC130CXAPBH1` | 360 CST UV 실외기 | 냉난방 스탠드 > 프레스티지 | 360 |
| `AC130CXAPHH1` | 360 CST UV 실외기 | 냉난방 스탠드 > 프레스티지 | 360 |
| `AC145CXAPHH1` | 360 CST UV 실외기 | 냉난방 스탠드 > 프레스티지 | 360 |
| `AC145BXADHH1` | 싱글 덕트 실외기 | 냉난방 스탠드 > 프리미엄/디럭스 | 덕트 |
| `AR06A9170HNQ` | 24년형 가정용 에어컨 유풍 화이트 벽걸이 | 기타 | 벽걸이, 가정용 에어컨 |
| `AR06B9150HNQ` | 24년형 가정용 에어컨 무풍 화이트 벽걸이 | 기타 | 벽걸이, 가정용 에어컨 |
| `AR06D9151HNQ` | 24년형 가정용 에어컨 무풍갤러리 화이트 벽걸이 | 기타 | 벽걸이, 가정용 에어컨 |
| `AR60F06D1A0Q` | 가정용 에어컨 Q9000 화이트 벽걸이 | 기타 | 벽걸이, 가정용 에어컨 |
| `AR60F06D1A1Q` | 가정용 에어컨 무풍갤러리 공청 에센셜 샴페인 벽걸이 | 기타 | 벽걸이, 가정용 에어컨 |
| `AR70H06D1A1Q` | 가정용 에어컨 무풍콤보 갤러리프로 세미 에센셜 화이트 벽걸이 | 기타 | 벽걸이, 가정용 에어컨 |
| `AR80F06D2A1Q` | 가정용 에어컨 무풍갤러리 e헤파 에센셜 화이트 벽걸이 | 기타 | 벽걸이, 가정용 에어컨 |
| `AR80H06D2A1Q` | 가정용 에어컨 무풍콤보 갤러리프로 공청 에센셜 화이트 벽걸이 | 기타 | 벽걸이, 가정용 에어컨 |
| `ARR-NK3F` | 가정용 벽걸이 리모컨 | 부자재 | 벽걸이 |
| `ARR-PK8F` | 가정용 벽걸이 리모컨 | 부자재 | 벽걸이 |
| `ARR-WK8F` | 가정용 벽걸이 리모컨 | 부자재 | 벽걸이 |
| `FRC-1438XAF2` | 가정용 벽걸이 자재 | 기타 | 벽걸이 |
| `FRH-1412NA3` | 벽걸이 자재 | 기타 | 벽걸이 |
| `FRH-1412XA3` | 벽걸이 자재 | 기타 | 벽걸이 |
| `FRH-1438NH3` | 벽걸이 자재 | 기타 | 벽걸이 |

#### 초월(00003) → 상일(2): 5개

| 모델 식별자 | 품명 | 현재 분류 L > M | 분류 적중 근거 |
|---|---|---|---|
| `AC060CS6PBH1SY` | R5-TEMP-RESTORE-AC060CS6PBH1SY | 360 > CST UV | 360 분류 |
| `AC110BXAPBH3` | 무풍 4way 냉난방 프리미엄 실외기 | 비스포크 스탠드 > 프라임 핑크 | 비스포크 분류 |
| `AC110BXAPHH3` | 무풍 4way 냉난방 프리미엄 실외기 | 비스포크 스탠드 > 프라임 핑크 | 비스포크 분류 |
| `AC145BXAPHH5` | 무풍 4way 냉난방 프리미엄 실외기 | 비스포크 스탠드 > 프라임 핑크 | 비스포크 분류 |
| `AP083BXPPBH3` | 냉난방 프리미엄 스탠드 실외기 | 비스포크 스탠드 > 프라임 핑크 | 비스포크 분류 |

## 5. 기본값과 경계

| 경계 | 확인 결과 |
|---|---|
| 빈 품목 배열 | 레거시 즉시 초월 `00003` (`tools/legacy-gas/거래처 발송 주문서/Code.js:1831-1833`) |
| 하나라도 적중 | 주문 전체 상일 `2` (`tools/legacy-gas/거래처 발송 주문서/Code.js:1846-1872`) |
| 아무것도 적중하지 않음 | 주문 전체 초월 `00003` |
| HOME/SINGLE 관련 742개 중 L/M/S 분류 없음 | 0개 |
| 전체 삭제 제외 상품 중 `product_category`와 L/M/S가 모두 없음 | 1,963개 |
| 분류 없는 품목의 창고 | 9개 대응 분류값 어느 것에도 속하지 않으므로 초월 `00003`으로 떨어짐 |

물리 카테고리 `UNCLASSIFIED` 연결 상품은 2,126개로, `product_category`/L/M/S가 모두 없는 1,963개보다 많다. 즉 물리 `UNCLASSIFIED`와 이번 상세 품목분류 미지정은 같은 집합이 아니다. 창고 판정의 HOME/SINGLE 축을 물리 카테고리로 대체해서는 현재 집합을 재현할 수 없다.

## 6. 확인 한계

- DB 대조는 2026-08-15 조회 시점의 삭제되지 않은 상품 3,084개 중 HOME/SINGLE 대응 742개를 대상으로 했다. 이후 분류 수동 수정이나 시트 동기화가 발생하면 건수와 차집합은 바뀔 수 있다.
- 레거시는 주문 전송 직전 `name`을 검사한다(`tools/legacy-gas/거래처 발송 주문서/Code.js:1835-1843`, `1846-1869`). DB 대조에서는 UI 전송행의 `name`에 대응하는 `products.name`을 사용했다. 싱글은 UI가 세트를 구성품 행으로 전개한 뒤 `SINGLE`을 부여하므로(`tools/legacy-gas/거래처 발송 주문서/index.html:6217-6242`) `SINGLE_SET`과 `SINGLE_PART`를 함께 비교했다.
- 실제 과거 주문별 품목 조합 로그와 재생 데이터는 이번 범위에서 확인하지 않았다. 따라서 32개는 **상품 단위로 창고가 달라질 수 있는 전수 목록**이며, 과거 주문 몇 건이 실제로 달라졌는지는 **확인 불가**다.

