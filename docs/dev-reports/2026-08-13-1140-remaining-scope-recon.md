# #1140 잔여 범위 정찰 — `단가변동` 명칭·기본값·구형 토글

> 조사일: 2026-08-13 KST  
> 코드 기준: `main` `395f4311532d4e2e11af0ab357d116565155688f`  
> 비교 머지: PR #1184 / `7f9335d067117e6594a30eb0f93f4e8cc1fed62d`  
> DB: 집PC 공유 `samhan-postgres.product_db`, 모든 조회에 `default_transaction_read_only=on` 및 `BEGIN TRANSACTION READ ONLY` 적용  
> 금지 준수: 제품 코드 수정 0, DB 쓰기 0, git 쓰기 0. 이 보고서만 신규 작성했다.

## 0. 결론

1. **PR #1184는 #1140을 구현하지 않았다.** #1140에서 머지된 것은 정찰 문서 2개와 트랙 문서 1개다. 기능 코드는 #1090 분류 정본 전환이다. PR의 최종 머지 코멘트도 “`#1140`은 이 PR에 들어 있지 않습니다”라고 명시한다.
2. 개발책임자 결정 B는 **미구현**이다. 집PC DB의 활성 구형은 정확히 **37개**지만 `2000-01-01` baseline은 **0개**, 누락은 **37개**다.
3. 현재가와 기존 `2026-04-01` 스냅샷은 출고가·납품가 모두 **37/37 동일, 차이 합계 0원**이다. 그러나 그 스냅샷은 현재 코드가 조회하는 baseline 날짜가 아니므로 “B가 구현돼 0원”이라는 증거가 아니다.
4. 구형 토글은 없다. Desktop 관리 화면은 구형을 `대상 아님`으로 표시하고, 웹 종합견적서는 `chkHomeInc`·`chkSingleInc`·`chkCommInc` 3개만 만든다. 따라서 **토글 전환 no-op을 실행할 수조차 없다.**
5. `단가변동` 명칭 통일도 미완료다. 이 산출물 자체를 제외한 현재 저장소에 exact `인상 전 단가`가 **55파일·114개 줄** 남아 있고 실제 사용자 라벨도 8줄 남아 있다. DB 일반 값에는 exact 옛 문구가 0건이지만 적용된 컬럼 comment에는 1건 남아 있다.
6. `기본값 설정 가능`은 **선행 기능만 부분 구현**돼 있다. 기존 음의 의미 `default_pre_change`를 3개 견적 토글에 설정하는 GET/PUT·Desktop 관리 UI는 있다. #1140의 양의 의미 `단가변동 기본값 = NOT default_pre_change`, 값 반전, 구형의 실제 소비는 없다.
7. 따라서 이슈 #1140은 **닫으면 안 된다.** 결정 B가 내려졌을 뿐 구현·데이터·4번째 토글·표기 통일·회귀 검증이 모두 남았다.

## 1. #1184가 닫은 것

### 1.1 GitHub와 시간 순서

- PR #1184 머지: `2026-08-12T20:16:07Z` = 2026-08-13 05:16:07 KST.
- #1140 개발책임자 결정 B 코멘트: `2026-08-12T22:12:40Z` = 2026-08-13 07:12:40 KST.
- 즉 결정 B는 #1184 머지 약 1시간 56분 **뒤**에 확정됐다. #1184가 B를 구현했을 수 없다.
- PR #1184 최종 코멘트 원문: “⚠️ **`#1140`(단가변동 명칭 통일)은 이 PR에 들어 있지 않습니다.** 정찰만 끝났고 baseline 결정이 필요합니다.”

### 1.2 #1140에 대해 실제 추가된 파일·라인

| 파일 | #1184가 넣은 내용 | 현재 줄 |
|---|---|---:|
| `docs/tracks/2026-08-12-1090-1140-discount-axis.md` | 트랙 개설, #1140 범위, 정찰 질문 | 1, 11, 25-31 |
| `docs/dev-reports/2026-08-12-1090-1140-recon-sol.md` | 저장 위치·의미 반전·구형 baseline 0건 정찰, 구현 후보 | 12-13, 138-205, 324-352, 420-528 |
| `docs/dev-reports/2026-08-13-1140-recon.md` | 37품목 실측, baseline 후보 A/B/C, 명칭 전수, S0-S5 후보 | 8-14, 47-76, 127-213, 215-287, 346-385 |

특히 `2026-08-13-1140-recon.md:281-287`은 B를 **후보**로만 적고 “선택하지 않음”이라고 명시한다. 당시 닫힌 것은 다음뿐이다.

- 구형 역사 baseline은 DB·저장소에서 복원 불가라는 사실.
- 당시 PC에서 활성 구형 37개, baseline 0개라는 측정.
- `default_pre_change`가 새 양의 의미와 반대라는 계약 위험.
- 남아 있는 문구·내부 식별자·후속 슬라이스 후보.

### 1.3 #1184의 기능 코드는 #1090

PR stat은 57파일 `+3631/-110`이지만 #1140 기능 파일은 없다. 대표 기능 근거는 다음과 같이 #1090 분류 정본이다.

- `services/product-service/src/main/resources/db/migration/V42__classification_discount_option_canon.sql:1-40`: 분류가 있는 제품에 `discount_option` 이관.
- `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:642-655`: 기존 모델 표식의 정액 DC 근거를 분류 정본으로 승격.
- `clients/desktop/src/renderer/utils/slipDiscount.ts:7-10,104-107`: 분류 정본 및 미분류 한시 fallback.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPriceCalculationService.java:223-240`: 주문 가격 계산의 정액 DC 근거 전환.

반대로 #1140이 필요로 하는 `price_change_schedule` 의미 반전 migration, 구형 `price_history` 적재, `chkOld...`, 4번째 토글 변경은 #1184 stat에 없다.

### 1.4 #1184 이후 관련 변경

`fb44285e1 feat(1092): 카테고리별 단가변동을 제품 메뉴로 이동`이 기존 관리 섹션을 `EstimatePricingConfigPage`에서 `ProductPriceSchedulePage`로 옮겼다. 이는 경로 이동이며 #1140 구현이 아니다.

- `clients/desktop/src/renderer/routes/ProductPriceSchedulePage.tsx:30-37`: 토글 대상은 여전히 3종.
- 같은 파일 `170,211`: 라벨은 여전히 `인상 전 단가 기본값` / `인상 전 단가 기본 적용`.
- 같은 파일 `177,213-215`: `oldProducts`는 여전히 토글 없이 `대상 아님`.
- `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.priceSchedule.test.tsx:187-217`: 테스트가 구형 토글 부재와 `defaultPreChange` 미전송을 적극 보장한다.

## 2. 개발책임자 결정 B 구현 여부 — 집PC DB 실측

### 2.1 다른 트랙 데이터와 분리

37개 측정은 `product_db.products`와 `product_db.price_history`만 사용하고 아래 조건으로 한정했다.

```sql
p.is_deleted = false
AND p.status = 'ACTIVE'
AND p.product_category = 'OLD'
```

따라서 판매전표 `2026/08/13-*`, 입고전표, QA 창고 4건, 거래처 `P-2026-0017`, 회계전표 2건은 이 모집단과 구조적으로 교집합이 없다. 전표·창고·거래처·회계 테이블은 37개 집계에 join하지 않았다.

### 2.2 읽기 전용 SQL

```sql
BEGIN TRANSACTION READ ONLY;

WITH old AS (
  SELECT id, model_name, release_price, delivery_price
  FROM products
  WHERE is_deleted=false AND status='ACTIVE' AND product_category='OLD'
), baseline AS (
  SELECT product_id, release_price, delivery_price
  FROM price_history
  WHERE is_deleted=false AND effective_date=DATE '2000-01-01'
), snap AS (
  SELECT product_id, release_price, delivery_price
  FROM price_history
  WHERE is_deleted=false AND effective_date=DATE '2026-04-01'
)
SELECT
  count(*) AS active_old,
  count(b.product_id) AS baseline_rows,
  count(*) FILTER (WHERE b.product_id IS NULL) AS baseline_missing,
  count(*) FILTER (WHERE b.product_id IS NOT NULL AND o.release_price=b.release_price)
    AS baseline_release_equal,
  count(*) FILTER (WHERE b.product_id IS NOT NULL AND o.delivery_price=b.delivery_price)
    AS baseline_delivery_equal,
  coalesce(sum(abs(o.release_price-b.release_price))
    FILTER (WHERE b.product_id IS NOT NULL),0) AS baseline_release_abs_diff,
  coalesce(sum(abs(o.delivery_price-b.delivery_price))
    FILTER (WHERE b.product_id IS NOT NULL),0) AS baseline_delivery_abs_diff,
  count(s.product_id) AS snapshot_rows,
  count(*) FILTER (WHERE s.product_id IS NOT NULL AND o.release_price=s.release_price)
    AS snapshot_release_equal,
  count(*) FILTER (WHERE s.product_id IS NOT NULL AND o.delivery_price=s.delivery_price)
    AS snapshot_delivery_equal,
  coalesce(sum(abs(o.release_price-s.release_price))
    FILTER (WHERE s.product_id IS NOT NULL),0) AS snapshot_release_abs_diff,
  coalesce(sum(abs(o.delivery_price-s.delivery_price))
    FILTER (WHERE s.product_id IS NOT NULL),0) AS snapshot_delivery_abs_diff
FROM old o
LEFT JOIN baseline b ON b.product_id=o.id
LEFT JOIN snap s ON s.product_id=o.id;

COMMIT;
```

세션 자체도 `SELECT current_setting('transaction_read_only')` 결과 `on`을 확인했다.

### 2.3 집PC 원문

```text
     db     | is_replica | tx_read_only
------------+------------+--------------
 product_db | f          | on
(1 row)

 active_old | baseline_rows | baseline_missing | baseline_release_equal | baseline_delivery_equal | baseline_release_abs_diff | baseline_delivery_abs_diff | snapshot_rows | snapshot_release_equal | snapshot_delivery_equal | snapshot_release_abs_diff | snapshot_delivery_abs_diff
------------+---------------+------------------+------------------------+-------------------------+---------------------------+----------------------------+---------------+------------------------+-------------------------+---------------------------+----------------------------
         37 |             0 |               37 |                      0 |                       0 |                         0 |                          0 |            37 |                     37 |                      37 |                      0.00 |                       0.00
(1 row)
```

가격 이력 날짜 원문:

```text
 effective_date | is_deleted | history_rows | products
----------------+------------+--------------+----------
 2026-04-01     | f          |           37 |       37
(1 row)
```

### 2.4 37품목 상세 원문

`baseline_*` 두 열은 37행 모두 NULL이고, `snapshot_*`은 현재가와 같다.

```text
model_name      current_release baseline_release current_delivery baseline_delivery snapshot_release snapshot_delivery
AG4S0957W             167200.00 NULL                 120000.00 NULL                  167200.00          120000.00
AGSS1421W             193600.00 NULL                 135000.00 NULL                  193600.00          135000.00
AM052FNLDBH1          726000.00 NULL                 363000.00 NULL                  726000.00          363000.00
AM072HN1DBH1          706200.00 NULL                 353100.00 NULL                  706200.00          353100.00
AM080FXVGHH1         5412000.00 NULL                2706000.00 NULL                 5412000.00         2706000.00
AM083FNMDBH1         1023000.00 NULL                 511500.00 NULL                 1023000.00          511500.00
AM100RXVVHH1         7502000.00 NULL                3751000.00 NULL                 7502000.00         3751000.00
AM110FNMDBH1         1050500.00 NULL                 525250.00 NULL                 1050500.00          525250.00
AM120NXVHHH1         8459000.00 NULL                4229500.00 NULL                 8459000.00         4229500.00
AM120NXVSHH1         7524000.00 NULL                3762000.00 NULL                 7524000.00         3762000.00
AM120NXVUHH1         6965200.00 NULL                3482600.00 NULL                 6965200.00         3482600.00
AM120RXVVHH1         9240000.00 NULL                4620000.00 NULL                 9240000.00         4620000.00
AM140HXVGHC1         7161000.00 NULL                3580500.00 NULL                 7161000.00         3580500.00
AM140NXVHHH1        10120000.00 NULL                5060000.00 NULL                10120000.00         5060000.00
AM160FXVSJH1        11437800.00 NULL                5718900.00 NULL                11437800.00         5718900.00
AM160HXVGHC1         8303900.00 NULL                4151950.00 NULL                 8303900.00         4151950.00
AM160NXVSHH1        10505000.00 NULL                5252500.00 NULL                10505000.00         5252500.00
AM180FXVGHH1        10560000.00 NULL                5280000.00 NULL                10560000.00         5280000.00
AM180NXVHHH1        12320000.00 NULL                6160000.00 NULL                12320000.00         6160000.00
AM180NXVSHH1        11077000.00 NULL                5538500.00 NULL                11077000.00         5538500.00
AM200HXVGHC1         9916500.00 NULL                4958250.00 NULL                 9916500.00         4958250.00
AM200NXVHHH1        13365000.00 NULL                6682500.00 NULL                13365000.00         6682500.00
AM300HXVGHH1        17369000.00 NULL                8684500.00 NULL                17369000.00         8684500.00
AVXC4H060B1-E        486800.00 NULL                 243400.00 NULL                  486800.00          243400.00
AVXC4H100B2          781000.00 NULL                 390500.00 NULL                  781000.00          390500.00
AVXDHH100B1          869000.00 NULL                 434500.00 NULL                  869000.00          434500.00
AVXDUH100B3          869000.00 NULL                 434500.00 NULL                  869000.00          434500.00
NJ023WCXB3           345400.00 NULL                 172700.00 NULL                  345400.00          172700.00
NJ0521CXB2           522500.00 NULL                 261250.00 NULL                  522500.00          261250.00
NJ0721CXB2           624800.00 NULL                 312400.00 NULL                  624800.00          312400.00
NS0604DXB2           372240.00 NULL                 186120.00 NULL                  372240.00          186120.00
PC1BWSK1N            193600.00 NULL                 135000.00 NULL                  193600.00          135000.00
PC1MWSK1N            132000.00 NULL                 100000.00 NULL                  132000.00          100000.00
PC1NWSK2             140800.00 NULL                 100000.00 NULL                  140800.00          100000.00
PC1NWSK2N            140800.00 NULL                 100000.00 NULL                  140800.00          100000.00
PC4NUSK1             167200.00 NULL                 120000.00 NULL                  167200.00          120000.00
PC4NUSK1N            167200.00 NULL                 120000.00 NULL                  167200.00          120000.00
(37 rows)
```

### 2.5 판정

- **B baseline 복제:** 미구현. `baseline_rows=0`, `baseline_missing=37`.
- **출고가·납품가 차이 0원:** 현재가와 `2026-04-01` snapshot 사이에는 사실이다. B baseline과의 차이는 비교 행 자체가 0개이므로 입증되지 않았다.
- **토글 no-op:** 미구현. baseline도 토글도 없으므로 실행 가능한 no-op 경로가 없다.
- **코드 원인:** `ProductSheetSyncService.java:128`은 구형의 `beforeIncreaseTabName`을 `null`로 두며, `PriceHistorySeeder.java:87-93`은 OLD를 건너뛴다. 현재 `EstimateCatalogInternalController.java:71,399`는 baseline을 정확히 `2000-01-01`에서 읽는다.
- 집PC `flyway_schema_history`는 V37까지 적용돼 있다. main에는 V42가 있으므로 실행 스택은 main보다 낡다. 다만 main 전체 검색에도 B migration/seed는 없고, DB에도 baseline은 없으므로 이 판정은 배포본 노후만으로 뒤집히지 않는다.

## 3. `단가변동` 명칭 통일 전수

### 3.1 실제 사용자 표면에 남은 옛 문구

| 표면 | 위치 | 상태 |
|---|---|---|
| Desktop 제품 > 카테고리별 단가변동 | `ProductPriceSchedulePage.tsx:170,211` | `인상 전 단가 기본값`, `인상 전 단가 기본 적용` |
| 같은 Desktop badge | `ProductPriceSchedulePage.tsx:146` | `견적 인상 전/후 단가` |
| 웹 종합견적서 상업/홈/싱글 | `estimate-app/views/index.ejs:6653,7821,7860` | 체크박스 라벨 `인상 전 단가` |
| tracked legacy GAS 종합견적서 | `tools/legacy-gas/종합견적서/index.html:6207,7380,7419` | 체크박스 라벨 `인상 전 단가` |

exact 사용자 라벨만 **8줄**이다. Desktop badge의 `인상 전/후 단가` 1줄은 exact 검색에는 잡히지 않지만 같은 미통일 표면이라 별도 포함했다.

### 3.2 mock·상수·계약·테스트

- mock: exact `인상 전 단가`는 `clients/desktop/src/renderer/api/mock.ts`에 0건. 그러나 `products.price-schedule` 권한과 `단가변동` 설명은 `19431-19433,19582-19583,19656-19657,19779-19780,19832-19833`에 있다.
- 상수/내부 식별자: `defaultPreChange/default_pre_change`, `PRICE_DEFAULT_VARIANT`, `PRICE_INC`, `priceIncData`, `chkHomeInc/chkCommInc/chkSingleInc`가 옛 의미를 유지한다. 이름만 새 용어로 바뀐 상태가 아니다.
- 테스트: `EstimatePricingConfigPage.priceSchedule.test.tsx:187-217`은 구형 토글이 없어야 한다고 검증한다. `estimate-app/test/db-catalog.test.js:230-238`은 옛 문구와 4카테고리 `defaultPreChange` map을 검증하지만, 실제 화면 소비는 3개뿐이다.
- API/Javadoc: product service controller/domain/DTO와 accounting/partner-order client가 exact 옛 문구를 계속 사용한다. 아래 부록에 전수 위치를 기록했다.

### 3.3 DB 값과 DB metadata

모든 연결 가능 업무 DB의 `text/varchar/char/json/jsonb` 실제 값을 읽기 전용으로 훑었다.

- exact `인상 전 단가`: **0건**.
- `단가변동`: 92건. 대부분 `slip_db`의 revision/audit/품목명/거래처명 등 다른 QA·업무 데이터에 들어간 문자열이다. 설정 구현 증거로 사용하지 않았다.
- `product_db.price_change_schedule` 실제 계약은 여전히 `default_pre_change` 4행이다.

```text
category          effective_date default_pre_change is_deleted
commercialMulti   2026-07-01     false              false
homemulti         2026-07-01     true               false
oldProducts       2026-07-01     false              false
singleSets        2026-07-01     false              false
```

DB metadata에는 옛 문구가 1건 남는다.

```text
public.price_change_schedule.default_pre_change
견적 카테고리별 "인상 전 단가" 체크박스 초기값. TRUE 면 estimate-app 이 인상 전 단가를 기본 선택한다. 기본값 FALSE(인상 후 단가 기본).
```

이는 적용된 V23의 `COMMENT ON COLUMN` 결과다.

### 3.4 exact `인상 전 단가` 전수 결과

명령:

```powershell
rg -n -S --hidden -g '!/.git/**' -g '!node_modules/**' -g '!build/**' -g '!dist/**' -g '!coverage/**' -g '!docs/dev-reports/2026-08-13-1140-remaining-scope-recon.md' '인상 전 단가' .
```

산출물의 인용으로 검색 결과가 늘어나는 자기참조를 막기 위해 이 보고서만 제외했다. 결과는 **55파일·114 matching lines**다. 파일별 줄은 다음과 같다.

```text
CHANGELOG.md:37,47
README.md:663
ROADMAP.md:175
clients/desktop/playwright/17-s4b-price-variant-real-qa/price-variant-live-real-qa.spec.ts:28,157
clients/desktop/src/renderer/api/productCatalogApi.ts:761,779
clients/desktop/src/renderer/routes/ProductPriceSchedulePage.tsx:30,170,211
clients/web/estimate-app/lib/code.js:1742
clients/web/estimate-app/lib/db-catalog.js:196,233
clients/web/estimate-app/scripts/qa-capture-17-s4b-price-variant.mjs:2,83
clients/web/estimate-app/test/db-catalog.test.js:230
clients/web/estimate-app/views/index.ejs:6653,7821,7860
docs/dev-reports/2026-07-08-17-s4b-price-variant-config.md:1,13,70
docs/dev-reports/2026-07-09-price-change-s3-order-switch.md:10
docs/dev-reports/2026-07-29-977-money-gas-recompare.md:87
docs/dev-reports/2026-08-07-1075-estimate-set-options-legacy-recon.md:48
docs/dev-reports/2026-08-08-896-parity-run2-same-commit.md:143
docs/dev-reports/2026-08-08-896-sheet-db-diff-v2-both-price-sets.md:10,377,383,399
docs/dev-reports/2026-08-09-896-p2-load-design.md:262
docs/dev-reports/2026-08-09-978-r3-sol-reconv.md:21
docs/dev-reports/2026-08-11-gasv2-CRITIC.md:369
docs/dev-reports/2026-08-12-1090-1140-recon-sol.md:30,145,326,450,516
docs/dev-reports/2026-08-13-1092-remove-embedded-pages-luna.md:13
docs/dev-reports/2026-08-13-1140-recon.md:14,50,83,134,170
docs/dev-reports/896-gas-formula-agg/AMBIGUOUS.txt:172,362
docs/dev-reports/896-gas-formula-agg/EXCEPTIONS.txt:56,403
docs/dev-reports/896-gas-formula-agg/groups.json:1
docs/dev-reports/896-gas-formula-agg/items.json:1
docs/dev-reports/sp-04-full-menu-legacy-gas-notion-audit.md:62,75
docs/dev-reports/sp-07-google-sheets-quote-order-e2e.md:11
docs/operational-validation/google-sheets-live-source-snapshot.md:17,19,21,23,26,62
docs/operational-validation/google-sheets-source-validation.md:41,60
docs/planning/2026-05-16_google-sheets-quote-order-e2e.md:20,55,66,94,104
docs/planning/2026-05-16_legacy-gas-db-api-parity.md:122
docs/qa/1009-estimate-menu-real-qa/qa-log.txt:18
docs/qa/price-change-s3/scenarios.md:177
docs/superpowers/plans/2026-05-16-sp-07-google-sheets-quote-order-e2e.md:9
docs/superpowers/specs/2026-05-16-sp-07-google-sheets-quote-order-e2e-design.md:32
docs/superpowers/specs/2026-07-01-price-change-epic-design.md:8
docs/superpowers/specs/2026-07-08-17-s4b-price-variant-config-design.md:1,12,14,49,71
docs/tracks/2026-08-12-1090-1140-discount-axis.md:11
migration/decisions/DECISIONS.md:1737,1788
scripts/generate-sp-07-google-sheets-source-screenshots.mjs:48,134,145
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductClient.java:202
services/partner-order-service/README.md:169
services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/BootstrapService.java:519
services/product-service/src/main/java/com/samhanair/logis/product/domain/PriceChangeSchedule.java:71,74,109,116
services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:95,110,1635
services/product-service/src/main/java/com/samhanair/logis/product/web/dto/PriceChangeScheduleAdminResponse.java:11
services/product-service/src/main/java/com/samhanair/logis/product/web/dto/PriceChangeScheduleUpdateRequest.java:12
services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java:231,394,395
services/product-service/src/main/java/com/samhanair/logis/product/web/PriceChangeScheduleAdminController.java:32,53,81,92
services/product-service/src/main/java/com/samhanair/logis/product/web/PriceChangeScheduleInternalController.java:68,71,75,76
services/product-service/src/main/resources/db/migration/V23__add_price_change_schedule_default_variant.sql:2,4,12
services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java:537
tools/legacy-gas/종합견적서/index.html:6207,7380,7419
```

역사 문서·적용된 migration 원문·외부 Google Sheet tab명(`*_단가인상`)까지 모두 기계 치환해도 되는지는 별도 결정이 필요하다. 현재 RED-B의 “저장소 0건”과 적용 migration 불변식은 그대로는 충돌한다.

## 4. `기본값 설정 가능` 구현 여부

### 4.1 이미 있는 것 — #1140 이전 선행 기능

- DB: `price_change_schedule.default_pre_change` 4행.
- BE 조회/수정: `PriceChangeScheduleAdminController.java:48-97`, `PriceChangeScheduleInternalController.java:68-80`.
- DTO/domain: `PriceChangeScheduleUpdateRequest.java`, `PriceChangeScheduleAdminResponse.java`, `PriceChangeSchedule.java:71-116`.
- Desktop 관리: `ProductPriceSchedulePage.tsx:99-127,170-229`.
- 웹 초기값 조회: `estimate-app/lib/db-catalog.js:233-241`.
- 웹 3개 소비: `estimate-app/views/index.ejs:6653,7821,7860`, reset은 `10324` 등.

따라서 홈멀티·싱글·상업멀티의 **옛 의미** “인상 전 단가를 기본 체크할지”는 설정 가능하다.

### 4.2 아직 없는 것 — #1140 요구

- `단가변동 기본값 = NOT default_pre_change`라는 양의 의미 API/DB/FE 계약.
- 기존 값의 의미 보존 반전: `homemulti true→false`, `singleSets false→true`, `commercialMulti false→true`, `oldProducts false→true`.
- 구형 관리 토글: `PRICE_SCHEDULE_TOGGLE_CATEGORIES`에 `oldProducts`가 없다.
- 구형 견적 토글: `chkOld...`가 없다.
- 구형 baseline map: `PRICE_INC` 기본값도 `{home,comm,single}`뿐이고 구형 계산은 `OLD_PRODUCTS` 단일가를 직접 사용한다 (`index.ejs:2262-2283,2419-2426,2757,2880-2884`).
- 양의 의미 기본값에 대한 4카테고리 테스트와 금액 불변 회귀.

판정은 **부분 구현**이다. “기본값 저장 기술”은 선행 구현됐지만, #1140이 지시한 이름·양의 의미·4번째 소비 경로는 구현되지 않았다.

## 5. 남은 범위 — 다음 슬라이스 후보

### 1140-S0 — 결정 B를 저장소 정본에 기록

- 최신 issue comment의 B를 결정 문서/DECISIONS/dev-report에 반영.
- 기존 정찰의 “후보·미결정” 문구를 현재 결정과 구분.
- 끝 조건: B를 다시 묻는 문서가 없고 구현 검증표가 37행으로 고정됨.

### 1140-S1 — 구형 baseline B 적재

- 활성 OLD 현재 `release_price`·`delivery_price`를 `2000-01-01` baseline에 동일 복제.
- 집PC는 37/37이어야 하며 출고·납품 abs diff 각각 0원.
- 양 PC seed 차이를 고려해 migration은 대상 집합·누락·중복·재실행 결과를 명시적으로 검증해야 함. 숫자 37을 근거 없이 하드코딩하는 방식은 위험.
- dev fixture `현재×0.9`는 사용 금지.

### 1140-S2 — 양의 의미 기본값 계약

- `단가변동=true`가 무엇을 뜻하는지 API/DB/FE 한 방향으로 통일.
- 기존 4행은 의미 보존식으로 반전.
- accounting, estimate-app, partner-order, Desktop 관리의 mixed-version 경계 회귀 필요.

### 1140-S3 — 구형 4번째 토글과 소비

- Desktop 관리 `oldProducts` 토글 신설.
- 웹 종합견적서 3→4 토글, 초기화·reset·snapshot 저장/복원·금액 재렌더 연결.
- OLD baseline map 및 가격 선택 소비 연결.
- B이므로 37/37 토글 전후 금액이 정확히 같음을 실제 사용자 경로로 증명.

### 1140-S4 — 명칭 전수 통일

- 사용자 라벨, 접근성 라벨, API/Javadoc, mock, 테스트, DB comment를 승인된 `단가변동` 용어로 정리.
- `defaultPreChange`, `PRICE_INC`, `chk*Inc` 등 반대 의미 식별자는 승인한 물리 계약에 따라 adapter 격리 또는 rename.
- historical docs와 적용된 V23 source를 어떻게 처리할지 먼저 결정.
- 외부 호환 원천인 `*_단가인상` tab명은 화면 용어와 별도 축으로 취급할지 결정.

### 1140-S5 — 재수렴/라이브 QA

- 홈·싱글·상업 3카테고리의 전환 전후 기존 기본 상태·가격 exact parity.
- 구형 37품목 baseline coverage 37/37, 현재가 diff 0원.
- 관리 화면 4행 저장 왕복, 종합견적서 4개 토글 및 reset/snapshot 왕복.
- 저장소 residual 정책에 따른 old phrase 0건 또는 승인된 예외만 존재.
- main보다 낡지 않은 fresh stack commit을 기록하고 사용자 화면에서 실행.

권장 의존 순서:

```text
S0 결정 기록 → S1 B 데이터 → S2 양의 계약 → S3 구형 UI/소비 → S4 명칭 정리 → S5 재수렴
```

## 6. 이슈를 닫아도 되는가

**아니다.** 아래 완료 조건 중 현재 충족된 것은 “B가 결정됨” 하나뿐이다.

| 완료 조건 | 현재 |
|---|---|
| B baseline 37/37 적재 | ❌ 0/37 |
| 출고가·납품가 baseline diff 0원 | ❌ baseline 행 없음 |
| 구형 토글 4번째 신설 | ❌ 관리·견적 모두 없음 |
| 구형 토글 실제 no-op | ❌ 실행 경로 없음 |
| 양의 의미 기본값 설정 | ❌ legacy negative 계약만 있음 |
| `인상 전 단가` 사용자 표면 0 | ❌ exact 8줄 + badge 1줄 |
| 저장소 exact 옛 문구 0 | ❌ 55파일·114줄 |
| 금액 불변 사용자 경로 QA | ❌ #1140 구현 자체 없음 |

따라서 이슈는 구현 PR과 fresh-stack 사용자 경로 QA가 끝날 때까지 OPEN이 맞다. 실제 close 작업은 하지 않았다.

## 7. 개발책임자 판단이 필요한 질문

1. **물리 boolean 계약**: (a) DB/API를 양의 의미 `defaultPriceChangeEnabled`로 rename하고 4행 값을 반전할지, (b) `default_pre_change`는 유지하고 UI adapter에서만 반전할지 결정이 필요하다. 본인은 (a)를 권장한다. 같은 `true`가 화면과 DB에서 반대 뜻인 영구 오독을 없앨 수 있다.
2. **“저장소 옛 문구 0건”의 예외 범위**: 적용된 V23 migration source와 과거 정찰/QA 문서까지 수정 대상으로 볼지, 아니면 runtime UI/API/DB comment/현재 테스트만 0건으로 하고 역사 원문·외부 `*_단가인상` tab명을 승인 예외로 둘지 결정이 필요하다. 본인은 역사 원문과 외부 tab명은 보존하고, runtime·현재 계약·현재 테스트·DB comment는 0건으로 만드는 방식을 권장한다. 적용 migration 불변식과 감사 추적을 보존할 수 있다.

B baseline 값 자체와 구형 포함 여부는 이미 확정됐으므로 다시 질문할 사항이 아니다.

## 8. 종료 점검

- 여유 RAM: 시작 24.443GB, 보고서 작성 직전 19.392GB로 중단 기준 1.0GB 이상.
- 공유 컨테이너 stop/restart/create/delete 0.
- DB write 0; 모든 SQL은 읽기 전용 세션/transaction.
- git checkout/pull/add/commit/push/merge 등 쓰기 명령 0.
- 기존 untracked `.claude/docs/`, `infrastructure/docker-compose.local-portfix.yml`은 건드리지 않았다.
