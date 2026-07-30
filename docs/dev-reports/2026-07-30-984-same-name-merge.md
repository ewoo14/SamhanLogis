# PR #984 R3 HIGH-1 라운드 fix: 동명 순번코드 병합

## 결론

대표 후보를 정하지 못했다는 이유로 같은 품목명의 raw 행을 누락하던 경로를 제거했다. 정확히 같은 `품목명` 그룹은 파일 순서상 첫 raw code를 물리 저장용 canonical code로 사용하고, 모든 순번코드를 `product_aliases`에 저장한다. canonical code는 업무상 대표가 아니라 하나의 `products` 행에 필요한 저장 키일 뿐이다.

품목코드 조회는 `products.product_code` 직접 조회 후 `product_aliases.alias_code`로 fallback한다. 따라서 canonical code가 아닌 순번코드도 같은 품목으로 조회된다.

개발책임자 결정(2026-07-30)을 적용했다.

> “`AAAA-*` 이런 것도 이카운트 순번코드”
>
> “같은 품목명은 하나로 병합하고”
>
> “다만 추후 이카운트 데이터도 서로 병합해줘야함”

## 원인

`EcountProductImporter`는 각 raw 행을 독립적으로 `resolveMainCandidate`에 통과시켰다. 관계 파일과 사전 후보 규칙이 없고 같은 이름의 raw 행이 2개 이상이면 `MIG2_NO_MAIN_CANDIDATE`가 발생했다. 이후 해당 이름의 모든 행을 `SKIPPED_MAIN_CANDIDATE`로 표시하고 HTTP 200 결과에 포함시켰다.

그 결과 R2에서 `skippedGroupCount=12`, 24개 raw code가 누락됐고 R3에서 `lookup-by-code`가 24/24 HTTP 404였다. 공유 DB의 현재 R4 상태도 다음과 같이 24개 code가 모두 활성 product code·model name·alias에 없다.

## RED-first 원문

신규 `EcountProductImporterSameNameMergeTest`를 먼저 추가한 뒤 수정 전 실행했다.

```text
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t21'; .\gradlew.bat :services:product-service:test --tests 'com.samhanair.logis.product.service.EcountProductImporterSameNameMergeTest' --rerun-tasks --no-build-cache

EcountProductImporterSameNameMergeTest > 같은_품목명_순번코드_그룹은_대표후보_실패로_누락되지_않고_한_품목과_alias로_병합된다() FAILED
    org.opentest4j.AssertionFailedError at EcountProductImporterSameNameMergeTest.java:65

> Task :services:product-service:test FAILED
1 test completed, 1 failed
BUILD FAILED
```

수정 전 실제 결과는 테스트 기대와 반대로 `imported=0`, `aliasImported=0`, `skippedGroupCount=1`이었다.

## 수정 내용

- `EcountProductImporter`가 normal raw 행을 정확한 품목명별로 그룹화한다.
- 동명 그룹에서 후보 판정이 실패해도 첫 raw code를 저장용 canonical code로 사용한다.
- 동명 그룹의 모든 행을 하나의 `ProductMainCandidate`로 수렴시키고 모든 code를 alias로 upsert한다.
- DB에 같은 품목명이 이미 여러 건이어도 생성시각 후 code 순서의 안정된 기존 행을 선택해 raw 행을 누락하지 않는다.
- 병합된 각 staging raw 행의 `raw_specification`, `raw_outbound_price`, `raw_inbound_price` 원문을 그대로 보존한다.
- `staging.ecount_item_raw.reject_reason`에 `MERGED_SAME_NAME`, 선택 행, 폐기 행의 code·규격·출하가·입고단가를 기록한다. 후속 이카운트 원본 병합 작업은 이 raw 행과 reason을 입력으로 사용할 수 있다.
- `ProductService.lookupSummaryByProductCode`가 직접 `product_code`를 찾지 못하면 active `product_aliases.alias_code`를 조회한다.
- `ProductSheetSyncService`, `Product.lineage`, V27/V28 migration, rollback transaction 경계는 변경하지 않았다.

## GREEN 원문

### 대상 단위 테스트

```text
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t21'; .\gradlew.bat :services:product-service:test --tests 'com.samhanair.logis.product.service.EcountProductImporterSameNameMergeTest' --tests 'com.samhanair.logis.product.service.ProductServiceTest' --rerun-tasks --no-build-cache

> Task :services:product-service:test
BUILD SUCCESSFUL in 14s
13 actionable tasks: 13 executed
```

### importer 기존 회귀 + alias lookup 단위 테스트

```text
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t21'; .\gradlew.bat :services:product-service:test --tests 'com.samhanair.logis.product.service.EcountProductImporterTest' --tests 'com.samhanair.logis.product.service.EcountProductImporterSameNameMergeTest' --tests 'com.samhanair.logis.product.service.ProductServiceTest' --rerun-tasks --no-build-cache

> Task :services:product-service:test
BUILD SUCCESSFUL in 14s
13 actionable tasks: 13 executed
```

### 실 경로 12그룹 fixture 컴파일

`EcountProductImporterIT.sameNameSequenceCodes_are_all_aliases_and_lookupable`는 실제 `importCsv` 진입점으로 12개 그룹·24개 code를 넣고, 각 그룹의 두 code가 같은 Product ID인지, 12개 이름이 서로 다른 Product ID인지, staging 병합 reason과 alias row를 확인한다. 같은 파일을 두 번 넣어 `12 imported → 0 imported/12 updated`, `24 aliases`도 확인한다.

```text
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t21'; .\gradlew.bat :services:product-service:compileTestJava --rerun-tasks --no-build-cache

BUILD SUCCESSFUL in 10s
6 actionable tasks: 6 executed
```

이 IT는 Testcontainers와 Postgres를 기동하므로 작업 지시대로 실행하지 않았다. 위 GREEN은 테스트 소스 컴파일 결과이며, 실제 Postgres runtime GREEN은 CI 또는 개발책임자가 허용한 격리 DB에서 실행해야 한다.

## 24개 code 조회 전/후

### fix 전 실측

R3 실서버 결과는 24/24 HTTP 404였다. 이번 세션에서 공유 DB에 실행한 읽기 전용 SQL도 24행 모두 `product_code`, `model_name`, `alias_code`가 NULL이었다.

```sql
WITH codes(code) AS (
  VALUES ('00131'), ('SAR-00006'), ('AAAA-00004'), ('AAAA-00005'),
         ('AAAA-00006'), ('AAAA-00007'), ('AAAA-00008'), ('ZENG-00009'),
         ('AAAA-00009'), ('ZENG-00011'), ('AAAA-00010'), ('ZENG-00010'),
         ('AAAA-00011'), ('ZENG-00008'), ('AAAA-00021'), ('ZENG-00016'),
         ('AAAA-00022'), ('AAAA-00023'), ('AAAA-00034'), ('ZENG-00017'),
         ('AAAA-00037'), ('AAAA-00038'), ('ZENG-00012'), ('ZENG-00019')
)
SELECT c.code, p.product_code, p.model_name, a.alias_code
  FROM codes c
  LEFT JOIN products p
    ON p.product_code = c.code AND p.is_deleted = FALSE
  LEFT JOIN product_aliases a
    ON a.alias_code = c.code AND a.is_deleted = FALSE
 ORDER BY c.code;
```

### fix 후 확인 범위

Docker 재배포 금지 지시 때문에 수정된 source를 R4 실서버에 배포하거나 공유 DB에 import write할 수 없었다. 따라서 아래 `fix 후` 열은 이번 세션에서 실측한 HTTP 상태가 아니라, GREEN IT가 실행할 동일 조회 계약의 기대 결과다. 24개 전부가 active `product_aliases`를 통해 1개 병합 Product로 해석되며 HTTP controller에서는 200이 된다.

| code | fix 전 R4 실서버 | fix 후 source/IT 계약 |
|---|---:|---:|
| `00131` | 404 | 200* |
| `SAR-00006` | 404 | 200* |
| `AAAA-00004` | 404 | 200* |
| `AAAA-00005` | 404 | 200* |
| `AAAA-00006` | 404 | 200* |
| `AAAA-00007` | 404 | 200* |
| `AAAA-00008` | 404 | 200* |
| `ZENG-00009` | 404 | 200* |
| `AAAA-00009` | 404 | 200* |
| `ZENG-00011` | 404 | 200* |
| `AAAA-00010` | 404 | 200* |
| `ZENG-00010` | 404 | 200* |
| `AAAA-00011` | 404 | 200* |
| `ZENG-00008` | 404 | 200* |
| `AAAA-00021` | 404 | 200* |
| `ZENG-00016` | 404 | 200* |
| `AAAA-00022` | 404 | 200* |
| `AAAA-00023` | 404 | 200* |
| `AAAA-00034` | 404 | 200* |
| `ZENG-00017` | 404 | 200* |
| `AAAA-00037` | 404 | 200* |
| `AAAA-00038` | 404 | 200* |
| `ZENG-00012` | 404 | 200* |
| `ZENG-00019` | 404 | 200* |

`*` 200은 live HTTP 재요청이 아니라 `EcountProductImporterIT`의 `ProductService.lookupSummaryByProductCode` assertion 계약이다. 배포 후 아래 SQL에서 24행 모두 `alias_code`가 채워지는 것을 확인해야 live 24/24 HTTP 200을 확정할 수 있다.

```sql
SELECT alias_code, main_product_id
  FROM product_aliases
 WHERE is_deleted = FALSE
   AND alias_code IN (...위 24개 code...)
 ORDER BY alias_code;
```

## 병합 시 채택/폐기된 규격·단가

canonical code는 실 업무 대표 판정이 아니라 파일 순서상 첫 행의 저장 키다. 현재 구현은 첫 행의 제품 컬럼을 `products`에 채택하고, 두 번째 행을 포함한 전체 raw 원문을 staging에 보존한다. 아래 값은 R2 import가 남긴 `staging.ecount_item_raw`를 읽기 전용 SELECT한 실측이다. 금액은 출하가/입고단가 순서다.

| 품목명 | 채택 raw code: 규격 / 출하가 / 입고단가 | 폐기 raw code: 규격 / 출하가 / 입고단가 |
|---|---|---|
| AR-EH03 | `00131`: 빈값 / 25,300 / 0 | `SAR-00006`: 무선리모컨(일반+무풍) / 25,300 / 0 |
| 삼성추가배관(벽걸이) | `AAAA-00004`: 10평이하 / 0 / 12,277 | `AAAA-00005`: 30평이하 / 0 / 13,914 |
| 삼성추가배관(스탠드) | `AAAA-00006`: 30평미만 / 0 / 13,914 | `AAAA-00007`: 30평이상 / 0 / 16,370 |
| 바람막이 | `AAAA-00008`: 실외기 열전환 커버 / 0 / 45,017 | `ZENG-00009`: 바람막이 / 0 / 30,000 |
| 배수펌프 | `AAAA-00009`: HRP-(4,6,8,12,15)M / 0 / 110,496 | `ZENG-00011`: 배수펌프 / 0 / 80,000 |
| 천공 | `AAAA-00010`: 50,55,65 / 0 / 16,370 | `ZENG-00010`: 천공 / 0 / 10,000 |
| 유니온 | `AAAA-00011`: 삼성 Assy' 스마트 링크 / 0 / 22,099 | `ZENG-00008`: 유니온 / 0 / 14,000 |
| 사다리차 | `AAAA-00021`: 10M / 0 / 106,404 | `ZENG-00016`: 사다리차 / 0 / 0 |
| 고소작업차(스카이) | `AAAA-00022`: 저층용(2~8층) / 0 / 148,512 | `AAAA-00023`: 저층용(9층이상) / 0 / 247,521 |
| 실외기받침대 | `AAAA-00034`: 벽걸이형 / 0 / 0 | `ZENG-00017`: 실외기받침대 / 0 / 0 |
| 삼성 추가배관 | `AAAA-00037`: 32.5㎡ 이하 / 0 / 0 | `AAAA-00038`: 100.5㎡ 이하 / 0 / 0 |
| 추가배관(벽걸이) | `ZENG-00012`: 추가배관(벽걸이10평미만) / 0 / 12,000 | `ZENG-00019`: 추가배관(벽걸이30평미만) / 0 / 0 |

폐기 값은 삭제하거나 product row에 버리지 않는다. `staging.ecount_item_raw`의 24개 원본 컬럼과 `MERGED_SAME_NAME` reason에 남기므로, 추후 이카운트 데이터 자체를 서로 병합하는 작업의 입력으로 사용할 수 있다.

## 불변식 확인

| # | 불변식 | 확인 방법 | 이번 세션 결과 |
|---:|---|---|---|
| 1 | 대표 후보 불가로 조용히 누락되지 않음 | RED fixture의 동명 후보 실패를 GREEN에서 `imported=1`, `aliasImported=2`, `skippedGroupCount=0`으로 확인. singleton 후보 실패는 HTTP 200 skip 대신 exception으로 중단 | 단위 GREEN |
| 2 | 같은 품목명은 한 행 | 12그룹 IT에서 두 code의 Product ID 동일, 재임포트는 `updated=12` | IT source compile, runtime 미실행 |
| 3 | 다른 품목명은 병합하지 않음 | 12개 이름별 Product ID를 수집하고 `doesNotHaveDuplicates()` assertion. grouping key는 exact `row.name()` | IT source compile, runtime 미실행 |
| 4 | 모든 순번코드 조회 가능 | Product code 직접 조회 + alias fallback, 24개 code 전수 lookup assertion, 24개 alias SQL assertion | 단위 GREEN, IT runtime/live 미실행 |
| 5 | 규격·단가가 조용히 사라지지 않음 | raw 컬럼 보존 + `MERGED_SAME_NAME` reason에 selected/discarded 값 기록. `AAAA-00004/00005`와 12그룹 전체 실측 표를 이 문서에 기록 | 코드 반영, IT runtime 미실행 |
| 6 | 사용자 품목명 보존 | `ProductSheetSyncService`, `UPDATE_ACTIVE_MODEL_NAME_SQL` 및 `lineage='SHEET'` 조건을 변경하지 않음. 기존 R4 report의 시트 정본명 검증과 diff 대조 | 정적 확인 |
| 7 | 멱등 | 12그룹 IT가 같은 fixture 두 번 실행하고 `12 imported → 0 imported/12 updated`, alias 24를 assertion | IT source compile, runtime 미실행 |
| 8 | 실패 시 부분 반영 없음 | `@Transactional(REQUIRES_NEW)`와 alias 충돌 SQL을 변경하지 않음. 기존 alias conflict 회귀 테스트가 유지되고 R3 live rollback 증거와 diff 대조 | 단위/기존 증거, 새 live 미실행 |
| 9 | 정상 726건 다운스트림 | lookup/product/inventory/slip 코드를 변경하지 않았고 R3의 726/726 HTTP 200, 전표 200, `AVAILABLE → RESERVED` 증거와 diff 대조 | 정적 확인, live 재실행 안 함 |
| 10 | 직전 sync 순서 수렴 | `ProductSheetSyncService`, V28 lineage migration, 기존 수렴 IT를 변경하지 않음. 본 변경은 Ecount importer와 code lookup만 확장 | 정적 확인, Testcontainers 미실행 |

## migration·안전 경계

- 새 컬럼이나 상태값이 필요하지 않다. 기존 staging raw 컬럼과 `reject_reason`, V27/V28을 사용했으므로 migration을 추가하지 않았다. 따라서 V29 전수 대조를 발동하지 않았고 기존 V27/V28 파일을 수정하지 않았다.
- Docker 재배포를 하지 않았다.
- Testcontainers/Postgres IT를 실행하지 않았다.
- 공유 DB에는 위 두 개의 읽기 전용 SELECT만 실행했다. import write는 하지 않았다.
- `git add`, `commit`, `push`, `checkout`을 실행하지 않았다.

## 변경·신규 파일 목록

### 변경 파일

| 파일 | 변경량 |
|---|---:|
| `docs/handoff/CURRENT-WORK.md` | `+8 / -0` |
| `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java` | `+79 / -44` |
| `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java` | `+7 / -4` |
| `services/product-service/src/test/java/com/samhanair/logis/product/it/EcountProductImporterIT.java` | `+87 / -0` |
| `services/product-service/src/test/java/com/samhanair/logis/product/service/EcountProductImporterTest.java` | `+16 / -30` |
| `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductServiceTest.java` | `+13 / -0` |

### 신규 파일

| 파일 | 변경량 |
|---|---:|
| `services/product-service/src/test/java/com/samhanair/logis/product/service/EcountProductImporterSameNameMergeTest.java` | `+89 / -0` |
| `docs/dev-reports/2026-07-30-984-same-name-merge.md` | `+212 / -0` |
