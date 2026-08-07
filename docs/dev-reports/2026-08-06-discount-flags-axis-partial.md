# 정액 할인 분류 축 조사 — **부분 산출물** (세션 종료로 미완)

> 2026-08-06 회사PC 세션. 워크플로우가 세션 종료로 중단됐고 **축조사 일부만** 회수했다.
> 후속 단계(모델명 판별 ↔ 기존 데이터 대조 · 편집 UI 작업량 · 결정용 정리표)는 **미실시**다.

## 개발책임자 지시 (2026-08-06)

> *"기존 레거시 GAS 코드는 모델명을 기준으로 할인액 카테고리를 특정했는데 그렇게 되면 추후에 모델명 체계가 바뀔때 서버를 바꿔야하는 단점이 있음. 하여 품목별로 분류가 들어가 있으니 이를 기준으로 **견적품목 메뉴에서 편집이 가능하도록** 바뀌게 하기를 원함."*

📌 개발책임자 결정: **분류 축을 먼저 정리해 올릴 것.**

## PM 이 이미 확정한 것 (다시 재도 되지만 시작점)

```text
그 목적의 컬럼이 이미 있다 — 설계는 있고 배선이 없다
  Product.java:146-150
    "DOMAIN-EXTENSIONS §1 + getModelFlags 7 prefix 정규식 — 6-bit bitset
     (is360/is4way/is1way/isStand/isDeluxe/isGrade1). 0/1 char 6 자리 문자열."
    @Column(name = "discount_flags", nullable = false, length = 20)
    private String discountFlags = "000000";
  Product.java:639  changeDiscountFlags(String flagsBits)  — 6자 아니면 "000000"

실 데이터   '000000' 3,053건 · '100000' 8건
소비처      slip-service · dc-config-service 에서 grep 0건

다른 축     product_estimate_exposure.estimate_category
            CHECK: HOME_MULTI · SINGLE_SET · COMMERCIAL_MULTI · LEGACY · OTHER  (5종)
            UNIQUE(product_id, estimate_category) — 한 품목이 여러 분류를 가질 수 있다

레거시 판별  종합견적서/index.html:2200-2226 getModelFlags(model) — 모델코드 문자 위치
레거시 적용  :2992 adjustSingleSetBasePrice 가 **세트 base price** 에서 정액을 뺀다
             :4765 싱글세트 경로는 home_rate/comm_rate 를 쓰지 않는다
```

## 🚨 집PC 가 반드시 확인할 것

**시트 sync 가 사람이 편집한 값을 덮어쓰는가.** 견적품목 메뉴에서 편집해도 다음 sync 에 날아가면 이 설계가 성립하지 않는다.
선례: `variableDiscountManualOverride`(V19, 2026-06-17)가 같은 문제를 이미 푼 방식이다 — `ProductSheetSyncService` upsert 경로에서 시트 기준 덮어쓰기를 막는다.

그리고 **전환 시 금액이 달라지는 품목이 몇 건인지**를 실 데이터로 세야 한다. 현재는 모델명 판별로 정액이 붙고(`#1077` R8), `discount_flags` 기준으로 바꾸면 초기값에 따라 붙던 것이 안 붙거나 반대가 된다.

⚠️ `#1077` R10 이 찾은 **정액 이중 적용**(API·화면에서 각 한 번)이 먼저 닫혀야 이 축의 금액 비교가 의미를 갖는다.

---

## 회수 1

조사 완료했습니다. PM 전제 중 두 가지가 틀렸고, 개발책임자 제안을 데이터가 강하게 뒷받침합니다.

---

# `products.discount_flags` 전 생애 추적

## 🚨 먼저 — PM 전제 오류 2건

**오류 1 — "소비처 slip-service · dc-config-service 에서 grep 0건" → 소비처는 살아 있습니다.**

`dc-config-service` 에서 `discountFlags` 문자열 grep 이 0인 건 맞지만, **6비트를 풀어낸 boolean 으로** 소비합니다.

```
PartnerOrderConfirmService.java:192    String discountFlags = resolveDiscountFlags(p);
                          :204-206     discountFlag(discountFlags, 0) ... discountFlag(discountFlags, 5)
                                            ↓ DcConfigClient.PriceLine
PriceCalculationRequest.java:32-37     boolean is360, is4Way, is1Way, isStand, isDeluxe, isFirstGrade
PriceCalculationService.java:130-135   if (line.is360()) sum = sum.add(nz(config.getDiscount360Amount()));
                                       ... 6종 정액 차감
```

`slip-service` 는 0건 맞습니다(재확인).

**오류 2 — 실 데이터 건수.** `'000000' 3,053건`은 `is_deleted=false` 기준입니다. 전체는 **3,055건**(soft-deleted 2건 포함). `'100000' 8건`은 정확합니다.

---

## 1. 언제·어떻게 생겼는가

| 항목 | 실측 |
|---|---|
| 위치 | `services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:25` |
| 원문 | `ADD COLUMN discount_flags VARCHAR(20) NOT NULL DEFAULT '000000',  -- 6-bit (is360,is4way,is1way,isStand,isDeluxe,isGrade1)` |
| 도입 커밋 | `c72de707f` · **2026-05-05** · `feat(product): M1a — 시트 27탭 → 8 entity 시드 (dry-run + IT)` |

`git log -S "discount_flags"` 결과가 이 커밋 1건뿐 — 도입 이후 **컬럼 정의는 한 번도 수정되지 않았습니다.**

## 2. 누가 값을 쓰는가

`changeDiscountFlags` 호출부 **전수**(`rg --no-ignore`, build/node_modules 제외):

| 호출부 | 성격 |
|---|---|
| `ProductSheetSyncService.java:1260` | 시트 sync **insert** 경로 |
| `ProductSheetSyncService.java:1324` | 시트 sync **update** 경로 |
| `ProductMasterEntityIT.java:63` | 테스트 (`"100010"`) |

**즉 실 writer 는 시트 sync 단 하나입니다.** import·admin API·seed 모두 아님:

- `HvacProductSeeder.java:435,482` 는 raw SQL 로 `product.getDiscountFlags()` 를 INSERT 하지만 `changeDiscountFlags` 를 호출하지 않아 **항상 default `'000000'`** 을 넣습니다.
- **admin/API writer 없음** — `web/dto/` 48개 파일 중 `discountFlags` 를 가진 **Request DTO 가 0개**입니다. `UpdateProductFixedDiscountRequest` · `UpdateProductVariableDiscountRequest` · `FixedDiscountRateBulkRequest` 는 있는데 flags 용은 없습니다.

### `'100000'` 8건의 출처

```
model_code       product_category   created_at                  created_by
AM360AXVGHC1SY   COMMERCIAL_MULTI   2026-06-18 07:45:11.35732   system
AM360AXVGHH1SY   COMMERCIAL_MULTI   2026-06-18 07:45:10.887814  system
AM360AXVHHH1SY   COMMERCIAL_MULTI   2026-06-18 07:45:09.808358  system
AM360AXVHHR1SY   COMMERCIAL_MULTI   2026-06-18 07:45:16.668491  system
AM360AXVHJH1SY   COMMERCIAL_MULTI   2026-06-18 07:45:17.276193  system
AM360AXVSHH1SY   COMMERCIAL_MULTI   2026-06-18 07:45:10.360282  system
AM360AXVUHH1SY   COMMERCIAL_MULTI   2026-06-18 07:45:16.097769  system
AM360NXGGBH1S    COMMERCIAL_MULTI   2026-06-18 07:45:15.677456  system
```

**2026-06-18 07:45:09~17 (8초)·`created_by='system'` = 시트 sync 1회 실행분.** 모델코드에 문자열 `360` 이 들어 있어 걸렸습니다.

### 🔑 writer 의 규칙이 레거시와 다릅니다

`VariableDiscountDetector.java:41-46` (DB 에 쓰는 규칙) — **부분문자열 정규식**:
```java
P_360   = ".*360.*"        P_STAND  = ".*(stand|스탠드).*"
P_4WAY  = ".*4way.*"       P_DELUXE = ".*(deluxe|디럭스).*"
P_1WAY  = ".*1way.*"       P_GRADE1 = ".*(1등급|grade.?1|G1).*"
```

레거시(`종합견적서/index.html:2200-2226`)는 **문자 위치** `m[7]`/`m[8]`/`m[10]` 판정입니다. 완전히 다른 알고리즘입니다.

## 3. 누가 값을 읽는가 (PM 전제와 다름)

| 소비처 | 파일:줄 | 내용 |
|---|---|---|
| partner-order **확정 가격 계산** | `PartnerOrderConfirmService.java:192,204-206` | 6비트 → PriceLine 전사 |
| partner-order 폴백 | `PartnerOrderConfirmService.java:365-411` | 저장값이 `000000`이면 **모델명으로 재계산** |
| dc-config 정액 차감 | `PriceCalculationService.java:130-135` | 6종 금액 합산 차감 |
| client DTO | `ProductClient.java:219`, `ProductSummary.java:28` | 응답 파싱 |
| slip-service | — | **0건 (확인)** |
| estimate-app | — | **0건** — 자체 `getModelFlags` 사용 |
| order-app/src | — | 0건 |
| desktop | `sales.ts:73` | **타입 선언만**, 로직 사용 0 (`mock.ts` 는 전부 `null`) |

## 4. 비트 순서 — **정의돼 있습니다** (미정의 아님)

**4곳이 일치**하며 Javadoc 순서 = 실제 순서입니다.

| idx | 플래그 | 차감 금액 (`dc_configs`) |
|---|---|---|
| 0 | is360 | `discount_360_amount` |
| 1 | is4Way | `discount_4way_amount` |
| 2 | is1Way | `discount_1way_amount` |
| 3 | isStand | `discount_stand_amount` |
| 4 | isDeluxe | `discount_deluxe_amount` |
| 5 | isFirstGrade | `discount_first_grade_amount` |

근거: 마이그레이션 주석 `:25` · 쓰기 순서 `VariableDiscountDetector.java:116-121` · 전사 `PartnerOrderConfirmService.java:204-206` · 수신 `PriceCalculationRequest.java:32-37` · 적용 `PriceCalculationService.java:130-135`.

⚠️ 단 **검증은 없습니다** — `Product.java:640` 은 길이 6만 봅니다:
```java
this.discountFlags = (flagsBits == null || flagsBits.length() != 6) ? "000000" : flagsBits;
```
`"abcdef"` 도 그대로 저장됩니다. (읽는 쪽 `:366` 은 `matches("[01]{6}")` 로 거르므로 조용히 폴백)

## 5. DTO·API 노출

**응답 전용 · 편집 불가.** `ProductSummaryResponse.java:46` · `ProductCatalogResponse.java:59` 에 노출되지만 대응 Request DTO 가 없습니다.

---

# 🔑 셋째 가능성 — 실측으로 드러난 3가지

## (A) 저장값이 레거시와 **양방향 전면 불일치**

레거시 `getModelFlags` 를 SQL 로 재현해 실 데이터와 대조했습니다(SQL 은 `index.html:2200-2226` 원문과 줄 단위 대조 완료 — AP230/AP290 예외 포함).

```
모델코드 9자 이상 활성 품목 2,826건
  레거시가 비트를 세우는 건수 : 333
  저장값과 불일치            : 341
```

방향별:
- **333건**: 레거시는 비트를 세우는데 저장은 `000000`
- **8건**: 저장은 `100000` 인데 레거시는 `000000` — `AM` 으로 시작해 `AC`/`AP` 조건에 안 걸림

**교집합이 0입니다.** 비트가 선 8건과 서야 할 333건이 완전히 어긋나 있습니다.

## (B) 그 8건은 **계산에서 무시되는 자리**에 있습니다

`PriceCalculationService.java:126-128`:
```java
if ("HOMEMULTI".equals(line.category()) || "COMMERCIAL_MULTI".equals(line.category())) {
    return BigDecimal.ZERO;   // 멀티는 6종 정액 미적용
}
```

비트가 선 8건은 **전부 COMMERCIAL_MULTI** → 차감 0.
비트가 필요한 **SINGLE_SET 276건은 전부 `000000`** (`flags_zero = 276 / 276`).

⟹ **`discount_flags` 는 현재 실질적으로 전량 무효입니다.** 그런데도 아무도 아프지 않았던 이유가 (C)입니다.

## (C) 같은 판정이 **4곳**에 구현돼 있고, DB 를 쓰는 쪽만 다릅니다

| # | 위치 | 알고리즘 | 역할 |
|---|---|---|---|
| 1 | `tools/legacy-gas/종합견적서/index.html:2200` | 문자위치 | 레거시 원본 |
| 2 | `clients/web/estimate-app/views/index.ejs:2334` | 문자위치 — **1과 byte-identical** | 견적 화면 정액 차감 (`:3262`, `:3375`, `:4393`) |
| 3 | `PartnerOrderConfirmService.java:369-411` | 문자위치 — 1과 동일 | `000000` 일 때 **서버 폴백** |
| 4 | `VariableDiscountDetector.java:111-123` | **부분문자열 정규식 — 다름** | **DB 에 쓰는 유일한 주체** |

**4번이 DB 를 채우고, 1·2·3 이 실제 금액을 계산합니다.** DB 값이 틀려도 3번 폴백이 모델명으로 재계산해 덮으므로 증상이 드러나지 않았습니다.

⟹ **개발책임자가 없애려는 "모델명 기준 판정" 이 서버(`:369-411`)와 견적 화면(`index.ejs:2334`)에 그대로 살아 있고, `discount_flags` 는 그것을 대체하지 못한 채 방치돼 있습니다.**

## (D) 개발책임자 제안의 실현성 — **분류축이 이미 6종을 담고 있습니다**

SINGLE_SET 276건을 `cat_l`(대분류)/`cat_m`(중분류) 와 레거시 판정으로 교차집계:

| 레거시 | 대분류 / 중분류 | 건수 | 일치도 |
|---|---|---|---|
| is360 | `360` / CST UV | 10 | **10/10 완전일치** |
| is1way | `1way 냉방전용`(6) + `1way 냉난방`(5) | 11 | **11/11 완전일치** |
| is4way | `4way 냉난방`(21) + `4way 냉방전용`(6) | 27 | **27/27 완전일치** |
| isGrade1 | 중분류 `1등급` (4way 10 + 냉난방스탠드 4) | 14 | **14/14 완전일치** |
| isStand / isDeluxe | `*스탠드` 대분류 | 35 / 3 | **1개 셀만 불일치** ↓ |
| (없음) | 가정용/벽걸이/실링/덕트/부자재 | 176 | 할인 대상 아님 — 정상 |

**유일한 예외 = `냉난방 스탠드 / 프리미엄/디럭스` 14건**. 중분류 이름이 프리미엄과 디럭스를 한 칸에 묶어놔서 갈립니다:

```
AP072BAPDBH2S · AP130BAPDBH2S · AP145BAPDHH2S          → isDeluxe (3)
AP052/060/072/083/110/130/145BAPP*  (9건)              → isStand
AP230DAPDHH1S · AP290DAPDHH1S                          → isStand (레거시 하드코딩 예외)
```

**이 2건(AP230/AP290)이 개발책임자 제안의 결정적 근거입니다.** 문자 규칙상 `c8='D', c11='H'` → isDeluxe 여야 하는데 레거시가 `if (m.startsWith('AP230') || m.startsWith('AP290')) { isStand = true; isDeluxe = false; }` 로 **모델명을 하드코딩해 뒤집습니다.** 어떤 규칙으로도 표현이 안 되고 **품목별 편집만이 표현할 수 있습니다.**

⟹ 중분류를 `프리미엄` / `디럭스` 로 분리하면 규칙 기반으로 **276건 중 274건이 자동 매핑**되고, 나머지 2건은 품목별 편집으로 덮으면 됩니다.

## (E) 부수 실측

- `cat_s`(소분류): SINGLE_SET 276건 **전부 NULL** (`COMMERCIAL_MULTI` 84, `HOME_MULTI` 34 만 채워짐)
- `product_category` NULL 1,942건 — 분류 3축 모두 비어 있음(이카운트 유입분 추정, **미판정**)
- `dc_configs` 259건 중 6종 금액 설정: 360=44 · 4way=49 · 1way=45 · stand=49 · deluxe=17 · grade1=10 → **50개 거래처가 실제 사용 중**(209건은 6종 전부 NULL). 금액대 20,000~70,000원

## 미판정

- estimate-app / partner-order 중 **현재 실제 배포·사용되는 견적 경로가 어느 쪽인지** — 소스는 둘 다 존재하나 배포본 확인 안 함
- `product_category` NULL 1,942건의 유입 경로
- `estimate_category` 는 `products` 컬럼과 `product_estimate_exposure` 테이블 양쪽에 존재 — 후자는 이번 조사 범위 밖

## 주요 파일 경로

- `D:\dev\Samhan-Public\services\product-service\src\main\resources\db\migration\V3__migration_extension.sql`
- `D:\dev\Samhan-Public\services\product-service\src\main\java\com\samhanair\logis\product\service\VariableDiscountDetector.java`
- `D:\dev\Samhan-Public\services\product-service\src\main\java\com\samhanair\logis\product\service\ProductSheetSyncService.java`
- `D:\dev\Samhan-Public\services\product-service\src\main\java\com\samhanair\logis\product\domain\Product.java`
- `D:\dev\Samhan-Public\services\partner-order-service\src\main\java\com\samhanair\logis\partnerorder\service\PartnerOrderConfirmService.java`
- `D:\dev\Samhan-Public\services\dc-config-service\src\main\java\com\samhanair\logis\dcconfig\service\PriceCalculationService.java`
- `D:\dev\Samhan-Public\clients\web\estimate-app\views\index.ejs`
- `D:\dev\Samhan-Public\tools\legacy-gas\종합견적서\index.html`

---

## 회수 2

모든 측정 완료. 결과입니다.

---

# 모델명 판별 실측 분포 (product_db, 2026-08-06)

## 0. PM 전제 검증 — 3건 정정

| PM 전제 | 판정 | 실측 |
|---|---|---|
| `getModelFlags` 규칙 6종 | ✅ 정확 | `tools/legacy-gas/종합견적서/index.html:2200-2227` 원문 일치 |
| `discount_flags` `'000000'` 3,053 · `'100000'` 8 | ✅ 정확 | `SELECT discount_flags, count(*) FROM products WHERE is_deleted=false GROUP BY 1` → 정확히 그 값 |
| **"소비처 slip/dc-config grep 0건"** | ⚠️ **불완전** | 두 서비스는 맞으나 **partner-order-service 가 실 소비처**: `PartnerOrderConfirmService.java:192` `resolveDiscountFlags(p)` → `:201-207` `DcConfigClient.PriceLine` 6비트 전사 |
| **"레거시 적용 = :2992 한 곳"** | ⚠️ **불완전** | `getModelFlags` 호출부 **3곳**: `:3004`(adjustSingleSetBasePrice=세트) · `:3117`(analyzeSingleSetDiscountFlags=표시) · `:4016`(**singleUnitPrice**=개별 싱글품목) |
| **"규칙은 레거시에만 있다"(암묵)** | 🚨 **틀림 — 규칙은 현행 시스템에 3벌 살아 있다** | `clients/web/order-app/index.html:1473` · `clients/web/estimate-app/views/index.ejs:2334` · `PartnerOrderConfirmService.java:377-412` (Java 이식본, AP230/AP290 예외까지 동일) |

🚨 **가장 중요한 정정 — 저장된 `discount_flags` 는 사실상 안 쓰이고, 실제로 도는 건 모델명 규칙이다.**
`resolveDiscountFlags()` (`:364-368`) 는 **저장 비트에 `'1'` 이 하나라도 있을 때만** 그것을 쓰고, 아니면 `:377-411` 의 모델명 규칙으로 재계산합니다. `'1'` 이 있는 행은 3,061 중 **8건뿐** → **3,053건(99.7%)이 런타임에 모델명 규칙으로 판정**됩니다.

저장값 vs 규칙값 대조 (SQL 실측):
```
stored_equals_rule | count
 f                 |   341   ← 333(규칙=1인데 저장 '000000') + 8(저장 '100000'인데 규칙 '000000')
 t                 |  2720
```
즉 **`products.discount_flags` 는 "값이 걸리는 모든 행에서 틀려 있다".** 8건은 전부 오탐:

```
AM360AXVGHC1SY | DVM S2 냉방전용 상부토출 36HP | 100000 | 규칙값 000000
AM360AXVGHH1SY | DVM S2 표준형 36HP           | 100000 | 규칙값 000000
... (8건 전부 AM360* / COMMERCIAL_MULTI)
```
`AM360` 의 "360" 은 **36.0HP 용량코드**이지 360 카세트가 아닙니다(품명 `36HP (18HP+18HP)`). 다만 `PriceCalculationService.java:126-128` 이 `HOMEMULTI`/`COMMERCIAL_MULTI` 카테고리면 옵션 정액을 0 으로 단락시키므로 **현재 금액 피해는 없습니다**. ⚠️ 단 `mapCategory` (`PartnerOrderConfirmService.java:337-346`) 는 **요청의 `categoryKey`** 로 판정하므로, AM360 라인이 그 둘이 아닌 키로 오면 `OTHER` → 360 정액이 차감됩니다. **호출자가 그런 키를 보내는 경로가 있는지는 미판정.**

---

## 1. 6종 각각 몇 건 (is_deleted=false, 3,061건)

| 판별 | 건수 |
|---|---|
| is360 | **27** |
| is4way | **67** |
| is1way | **54** |
| isStand | **90** (AP230/AP290 예외로 켜진 18 포함) |
| isDeluxe | **8** |
| isGrade1 | **87** |
| **아무 판별에도 안 걸림** | **2,728** |

합 333 = 판별 1개 이상 걸린 행 수(중복 없음).

## 2. 두 종 이상 겹치는 경우 — **실 데이터 0건**

```
n_flags | count
      0 |  2728
      1 |   333
```
**단 규칙상 배타적이지는 않습니다.** AC 계열은 `m[7]`(6/4/1)과 `m[8]`(P·D vs F)로 완전 배타. AP 정상 경로도 `m[8]` 이 P/D vs F 라 배타. **유일한 비배타 경로 = AP230/AP290 예외** — 이 예외는 `m[8]` 을 안 보고 `isStand=true` 를 강제하므로, `AP230…F…` 형태 모델이 생기면 **isStand + isGrade1 동시 성립**합니다. 현재 그런 행은 0건.

## 3. AP230/AP290 예외 — **18건, 그리고 이 예외가 규칙의 자기모순을 증명합니다**

18건 **전부** `m[8]='D'` · `m[10]='H'` 입니다. 예외가 없으면 18건 전부 **isDeluxe=true, isStand=false** 가 됩니다. 예외가 이걸 **정반대로 뒤집습니다**(isStand=true, isDeluxe=false).

이유는 품명에 있습니다:

| 모델 | 품명 | 규칙 자연 판정 | 예외 후 |
|---|---|---|---|
| AP230DAPDHH1S | **냉난방 프리미엄 스탠드** (납품가 4,200,000) | isDeluxe | isStand |
| AP290DAPDHH1S | **냉난방 프리미엄 스탠드** (납품가 4,650,000) | isDeluxe | isStand |

**즉 `AP230…`/`AP290…` 두 줄은 "모델코드가 업무 분류를 못 나타내서 하드코딩으로 때운 자리"입니다.** 개발책임자 지시의 근거가 코드 안에 이미 있습니다.

18건 중 견적 화면 노출(`usage_scope='BOTH'`)은 **2건**(위 두 BUNDLE), 나머지 16건은 `NONE`(실내기/실외기/부품).

## 4. `usage_scope='BOTH'` 안에서의 분포 — 실제 영향 범위

| usage_scope | 행 | is360 | is4way | is1way | isStand | isDeluxe | isGrade1 | 무판별 |
|---|---|---|---|---|---|---|---|---|
| **BOTH** | 774 | 10 | 27 | 11 | 35 | 3 | 14 | 674 |
| NONE | 2,287 | 17 | 40 | 43 | 55 | 5 | 73 | 2,054 |

**BOTH 에서 판별이 걸리는 100건은 전부 `product_category='SINGLE_SET' AND product_type='BUNDLE'`** (아래 표와 수치 완전 일치). 즉 **실 영향 범위 = 싱글세트 271건 중 100건.**

## 5. product_type / product_category 별

| product_category | product_type | 행 | is360 | is4way | is1way | isStand | isDeluxe | isGrade1 | 무판별 |
|---|---|---|---|---|---|---|---|---|---|
| (null) | SINGLE | 1,942 | 10 | 17 | 21 | 17 | 0 | 48 | 1,829 |
| SINGLE_PART | SINGLE | 345 | 7 | 23 | 22 | 38 | 5 | 25 | 225 |
| **SINGLE_SET** | **BUNDLE** | **271** | **10** | **27** | **11** | **35** | **3** | **14** | **171** |
| COMMERCIAL_MULTI | SINGLE | 270 | 0 | 0 | 0 | 0 | 0 | 0 | 270 |
| HOME_MULTI | SINGLE | 119 | 0 | 0 | 0 | 0 | 0 | 0 | 119 |
| COMMERCIAL_MULTI | BUNDLE | 72 | 0 | 0 | 0 | 0 | 0 | 0 | 72 |
| OLD | SINGLE | 37 | 0 | 0 | 0 | 0 | 0 | 0 | 37 |
| SINGLE_SET | SINGLE | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |

`product_estimate_exposure` 기준(견적 화면 실 노출)도 동일: SINGLE_SET 288행 중 100건 판별 / 188건 무판별. COMMERCIAL_MULTI 416 · HOME_MULTI 119 · LEGACY 40 은 **전부 0**.

## 6. 🚨 규칙 형식을 벗어난 품목 — **2,648건이 영원히 판별 0**

| 버킷 | 건수 | 비고 |
|---|---|---|
| 그 외 접두 (AC/AP/AR/AF 아님 — 가드 자체 탈락) | 2,172 | `AM…`, `PC…`, 숫자코드, 한글명 등 |
| **AF** (레거시 가드 `/^(AC\|AP\|AR\|AF)/` 통과하지만 `getModelFlags` 는 AC/AP 만 처리) | **333** | 가정용 에어컨 — **가드는 통과, 판별은 항상 전부 false** |
| **AR** (동상) | **141** | 벽걸이 |
| AC 길이<9 | 2 | |
| **소계 (구조상 판별 불가)** | **2,648** | |
| AC/AP 이고 길이≥9 인데 어떤 규칙에도 안 걸림 | **80** | |
| AC/AP 이고 판별됨 | 333 | |

**AF·AR 474건은 레거시 가드(`:3002`, `:4012`)를 통과해 `getModelFlags` 까지 도달한 뒤 전부 false 로 나옵니다** — 가드와 판별기의 접두 집합이 어긋나 있습니다.

싱글세트(BUNDLE 271) 내 접두 분해:

| 접두 | 행 | 무판별 |
|---|---|---|
| AF | 134 | **134 (100%)** |
| AC | 65 | 7 |
| AP | 42 | 0 |
| AR | 30 | **30 (100%)** |

AC 무판별 7건 — 여기가 진짜 공백입니다:
```
AC072BSCPBH2SY  c8=C c9=P  싱글 실링
AC090BSCPBH2SY  c8=C c9=P  싱글 실링
AC130BSCPHH2SY  c8=C c9=P  싱글 실링
AC145BSCPHH2SY  c8=C c9=P  싱글 실링
AC110CAMDBH1SY  c8=M c9=D  싱글 덕트 단상형
AC110CAMDHH1SY  c8=M c9=D  싱글 덕트 삼상형
AC145CAMDHH1SY  c8=M c9=D  싱글 덕트
```
`m[7]` 이 `C`/`M` 이라 6/4/1 어디에도 안 걸립니다. **실링·덕트는 6종 카테고리에 자리가 없고, `dc_configs` 에도 해당 정액 컬럼이 없습니다**(`discount_{360,4way,1way,stand,deluxe,first_grade}_amount` 6개뿐). 이게 "규칙이 못 담은 것"인지 "업무상 할인 대상 아님"인지는 **미판정 — 개발책임자 확인 필요**.

---

## 🔑 셋째 가능성 — **찾으시는 "분류" 는 이미 있고, 견적품목 메뉴에서 이미 편집됩니다**

`product_db.classification` (L/M/S 3단계, `products.cat_l_id/cat_m_id/cat_s_id` FK · 마이그레이션 `V20__add_product_classification.sql`).
편집 UI 이미 존재: `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:431` `분류 설정 — {modelCode}` 모달(대/중/소분류 select + 저장) → API `ProductCatalogController.java:288` `PATCH /products/{modelCode}/classification`.

**채움률(조인 키 공백 점검):** 싱글세트 BUNDLE **271/271 (100%) `cat_l_id` 보유**, `cat_m_id` 244/271, `cat_s_id` 0. `usage_scope='BOTH'` 774행도 `cat_l_id` 774/774.

**결정적 실측 — 레거시 flag × 현행 분류 교차표 (싱글세트 BUNDLE 271):**

| cat_L | cat_M | 레거시 flag | 건수 |
|---|---|---|---|
| 360 | CST UV | is360 | 10 |
| 4way 냉난방 | 프레스티지 | is4way | 10 |
| 4way 냉난방 | 프리미엄/디럭스 | is4way | 11 |
| 4way 냉방전용 | – | is4way | 6 |
| 4way 냉난방 | **1등급** | **isGrade1** | 10 |
| 1way 냉난방 | – | is1way | 5 |
| 1way 냉방전용 | – | is1way | 6 |
| 냉난방 스탠드 | 프레스티지 | isStand | 9 |
| 냉전 스탠드 | – | isStand | 3 |
| 비스포크 스탠드 | 세이지/그레이/핑크 | isStand | 4+4+4 |
| 냉난방 스탠드 | **1등급** | **isGrade1** | 4 |
| **냉난방 스탠드** | **프리미엄/디럭스** | **isStand 9 + isDeluxe 3 + isStand(AP230/290예외) 2** | **14 ⚠️** |
| 실링 / 덕트 | – | (none) | 4 / 3 |
| 가정용 에어컨·냉난방 벽걸이·냉전 벽걸이 | – | (none) | 164 |

**26개 조합 중 25개는 분류가 flag 를 1:1로 결정합니다. 어긋나는 노드는 정확히 1개 — `냉난방 스탠드 / 프리미엄/디럭스` 14건뿐.** 그 14건도 품명이 이미 갈라 놓았습니다:

```
AP072BAPDBH2S · AP130BAPDBH2S · AP145BAPDHH2S   → "냉난방 디럭스 스탠드"   (3건, isDeluxe)
AP052/060/072/083/110/130/145BAPP…             → "냉난방 프리미엄 스탠드" (9건, isStand)
AP230DAPDHH1S · AP290DAPDHH1S                  → "냉난방 프리미엄 스탠드" (2건, 예외로 isStand)
```
**즉 중분류 `프리미엄/디럭스` 를 `프리미엄`/`디럭스` 두 노드로 쪼개기만 하면 분류→6종 매핑이 완전 결정적이 되고, AP230/AP290 하드코딩 예외가 소멸합니다.**

### 전환 시 반드시 결정해야 할 것 (분류 전환이 레거시와 갈리는 지점)

1. **1등급 = 형태 축이 아니라 등급 축.** 레거시는 `m[8]='F'` 가 `P`/`D` 를 밀어내 **"무풍 4way 냉난방 1등급" 14건이 is4way=false, isGrade1=true** 입니다. 그런데 분류상으로는 `cat_L=4way 냉난방 / cat_M=1등급` 이라 **형태와 등급을 독립으로 읽으면 4way 정액 + 1등급 정액이 이중 차감**됩니다(`PriceCalculationService.java:130-135` 는 매칭되는 모든 정액을 **가산**). 현행 `dc_configs` 실측으로 4way 정액 보유 49건 · 1등급 정액 보유 10건 → 실제 금액이 움직입니다. **"1등급은 형태 할인을 대체하는가, 추가되는가" 는 업무 규칙이며 개발책임자 확인 대상.**
2. **6종 매핑은 cat_L 단일 축이 아니다.** 360/4way/1way/스탠드는 **대분류**, 디럭스/1등급은 **중분류** 에 있습니다. 편집 UI 를 만들 때 "대분류 = 할인 카테고리" 로 잡으면 디럭스·1등급이 표현 불가입니다.
3. **실링 4 · 덕트 3 은 6종에 자리가 없다** (위 §6).
4. **AF 134 · AR 30 (가정용/벽걸이)** 은 분류로도 flag 로도 할인 없음 — 전환해도 동일. 검증 시 "0 이 유지되는가" 를 양방향 RED 로 걸 것.
5. **전환 대상은 3곳 전부여야 한다** — `order-app/index.html:1473` · `estimate-app/views/index.ejs:2334` · `PartnerOrderConfirmService.java:377-412`. 한 곳만 바꾸면 **화면 표시가와 확정가가 갈립니다.** 그리고 `resolveDiscountFlags` 의 `anyMatch('1')` 단락 로직 때문에, **`products.discount_flags` 를 올바르게 채우기만 해도 그 순간 fallback 이 꺼지고 값이 바뀝니다** — 이 컬럼에 쓰는 어떤 변경도 즉시 금액에 도달합니다.

### 미판정으로 남긴 것
- `usage_scope='NONE'` 의 판별 233건(SINGLE_PART 120 + 미분류 113)이 `singleUnitPrice`(`:4016`) 경로로 실제 금액에 도달하는지 — 확인 못 함.
- 실링/덕트에 할인 카테고리가 **없어야 하는지** 업무 판단.
- AM360 라인이 `categoryKey` 를 `commercialMulti` 이외로 보내는 호출 경로 존재 여부.

**주요 경로**: `D:\dev\Samhan-Public\tools\legacy-gas\종합견적서\index.html` · `D:\dev\Samhan-Public\services\partner-order-service\src\main\java\com\samhanair\logis\partnerorder\service\PartnerOrderConfirmService.java` · `D:\dev\Samhan-Public\services\dc-config-service\src\main\java\com\samhanair\logis\dcconfig\service\PriceCalculationService.java` · `D:\dev\Samhan-Public\clients\desktop\src\renderer\routes\EstimateItemsCatalogPage.tsx` · `D:\dev\Samhan-Public\services\product-service\src\main\resources\db\migration\V20__add_product_classification.sql`

---

## 회수 3

조사 완료. 실측 결과입니다.

---

# 견적품목 메뉴 실측 조사 (2026-08-06)

## 0. PM 전제 검증 — 2건 정정, 나머지 확인

### ✅ 확인된 전제
| 전제 | 실측 |
|---|---|
| `getModelFlags` 문자 위치 판정 6종 | `tools/legacy-gas/종합견적서/index.html:2200-2231` — 원문 일치 (AP230/AP290 예외 포함) |
| `adjustSingleSetBasePrice`, 호출부 | `:2992-3023`, 호출 `:4765` — 일치. 정액 6종 UI = `#ss_disc_360/4way/stand/1way/deluxe/grade1` (`:7407-7412`) |
| `products.discount_flags` 실 데이터 | `'000000' 3,053` · `'100000' 8` — **정확히 일치** (총 3,061 = 미삭제 품목 수) |
| slip-service · dc-config-service 에서 `discount_flags` grep 0 | 일치 |
| `product_estimate_exposure` CHECK 5값 · UNIQUE(product_id, category) | `V18__add_product_estimate_exposure.sql:9,18,22` 일치 |

### 🚨 정정 1 — `discount_flags` 는 `getModelFlags` 로 계산되지 않는다. 별개의 **깨진 substring 룰**이다

`Product.java:146-150` Javadoc 은 *"getModelFlags 7 prefix 정규식"* 이라 적었지만, 실제 산출은 `VariableDiscountDetector.java:41-46`:

```java
private static final Pattern P_360 = Pattern.compile("^(?i).*360.*");
private static final Pattern P_4WAY = Pattern.compile("^(?i).*4way.*");
private static final Pattern P_STAND = Pattern.compile("^(?i).*(stand|스탠드).*");
private static final Pattern P_DELUXE = Pattern.compile("^(?i).*(deluxe|디럭스).*");
```
`detectDiscountFlags(String modelCode)` (`:111-122`) 가 **모델코드**(품목명 아님)에 이 정규식을 돌립니다. 모델코드는 `AC115RS4PBH1` 같은 영숫자라 `4way`·`스탠드`·`디럭스`는 **영원히 매칭되지 않고**, `.*360.*` 만 우연히 걸립니다. 그래서 `'100000'` 8건의 정체는:

```
AM360AXVGHC1SY  DVM S2 냉방전용 상부토출 36HP   ← 상업멀티 DVM 실외기
AM360AXVGHH1SY  DVM S2 표준형 36HP
... (8건 전부 COMMERCIAL_MULTI 노출)
```
**싱글중대형 360 카세트가 아닙니다.** 레거시 `getModelFlags("AM360…")` 는 AC/AP 로 시작하지 않아 6종 전부 false 입니다. 즉 `discount_flags` 는 미사용 필드일 뿐 아니라 **값 자체가 레거시와 불일치**합니다 — 이 필드를 출발점으로 삼으면 안 됩니다.

부수 확인: `PartnerOrderConfirmService.java:365-369` 는 저장된 flags 에 `'1'` 이 하나라도 있으면 **그대로 채택**하므로 이 8건은 모델 룰을 우회해 `is360=true` 로 전사됩니다. 다만 `PriceCalculationService.java:124-127` 이 `category` 가 `HOMEMULTI`/`COMMERCIAL_MULTI` 면 정액 6종을 0으로 막으므로 금액 결함까지 가는지는 **미판정**(호출자가 항상 그 category 를 넘기는지 확인 안 함).

### 🚨 정정 2 — 모델명 판정은 레거시 GAS 에만 있는 게 아니다. **현행 서버 코드 4곳에 살아 있다**

| 위치 | 형태 |
|---|---|
| `clients/web/estimate-app/views/index.ejs:2334` | `getModelFlags` — 레거시와 **문자 단위 동일** (직접 대조함). 사용 `:3262, :3375, :4393` |
| `clients/web/order-app/index.html:1473` | `getModelFlags`. 사용 `:1726, :1836, :2802` |
| `services/partner-order-service/…/PartnerOrderConfirmService.java:378-405` | Java 재구현 (AP230/AP290 예외까지 동일) |
| `services/accounting-service/…/DiscountRevalidator.java:385-410` | `optionDiscountFor(modelToken)` — 또 다른 재구현. `AR…S`/`AF…S` 제외 조건이 **추가로 다름** |
| `services/product-service/…/VariableDiscountDetector.java:41-46` | 위의 깨진 substring 버전 |

⟹ *"모델명 체계가 바뀔 때 서버를 바꿔야 한다"* 는 개발책임자 지적은 **실제로 5개 파일**을 뜻합니다.

---

## 1. 견적품목 메뉴가 보여주고 편집하는 것

**파일**: `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx` (2,299줄)
**경로**: `/products/estimate-items` — 사이드바 "견적품목 관리" (`AppLayout.tsx:826-831`)
**탭**: 홈멀티 / 싱글중대형 / 상업멀티 / 구형 (`:104-110` — `OTHER` 는 탭 없음)

컬럼 11개 (`:1494-1640`):

| # | key | 헤더 | 편집 | 수단 |
|---|---|---|---|---|
| 0 | `_drag` | — | ✅ | 드래그 (canEdit && 검색어없음 && !모바일, `:1155`) |
| 1 | `modelCode` | 모델명 | ❌ | |
| 2 | `name` | 품목명 | ❌ | |
| 3 | `catL` | **분류** | ✅ | "설정" 버튼 → 모달 L/M/S Select 3개 (`:389-503`) |
| 4 | `estimateCategory` | 카테고리 | ✅ | 칩 추가/삭제 (`:541-620`) |
| 5 | `usageScope` | 노출 설정 | ✅ | 견적/주문 토글 2개 (`:214-266`) |
| 6 | `hasVariableDiscount` | 변동DC | ✅ | 토글 (`:270-301`) |
| 7 | `fixedDiscountRate` | 고정DC% | ✅ | 인라인 입력 blur/Enter 자동저장 (`:305-374`) |
| 8 | `displayOrder` | 표시순서 | 표시전용 | 드래그로만 변경 |
| 9 | `productType` | 세트 | ❌ | Badge |
| 10 | `_components` | 구성품 | ✅ | 모달 (BUNDLE 전용) |

추가: 하단 `ProductMultiSelectAutocomplete` 로 **기초품목을 현재 탭에 추가** (`:1314-1339`).
읽기 전용 시 배너 `estimate-items-readonly-banner` (`:1654`).

---

## 2. 편집이 가는 API (파일:줄)

| UI | FE 함수 | 엔드포인트 | BE |
|---|---|---|---|
| 분류 모달 저장 | `updateProductClassificationSettings` `productCatalogApi.ts:586-596` | `PATCH /api/v1/products/{modelCode}/classification` | `ProductCatalogController.java:288-298` → `ProductService.java:728-743` |
| 카테고리 칩 / 노출 토글 / 품목 추가 | `updateProductUsage` `:471-481` | `PATCH …/usage` | `ProductCatalogController.java:234-246` |
| 변동DC | `updateProductVariableDiscount` `:504-515` | `PATCH …/variable-discount` | `:275-285` |
| 고정DC% | `updateProductFixedDiscount` `:534-545` | `PATCH …/fixed-discount` | `:301-311` |
| 구성품 모달 | `updateBundleComponents` `:624-634` | `PUT …/components` | `:432` |
| 드래그 저장 | `updateDisplayOrders` `:646-650` | `PUT /api/v1/products/display-orders` | `:455-460` |

**분류 PATCH body 는 정확히 3필드** (`productCatalogApi.ts:361-367`):
```ts
export interface UpdateProductClassificationSettingsRequest {
  catLId: string | null; catMId: string | null; catSId: string | null
}
```
BE 검증 (`ProductService.java:908-940`): ① M 은 L 필요·부모 일치 ② S 는 M 필요·부모 일치 ③ 세 단계의 `estimate_category` 동일 ④ **그 category 가 해당 품목의 활성 노출에 존재해야 함**.

모달 옵션은 **현재 탭 category 로만** 로드됩니다 (`:1207-1211` `fetchClassificationTree(committedCategory)`).

> 분류 **마스터**(L/M/S 노드 자체) CRUD 는 별도 메뉴 `/products/classifications` (`ProductClassificationsPage.tsx`, 735줄, 같은 권한). `POST/PATCH/DELETE /api/v1/classifications` (`ClassificationController.java:45-63`).

---

## 3. estimate_category 실 데이터 분포 (product_db)

```sql
SELECT estimate_category, is_deleted, count(*) FROM product_estimate_exposure GROUP BY 1,2;
```
| category | is_deleted=f | is_deleted=t |
|---|---|---|
| COMMERCIAL_MULTI | 416 | 0 |
| SINGLE_SET | **288** | 0 |
| HOME_MULTI | 119 | 0 |
| LEGACY | 40 | 2 |
| OTHER | **0** | 0 |

**다중 category 품목** (활성 기준, 총 782 품목 / 863 노출):
| category 개수 | 품목 수 |
|---|---|
| 1 | 714 |
| 2 | 57 |
| 3 | 9 |
| 4 | 2 |
→ **2개 이상 = 68건**

SINGLE_SET 288건 내역: `BUNDLE 271 / SINGLE 17`, 모델 prefix `AF 134 · AC 65 · AP 42 · AR 33 · 기타 14`.

### 🔑 핵심 실측 — 분류(L/M)와 레거시 6종 플래그의 일치도

SINGLE_SET 288건에 대해 레거시 `getModelFlags` 를 SQL 로 재현하여 `cat_l`/`cat_m` 과 교차:

| cat_l | cat_m | 건수 | is360 | is4way | is1way | isStand | isDeluxe | isGrade1 |
|---|---|---|---|---|---|---|---|---|
| 360 | CST UV | 10 | **10** | | | | | |
| 4way 냉난방 | 프레스티지 | 10 | | **10** | | | | |
| 4way 냉난방 | 프리미엄/디럭스 | 11 | | **11** | | | | |
| 4way 냉난방 | 1등급 | 10 | | | | | | **10** |
| 4way 냉방전용 | — | 6 | | **6** | | | | |
| 1way 냉난방 | — | 5 | | | **5** | | | |
| 1way 냉방전용 | — | 6 | | | **6** | | | |
| 냉난방 스탠드 | 프레스티지 | 9 | | | | **9** | | |
| **냉난방 스탠드** | **프리미엄/디럭스** | **14** | | | | **11** | **3** | |
| 냉난방 스탠드 | 1등급 | 4 | | | | | | **4** |
| 냉전 스탠드 | — | 3 | | | | **3** | | |
| 비스포크 스탠드 | 세이지/콰이엇/프라임 | 12 | | | | **12** | | |
| 가정용 에어컨 (AF) | 5종 | 134 | 0 | 0 | 0 | 0 | 0 | 0 |
| 냉난방/냉전 벽걸이 (AR) | | 30 | 0 | 0 | 0 | 0 | 0 | 0 |
| 덕트·실링·부자재·받침 | | 24 | 0 | 0 | 0 | 0 | 0 | 0 |

**단 한 곳을 빼고 분류가 레거시 플래그를 완전히 결정합니다.** 유일한 예외:

```
냉난방 스탠드 > 프리미엄/디럭스 (14건)
  ├ isDeluxe (3): AP072BAPDBH2S / AP130BAPDBH2S / AP145BAPDHH2S  — 이름 "냉난방 디럭스 스탠드"
  └ isStand (11): AP0xxBAPPBH2S 계열 + AP230DAPDHH1S, AP290DAPDHH1S — 이름 "냉난방 프리미엄 스탠드"
```
중분류 이름이 `프리미엄/디럭스` 로 **두 개를 한 노드에 묶어** 놓았습니다. 품목명은 이미 구분되어 있으므로 이 M 노드를 `프리미엄`/`디럭스` 로 쪼개면 (또는 소분류 추가) 분류만으로 6종이 100% 결정됩니다. **SINGLE_SET 에는 소분류(S) 노드가 현재 0개**라 S 단계가 통째로 비어 있습니다 (L 16 · M 19 · S 0).

### ⚠️ 부수 실측 — 분류는 견적 카테고리별이 아니라 **품목당 1세트**

`products.cat_l_id/cat_m_id/cat_s_id` 는 단일 FK 입니다 (`V20__add_product_classification.sql:48-52`). 노출은 M:N 인데 분류는 1:1 이라 교차가 생깁니다:

| 노출 category | 분류 소속 category | 건수 |
|---|---|---|
| COMMERCIAL_MULTI | HOME_MULTI | 61 |
| COMMERCIAL_MULTI | SINGLE_SET | 13 |
| SINGLE_SET | HOME_MULTI | **12** |
| LEGACY | 타 category | 3 |

SINGLE_SET 탭에서 분류가 HOME_MULTI 소속인 12건은 전부 부자재입니다 (유선리모컨 키트·무선리모컨·유연호스 I/L형·원형발통 세트·운임·절삭 등) — 레거시 `adjustSingleSetBasePrice:3001-3003` 의 `isAcc` 우회 대상과 정확히 겹쳐 할인 영향은 없습니다. 다만 **SINGLE_SET 탭에서 이 12건의 분류 모달을 열면 대분류 Select 가 빈 값으로 보입니다** (옵션이 SINGLE_SET 로만 로드되므로). 저장 시도 시 BE 가 노출 검증을 통과시킬지는 이들이 HOME_MULTI 에도 노출돼 있어 케이스별입니다.

---

## 4. 이 메뉴에 필드 하나 추가하는 규모

**같은 일을 한 실제 커밋이 있습니다.** `aeda714dd` "F1 고정DC% 인라인 컬럼 복원 + 자동저장" — 인라인 편집 필드 **1개** 추가에:

```
16 files changed, 424 insertions(+), 101 deletions(-)
  clients/desktop/src/renderer/api/mock.ts                          25 +-
  clients/desktop/src/renderer/api/productCatalogApi.test.ts        39 ++
  clients/desktop/src/renderer/api/productCatalogApi.ts             35 ++-
  clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.test.ts  12 ++
  clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx  213 ++++---
  clients/desktop/src/renderer/routes/ProductCatalogPageModel.test.ts   25 ++
  clients/desktop/src/renderer/routes/ProductCatalogPageModel.ts    33 ++
  services/api-gateway/src/main/resources/application.yml           10 +-   ← 필수
  services/api-gateway/.../ApiGatewayContextLoadIT.java             11 +-
  services/product-service/.../ProductService.java                  15 +-
  services/product-service/.../ProductCatalogController.java        17 +-
  services/product-service/.../UpdateProductClassificationRequest.java 10 +-
  services/product-service/.../UpdateProductFixedDiscountRequest.java  11 +
  services/product-service/.../ProductCatalogControllerIT.java      56 +-
  services/product-service/.../ProductPermissionControllerIT.java    8 +-
  services/product-service/.../ProductSheetSyncServiceIT.java        5 +-
```
직전 커밋 `2c36256d0` (분류 PATCH 신설) = 8 files, +219/-33.

**놓치기 쉬운 것들**:
- **api-gateway 전용 라우트가 필수**. `/api/v1/products/*/xxx` 는 strip 규칙 때문에 개별 route id 가 있어야 합니다 (`application.yml:310-338` — `product-variable-discount-v1`, `product-fixed-discount-v1`, `product-classification-v1`, `product-classifications-v1`). api-gateway 는 전 트랙 공유 배포본입니다.
- **`ProductSheetSyncService` 덮어쓰기 방어**. 시트 sync 가 값을 되돌리지 않게 `xxxManual` 플래그가 필요합니다 (`classification_manual`, `fixed_discount_manual` — `V20:56-57`). 현재 실 데이터 `classification_manual=true` 는 **0건**.
- **mock.ts** — `products.admin` 권한 게이트가 mock 에도 이중 구현돼 있습니다 (`mock.ts:2607, 2717, 2791, 2811, 2846…`).
- Playwright 스펙 15개가 `estimate-items` 를 참조합니다.

**분류 기준 방식이면 추가 필드가 아예 없을 수도 있습니다** — 6항 참조.

---

## 5. 권한

| 축 | page_code | action | 코드 |
|---|---|---|---|
| 메뉴 노출 | `products.list` | `view` | `AppLayout.tsx:826-831` (`showProductsList`) |
| 라우트 진입 | `products.list` | `view` | `routes/index.tsx:1461-1468` `<PermissionGuard>` |
| 편집 가능 | `products.admin` | `update` | `EstimateItemsCatalogPage.tsx:1131-1132` `canAccess('products.admin','update')` |
| 서버 강제 | `products.admin` | `UPDATE` | `@RequirePermission` — `ProductCatalogController.java:235, 257, 276, 289, 302, 315` |

`auth_db.role_page_permissions` (is_deleted=false) 실측:

| role | products.list view | products.admin view/update |
|---|---|---|
| MASTER | ✅ | ✅ / ✅ |
| MANAGER | ✅ | ✅ / ✅ |
| DEVELOPER | ✅ | ✅ / ✅ |
| SALES | ✅ | ✅ / ✅ |
| INVENTORY | ✅ | ✅ / ✅ |
| ACCOUNTANT | ✅ | ❌ / ❌ (조회만) |
| WAREHOUSE | ✅ | ❌ / ❌ (조회만) |
| STAFF · DRIVER · DISPATCH · PARTNER | ❌ | ❌ / ❌ |

⟹ **볼 수 있는 역할 7개, 편집 가능 5개** (MASTER/MANAGER/DEVELOPER/SALES/INVENTORY).
`account_page_permissions` 계정 오버라이드 20행은 전부 `dev_*` 시드 계정이며 역할 기본값과 동일 (예외: `dev_locked` 가 `products.admin` update=true).

---

## 6. 🔎 셋째 가능성 — 지시문에 두 가지 읽기가 있습니다

> *"품목별로 분류가 들어가 있으니 이를 기준으로 견적품목 메뉴에서 편집이 가능하도록"*

**읽기 A — 할인 카테고리 필드를 신설**해 견적품목 메뉴에서 품목마다 직접 고른다.
→ 4항 규모(≈16파일). 288행을 사람이 관리. 분류와 새 필드가 어긋날 수 있는 축이 하나 늘어남.

**읽기 B — 기존 분류(L/M/S)를 판정 기준으로 삼는다.** 편집 UI 는 **이미 존재**합니다(3항 컬럼 `catL` "설정" 모달). 신규 필드 0개.
→ 필요한 일: ① `냉난방 스탠드 > 프리미엄/디럭스`(14건) 를 `프리미엄`/`디럭스` 로 분할 — **분류 관리 메뉴에서 데이터만으로 가능** ② 분류→6종 매핑 테이블 ③ `getModelFlags` 5곳 치환.

**읽기 C (제 제안) — 매핑을 `classification` 노드에 붙인다.** `classification` 에 `discount_option` 컬럼(NULL/360/4WAY/1WAY/STAND/DELUXE/GRADE1)을 두면 관리 대상이 **SINGLE_SET 35개 노드**뿐이고, 새 모델이 들어와도 분류만 지정하면 자동 상속됩니다. 견적품목 메뉴는 파생값을 표시하고, 분류를 바꾸는 것이 곧 편집이 됩니다.
→ 다만 *"견적품목 메뉴에서 편집"* 을 **품목 단위 override** 로 요구하신 거라면 C 만으로는 부족하고 A 를 얹어야 합니다.

**A/B/C 는 제가 고를 문제가 아닙니다.** 다만 세 안 모두 3항의 `프리미엄/디럭스` 14건 분할과 5개 파일의 `getModelFlags` 치환이 공통 선행 조건이고, 이 둘은 어느 쪽을 택하든 버려지지 않습니다.

---

## 7. 미판정 항목 (지어내지 않음)

- `PriceCalculationService.sumOptionDc` 의 `line.category()` 를 호출자가 무엇으로 채우는지 — 8건 AM360 오플래그가 실제 금액에 닿는지 확인 안 함
- 견적서 실화면(estimate-app)이 정액 할인을 어느 경로로 최종 계산하는지 — `index.ejs:3262/3375/4393` 3개 호출부 내용 미독해
- `DiscountRevalidator.optionDiscountFor` 의 `AR…S`/`AF…S` 제외 조건이 레거시 어느 규칙에서 왔는지 (레거시 GAS 에는 `isAcc` 이름 기반 우회만 있음)
- 상업멀티(416건)·홈멀티(119건)에도 유사한 카테고리 축이 필요한지 — 조사 범위 밖

---

## 회수 4

조사 완료. 아래가 실측 결과입니다.

---

# 정액 6종 소비 경로 전수 조사 (2026-08-06)

## 0. 먼저 — PM 전제 정정 3건

### ① "#1077 R8" → 실제는 **#1069 R8** 이고 **main 에 없다**
```
git merge-base --is-ancestor baed4ab3a HEAD  →  NO
git branch -a --contains baed4ab3a           →  feat/1069-bundle-expansion-in-form
커밋 제목                                     →  "[FIX] #1069 R8 — 싱글중대형 세트의 카테고리별 정액 할인이 …"
워크트리                                      →  D:/dev/Samhan-Public/.claude/worktrees/w1077
```
디렉토리 이름만 `w1077`. 아래 조사는 **main(현 HEAD `7680d0bf8`) / 브랜치(`baed4ab3a`)** 를 구분해 적었습니다.

### ② 🚨 **slip-service 는 dc-config 를 아예 호출하지 않는다** — 그 커밋의 백엔드 fix 는 죽은 코드
`D:/dev/Samhan-Public/services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:274-280`
```java
// 단가는 화면이 DC/최근단가/사용자 협의가를 반영해 확정한 값을 정본으로 사용한다.
// 서버에서 다시 dc-config-service를 호출하면 화면의 할인 완료 단가를 정가로 오인해
// 전역DC를 재적용하므로(예: 970,200 -> 494,802) 계산하지 않는다.
SlipDiscountCalculator.Calculation discountCalculation = new SlipDiscountCalculator.Calculation(
        req.lines().stream().map(CreateSlipRequest.SlipLineRequest::unitPrice).toList(),
        req.discountInfo());
```
- `DiscountPriceClient.calculatePrices/calculateDetailed` 의 **프로덕션 참조 0건** (grep 결과 참조처는 `SlipDiscountCalculator` 와 테스트뿐, `SlipDiscountCalculator.calculate*` 를 부르는 프로덕션 코드도 0건).
- 이 제거는 **오늘 main 에 들어왔습니다**: `d82fb265c 2026-08-06 [FEAT] #874 … (#1057)`.
- 런타임 실측 확증 — `price_calculation_logs` 에 slip-service 호출 **0건**:
```sql
SELECT caller_service, count(*), min(created_at)::date, max(created_at)::date
FROM price_calculation_logs GROUP BY 1 ORDER BY 2 DESC;
 partner-order-service             | 569 | 2026-07-29 | 2026-07-29
 recon-fe-rule                     |   3 | 2026-07-29 | 2026-07-29
 partner-order-service-r2-evidence |   1 | ...
 partner-order-service-r3-evidence |   1 | ...
```
⟹ `baed4ab3a` 가 `DiscountPriceClient.toRequestLine()` 에 넣은 여섯 플래그는 **실행되지 않습니다**. 그 커밋의 실효는 프런트 `clients/desktop/src/renderer/utils/slipDiscount.ts` 쪽뿐입니다.

부수 결함(브랜치): `LegacyModelFlags.from(line.modelCode())` 인데 `SlipDiscountCalculator.java:49-51` 의 `modelCode()` 는 **`lineId` 를 그대로 반환**합니다. 추가된 테스트는 lineId 자리에 `"AC123456P"` 를 넣어 통과합니다(경로가 죽어 있어 금액 영향은 없음).

### ③ `products.discount_flags` 를 채우는 규칙이 레거시 규칙이 아니다
`Product.java:145-150` Javadoc 은 *"getModelFlags 7 prefix 정규식"* 이라 적혀 있으나, 실제 writer 는
`services/product-service/src/main/java/com/samhanair/logis/product/service/VariableDiscountDetector.java:41-46, 111-123` — **모델코드 문자열 부분일치**입니다.
```java
P_360   = ^(?i).*360.*        P_STAND = ^(?i).*(stand|스탠드).*
P_4WAY  = ^(?i).*4way.*       P_DELUXE= ^(?i).*(deluxe|디럭스).*
```
실 카탈로그(products 활성 3,061건)에서 두 규칙을 대조한 결과:

| | 360 | 4way | 스탠드 |
|---|---|---|---|
| 부분일치(현 writer) | **8** | **0** | **1** |
| 레거시 위치 규칙 | **27** | **67** | **90** |

그리고 `'100000'` 8건은 **전부 `AM360…` 상업멀티**인데, 상업멀티는 `PriceCalculationService.sumOptionDc` 가 정액을 0 으로 만듭니다.
⟹ **`products.discount_flags` 는 오늘 어떤 금액에도 영향이 없습니다 — 켜져 있는 8건조차 억제되는 자리에 있습니다.** PM 이 실측한 `000000` 3,053 / `100000` 8 은 정확합니다(`is_deleted=true` 2건 별도).

---

## 1. PriceCalculationService — 받는 방식과 합산

`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java`

```java
:64   BigDecimal afterRate  = listPrice.multiply(ONE.subtract(appliedRate));
:65   BigDecimal optionDc   = sumOptionDc(config, line);
:66   BigDecimal afterOption= afterRate.subtract(optionDc).max(ZERO);   // 율 적용 후 정액 차감
:67   BigDecimal finalPrice = roundToUnit(afterOption, config);

:122  private BigDecimal sumOptionDc(DcConfig config, PriceCalculationRequest.Line line) {
:123      if (config == null) return ZERO;
:126      if ("HOMEMULTI".equals(line.category()) || "COMMERCIAL_MULTI".equals(line.category()))
:127          return ZERO;                        // ← 멀티는 정액 전면 억제
:130      if (line.is360())       sum = sum.add(nz(config.getDiscount360Amount()));
:131      if (line.is4Way())      sum = sum.add(nz(config.getDiscount4WayAmount()));
:132      if (line.is1Way())      sum = sum.add(nz(config.getDiscount1WayAmount()));
:133      if (line.isStand())     sum = sum.add(nz(config.getDiscountStandAmount()));
:134      if (line.isDeluxe())    sum = sum.add(nz(config.getDiscountDeluxeAmount()));
:135      if (line.isFirstGrade())sum = sum.add(nz(config.getDiscountFirstGradeAmount()));
```
- **합산 방식 = 참인 플래그 전부 더한다**(배타 아님). 뒤에 나오는 accounting 쪽과 다릅니다(§3).
- **정액이 살아나는 카테고리는 `OTHER` 하나뿐.** `HOMEMULTI`/`COMMERCIAL_MULTI` 는 0.

**DTO — 여섯 boolean 은 필수가 아니라 기본값 `false`**
`dto/PriceCalculationRequest.java:33-38`
```java
@Schema(description = "옵션 - 360 판넬")  boolean is360,
… boolean is4Way, is1Way, isStand, isDeluxe, isFirstGrade
```
`@NotNull` 없음 · 컨트롤러는 `@Valid`(`InternalDcConfigController.java:137-139`) 지만 primitive `boolean` 이라 **JSON 에서 빠지면 400 이 아니라 조용히 false**. `:44-64` 의 호환 생성자 2개도 여섯을 false 로 채웁니다.
⚠️ JSON 에 명시적 `null` 을 넣었을 때의 동작은 **미판정**(요청을 실제로 쏘지 않았습니다).

---

## 2. 누가 요청을 보내는가 — 백엔드 호출자는 **2개, 살아 있는 건 1개**

`rg --no-ignore -n "price-calculations" services clients shared tools` 전수 결과:

| 호출자 | 파일 | 여섯 플래그 전송 | 실제 호출 |
|---|---|---|---|
| **partner-order-service** (주문 확정) | `client/DcConfigClient.java:155` + `service/PartnerOrderConfirmService.java:201-208` | ✅ 6개 모두 | **569회 (실측)** |
| slip-service (판매/출고전표) | `service/DiscountPriceClient.java:60` | main ❌ 0개 / 브랜치 ✅ 6개 | **0회** — §0-② |

- **estimate-service 는 존재하지 않습니다.** `PriceCalculationRequest.java:15` 와 `InternalDcConfigController.java:32` Javadoc 의 *"estimate-service / partner-order-service"* 는 **문서가 실물보다 앞서간 것**입니다(`services/` 17개 중 estimate-service 없음).
- 구매전표 경로: 호출자 없음.

**정액이 실제로 붙은 실측치** (`price_calculation_logs.response_payload`):
```sql
SELECT count(*) , sum((r->>'appliedFixedAmount')::numeric)
FROM price_calculation_logs, jsonb_array_elements(response_payload->'lines') r
WHERE (r->>'appliedFixedAmount')::numeric > 0;
 138 | 8020000.00
```
요청 라인 카테고리별 분포:
```
 category         | lines | any_flag_true
 COMMERCIAL_MULTI |  281  |  17     ← sumOptionDc 가 0 으로 억제
 OTHER            |  270  | 138     ← 정액이 실제로 붙는 유일한 구간
 HOMEMULTI        |   22  |   0
```

**플래그를 만드는 곳**(main): `PartnerOrderConfirmService.java:364-412 resolveDiscountFlags` — `product.discountFlags()` 가 `"000000"` 이거나 null 이면 **모델코드에서 재판정**합니다(즉 3,053건 전부 이 경로). `:374` 에 `model.contains("360") → "100000"` 이라는 AM360 호환 분기가 따로 있어, 위 17건(`AM360AXVHHR1SY` 등)이 여기서 나왔습니다.
이 함수는 `LegacyModelFlags` 로 **리팩터링되지 않은 네 번째 사본**입니다(브랜치에서도 미변경).

이중 적용 없음 확인: `resolveListPrice`(`:415-432`)가 화면의 할인 후 단가가 아니라 카탈로그 `releasePrice/deliveryPrice` 를 다시 읽습니다.

---

## 3. accounting-service DiscountRevalidator — **적용이 아니라 검증**, 그리고 합산이 아니라 **택일**

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:380-412`
```java
BigDecimal discountForSet(String modelToken) { … optionDiscountFor(modelToken) … }
private BigDecimal optionDiscountFor(String code) {
    if (AR…S || AF…S) return null;
    if (AC && len>=9) { …6P→360 / 4PD→4way / 1PD→1way / [8]='F'→firstGrade }
    if (AP)           { AP230|AP290|[8]='P'|[8]='D'&&[10]='C' → stand
                        [8]='D'&&[10]='H' → deluxe / [8]='F' → firstGrade }
    return null;   // ← 첫 매치 하나만 반환
}
```
- 소비처는 `MonthEndCloseService`(`:461-518, 681`) 뿐 — **월/일 마감 재검증**. 가격을 매기는 경로가 아닙니다.
- 🚨 **dc-config 는 참인 플래그를 전부 더하고(§1), 여기는 하나만 고릅니다.** 한 모델이 두 플래그를 동시에 만족하면 두 엔진의 기대값이 갈립니다. (레거시 `getModelFlags` 자체가 배타가 아니므로 어느 쪽이 업무상 맞는지는 **미판정 — 개발책임자 확인 필요**.)

**브랜치 `baed4ab3a` 의 공용화 — 실 데이터에서는 등가**
`shared/common/src/main/java/com/samhanair/logis/common/discount/LegacyModelFlags.java` 로 −29줄 치환했고, 코드상 두 군데가 달라집니다:
1. 구 코드는 `AP230/AP290` 에 `length>=9` 가드가 없었는데 신규는 AP 블록 전체에 `length>=9`.
2. 구 코드는 `AP` + `[8]='P'` 면 무조건 stand, 신규는 `[10]='C'` 인 경우 `[8]='D'` 여야 stand.

실 카탈로그(AP 품목 117건)로 재보니 **양쪽 모두 해당 행이 0건**:
```sql
ap_total=117 | ap_len_lt9=0 | ap230_290=18 | ap230_290_lt9=0 | ap_c_and_p=0 | ap_c_and_d=11
```
⟹ 현 데이터 기준 **동작 변화 없음**. (`slip_lines` 461행에 AP 모델 0건이라 전표 축은 표본 없음.)

---

## 4. `dc_configs` 정액 6컬럼 분포 (dc_config_db, `is_deleted=false`)

```
 total_active | has_any_fixed | c360 | c4way | c1way | cstand | cdeluxe | cgrade1
          259 |            50 |   44 |    49 |    45 |     49 |      17 |      10
```
조합 상위 (26조합 전체 중):
```
  a360   | a4way  | a1way  | astand | adeluxe| agrade1| 거래처
 50000   | 50000  | 50000  | 50000  |        |        |   8
 30000   | 30000  | 30000  | 30000  |        |        |   7
 20000   | 20000  | 20000  | 20000  |        |        |   5
 40000   | 40000  | 40000  | 40000  | 20000  |        |   3
 70000   | 70000  | 50000  | 70000  | 30000  | 30000  |   2
 …
         |        |        | 30000  |        |        |   1   ← 스탠드만
```
- **209/259 는 정액 미보유** ⟹ 이 거래처들은 어떤 fix 를 해도 금액 불변.
- 디럭스(17)·1등급(10)은 희소. 360/4way/1way/스탠드는 대개 **한 세트로 같이** 설정됩니다.
- 컬럼은 `numeric(12,2)`, `CHECK ≥ 0`, NULL 허용(= 미설정).

---

## 5. 🚨 정액이 **적용되는 화면** — 전수

| 화면 | 코드 위치 | 정액 적용 | 근거 |
|---|---|---|---|
| **거래처 주문서 (order-app, 웹)** | `clients/web/order-app/index.html:1715 adjustSingleSetBasePrice`, `:2779 singleUnitPrice` | ✅ **브라우저에서** | `:1735-1740`, `:2814-2819` 에서 6종 차감. 설정은 로그인 응답으로 수신 — `partner-auth-service/client/DcConfigClient.java:93-97` → `order-app:1521-1526 normalizePartnerConfig` |
| 거래처 주문 **확정(서버)** | `PartnerOrderConfirmService.java:201-209` | ✅ **서버에서 재계산** | 실측 138라인 / 8,020,000원 |
| **종합견적서 (estimate-app, 웹)** | `clients/web/estimate-app/views/index.ejs:3262, :3375, :4393` | ✅ 브라우저에서 (`ss_disc_*` 입력값 기준) | `:7808-7809` 에 스탠드/디럭스 할인 입력 UI 존재 |
| **판매/출고전표 (desktop SlipFormPage)** | `SlipFormPage.tsx:785` → `utils/slipDiscount.ts` | ❌ **main 미적용** / ✅ 브랜치 적용 | main `slipDiscount.ts` 는 `homeMultiDc`/`commercialMultiDc` **율 2개만** 씀. `api/sales.ts:1114-1140 PartnerDcConfig` 는 이미 `threeSixty/fourWay/oneWay/stand/deluxe/firstGrade` 를 **갖고 있는데 안 쓰고 있었다** |
| 전표 서버 저장 | `SlipService.java:277` | ❌ (서버는 DC 계산 안 함) | §0-② |
| **견적 (desktop EstimateFormPage)** | `EstimateFormPage.tsx:1144-1150` | ❌ **DC 자체가 전무** | `partnerReprice.run(id, candidates)` — 3번째 인자 `discountConfig` **미전달**, 후보에 `discountInput` **미설정**. `rg "fixedDiscountRate|hasVariableDiscount|DcConfig"` 결과 **0건** |
| **전표 상세/수정 (desktop SlipDetailPage)** | `SlipDetailPage.tsx:2761` | ❌ | 위와 동일 — `discountConfig` 미전달 |
| 구매전표 | — | ❌ | 호출자 없음 |

**요약: 오늘 정액이 실제로 붙는 곳은 「거래처 주문서(웹)」와 「종합견적서(웹)」 두 레거시 화면뿐이고, 데스크톱 앱(판매전표·견적·전표수정)에서는 전부 0원입니다.** 브랜치 `baed4ab3a` 는 그중 **판매전표 하나만** 프런트에서 메웠습니다(견적·전표상세는 미변경).

---

## 6. 셋째 가능성 — **분류 축은 이미 있고, 견적품목 메뉴에 편집 UI 까지 있다**

개발책임자께서 말씀하신 *"품목별로 분류가 들어가 있으니"* 는 `product_estimate_exposure.estimate_category` 가 아니라 **`products.cat_l_id / cat_m_id / cat_s_id` → `classification` 테이블**로 보입니다.

```sql
-- product_db
SELECT count(*), count(cat_l_id), count(cat_m_id), count(cat_s_id) FROM products WHERE is_deleted=false;
 3061 | 1119 | 888 | 118
-- SINGLE_SET 만: 276건 중 cat_l 276/276(100%), cat_m 244/276(88%)
```

**SINGLE_SET 276건을 cat_L × 레거시 모델코드 규칙으로 교차:**
```
      cat_l      |  n  | 360 | 4way | 1way |스탠드|디럭스|1등급| 무플래그
 가정용 에어컨   | 134 |   0 |    0 |    0 |    0 |    0 |   0 |  134   ← 전부 AF prefix
 4way 냉난방     |  31 |   0 |   21 |    0 |    0 |    0 |  10 |    0
 냉난방 스탠드   |  27 |   0 |    0 |    0 |   20 |    3 |   4 |    0
 냉전 벽걸이     |  16 |   0 |    0 |    0 |    0 |    0 |   0 |   16
 냉난방 벽걸이   |  14 |   0 |    0 |    0 |    0 |    0 |   0 |   14
 비스포크 스탠드 |  12 |   0 |    0 |    0 |   12 |    0 |   0 |    0
 360             |  10 |  10 |    0 |    0 |    0 |    0 |   0 |    0
 1way 냉방전용   |   6 |   0 |    0 |    6 |    0 |    0 |   0 |    0
 4way 냉방전용   |   6 |   0 |    6 |    0 |    0 |    0 |   0 |    0
 1way 냉난방     |   5 |   0 |    0 |    5 |    0 |    0 |   0 |    0
 냉전 스탠드     |   3 |   0 |    0 |    0 |    3 |    0 |   0 |    0
 실링/덕트/부자재/실외기받침 | 12 | 전부 0 |
```
- 서로 다른 정액 카테고리가 **한 버킷에 섞인 경우는 없습니다**. 섞인 건 1등급(F)·디럭스가 4way/스탠드 버킷 **안에** 들어간 것뿐입니다.
- **cat_M 이 1등급을 정확히 분리**합니다:
```
 4way 냉난방  | 1등급          | 10 | 4way 0  1등급 10   ← 완전분리
 냉난방 스탠드| 1등급          |  4 | 스탠드 0  1등급 4  ← 완전분리
 4way 냉난방  | 프리미엄/디럭스| 11 | 4way 11
 4way 냉난방  | 프레스티지     | 10 | 4way 10
 냉난방 스탠드| 프레스티지     |  9 | 스탠드 9
 냉난방 스탠드| 프리미엄/디럭스| 14 | 스탠드 11 · 디럭스 3   ← 유일한 미분리
```
- 🚨 **유일한 공백 = 디럭스.** `프리미엄/디럭스` 14건이 스탠드 11 + 디럭스 3 을 섞고 있습니다. 실물:
```
 AP072BAPDBH2S  냉난방 디럭스 스탠드     ← D..H = 디럭스
 AP130BAPDBH2S  냉난방 디럭스 스탠드
 AP145BAPDHH2S  냉난방 디럭스 스탠드
 AP052BAPPBH2S  냉난방 프리미엄 스탠드   ← ..P.. = 스탠드
 …
 AP230DAPDHH1S  냉난방 프리미엄 스탠드   ← 모델은 D..H(디럭스형)인데 이름은 프리미엄
 AP290DAPDHH1S  냉난방 프리미엄 스탠드   ←  ⟹ 레거시 AP230/AP290 예외의 실제 근거
```
분류 축으로 옮기면 **레거시의 AP230/AP290 하드코딩 예외가 자연 소멸**합니다(그 두 건은 `프리미엄/디럭스` 안에서 스탠드로 지정하면 끝).

**편집 UI 는 이미 존재합니다:**
- 화면: `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx` — *"견적품목 관리 페이지(`/products/estimate-items`)"*, `:431` `title={`분류 설정 — ${row.modelCode}`}`, `:461/475/489` 에서 L→M→S 종속 셀렉트.
- API: `PATCH /api/v1/products/{modelCode}/classification` (`api/productCatalogApi.ts:591`), 마스터는 `GET/POST/PATCH/DELETE /api/v1/classifications` (`:546-582`, BE `ClassificationController.java:40`).
- 분류 마스터 현황: `SINGLE_SET` L 16 · M 19 · S 0.

⟹ **모델코드 파싱을 분류 기준으로 바꾸는 데 필요한 신규 스키마·신규 화면은 없습니다.** 필요한 것은 (a) 정액 6종 ↔ 분류 노드 매핑을 어디에 둘지(=`classification` 행에 정액 종류를 붙일지, `SINGLE_SET` L 목록을 6종으로 재편할지) 결정, (b) 디럭스 분리, (c) 소비처를 그 매핑으로 전환.

---

## 7. 같은 판별 로직 사본 수 — 현재 **7벌**

| # | 위치 | 규칙 | 상태 |
|---|---|---|---|
| 1 | `tools/legacy-gas/종합견적서/index.html:2200-2226` | 위치 | 권위(레거시) |
| 2 | `clients/web/order-app/index.html:1473-1499` | 위치 | 운영 중 |
| 3 | `clients/web/estimate-app/views/index.ejs:2334-2360` | 위치 | 운영 중 |
| 4 | `PartnerOrderConfirmService.java:364-412` | 위치 + AM360 예외 | 운영 중 · **공용화 누락** |
| 5 | `DiscountRevalidator.java:385-412` | 위치(택일) | 운영 중 → 브랜치에서 #7 로 치환 |
| 6 | `VariableDiscountDetector.java:111-123` | **부분일치(틀림)** | `discount_flags` writer |
| 7 | `shared/common/…/LegacyModelFlags.java` | 위치 | 브랜치 신규 |
| 8 | `clients/desktop/…/slipDiscount.ts:getModelFlags` | 위치 | 브랜치 신규 (TS 별도 사본) |

브랜치는 −29줄을 줄였지만 **+2벌(#7, #8)** 을 만들어 순증했고, 가장 활발히 도는 #4 는 손대지 않았습니다.

---

## 미판정 (지어내지 않음)
- 두 엔진의 **합산 vs 택일** 중 어느 쪽이 업무 정본인지 — 레거시 `getModelFlags` 는 배타가 아니고, 두 플래그 동시 참인 실제 모델을 아직 세지 않았습니다.
- 요청 JSON 에 `"is360": null` 을 명시했을 때의 Jackson 동작(요청 미발사).
- `estimate-app` 이 `ss_disc_*` 입력을 dc-config 에서 자동 채우는지(`:2561-2598` 에 `dc.oneWayDiscount` 참조는 있으나 실제 fetch 경로 미추적).
- `product_estimate_exposure` 의 `LEGACY 40`·`OTHER 0` 이 정액과 어떤 관계인지.
- `products.estimate_category` 는 **활성 3,061건 전부 NULL** — 왜 비어 있는지는 미조사(단, 어떤 소비처도 이 컬럼을 읽지 않습니다).
