# #874 세트 `riUsage`·거래처 약정 DC 정찰 및 구현 전 기획

- 정찰일: 2026-07-29 (KST)
- 작업 트리: `C:\dev\Samhan-Public\.claude\worktrees\874-dc`
- 브랜치/기준점: `feat/874-set-riusage-partner-dc` / `6da2da717e6c5604b51fe714743624dfbf136970`
- 수행 범위: 실코드·실DB 읽기 전용 정찰과 기획만
- 미수행: 코드 구현, 스키마 변경, 공유 DB write, git write, 이슈 등록

## 0. 결론

1. `riUsage`는 엔티티나 DTO 필드가 아니다. 레거시 일마감이 **한 문서 안의 세트 구성품을 수량 단위로 매칭한 뒤, 원본 행별 `total/used`를 잠시 집계하는 런타임 맵**이다.
2. 현재 현대 일마감은 싱글 계열을 명시적으로 `OUT_OF_SCOPE`로 돌린다. 따라서 “반영되지 않는다”는 뜻은 저장 누락이나 화면 필드 누락이 아니라 **세트 구성품 매칭 계산이 없어서 `verified`가 산출되지 않는 것**이다.
3. 세트 저장 구조는 이미 있다. `products.product_type='BUNDLE'`과 `bundle_component`가 부모·구성품·필요수량·종류를 보존한다. 실 `product_db`에는 활성 품목 1,220개, 활성 BUNDLE 344개, 활성 구성품 링크 1,588개가 있다.
4. 다만 현대 `ComponentKind`에는 레거시의 `SUB_INDOOR`가 없다. 실DB의 해당 모델 67행(8개 모델코드, 67개 SINGLE_SET 부모)은 모두 `ACCESSORY`로 저장되어 있어, 현재 저장된 종류값만으로는 레거시 분류를 완전히 복원할 수 없다.
5. 레거시 약정DC의 실 저장소는 `partner_db.partner_price_discounts`가 아니라 `dc_config_db.dc_configs`다. `dc_configs` 210건은 `partner_db` 활성 거래처 7,259건 중 210건과 partnerCode·bizNo 모두 정확히 연결된다.
6. 현재 일마감 BE는 일자 전체에서 같은 품명을 거래처·문서 경계 없이 합친 평균 단가로 1회 판정한다. 이 구조에서는 거래처별 약정DC를 고를 수 없고, 다른 문서의 구성품끼리 세트로 잘못 짝지을 수 있다. **계산 추가 전에 문서·거래처·원본 라인 경계 보존이 선행되어야 한다.**
7. `order-app`, `estimate-app`, `dc-config-service`, `partner-order-service`, `accounting-service`, 레거시 GAS에 할인 계산이 중복돼 있다. 특히 `partner-order-service`는 옵션 플래그 6개를 전부 `false`로 보내고 품목 고정DC도 전달하지 않아 FE와 서버 확정 단가가 달라질 가능성이 확인됐다. 이는 중요한 별도 출시 리스크지만, #874의 원래 범위인 일마감 감사 로직과는 분리하는 편이 안전하다.

## 1. 정찰 기준과 실측 방법

### 1.1 이슈 본문

`gh issue view 874`를 가장 먼저 실행해 본문을 정독했다. 본문 원문 핵심은 다음과 같다.

> `#773 잔여 4건 중 하나`
>
> `- 세트 품목의 riUsage 반영`
>
> `- 거래처 약정 DC 반영`
>
> `🟢 지금 가능(Google 자격 블로커 무관). 단 세트 구성품 모델·약정DC 저장 구조를 먼저 실코드로 확인`

선행 보고서도 같은 경계를 명시한다.

- `docs/dev-reports/2026-07-13-773-s5-purchase-render-modelname.md:55-56`
  > `## 범위 밖 (불변)`
  >
  > `- S1.5(세트 riUsage·거래처 약정DC) ...`

원 스펙의 정의도 일마감 금액 재산정이 아니라 read-time 감사다.

- `docs/specs/773-daily-closing-price-variant-recalc-spec.md:25-33`
  > `레거시 isBeforeHike는 "가격을 다시 매기는(re-pricing)" 것이 아니라 "할인율 재검증(re-validation) 워크시트"다.`
  >
  > `거래처 DC 약정 ... 과 대조 → 확인 플래그만 산출.`
  >
  > `공급가액/부가세/합계는 이카운트 raw 그대로 통과`

### 1.2 DB 조회 안전장치

모든 PostgreSQL 실측은 각 쿼리를 `BEGIN TRANSACTION READ ONLY; ... COMMIT;`으로 감싸 실행했다. 조회한 DB는 `product_db`, `partner_db`, `dc_config_db`, `accounting_db`다. INSERT/UPDATE/DELETE/DDL은 실행하지 않았다.

---

## 2. ① `riUsage`가 무엇이고 지금 어디까지 있는가

### 2.1 정의 위치와 의미

비문서 소스 전체에서 문자열 `riUsage`를 검색한 결과는 두 군데뿐이다.

- `tools/legacy-gas/일마감 프로그램/Code.js:661-710`: 실제 런타임 계산
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:123`: 아직 범위 밖이라는 주석

관련 엔티티, DTO, Flyway migration, FE 타입에는 `riUsage` 필드가 없다. 관련 실DB 4개에서 `ri_usage` 또는 유사 컬럼 수를 조회한 결과도 모두 0이었다.

레거시는 원본 Ecount 각 행에 행 인덱스를 붙인다.

- `tools/legacy-gas/일마감 프로그램/Code.js:458-460`
  > `var ecountDataMapped = ecountData.map(function(r, i) {`
  >
  > `  var obj = { _ri: i };`

그 뒤 문서를 `일자_번호`로 묶는다.

- 같은 파일 `:473-478`
  > `var key = row['일자'] + '_' + row['번호'];`
  >
  > `invoiceGroups[key].push(row);`

각 SINGLE 행은 절대수량만큼 pool 원소로 펼쳐진다.

- 같은 파일 `:568-580`
  > `var qty = money_to_int_(item['수량']) || 1;`
  >
  > `var loopQty = Math.abs(qty);`
  >
  > `pool.push({ ri: item._ri, token: item._token, class: item._cls, unitPrice: ..., used: false });`

세트 가격이 완전히 일치할 때 매칭된 구성품 단위만 `used=true`가 된다.

- 같은 파일 `:650-656`
  > `var finalExpectedPrice = expectedPriceSum - discount;`
  >
  > `if (Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice)) {`
  >
  > `  matchedPoolIdxs.forEach(function(idx) { pool[idx].used = true; });`

그 결과를 원본 행 인덱스별로 집계한 것이 `riUsage`다.

- 같은 파일 `:661-666`
  > `var riUsage = {};`
  >
  > `if (!riUsage[p.ri]) riUsage[p.ri] = { total: 0, used: 0 };`
  >
  > `riUsage[p.ri].total++;`
  >
  > `if (p.used) riUsage[p.ri].used++;`

최종 확인 판정은 그 행의 모든 수량 단위가 소비됐는지를 본다.

- 같은 파일 `:693-710`
  > `var isUsed = (riUsage[item._ri] && riUsage[item._ri].used === riUsage[item._ri].total);`
  >
  > `item['확인'] = (riUsage[item._ri] && riUsage[item._ri].used === riUsage[item._ri].total);`

따라서 `riUsage`의 `ri`는 별도 비즈니스 식별자나 제품 필드가 아니라 **row index**이고, `riUsage` 자체도 영속할 값이 아니라 판정을 위한 중간 산출물이다.

### 2.2 세트 구성품 카탈로그와의 결합

레거시는 `싱글 구성품` 시트를 읽어 다음 세 구조를 만든다.

- `tools/legacy-gas/일마감 프로그램/Code.js:215-266`
  > `var setToComps = {};`
  >
  > `var indoorToSets = {};`
  >
  > `var itemClassMap = {};`
  >
  > `setToComps[setName].push({ token: token, class: cls, price: price, raw: rawName });`

실내기 한 단위를 출발점으로 후보 세트를 찾고, 필수 실외기를 먼저 확보한 후 같은 문서 pool 안에서 나머지 구성품을 선택한다.

- 같은 파일 `:585-615`
  > `var cands = catalog.indoorToSets[ind.token] || [];`
  >
  > `var reqOut = reqComps.find(function(rc) { return rc.class === 'OUTDOOR'; });`
  >
  > `var outIdx = pool.findIndex(function(p) { return !p.used && p.class === 'OUTDOOR' && p.token === reqOut.token; });`

현대 제품 모델에는 같은 관계가 이미 있다.

- `services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponent.java:19-35`
  > `BUNDLE 부모 ↔ component 1:N`
  >
  > `qtyMode: ... FOLLOW_SET ... 전개 시 setQty 비례`
- 같은 파일 `:71-89`
  > `private UUID bundleProductId;`
  >
  > `private String componentProductCode;`
  >
  > `private BigDecimal defaultQty;`
  >
  > `private QtyMode qtyMode;`
  >
  > `private ComponentKind componentKind;`
- `services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:17-29`
  > `product_type ... SINGLE/BUNDLE`
  >
  > `has_variable_discount`
  >
  > `fixed_discount_rate`
- 같은 migration `:75-99`
  > `CREATE TABLE bundle_component`
  >
  > `bundle_product_id`
  >
  > `component_product_code`
  >
  > `default_qty`
  >
  > `qty_mode`

정방향 전개도 이미 구현돼 있다.

- `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:22-35`
  > `BUNDLE(세트) → 구성품 전개 엔진`
  >
  > `FOLLOW_SET → setQty×defaultQty, FIXED → defaultQty`
- 같은 파일 `:91-130`
  > `componentRepository.findByBundleProductId(parent.getId())`
  >
  > `setQty.multiply(c.getDefaultQty())`

단, #874에 필요한 것은 부모 세트에서 구성품을 만드는 정방향 전개가 아니라 **문서에 찍힌 구성품 묶음으로 가능한 부모 세트를 찾는 역방향 판정**이다. 저장소 레벨의 역조회는 있다.

- `services/product-service/src/main/java/com/samhanair/logis/product/repository/BundleComponentRepository.java:43-49`
  > `WHERE bc.componentProductCode = :componentProductCode`
  >
  > `List<BundleComponent> findByComponentProductCode(...)`

그러나 외부 계약은 부모→구성품 조회와 부모→전개뿐이다.

- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductCatalogController.java:394-409`
  > `GET /api/v1/products/{modelCode}/components`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductInternalController.java:263-293`
  > `세트 전개 (internal)`
  >
  > `@PostMapping("/expand")`

구성품 여러 개를 입력해 가능한 부모 BUNDLE 전체를 반환하는 internal bulk/inverse 계약은 확인하지 못했다. 저장소 메서드는 있지만 서비스 외부에서 쓸 수 있는 계약이 검색되지 않았기 때문이다.

### 2.3 실 `product_db` 측정

| 측정값 | 결과 |
|---|---:|
| 활성 품목 | 1,220 |
| 활성 BUNDLE | 344 |
| 활성 구성품 링크 | 1,588 |
| 활성 구성품 부모 UUID 수 | 345 |
| `SINGLE_SET / EXPAND` | 부모 271 / 링크 1,447 |
| `COMMERCIAL_MULTI / EXPAND` | 부모 72 / 링크 137 |
| 분류·mode가 null인 BUNDLE | 부모 1 / 링크 2 |
| `FOLLOW_SET` | 1,584행, `default_qty` 전부 1 |
| `FIXED` | 4행 전체, 활성 부모 기준 2행 |
| 활성 BUNDLE의 미해소 구성품 | 2행, 부모 `TEST-BUNDLE-SET-01` |

활성 부모 수 345가 활성 BUNDLE 344보다 하나 많은 것은 soft-delete된 부모의 링크가 잔존하기 때문이다. 활성 BUNDLE로 다시 제한하면 344다.

운영형 데이터의 `FOLLOW_SET` 필요수량은 현재 모두 1이지만, 도메인은 `default_qty`와 `FIXED/FOLLOW_SET`을 이미 지원한다. 구현·검증은 현재 값이 1이라는 우연에 의존하면 안 된다.

중요한 종류 손실도 실측됐다.

- 현대 enum: `BundleComponent.java:37-44`
  > `INDOOR, OUTDOOR, PANEL, REMOTE, MATERIAL, ACCESSORY, FOOT`
- 레거시 분류: `tools/legacy-gas/일마감 프로그램/Code.js:198-203`
  > `if (u[11] === 'N') return 'INDOOR';`
  >
  > `if (u[11] === 'X') return 'OUTDOOR';`
  >
  > `if (u[11] === 'Q') return 'SUB_INDOOR';`

실DB에서 레거시 규칙상 `SUB_INDOOR`인 `AR...Q` 구성품은 67행, 8개 구성품 코드, 67개 SINGLE_SET 부모였고 현대 값은 전부 `ACCESSORY`였다. sync 분류기가 `SUB_INDOOR`를 표현하지 못하는 이유도 코드로 확인됐다.

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1025-1044`
  > `구분/이름/특징 → ComponentKind`
  >
  > `if (s.contains("실내")) return ... INDOOR;`
  >
  > `return ... ACCESSORY;`

### 2.4 현재 “반영되지 않는다”의 정확한 뜻

현대 재검증 엔진은 싱글 의존 접두를 찾으면 계산하지 않고 종료한다.

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:37-38`
  > `Pattern.compile("^(AC|AP|AR|AF|PC|AWR|ARR).*");`
- 같은 파일 `:52-53`
  > `세트/약정DC 의존 분기로 S2b 범위 밖.`
- 같은 파일 `:123-126`
  > `싱글 본체/부속(세트 riUsage·약정DC 의존): S1.5 대기 → OUT_OF_SCOPE.`
  >
  > `return new Revalidation(... Status.OUT_OF_SCOPE, ...)`

현재 응답 DTO에는 `riUsage`가 없고, 판정 결과만 있다.

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/DailyClosingDetailResponse.java:57-80`
  > `DailyProductLine(... expectedRate, actualRate, verified, revalidationStatus)`

FE도 `riUsage`를 표시하지 않으며 `OUT_OF_SCOPE`를 “대상외”로 표시한다.

- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:52-59`
  > `OUT_OF_SCOPE: '대상외'`
- 같은 파일 `:675-716`
  > `row.verified === ...`
  >
  > `<Badge variant="neutral">판정불가</Badge>`

즉 현재 상태는 다음과 같다.

- 저장: `riUsage` 저장 대상 아님
- 계산: 없음
- 응답: `verified=null`, `OUT_OF_SCOPE`
- 화면: “판정불가 / 대상외”

---

## 3. ② 거래처 약정 DC 저장 구조

### 3.1 레거시 약정DC의 실제 항목

레거시가 거래처별로 읽는 값은 다음과 같다.

- `tools/legacy-gas/일마감 프로그램/Code.js:403-416`
  > `homeRate: num('홈멀티DC')`
  >
  > `commRate: num('상업멀티DC')`
  >
  > `dc360`, `dc4way`, `dc1way`, `stand`, `deluxe`, `grade1`
  >
  > `excl: names('할인제외 품목')`

현재 코드에서 이 구조와 직접 대응하는 엔티티는 `dc-config-service`의 `DcConfig`다.

- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/domain/DcConfig.java:22-38`
  > `거래처별 DC 설정 (Partner 1:1)`
  >
  > `legacy applyConfigFromServer ... CFG_RAW 보존`
  >
  > `homeDiscountRate`, `commercialDiscountRate`
  >
  > `discount{360 / 4Way / 1Way / Stand / Deluxe / FirstGrade}Amount`
- 같은 파일 `:52-91`
  > `@JoinColumn(name = "partner_id", ... unique = true)`
  >
  > `home_discount_rate`
  >
  > `commercial_discount_rate`
  >
  > 옵션 정액 DC 6종
- `services/dc-config-service/src/main/resources/db/migration/V1__init_dc_config.sql:48-79`
  > `CREATE TABLE dc_configs`
  >
  > `partner_id ... REFERENCES partners(id)`
  >
  > `home_discount_rate`, `commercial_discount_rate`
  >
  > 옵션 정액 컬럼 6종

import 역시 레거시 CSV 컬럼을 그대로 매핑한다.

- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/DcConfigImportService.java:137-184`
  > `String partnerCode = ...`
  >
  > `BigDecimal homeRate = parsePercent(...)`
  >
  > `BigDecimal commRate = parsePercent(...)`
  >
  > 옵션 6종
  >
  > `cfg.changeSource(DcConfigSource.LEGACY_CSV)`

기존 internal 조회 계약도 있다.

- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/web/InternalDcConfigController.java:81-95`
  > `GET /partner-dc-configs`
  >
  > `전체 DC 설정 벌크 조회`
- 같은 파일 `:111-124`
  > `GET /partner-dc-configs/{partnerCode}`

### 3.2 실 `dc_config_db` 값

| 측정값 | 결과 |
|---|---:|
| 활성 `dc_configs` | 210 |
| 홈 할인율 nonzero | 159 |
| 상업 할인율 nonzero | 128 |
| 홈·상업 둘 다 null | 16 |
| 옵션 정액 6종 중 하나 이상 nonzero | 46 |
| source | 210건 전부 `LEGACY_CSV` |
| 활성 `dc_rules` | 0 |

`dc_config_db` 내부 `partners.partner_code` 210개와 `partner_db` 활성 거래처 7,259개의 연결을 조회한 결과:

| 비교 | 일치 |
|---|---:|
| exact `partner_code` | 210/210 |
| exact `biz_no` | 210/210 |
| 구두점 제거 후 partnerCode 또는 bizNo | 210/210 |

즉 별도 DB의 UUID는 공유하지 않지만, 현재 실데이터에서는 약정 210건 전부가 공개 비즈니스 키인 10자리 partnerCode/bizNo로 연결된다.

### 3.3 `partner_price_discounts`와 다른 이유

`partner_db.partner_price_discounts`도 이름만 보면 후보지만 의미와 데이터가 다르다.

- `services/partner-service/src/main/java/com/samhanair/logis/partner/domain/PartnerPriceDiscount.java:18-48`
  > `거래처 단가/할인 정책 (4탭 탭2)`
  >
  > `Partner 와 1:1`
  >
  > `기본 할인율 (%). 0.00 ~ 99.99`
- `services/partner-service/src/main/resources/db/migration/V6__add_partner_4tab.sql:21-58`
  > `partner_price_discounts — 단가/할인 정책`
  >
  > `basic_discount_rate NUMERIC(5,2)`

이 테이블에는 홈/상업 분리, 옵션 정액 6종, 단위처리, 제외품목이 없다. 실DB도 활성 5건뿐이고 값은 `0.00, 1.50, 2.00, 3.00, 5.00`이다. 이 5건은 migration 자체가 개발 seed임을 명시한다.

- `services/partner-service/src/main/resources/db/migration/V7__seed_p0_6_partners_full.sql:300-304`
  > `[DEV-SEED] partner_price_discounts — 각 5건 1행씩`

따라서 7,259개 실수입 거래처의 약정DC 저장소로 볼 수 없고, 레거시 45~50%대 홈/상업 DC와도 단위·의미가 다르다.

`partners.outbound_adjustment_rate/inbound_adjustment_rate`도 약정DC가 아니다. 실DB에 legacy 잔존값이 있는 거래처는 55개지만, migration은 해당 필드가 실제 Ecount export에 없음을 명시한다.

- `services/partner-service/src/main/resources/db/migration/V10__align_partners_to_ecount_export.sql:7-12`
  > `실제 거래처 백업 export 는 17 컬럼만 출력`
  >
  > `outbound_adjustment_rate/inbound_adjustment_rate ... 잉여`
- 같은 파일 `:51-52`
  > `이카운트 export 무존재 → NULL 허용`

### 3.4 기존 DC 체계와의 구분·우선순위

| 체계 | 저장 위치 | 축/단위 | 실데이터 | #874에서의 의미 |
|---|---|---|---:|---|
| 품목 고정DC | `product_db.products.fixed_discount_rate` | 품목별 percent (`45.00`) | 활성 167품목 | 거래처 약정보다 우선 |
| 변동DC 여부 | `product_db.products.has_variable_discount` | 품목별 boolean | 활성 802품목 | true일 때 고정DC 또는 거래처율 사용 |
| 거래처 약정DC | `dc_config_db.dc_configs` | 거래처별 홈/상업 fraction + 옵션 정액 | 210건 | 레거시 `discInfo` 정본 |
| 일반 기본 할인 | `partner_db.partner_price_discounts` | 거래처별 단일 percent | 개발 seed 5건 | #874 약정DC 아님 |
| 확장 룰 | `dc_config_db.dc_rules` | 모델/카테고리/기간 룰 | 0건 | 이번 범위 밖 |

레거시 멀티 판정의 실제 우선순위는 명확하다.

- `tools/legacy-gas/일마감 프로그램/Code.js:721-729`
  > `if (item._fixedDc != null) ...`
  >
  > `else if ... COMM_MULTI ... (discInfo.commRate || 0.45)`
  >
  > `else if ... HOME_MULTI ... (discInfo.homeRate || 0.45)`
  >
  > `else ... 45`

현대 일마감은 고정DC와 45 폴백까지만 구현했다.

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:114-121`
  > `멀티 ... 고정dc(percent) 또는 45 폴백`
  >
  > `Integer expectedRate = fixedDc == null ? 45 : roundPercent(fixedDc);`

따라서 현재 누락은 `fixedDc == null`일 때 해당 거래처와 홈/상업 구분에 맞는 `dc_configs` 값을 참조하는 단계다.

---

## 4. ③ 금액 경로에서 적용돼야 하는 지점

### 4.1 레거시 oracle의 정확한 적용 순서

1. 문서를 `일자_번호`로 그룹화한다: `Code.js:473-478`.
2. 각 행의 출고가·납품가·품목 고정DC·VAT 포함 단가·수량을 준비한다: `:550-561`.
3. 문서 첫 행의 거래처코드로 약정DC를 고른다: `:564-566`.
4. SINGLE 구성품을 수량 단위 pool로 확장한다: `:568-583`.
5. 구성품 납품가 합계에서 거래처 옵션 정액을 1회 차감한 기대 세트 가격을 만든다: `:619-650`.
6. 실제 구성품 단가 합과 기대 가격이 같으면 그 수량 단위를 소비 처리한다: `:651-656`.
7. 행별 `riUsage` 완전소비 여부로 SINGLE을 판정한다: `:661-710`.
8. MULTI는 품목 고정DC, 거래처 카테고리율, 45 폴백 순으로 판정한다: `:714-731`.

세트 구성품 가격 referent는 `싱글 구성품` 시트의 납품가다.

- `Code.js:227-243`
  > `if (header[i].indexOf('납품가') > -1) pCols.push(i);`
  >
  > `var price = money_to_int_(data[i][pIdx]);`

현대에서는 마감일 `asOf`에 적용되는 `price_history.delivery_price`가 이에 대응한다. 현재 정방향 `BundleExpander`는 현재 `Product.deliveryPrice`를 사용하므로(`BundleExpander.java:103-110`), 그것만 그대로 호출하면 과거 마감일 감사 기준을 잃는다.

### 4.2 현재 BE 경로와 누락 위치

일마감 endpoint에는 거래처 축이 없다.

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:176-185`
  > `GET /accounting/closings/daily`
  >
  > `date`, `kind`, `sourceKind`

FE 호출에도 partnerCode가 없다.

- `clients/desktop/src/renderer/api/closingApi.ts:225-234`
  > `getDailyClosingDetail(date, kind?, sourceKind?)`
  >
  > `{ params: { date, kind, sourceKind } }`

세금계산서 경로는 일자 전체의 발행문서를 읽은 뒤 `itemName` 하나만 key로 사용한다.

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:198-235`
  > `findIssuedInRange(... date, date)`
  >
  > `Map<String, ModelAccumulator> byModel`
  >
  > `String key = line.getItemName()`
  >
  > `acc.quantity`, `acc.supplyAmount`, `acc.vatAmount`

매출전표와 매입전표도 같은 방식으로 품명만 누적한다.

- 같은 파일 `:251-316`
  > `Map<String, ModelAccumulator> byModel`
  >
  > `accumulateProduct(byModel, line.getProductName(), ...)`
- 같은 파일 `:345-355`
  > `String key = productName ...`
  >
  > `byModel.computeIfAbsent(key, ...)`

그 뒤 시점 가격과 품목 고정DC만 bulk 조회해 집계행당 1회 판정한다.

- 같은 파일 `:357-398`
  > `loadApplicablePrices(matchedProductIds, asOf)`
  >
  > `loadFixedDiscountRates(matchedProductIds)`
  >
  > `discountRevalidator.revalidate(...)`

현재 누락은 두 층이다.

1. **집계 전 누락**: partnerId/partnerCode, 문서번호, 원본 line, 개별 unitPrice가 `byModel`에 들어가기 전에 사라진다. 이 상태에서는 약정DC 선택과 문서 단위 세트 매칭이 불가능하다.
2. **판정 엔진 누락**: `DiscountRevalidator.revalidate` 입력에는 partner/category agreement와 문서 구성품 묶음이 없고, SINGLE은 `OUT_OF_SCOPE`, MULTI는 무조건 45 폴백이다.

현 엔진 Javadoc도 평균이 오류를 상쇄할 수 있음을 이미 인정한다.

- `DiscountRevalidator.java:24-27`
  > `itemName 집계 기준`
  >
  > `서로 다른 단가로 팔리면 평균이 개별 오류를 상쇄/희석`

거래처별 약정DC가 추가되면 이는 단순 정확도 문제가 아니라 잘못된 거래처의 약정을 섞는 문제가 된다. 세트 매칭도 다른 문서의 실내기·실외기를 서로 소비하는 거짓 양성을 만들 수 있다.

### 4.3 실 `accounting_db`에서 현재 재현 가능한 정도

읽기 전용 실측 결과:

| 경로 | 전체 라인 | SINGLE 접두 라인 | AM/AJ 접두 라인 |
|---|---:|---:|---:|
| 세금계산서 | 22 | 0 | 0 |
| 매출 회계전표 | 0 | 0 | 0 |
| 매입 회계전표 | 0 | 0 | 0 |

세금계산서는 19건, 거래처 15개, 기간 2026-04-05~2026-07-27이었다. 현재 공유 `accounting_db`에는 #874 대상 HVAC 라인이 없어 실데이터로 판정 결과까지 재현하지 못했다. 이유는 대상 접두 라인이 0건이기 때문이다. 따라서 금액 파리티는 레거시 oracle 기반 fixture와 격리된 테스트 DB로 검증해야 한다.

---

## 5. ④ 두 앱·BE의 중복 구현

### 5.1 전부 확인된 구현 목록

| 위치 | 역할 | 확인된 계산 |
|---|---|---|
| `tools/legacy-gas/일마감 프로그램/Code.js:420-735` | 감사 oracle | 문서별 세트 `riUsage`, 약정DC 대조 |
| `clients/web/order-app/index.html:1502-1548` | 주문 FE 설정 | dc-config 중첩 응답을 홈/상업/옵션/반올림 값으로 정규화 |
| `clients/web/order-app/index.html:2691-2861` | 주문 FE 단가 | 홈·싱글·상업 계산, 고정DC 우선, 약정율·옵션 정액 |
| `clients/web/estimate-app/lib/code.js:1979-2024` | 견적 BE bridge | `/internal/partner-dc-configs` 10분 cache |
| `clients/web/estimate-app/views/index.ejs:2550-2605` | 견적 FE 설정 | 홈/상업/옵션 6종을 input에 적용 |
| `clients/web/estimate-app/views/index.ejs:4304-4458` | 견적 FE 단가 | 홈·싱글·상업 계산 |
| `services/dc-config-service/.../PriceCalculationService.java:20-117` | 공용 BE 계산 | 카테고리율, 옵션 정액 6종, 반올림 |
| `services/partner-order-service/.../DcConfigClient.java:68-143` | 주문 확정 BE client | dc-config 계산 호출 |
| `services/partner-order-service/.../PartnerOrderConfirmService.java:142-175` | 주문 저장 | 응답 finalPrice를 확정 라인에 저장 |
| `services/accounting-service/.../DiscountRevalidator.java:68-129` | 일마감 감사 | 고정DC/45 폴백, SINGLE 범위 밖 |
| `services/product-service/.../BundleExpander.java:22-130` | 세트 정방향 전개 | 구성품 수량과 단가, SINGLE 6:4 재배분 |

### 5.2 실제 드리프트

#### 주문 앱과 견적 앱

두 앱 모두 고정DC가 있으면 거래처율보다 우선한다.

- 주문: `clients/web/order-app/index.html:2726-2729`, `:2850-2855`
  > `const useRate = (fixedDc ?? rate);`
  >
  > `const useRate = (fixedDc ?? globalRate);`
- 견적: `clients/web/estimate-app/views/index.ejs:4337-4341`, `:4448-4452`
  > `const finalRate = (parsedFixed !== null) ? parsedFixed : globalRate;`

그러나 싱글 옵션 계산은 미세하게 다르다.

- 주문 `:2807`
  > `rateAmt < 1 ? ... 비율 ... : ... 정액 차감`
- 견적 `:4403`
  > `Math.max(0, val - rateAmt)`

현재 실 옵션 값은 정액이므로 당장 결과가 같을 수 있으나, 같은 계약을 서로 다른 규칙으로 해석하는 중복이다.

#### dc-config BE와 partner-order 확정

`PriceCalculationService`는 카테고리율과 옵션 정액을 지원한다.

- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:60-78`
  > `pickCategoryRate`
  >
  > `sumOptionDc`
  >
  > `afterRate.subtract(optionDc)`

하지만 `partner-order-service`의 요청 record에는 옵션 정보가 없고 실제 payload 6개를 전부 `false`로 만든다.

- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/DcConfigClient.java:68-70`
  > `PriceLine(... listPrice, category, quantity)`
- 같은 파일 `:118-123`
  > `m.put("is360", false)`
  >
  > `m.put("is4Way", false)` ... 옵션 6종 전부 false

확정 서비스는 이 결과를 FE 가격보다 우선해 저장한다.

- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:142-155`
  > `dcConfigClient.calculatePrices(partnerCode, priceLines)`
- 같은 파일 `:166-175`
  > `BigDecimal priceVat = finalPrices.getOrDefault(..., p.sellingPrice())`
  >
  > `PartnerOrderLine.create(... priceVat ...)`

또한 이 BE 가격 요청에는 `Product.fixedDiscountRate`가 없어 FE의 “품목 고정DC 우선”을 재현하지 못한다. 이 경로의 실 `price_calculation_logs`는 현재 1건뿐이어서 폭넓은 실주문 결과 비교는 하지 못했다. 코드 계약상 옵션 false와 고정DC 누락은 확인됐다.

#### accounting BE

accounting에는 `dc-config` client나 약정 필드 사용이 없다. main source 검색에서 관련 호출을 찾지 못했고, `DiscountRevalidator`는 품목 고정DC/45만 받는다. 이는 #874가 채워야 할 직접 누락이다.

### 5.3 하드코딩·조용한 스킵 함정

같은 위험 패턴이 이 영역에도 있다.

- 주문 상업 단가: `clients/web/order-app/index.html:2820-2824`
  > `const r = (COMMULTI||[]).find(...)`
  >
  > `if(!r){ return 0; }`
- 견적 상업 단가: `clients/web/estimate-app/views/index.ejs:4416-4418`
  > `const r = ...find(...)`
  >
  > `if(!r) return 0;`
- 주문 세트 기본가: `clients/web/order-app/index.html:5892-5894`
  > `const s = SINGLE_SETS.find(...)`
  >
  > `if (!s) return 0;`
- 견적 세트 기본가: `clients/web/estimate-app/views/index.ejs:8904-8906`
  > `const s = SINGLE_SETS.find(...)`
  >
  > `if (!s) return 0;`
- 주문 파생 상수: `clients/web/order-app/index.html:2877-2913`
  > 여러 하드코딩 모델을 `.find(...) || {}`로 찾고 빈 문자열/null로 환원
  >
  > `filter(Boolean)`과 `if (CONSTANT)`로 후속 계산을 조용히 생략
- 견적에도 동일 복제: `clients/web/estimate-app/views/index.ejs:4474-4510`

`PANEL_MODELS` 26개와 주요 직접 하드코딩 모델 11개를 실 `product_db`에서 exact modelCode로 조회한 결과는 이번 정찰 시점에는 모두 활성 상태였다. 즉 **현재 그 하드코드 자체로 인한 실누락은 재현되지 않았지만, 미해소 시 0원 또는 무음 생략하는 구조적 위험은 존재**한다.

제품 BE에도 유사한 fail-soft가 있다.

- `BundleExpander.java:103-110`
  > 구성품이 해소되지 않으면 `productId=null`, 이름=코드, `price=0`

반면 repository 문서는 운영 전 미해소 0건을 요구한다.

- `BundleComponentRepository.java:108-116`
  > `미해소 = ... 견적/전표 NOT_FOUND. 운영 전 0 이어야 함.`

실DB에는 활성 `TEST-BUNDLE-SET-01` 아래 미해소 구성품이 2행 있다. #874 역매칭은 이를 정상 0원 구성품처럼 받아 거짓 통과시키면 안 된다.

### 5.4 골든 정답지 영향

`clients/web/legacy-quantity-golden/`은 이름 그대로 수량 경계를 검증한다.

- `clients/web/legacy-quantity-golden/fixtures.js:3-11`
  > `가격을 포함하지 않는 모델 참조 fixture`
  >
  > `카탈로그 snapshot과 원수량·옵션·수동잠금 입력만 선언`
- `clients/web/legacy-quantity-golden/legacyQuantityBoundary.js:169-174`
  > `const homeUnitPrice = () => 0;`

따라서 #874를 일마감 read-time 감사에 한정하면 기존 quantity golden의 기대출력은 바뀌지 않는다. 앱의 수량/세트 파생 동작까지 건드리는 확장을 선택할 때만 영향이 생긴다. 그 경우 기대값 oracle은 반드시 `tools/legacy-gas/**`여야 하며 현대 앱 출력에서 기대값을 다시 만들면 안 된다.

---

## 6. 범위 제안

### 6.1 이번 #874 구현 범위로 제안

1. **일마감 read-time 감사 경로만 완결**
   - 세금계산서, 매출 회계전표, 매입 회계전표 세 경로가 현재 같은 재검증 엔진을 쓰므로 세 경로 모두 동일한 경계·판정 규칙을 적용한다.
   - 마감/전표/세금계산서 원금, 공급가, VAT, 합계는 변경하지 않는다.

2. **문서·거래처·원본 라인 단위 판정 기반 복구**
   - 거래처별 약정 선택과 세트 구성품 소비가 서로 다른 문서나 거래처를 넘지 않도록 한다.
   - 일자·품명 합계는 판정이 끝난 뒤 화면 표현을 위해서만 사용한다.

3. **실 저장소를 referent로 사용**
   - 세트 정의·필요수량·구성품 코드는 `product_db`의 활성 BUNDLE/`bundle_component`를 기준으로 한다.
   - 구성품 가격은 마감일 `asOf`에 적용되는 `price_history.delivery_price`를 기준으로 한다.
   - 거래처 약정은 `dc_config_db.dc_configs`를 partnerCode로 연결한다.
   - 품목 고정DC는 기존 `products.fixed_discount_rate`를 그대로 우선한다.

4. **레거시와 같은 세트 완전소비 판정**
   - 수량 단위 소비, 실내기 후보 선택, 필수 실외기, 선택 구성품, 옵션 정액 1회, 전 구성수량 완전소비 여부를 재현한다.
   - `SUB_INDOOR`는 현재 저장 종류값이 손실돼 있으므로 레거시 모델 토큰 규칙으로 정확히 식별한다.

5. **실패를 성공으로 바꾸지 않는 상태 표현**
   - 미해소 구성품, 적용 가격 결측, 약정 조회 장애, 서로 다른 결과가 섞인 집계는 `true`로 통과시키지 않는다.
   - `riUsage` 자체는 응답/DB에 새 필드로 저장하지 않고 `verified`와 사유 상태만 산출한다.

6. **계약·회귀 테스트와 read-only canary**
   - 레거시 GAS에서 직접 도출한 fixture로 가격·수량·옵션·우선순위를 검증한다.
   - 실DB에는 조회형 정합 canary만 실행한다.

### 6.2 이번에 미룰 범위

1. `order-app`·`estimate-app`의 가격/수량 로직 수정
   - 다른 트랙이 현재 해당 디렉터리를 수정 중이고, #874는 #773 일마감 감사 잔여다.
2. `partner-order-service` 확정 단가의 옵션 false·품목 고정DC 누락 수정
   - 출시 전 별도 우선순위 판단이 필요하지만, #874에 섞으면 감사 리포트와 주문 원금 변경이 한 PR에 결합된다.
3. `partner_price_discounts.basic_discount_rate`의 약정DC 통합
   - 의미·단위·실데이터가 레거시 약정과 다르고 정책 결정이 없다.
4. `dc_rules`
   - 실데이터 0건이며 현재 레거시 oracle의 필수 입력이 아니다.
5. `SUB_INDOOR` enum 추가와 실 `bundle_component` backfill
   - #874 감사 판정은 레거시 토큰으로 복원 가능하다. 도메인 정규화 migration은 별도 데이터 변경으로 분리한다.
6. `riUsage` 영속·FE 노출
   - 레거시도 런타임 중간값일 뿐이며 사용자에게 필요한 결과는 `확인` 판정이다.
7. `totalDiscount` 실계산과 원금 재가격
   - 선행 결정대로 placeholder와 금액 불변을 유지한다.
8. quantity golden 변경
   - 제안 범위에서는 수량 생성 로직이 바뀌지 않는다.

---

## 7. 불변식 후보

아래는 구현 수단이 아니라 반드시 성립해야 하는 결과 조건이다.

1. 한 문서의 구성품은 다른 문서나 다른 거래처의 구성품을 소비하지 않는다.
2. 한 원본 행은 그 행의 모든 수량 단위가 유효한 세트에 소비된 경우에만 완전소비 상태다.
3. 실내기·실외기·보조실내기의 필수 관계가 충족되지 않은 세트는 확인 상태가 아니다.
4. 같은 수량 단위는 둘 이상의 세트에 중복 소비되지 않는다.
5. 세트 구성품의 기대 금액은 마감 기준일에 유효한 구성품 납품가와 해당 거래처 옵션 약정으로 결정된다.
6. 거래처 옵션 정액은 해당 세트 판정에 정확히 한 번만 반영된다.
7. 품목 고정DC가 존재하면 거래처 홈/상업 약정율보다 우선한다.
8. 품목 고정DC가 없으면 상업멀티는 해당 거래처 상업율, 홈멀티는 해당 거래처 홈율을 따른다.
9. 적용 가능한 거래처 카테고리율이 없으면 레거시 45% 폴백과 동일한 결과가 난다.
10. `0`인 고정DC·약정값은 유효값이며 `null`과 구분된다.
11. percent 저장값과 fraction 저장값은 서로의 단위를 중복 적용하지 않는다.
12. 미해소 구성품, 결측 시점가격, 약정 서비스 장애는 확인 성공으로 보이지 않는다.
13. 여러 라인의 평균이 개별 불일치를 상쇄해 확인 성공을 만들지 않는다.
14. 일마감 감사 결과는 원천 공급가액·VAT·합계·전표 상태를 변경하지 않는다.
15. 사용자 화면과 응답에는 내부 UUID가 노출되지 않는다.
16. 같은 입력·같은 기준일·같은 referent는 반복 조회에서 같은 판정을 만든다.

---

## 8. 검증 계획

### 8.1 oracle 단위 테스트

`tools/legacy-gas/일마감 프로그램/Code.js:568-731`을 oracle로 다음 fixture의 기대값을 독립 산출한다.

- 세트 1개 완전일치
- 동일 세트 수량 2 이상 완전일치
- 일부 수량만 구성품이 있는 경우
- 실외기 누락
- 보조실내기(`AR...Q`) 포함/누락
- 같은 실내기에 후보 세트가 여러 개인 경우
- 패널·리모컨·자재 일부 존재/부재
- 360/4way/1way/스탠드/디럭스/1등급 정액 각각
- 옵션 할인제외 세트/품목
- 음수 수량·음수 단가의 절대값 비교
- 고정DC `null`, `0`, 35/40/45/50
- 거래처 홈율/상업율 `null`, `0`, 실값
- 45% 폴백

현대 산출물을 기대값 생성기로 사용하지 않는다.

### 8.2 product 계약 검증

- 부모 BUNDLE, 구성품 코드, `default_qty`, `qty_mode`, `component_kind`의 부분 성공/결측 계약
- 활성 부모만 사용
- 미해소 구성품 1개라도 있는 후보의 fail-closed
- `SUB_INDOOR` 8개 실 모델코드의 분류 파리티
- 기준일 전/후 `price_history.delivery_price` 선택
- 동일 구성품이 여러 부모에 속할 때 후보 결정성

### 8.3 dc-config 계약 검증

- partnerCode exact 연결
- 홈/상업율 분리
- 옵션 정액 6종
- 약정 없음과 서비스 장애 구분
- 품목 고정DC 우선
- `0`과 `null` 구분
- fraction(`0.45`)과 percent(`45.00`) 스케일 파리티
- bulk 응답 누락·중복·soft-delete 방어

### 8.4 accounting 통합 검증

각 sourceKind(`TAX_INVOICE`, `SALES_SLIP`, `PURCHASE_SLIP`)에 다음을 만든다.

- 같은 날·같은 모델·서로 다른 거래처 두 곳, 서로 다른 약정
- 같은 날·같은 모델·같은 거래처의 서로 다른 문서 두 건
- 한 문서의 세트 완전일치와 다른 문서의 불완전 세트
- 같은 품명의 서로 다른 단가
- 라벨 NOT_FOUND/AMBIGUOUS
- 구성품 가격 결측
- dc-config 404와 5xx

검증 결과는 문서/거래처 경계를 넘지 않아야 하고, 원천 금액 snapshot은 호출 전후 완전히 같아야 한다.

### 8.5 FE/계약 검증

- 기존 `확인`, `불일치`, `판정불가`, 사유 표시 회귀
- 새 혼합 상태를 선택한다면 타입·허용값·mock·렌더의 완전 동기화
- UUID 비노출
- 동일 품명 다중 판정의 사용자 해석 가능성

### 8.6 실DB read-only canary

- 활성 BUNDLE에 구성품 0개인 부모 수
- 미해소 구성품 수
- `SUB_INDOOR` 토큰과 저장 kind 불일치 수
- dc-config partnerCode의 partner_db 매칭률
- 약정 홈/상업/옵션 값 분포
- 일마감 대상 라인의 partnerCode 미해소 수

실 공유 DB에는 write fixture를 만들지 않는다. 현재 `accounting_db`에 대상 HVAC 라인이 0개이므로 실 판정 canary는 데이터가 들어온 뒤 별도로 반복한다.

### 8.7 하드코딩/골든 가드

- 두 앱의 하드코딩 모델 목록이 활성 카탈로그에 모두 해소되는지 검증
- `.find()` 미해소가 0원 성공으로 이어지는 경로 검출
- #874가 quantity 동작을 바꾸지 않는 동안 기존 golden은 byte-level 기대값 변경 없음
- quantity 동작을 변경하게 되면 `tools/legacy-gas/**` 실행 결과만 새 기대값의 근거로 사용

---

## 9. 개발책임자 결정이 필요한 것

### 결정 1 — 일자 화면에서 거래처·문서별 판정을 어떻게 표현할지

현재 `productSummaries`는 일자+품명 1행이다. 정확한 판정은 거래처+문서+원본 라인 단위여야 하므로 표시 축 결정이 필요하다.

- **(a) 권장: 기존 품명 요약은 유지하되, 개별 판정이 하나라도 불일치면 요약도 불일치로 하고 서로 다른 기대율/실제율이 섞이면 명시적 혼합 상태와 건수를 표시**
  - 화면 밀도를 유지하면서 평균에 의한 거짓 성공을 막는다.
- (b) 품명 행을 거래처·문서별로 분리
  - 가장 직접적이지만 일자 데이터가 많을 때 행 수가 크게 늘고 DTO/화면 변화가 크다.

결정 전에는 `expectedRate`, `actualRate`, `verified` 한 칸에 서로 다른 거래처 결과를 어떻게 축약할지 정답이 없다.

### 결정 2 — 발견된 주문 확정 단가 드리프트를 출시 차단 항목으로 볼지

확인된 사실은 다음과 같다.

- 주문/견적 FE는 거래처 옵션 정액과 품목 고정DC를 계산한다.
- `partner-order-service`는 옵션 6종을 전부 false로 보내고 품목 고정DC를 전달하지 않는다.
- 서버 확정 응답 단가가 주문 라인에 저장된다.

**권장안은 #874에는 포함하지 않고, 현재 병렬 트랙이 끝난 직후 별도 출시 전 점검·수정 대상으로 다루는 것**이다. #874에 포함하면 read-only 감사와 주문 원금 변경이 결합되고, 현재 다른 트랙이 수정 중인 `order-app`과 충돌한다. 다만 서비스 개시 전에 실제 주문 확정 단가의 FE↔BE 샘플 비교는 반드시 필요하다.

## 10. 정찰 완료 판정

- ① `riUsage` 정의·저장·계산·FE 상태: 확인 완료
- ② 약정DC 저장 구조·기존 DC와 차이·실데이터: 확인 완료
- ③ 세트/거래처 금액 경로와 누락 지점: 확인 완료
- ④ 두 앱·BE 중복과 드리프트: 확인 완료
- 실 `accounting_db` 대상 HVAC 판정 재현: 확인하지 못함
  - 이유: 현재 세금계산서 SINGLE/AM/AJ 대상 라인 0건, 매출·매입 회계전표 라인 0건
- 구현: 사용자 지시대로 수행하지 않음
