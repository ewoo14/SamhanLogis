# 2026-08-11 이카운트 적재 품목 0원 660건 감사

## 결론 4줄

1. **적재가 가격을 흘렸나: 아니오(이번 660건에 한정).** 활성·`created_at::date='2026-08-03'`·`selling_price=0`인 660건은 staging 대표 raw 660건과 전부 연결됐고 `raw_outbound_price`가 모두 숫자 `0`이었다. 같은 대표품목으로 묶인 alias 667행에도 양수 출하가는 0행이었다.
2. **원본 대조 가능했나: 가능.** `tools/` 아래에는 이카운트 raw가 없었지만, 로컬 `docs/migration/ecount-data/raw/품목-Excel다운로드.csv`가 남아 있었고 SHA-256이 staging `source_file_hash`와 일치했다. 이 CSV 2,854행의 출하가는 숫자 0=733, 양수=2,120, 공백=1, 비정상 문자열=0이었다.
3. **성격 분포:** `goods_type`은 `GOODS 628 / NON_GOODS 32`, `product_type`은 `SINGLE 660`, 이카운트 원본 `품목구분`을 옮긴 `product_business_type`은 `상품 585 / 무형상품 75`였다. 진단용 품목명 패턴은 모델·영문코드형 480, 실물·자재 65, 용역·시공 50, 기타·판정유보 65로서 0원군의 다수는 용역만이 아니라 실제 판매 후보 품목이다.
4. **도달성:** 660개 중 10개가 견적 15라인·전표 57라인(활성 43라인)에 참조됐고 견적 14라인·전표 11라인의 저장 금액이 실제 전부 0이었다. 그러나 참조 문서는 모두 `[DEV-SEED]` 계정 산물이었으며 실사용 문서는 0건이므로, 운영 금액 영향의 최종 판정은 **판정 불가**다.

---

## 1. 조사 조건

- 역할: 정찰·조회 전용
- 측정 시각: DB `clock_timestamp()` 기준 **2026-08-11 13:49:35~13:52:05 KST**
- DB 접근: 모든 psql 측정은 `BEGIN READ ONLY; ... COMMIT;` 안에서 실행
- 변경: 본 보고서 1개 외 코드·스키마·데이터 변경 없음
- 0원 판정 필드: PM 실측과 일치하는 `products.selling_price`
- 활성 조건: `products.is_deleted = FALSE AND products.status = 'ACTIVE'`
- 660건 cohort: 위 활성 조건 + `created_at::date = DATE '2026-08-03' AND selling_price = 0`
- QA·시더 제외 원칙: 문서 `created_by`를 `user_db.employees`와 대조해 `[DEV-SEED]` 계정이 만든 견적·전표는 실사용에서 제외

개발책임자 결정인 **“가격 0원 전부 허용 · 미등록 가격도 0원”**을 판정 근거로 삼았다. 따라서 본 보고서는 0원 자체를 결함으로 보지 않고, 원본 값 유실과 실제 금액 도달 여부만 분리한다.

## 2. 적재 경로 확정

### 2.1 원본 컬럼과 대상 컬럼

`EcountProductImporter`의 품목 헤더는 다음 순서다.

- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:38-42`
- 3번째 열(index 2)이 `출하가`, 4번째 열(index 3)이 `입고단가`다.

가격 흐름은 다음과 같다.

| 원본 | 파싱 | products 대상 |
|---|---|---|
| `cells[2]` 출하가 | `parseMoney` | `selling_price`, `outbound_price`, `unit_price_with_vat` |
| `cells[3]` 입고단가 | `parseMoney` | `purchase_price`, `inbound_price` |
| `cells[4]~cells[9]` | `parseMoney` | `single_price`, `outdoor_price`, `multi_50_price`, `multi_48_price`, `multi_45_price`, `item_35_price` |

근거:

- 값 읽기·파라미터 구성: `EcountProductImporter.java:368-388`
- 신규 INSERT: `EcountProductImporter.java:391-405`
- `product_code` 충돌 UPDATE: `EcountProductImporter.java:407-431`
- 시트 계보 기존 행 병합 UPDATE: `EcountProductImporter.java:441-486`
- 소프트 삭제 행 복원 UPDATE: `EcountProductImporter.java:489-535`

즉, 가격이 없을 때 **NULL로 두거나 기존 가격을 보존하는 경로가 아니다.** `parseMoney` 결과를 모든 가격 대상 컬럼에 넣고, 기존 행도 해당 값으로 갱신한다.

### 2.2 빈값·파싱 실패 계약

실제 구현은 다음과 같다.

```java
// EcountProductImporter.java:708-716
private static BigDecimal parseMoney(String raw) {
    if (raw == null || raw.isBlank() || "-".equals(raw)) {
        return BigDecimal.ZERO;
    }
    try {
        return new BigDecimal(raw.replace(",", "").replace(" ", ""));
    } catch (NumberFormatException ex) {
        return BigDecimal.ZERO;
    }
}
```

판정:

- 원본 가격 `NULL`·공백·`-` → `BigDecimal.ZERO`
- 정상 숫자 → 쉼표·공백 제거 후 숫자
- **비정상 문자열·오버플로 등 `NumberFormatException` → 로그·거부 없이 `BigDecimal.ZERO`**
- 따라서 파싱 실패가 조용히 0이 되는 잠재 위험은 실제로 존재한다.
- 다만 이번 raw 출하가에는 비정상 문자열이 0행이므로 이 위험은 660건의 원인이 아니다.

staging은 별도다. `EcountProductImporter.java:597-632`에서 raw 각 셀을 `EcountCsvSupport.nullIfBlank`로 넣으므로 빈 raw는 staging에 NULL로 보존될 수 있지만, products 변환 단계에서는 위 `parseMoney`에 의해 0이 된다.

### 2.3 관계행 가격 보완

`EcountProductImporter.java:193-213`은 관계 파일이 명시한 대표·연결행 묶음에서 대표행의 숫자값이 0이면 연결행의 첫 비0 값을 채운다. 숫자 0과 공백을 모두 “비어 있는 값”으로 취급한다.

이번 660건은 이 보완이 빠진 사례인지 별도로 측정했다.

```text
cohort_with_any_alias_count | product_with_positive_alias_count | alias_row_count | positive_alias_row_count
----------------------------+-----------------------------------+-----------------+-------------------------
660                         | 0                                 | 667             | 0
```

대표행뿐 아니라 동일 `target_main_product_id`로 묶인 alias 전체에도 양수 출하가가 없었다. 따라서 관계행 가격을 놓쳐 0원이 된 사례도 0건이다.

## 3. raw 파일 대조

### 3.1 파일 존재·정본 동일성

`tools/`를 재귀 검색했으나 이카운트 품목 raw는 없었다. 현재 로컬에 남은 파일은 다음이다.

```text
docs/migration/ecount-data/raw/품목-Excel다운로드.csv
docs/migration/ecount-data/raw/품목-Excel다운로드-20260802.xlsx
docs/migration/ecount-data/raw/품목관계리스트-Excel다운로드.xlsx
```

8월 3일 성공 적재에 사용된 파일은 CSV다. 로컬 파일 해시와 staging 해시가 정확히 일치한다.

```text
SHA-256  7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678
staging source_file_hash
         7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678
```

`docs/dev-reports/2026-08-03-984-live-import.md`의 실행 원문도 같은 CSV를 `itemFile`로 보냈다. 같은 보고서에서 품목 XLSX 직접 업로드는 `422 MIG2_CSV_HEADER_MISMATCH`였으므로 XLSX가 660건을 만든 입력은 아니다.

git 추적 상태는 raw 데이터가 아니라 `.gitkeep`만 추적한다.

```text
git ls-files | rg -i "ecount-data/raw|품목-Excel|품목관계"
docs/migration/ecount-data/raw/.gitkeep
```

따라서 **현재 PC에서는 원본 대조 가능**하지만 다른 clone에서 raw가 자동 복원된다고 볼 수는 없다.

### 3.2 raw 전체 출하가 분포

CSV의 회사명 첫 행을 제외하고 실제 헤더 아래 2,854행을 계산했다.

```text
Name         Count
------------ -----
BLANK            1
NONZERO       2120
NUMERIC_ZERO   733
INVALID           0
TOTAL          2854
```

staging과 660 cohort 직접 조인 결과:

```text
cohort_count | no_staging_match_count | staging_match_count | raw_blank_count | raw_dash_count | raw_numeric_zero_count | raw_numeric_nonzero_count | raw_invalid_count
-------------+------------------------+---------------------+-----------------+----------------+------------------------+---------------------------+------------------
660          | 0                      | 660                 | 0               | 0              | 660                    | 0                         | 0
```

즉 733개의 raw 0원 행 중 660개가 현재 8월 3일 생성·활성·0원 products cohort가 되었고, 이 660개에서는 원본 양수 유실이 한 건도 없다.

### 3.3 PM 표본 원문

원본 행:

- 헤더: `docs/migration/ecount-data/raw/품목-Excel다운로드.csv:2`
- `AAAA-00001`: 같은 파일 `:122` — 출하가 `0`, 입고단가 `26192`
- `AAAA-00004`: `:125` — 출하가 `0`, 입고단가 `12277`
- `AAAA-00008`: `:129` — 출하가 `0`, 입고단가 `45017`
- `AAAA-00009`: `:130` — 출하가 `0`, 입고단가 `110496`
- `AAAA-00010`: `:131` — 출하가 `0`, 입고단가 `16370`
- `AAAA-00011`: `:132` — 출하가 `0`, 입고단가 `22099`
- `ZENG-00006`: `:2793` — 출하가 `0`, 입고단가 `70000`

모든 표본은 “판매 출하가 0 / 입고단가 양수”가 원본에 그대로 있었다. 적재 후 판매가격 0은 원본 출하가의 충실한 반영이다.

## 4. 660건 모집단 재현

### 4.1 생성일·생성자 행 분포

실행 SQL:

```sql
SELECT created_at::date AS created_date, created_by,
       count(*) AS row_count,
       count(*) FILTER (WHERE selling_price = 0) AS selling_price_zero_count
FROM products
WHERE is_deleted = FALSE AND status = 'ACTIVE'
  AND created_at::date BETWEEN DATE '2026-07-20' AND DATE '2026-08-11'
GROUP BY created_at::date, created_by
ORDER BY created_at::date, created_by;
```

원문 결과:

```text
created_date | created_by                           | row_count | selling_price_zero_count
-------------+--------------------------------------+-----------+-------------------------
2026-07-28   | 00000000-0000-0000-0000-000000000001 | 1017      | 46
2026-08-03   | 00000000-0000-0000-0000-000000000001 | 1963      | 660
2026-08-09   | a0000000-0000-0000-0000-000000000003 | 2         | 0
```

월 분포 원문:

```sql
SELECT date_trunc('month', created_at) AS created_month, created_by,
       count(*) AS row_count,
       count(*) FILTER (WHERE selling_price = 0) AS selling_price_zero_count
FROM products
WHERE is_deleted = FALSE AND status = 'ACTIVE'
GROUP BY date_trunc('month', created_at), created_by
ORDER BY created_month, created_by;
```

```text
created_month       | created_by                           | row_count | selling_price_zero_count
--------------------+--------------------------------------+-----------+-------------------------
2026-07-01 00:00:00 | 00000000-0000-0000-0000-000000000001 | 1017      | 46
2026-08-01 00:00:00 | 00000000-0000-0000-0000-000000000001 | 1963      | 660
2026-08-01 00:00:00 | a0000000-0000-0000-0000-000000000003 | 2         | 0
```

known marker(`QA797`, `QA-1039-*`, `S-PM-0811`, `라이브QA`, lineage의 QA/SEED/TEST)로 660건을 검사한 결과는 0건이고, `lineage='ECOUNT'`가 660건 전부였다. 상품 모집단 자체에는 QA·시더 품목이 섞이지 않았다.

### 4.2 가격 3개 필드

```text
row_count | selling_price_zero_count | outbound_price_zero_count | unit_price_with_vat_zero_count | all_three_zero_count | selling_price_null_count | outbound_price_null_count | unit_price_with_vat_null_count
----------+--------------------------+---------------------------+--------------------------------+----------------------+--------------------------+---------------------------+-------------------------------
1963      | 660                      | 660                       | 660                            | 660                  | 0                        | 0                         | 0
```

660건은 `selling_price`, `outbound_price`, `unit_price_with_vat`가 모두 0이다. 이는 코드의 출하가 1→3 매핑과 일치한다.

### 4.3 접두 재측정

실행 SQL:

```sql
SELECT CASE
         WHEN product_code LIKE 'AAAA-%' THEN 'AAAA-*'
         WHEN product_code LIKE 'ZENG-%' THEN 'ZENG-*'
         WHEN product_code LIKE 'SI-%' THEN 'SI-*'
       END AS code_prefix,
       count(*) AS row_count,
       count(*) FILTER (WHERE selling_price=0) AS selling_price_zero_count
FROM products
WHERE is_deleted=FALSE AND status='ACTIVE'
  AND (product_code LIKE 'AAAA-%' OR product_code LIKE 'ZENG-%' OR product_code LIKE 'SI-%')
GROUP BY code_prefix ORDER BY code_prefix;
```

```text
code_prefix | row_count | selling_price_zero_count
------------+-----------+-------------------------
AAAA-*      | 39        | 38
SI-*        | 2         | 0
ZENG-*      | 23        | 23
```

PM 발단의 `SI-* 3건`과 달리 측정 시점 활성 DB에는 `SI-AL600a`, `SI-AL700a` 2건만 존재했다. 전체 products에서도 `SI-*`는 이 2행뿐이었다. 요약 라벨로 3건을 재사용하지 않고 현재 SQL 원문인 2건을 기준으로 한다.

## 5. 성격 분포

### 5.1 `goods_type` · `product_type` · 이카운트 `품목구분`

`product_business_type`은 importer가 원본 `품목구분`의 대괄호를 제거해 넣는 필드다(`EcountProductImporter.java:375`, `:719-724`).

```text
goods_type | product_business_type | product_type | row_count
-----------+-----------------------+--------------+----------
GOODS      | 상품                  | SINGLE       | 569
GOODS      | 무형상품              | SINGLE       | 59
NON_GOODS  | 무형상품              | SINGLE       | 16
NON_GOODS  | 상품                  | SINGLE       | 16
```

축별 합계:

```text
goods_type:              GOODS 628 / NON_GOODS 32
product_type:            SINGLE 660
product_business_type:   상품 585 / 무형상품 75
```

두 분류축은 일치하지 않는다. 예를 들어 원본상 무형상품 75개 중 59개가 현재 `goods_type=GOODS`다. 따라서 한 축만으로 “0원은 모두 용역”이라고 판정할 수 없다.

### 5.2 품목명 패턴

아래 CASE는 정본 분류가 아니라 성격을 세기 위한 상호배타 진단 규칙이다.

```sql
CASE
  WHEN name ~* '설치비|철거|천공|공사|작업비|용접비|세척비|검사비|시운전|사다리차|고소작업차|출장비|운반비|폐기비|해체비|이전비|마감비|인건비|수수료|이윤|조정|Adjustment|-.*별도-'
    THEN '용역·시공 명칭'
  WHEN name ~* '실내기|실외기|에어컨|선풍기|팬|모터|펌프|배관|동관|전선|케이블|호스|밸브|유니온|PCB|리모컨|받침대|거치대|가대|프레임|가이드|자재|냉매|드레인|분기관|덕트|필터|판넬|패널|커버|몰딩|볼트|너트|연장선|관$'
    THEN '실물·자재 명칭'
  WHEN name ~ '^[A-Za-z0-9][A-Za-z0-9._/+() -]*$'
    THEN '모델·영문코드형 명칭'
  ELSE '기타·판정유보 명칭'
END
```

원문 결과:

```text
name_pattern         | row_count
---------------------+----------
모델·영문코드형 명칭 | 480
기타·판정유보 명칭   | 65
실물·자재 명칭       | 65
용역·시공 명칭       | 50
```

표본:

- 용역·시공: `에어컨 철거`, `천공`, `질소세척비`, `연결용접비`, `기밀검사비`, `사다리차`, `Adjustment`
- 실물·자재: `한경희 선풍기`, `시스템실내기`, `냉매`, `배수모터교체`, `실외기 PCB`, `실외기 받침대`, `윈드가이드`
- 모델·영문코드형: `DB400T7A-Z501S`, `RPUW141X9P`, `RNW0400R2S`, `AP060AXPFBH1P` 등 480건
- 기타·판정유보: `원천징수`, `견적서/제품대`, `재작업`, `차액`, `삼성하계조끼` 등

따라서 660건은 용역·시공만의 집합이 아니다. 최소한 모델·코드형 480건과 실물·자재 명칭 65건은 실제 판매 품목 후보이며, 원본 품목구분도 585건을 `상품`으로 지정한다.

## 6. 견적·전표 도달성

### 6.1 UUID 기준 직접 참조 측정

product DB의 660개 `id`를 읽기 전용으로 추출해 slip DB의 `estimate_lines.product_id`, `slip_lines.product_id`와 직접 비교했다. 이름 fallback이 아니라 UUID 참조 기준이다.

```text
scope           | line_count | product_count | document_count | unit_price_zero_count | supply_zero_count | vat_zero_count | line_total_zero_count
----------------+------------+---------------+----------------+-----------------------+-------------------+----------------+----------------------
estimate_all    | 15         | 10            | 15             | 14                    | 14                | 14             | 14
estimate_active | 15         | 10            | 15             | 14                    | 14                | 14             | 14
slip_all        | 57         | 10            | 46             | 11                    | 11                | 11             | 11
slip_active     | 43         | 10            | 40             | 11                    | 11                | 11             | 11
```

관측 사실:

- 660개 중 10개 품목은 문서 저장 경로에 도달했다.
- 견적 14라인은 단가·공급가액·부가세·라인합계가 모두 0이었다.
- 전표 11라인도 단가·공급가액·부가세·라인합계가 모두 0이었다.
- 견적 1라인은 사용자가 1,000원을 넣어 1,100원(VAT 포함)으로 저장됐다. 즉 마스터가 0원이어도 수동 입력이 있으면 항상 0으로 강제되는 것은 아니다.
- 전표 0원 11건의 상태는 `DRAFT 10 / PROCESSING 1`; 완료·확정 0건이다.
- 견적 0원 14건은 모두 `QUOTE_DRAFT`다.

0원 도달 품목에는 서비스뿐 아니라 실제 판매 후보가 포함됐다: `DB400T7A-Z501S`, `WD-70006(4WAY 윈드가이드)`, `실외기 PCB`, `냉매`, `배수모터교체`, 실외기 받침대·프레임 등이다.

### 6.2 QA·시더 분리

견적 15라인은 전부 `[DEV-SEED] 개발영업`이 생성했다. 전표 57라인도 생성자가 `[DEV-SEED] 개발마스터/개발매니저/개발영업/개발창고` 네 계정뿐이었다. `user_db.employees` 원문은 다음과 같이 매핑됐다.

```text
login_id       | full_name             | role_snapshot | is_deleted
---------------+-----------------------+---------------+-----------
dev_manager    | [DEV-SEED] 개발매니저 | MANAGER       | false
dev_master     | [DEV-SEED] 개발마스터 | MASTER        | false
dev_sales      | [DEV-SEED] 개발영업   | SALES         | false
dev_warehouse  | [DEV-SEED] 개발창고   | WAREHOUSE     | false
```

git 대조에서도 `clients/desktop/playwright/collab-presence-rollout-real-qa/presence-rollout.spec.ts:44-47`이 이 계정들을 `[DEV-SEED]` 실 QA 계정으로 선언한다.

따라서 도달성은 두 층으로 판정한다.

1. **기술적 도달성:** 있음. QA 견적·전표에 0원이 그대로 저장됐다.
2. **운영 도달성:** 실사용 생성자 문서 0건. 따라서 **판정 불가**다. 이는 “결함 없음”이나 “금액 영향 0”이라는 뜻이 아니다.

## 7. 3축 대조

### 7.1 `git ls-files`

- importer와 테스트·migration은 추적 중이다.
- raw 디렉터리에서는 `.gitkeep`만 추적되고 실제 CSV/XLSX는 추적되지 않는다.
- 관련 핵심 추적 파일: `EcountProductImporter.java`, `EcountProductImporterTest.java`, `EcountProductImporterIT.java`, `V5__add_ecount_product_fields.sql`, `V7__add_product_aliases_and_ecount_staging.sql`.

### 7.2 `git grep`

- `EcountProductImporter.java:708-715`의 파싱 실패→0 계약을 확인했다.
- `EcountProductImporter.java:368-426`에서 출하가가 세 가격 필드에 들어가며 conflict 시에도 덮어쓰는 것을 확인했다.
- `docs/dev-reports/2026-08-03-984-live-import.md`에서 8월 3일 실제 CSV 업로드와 결과(`totalRows=2854`, `updated=2696`, `aliasImported=2853`, source hash 동일)를 확인했다.
- 기존 코드·문서에서 이번 “0원 660건”을 원본 대조·도달성까지 끝낸 보고서는 발견되지 않았다.

### 7.3 `gh issue list --state all --limit 400` (CLOSED 포함)

0원 660건 자체를 다룬 전용 이슈는 없었다. 관련 객체는 다음과 같지만 범위가 다르다.

- PR `#984` MERGED: 이카운트 품목 임포트의 모델코드 일치 병합과 가격 필드 반영. 0원 raw/도달성 감사가 아님.
- Issue `#976` CLOSED: 레거시 GAS 라이브 가격 변동 반영. 이카운트 0원 적재가 아님.
- Issue `#1096` CLOSED: 초기 시더·QA 품목과 참조 문서 정리. 이 보고서가 `[DEV-SEED]` 문서를 실사용에서 제외하는 근거와 정합.
- `#1166` OPEN 객체: 품목구분 정비 및 할인 규칙. 660건 원본 가격 유실 이슈가 아님.
- Issue `#528` CLOSED: MIG-8 주문 변환의 cross-DB alias 조회 결함. 가격 0과 무관.

따라서 이미 처리된 이슈를 “재발”로 잘못 선언할 근거는 없고, 반대로 이번 660건을 적재 결함으로 등록할 근거도 없다.

## 8. 최종 판정

| 질문 | 판정 | 근거 |
|---|---|---|
| 원본 양수가 0으로 유실됐는가 | **아니오 — 660건 전부 raw 숫자 0** | staging 대표 660/660 0, alias 667행 중 양수 0 |
| 원본 파일을 직접 대조했는가 | **예** | 로컬 CSV SHA-256 = staging source hash |
| 0원은 전부 용역인가 | **아니오** | GOODS 628, 원본 상품 585, 모델·실물 명칭 545 |
| 0원 품목이 문서에 들어갔는가 | **QA에서는 예** | 견적 14라인·전표 11라인 금액 전부 0 |
| 실사용 금액에 닿았는가 | **판정 불가** | 참조 문서 전부 `[DEV-SEED]`; 실사용 문서 0 |
| 파서 자체에 위험이 있는가 | **예, 별도 잠재 위험** | 숫자 파싱 실패가 거부·로그 없이 0으로 변환됨. 이번 raw의 invalid는 0행 |

이번 조사 범위에서 가격 채우기·마이그레이션·코드 수정 판단은 하지 않는다.
