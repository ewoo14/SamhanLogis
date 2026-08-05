# PR #984 재수렴 적대검증 — 병합 안전성

- 검증일: 2026-08-02 (KST)
- 브랜치/HEAD: `fix/ecount-import-model-code-merge` / `6ea1425fc`
- 검증 각도: **병합되면 안 되는 품목이 병합되는가, 남아야 할 값이 사라지는가**
- 판정: **BLOCK — 동명이라는 이유만으로 서로 다른 규격·단가의 실제 품목 33건이 대표 1건의 alias로 축약된다.**
- 제한 준수: 코드 수정·checkout·commit·push·DB write·DDL·실 임포트·Docker rebuild를 하지 않았다. DB는 `BEGIN READ ONLY` 또는 단일 `SELECT`만 사용했다.

## 0. 검증 대상과 실 데이터

`git log --oneline -15`와 `git diff origin/main...HEAD --stat`를 먼저 확인했다. 이 PR은 product-service에 `ProductLineage`, V28 계보 backfill, 이카운트 `model_name` 선조회 병합, 동명 raw 품목 그룹 병합 및 alias 보존을 추가한다. 전체 diff는 119 files, 15,123 insertions, 135 deletions이다.

실측 입력은 다음 워크트리의 gitignore 원본이다.

- `품목-Excel다운로드.csv`: 2,854행, 정상 2,853행, 정상 distinct 품목코드 2,853개
- SHA-256: `7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678`
- `품목관계리스트-Excel다운로드.xlsx`: 시트 1개, `1 x 1`, 값은 `회사명:(주)삼한공조시스템`뿐이다. 관계 데이터는 0행이다.
- 관계 XLSX SHA-256: `F7918B9FC9D88B75A5A14A014436D3E99DABEAE4E860493F5DAB9AD7D3D5DE35`
- 품목계층그룹 원본은 이 워크트리에 없다. 따라서 groupFile이 제공되는 별도 원본의 영향은 **원본 부재로 미판정**이다.

공유 `product_db`는 V26까지 적용되어 있고 V28 `lineage` 컬럼은 아직 없다. 따라서 아래 계보 수치는 V28 SQL의 조건을 현재 실 DB 1,226행에 읽기 전용 `CASE`로 그대로 적용한 **적용 예정 분포**다. staging의 `ecount_item_raw`는 0행이므로 staging 결과를 실측값처럼 사용하지 않았다.

## 1. 병합 규칙 원문

### 1.1 동명 raw 품목은 무조건 한 대표로 수렴

`services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:127-153`

> `같은 품목명은 raw 순번코드가 달라도 하나의 물건이다.`  
> `canonical code는 후보 mainCode 오름차순으로 고르고`  
> `for (ItemRow sameNameRow : sameNameRows) { resolvedCandidates.put(..., groupCandidate); }`

대표 후보는 exact/공백제거/괄호 앞 prefix 규칙으로 찾고, 없으면 기존 DB 정본 또는 raw 코드 오름차순 최소값을 고른다(`EcountProductImporter.java:351-389`). 실제 discarded 행의 규격·단가는 상태 사유 문자열에만 기록한다(`EcountProductImporter.java:400-418`). 두 코드는 모두 alias로 저장하지만(`EcountProductImporter.java:185-203`), Product의 규격·단가 컬럼은 대표 raw 행 하나만 사용한다(`EcountProductImporter.java:187-190`).

테스트도 서로 값이 다른 실제 위험 형태를 정상 병합으로 고정한다. `EcountProductImporterSameNameMergeTest.java:60-70`은 `삼성추가배관(벽걸이)`의 `AAAA-00004`(입고 12,277, 규격 10평이하)와 `AAAA-00005`(입고 13,914, 규격 30평이하)를 넣고 `imported=1`, `aliasImported=2`를 기대한다.

### 1.2 model_name 일치 병합은 SHEET만 허용

`services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:429-446, 516-568`

> `UPDATE products p ... WHERE p.model_name = :code`  
> `AND p.lineage = 'SHEET'`  
> `RETURNING p.id`

이 UPDATE가 1건 이상 반환하면 후속 `product_code` upsert를 하지 않는다. UPDATE는 `name`은 보존하지만 specification 및 11개 단가 계열, business type, group 값을 이카운트 값으로 바꾼다(`EcountProductImporter.java:543-558`).

### 1.3 MANUAL도 product_code가 같으면 이카운트 값이 이긴다

SHEET 선조회가 0건이면 importer는 active `product_code` 존재 여부를 확인한 뒤(`EcountProductImporter.java:435-446`) `ON CONFLICT (product_code)`로 UPDATE한다(`EcountProductImporter.java:472-513`). 이 UPDATE에는 lineage 조건이 없다.

> `ON CONFLICT (product_code) WHERE is_deleted = FALSE DO UPDATE SET`  
> `name = EXCLUDED.name, model_name = EXCLUDED.model_name, model_code = EXCLUDED.model_code,`  
> `specification = EXCLUDED.specification, selling_price = EXCLUDED.selling_price, ...`

따라서 **MANUAL과 이카운트 canonical 코드의 `product_code`가 같다면 이카운트의 이름·모델·규격·단가가 이긴다. lineage 값만 MANUAL로 남는다.** 현재 실 데이터에서는 이 조건에 걸리는 행이 0건이다.

### 1.4 V28 계보 분류

`services/product-service/src/main/resources/db/migration/V28__add_product_lineage.sql:1-30`

> 모든 기존 행의 기본값은 `MANUAL`  
> category `ECOUNT_MIG2`이면 `ECOUNT`  
> 아직 MANUAL이고 `product_category IS NOT NULL`이며 category `INDOOR_WALL`이면 `SHEET`

신규 이카운트 INSERT는 trigger가 ECOUNT로 바꾼다(`V28__add_product_lineage.sql:36-60`).

## 2. MANUAL 계보 실 건수 분포

V28 조건을 현재 DB에 그대로 적용한 결과다.

| 예정 계보 | 삭제 여부 | 상태 | 건수 |
|---|---:|---|---:|
| MANUAL | active | ACTIVE | 97 |
| MANUAL | active | DISCONTINUED | 4 |
| MANUAL | soft-deleted | ACTIVE | 6 |
| SHEET | active | ACTIVE | 1,119 |

MANUAL 107건의 생성자 분포는 system 100건(active 96, discontinued 4), `qa-seed` 1건(active), `qa798` 4건(soft-deleted), UUID actor 2건(soft-deleted)이다. UUID는 사용자 비공개 원칙에 따라 보고서에 기록하지 않았다. 이 DB 스냅샷에서 실사용자가 만든 것으로 확정할 수 있는 active MANUAL 행은 식별되지 않았다.

현재 원본과 대조한 MANUAL 충돌 수는 다음과 같다.

| 대조 키 | 전체 raw 코드 충돌 | canonical 코드 충돌 | MANUAL 충돌 |
|---|---:|---:|---:|
| active `products.model_name` | 734 | 730 | **0** |
| active `products.model_code` | 734 | 730 | **0** |
| active `products.product_code` | 0 | 0 | **0** |
| active `products.name` 대 raw 품목명 | 해당 없음 | 해당 없음 | **0** |

결론적으로 현재 실 데이터에서 이카운트 importer가 MANUAL 행을 덮어쓰는 건수는 **0건**, MANUAL 행을 없애는 건수도 **0건**이다. 근거는 MANUAL 107건 전체와 정상 raw 코드 2,853개를 세 식별자 각각으로 대조했고, importer의 DB 정본 fallback에 쓰이는 active MANUAL `name`과 raw 품목명도 별도로 대조했으나 모두 교집합이 0이기 때문이다.

다만 코드 계약 자체는 MANUAL 보호가 완전하지 않다. 미래에 MANUAL `product_code`가 이카운트 canonical 코드와 같아지는 즉시 §1.3의 무조건 upsert가 이카운트 값을 우선한다. 이번 0건은 현재 데이터 분포의 0이지, 보호 가드가 있어서 0인 것은 아니다.

## 3. 덮이거나 사라지는 건수

### 3.1 기존 DB 행

- 현재 입력에서 model_name과 canonical 코드가 같은 기존 행: **730건**, 모두 SHEET
- MANUAL 기존 행 덮어쓰기: **0건**
- importer 코드가 물리적으로 delete/soft-delete하는 기존 행: **0건**
- 730개 SHEET 행의 `product_code` 빈값을 canonical 코드로 채우는 건수: **730건**

현재 DB 값과 현재 raw 대표행을 비교하면 730 SHEET 행 중 다음 필드가 바뀐다. 이는 사람이 만든 MANUAL 값 소실은 아니지만, “무엇이 이기는가”에 대한 실측이다.

| UPDATE 필드 | 값 변경 행 | 기존 non-zero/nonblank 값이 다른 값으로 교체되는 행 |
|---|---:|---:|
| specification | 452 | 0 |
| selling_price | 262 | 262 |
| purchase_price | 443 | 441 |
| product_business_type | 6 | 6 |
| inbound_price | 14 | 0 |
| outbound_price | 683 | 0 |
| single_price | 153 | 0 |
| outdoor_price | 16 | 0 |
| multi_50_price | 240 | 0 |
| multi_48_price | 240 | 0 |
| multi_45_price | 220 | 0 |
| item_35_price | 243 | 0 |
| unit_price_with_vat | 683 | 0 |

즉 기존 SHEET의 판매가 262건과 매입가 441건은 이카운트 값으로 실제 교체된다. 이것은 구현 주석의 “메타/단가 병합” 범위와 일치하지만, 승자는 명백히 이카운트다.

### 3.2 raw 동명 그룹 — BLOCK 사유

실 raw 2,853 정상행에는 동명 2행 그룹이 **164개(328행)** 있다. 구현은 이를 164개의 Product로 축약하므로 독립 Product 후보 **164행이 사라지고 코드만 alias로 남는다.**

- 두 행의 코드 외 업무 값이 완전히 같은 그룹: 131개
- 규격·단가·구분 중 하나 이상이 실제로 다른 그룹: **33개**
- discarded되는 서로 다른 업무 필드 값: **59셀**
  - 규격 21, 출하가 4, 입고단가 12, 싱글 1, 멀티 50/48/45 각 5, 단품35 5, 품목구분 1

따라서 “별도 품목 행” 관점의 소실은 164건이고, 그중 실제 업무 값까지 소실되는 결함 건수는 **33건**이다. alias는 검색 키만 보존할 뿐 별도 규격·단가를 보존하지 못하므로 33건을 0으로 셀 수 없다.

요청에 언급된 726건과 달리, **현재 파일 SHA와 현재 DB의 직접 실측값은 730건**이다. raw 전체 코드 기준 model_name 충돌은 734건이며, 동명 canonicalization 후 4개 코드가 alias로 내려가 730건이다. 과거 726이라는 숫자를 현재 원본에 맞추어 꾸미지 않았다.

## 4. 실제 값 사례

### 사례 A — 서로 다른 작업 옵션이 한 품목으로 병합됨

품목명 `고소작업차(스카이)`:

| raw 코드 | 규격 | 입고단가 | 결과 |
|---|---|---:|---|
| `AAAA-00022` | `저층용(2~8층)` | 148,512 | 코드 오름차순 대표로 선택 |
| `AAAA-00023` | `저층용(9층이상)` | 247,521 | alias만 남고 규격·단가 소실 |

같은 이름이어도 층수 구간과 가격이 다른 별도 서비스다. “동명 = 하나의 물건” 가정이 실 데이터와 충돌한다.

### 사례 B — 테스트가 실제 소실을 정상 계약으로 고정

품목명 `삼성추가배관(벽걸이)`:

| raw 코드 | 규격 | 입고단가 | 결과 |
|---|---|---:|---|
| `AAAA-00004` | `10평이하` | 12,277 | 대표 |
| `AAAA-00005` | `30평이하` | 13,914 | alias만 남고 별도 옵션 소실 |

이 정확한 두 값은 테스트 `EcountProductImporterSameNameMergeTest.java:64-70`에도 들어 있으나 테스트는 두 품목의 구분 보존이 아니라 `imported=1`을 성공으로 간주한다.

### 사례 C — SHEET 값은 이카운트가 이김

기존 DB `AJ030RXH4BC1`은 name `실외기_3HP 다배관`, selling_price 1,470,700이다. raw canonical 행은 품목명 `AJ030RXH4BC1 (RX다배관)`, 출하가 1,254,000, 규격 `다배관`이다. 병합 뒤 name은 시트 값으로 남지만 selling_price는 1,254,000으로 교체되고 specification은 `다배관`이 된다.

## 5. 판정

**BLOCK.** MANUAL 실 충돌은 현재 0건이므로 “사람이 만든 active 품목이 이번 파일로 실제 덮인다”는 결함은 재현되지 않았다. 그러나 PR의 동명 병합 규칙은 실 원본에서 서로 다른 규격·단가를 가진 품목 33건을 별도 Product로 남기지 않고 alias로 축약한다. 특히 작업 범위·평형·층수처럼 이름이 같아도 가격이 달라야 하는 정상 품목이 포함되어 있다.

병합 허용 근거가 품목명 동일 하나뿐인 현재 규칙으로는 “병합되면 안 되는 것이 병합되지 않는다”를 입증할 수 없다. 33건의 명시적 allow-list/대표-variant 모델/복합키 등 보존 계약 없이 머지하면 정상 데이터가 조용히 사라진다.

## 6. 이 라운드가 보지 않은 것

이번 라운드는 요청된 단일 각도만 봤다. 다음은 판정하지 않았다.

- CI 49건의 재실행 및 일반 회귀 테스트 품질
- 동시 임포트, advisory lock, reservation window의 경쟁 조건
- API 인증·권한·프런트 화면·접근성·성능
- alias resolve 정확성 자체(단, alias가 별도 규격·단가를 저장하지 않는다는 병합 결과만 확인)
- DB migration/rollback 안정성 일반론
- 이 워크트리에 없는 품목계층그룹 원본의 효과
- 실 임포트 후 결과(금지 사항이므로 실행하지 않음)

## 7. 실행 증거 요약

핵심 DB 계수는 다음 형태의 읽기 전용 SQL로 수행했다.

```sql
BEGIN READ ONLY;
WITH classified AS (
  SELECT p.*,
         CASE
           WHEN c.code = 'ECOUNT_MIG2' AND c.is_deleted = FALSE THEN 'ECOUNT'
           WHEN p.product_category IS NOT NULL
            AND c.code = 'INDOOR_WALL' AND c.is_deleted = FALSE THEN 'SHEET'
           ELSE 'MANUAL'
         END AS prospective_lineage
    FROM products p
    JOIN categories c ON c.id = p.category_id
)
SELECT prospective_lineage, is_deleted, status, COUNT(*)
  FROM classified
 GROUP BY prospective_lineage, is_deleted, status;
COMMIT;
```

CSV는 첫 회사명 행을 제외하고 실제 헤더 13개로 파싱했다. importer의 placeholder 정규식 `^(-|0+|0+[- ]?0+[- ]?0+)$`와 동일한 조건을 적용했다. 동명 그룹은 코드의 exact/공백제거/괄호 앞 prefix 우선, 그 외 코드 오름차순이라는 HEAD 규칙 그대로 canonical을 계산한 뒤 DB의 active `model_name`, `model_code`, `product_code`와 대조했다.
