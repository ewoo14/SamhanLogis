# PR #984 R4 — R3 postfix 재수렴 리뷰

- 일자: 2026-08-02 (KST)
- 브랜치/HEAD: `fix/ecount-import-model-code-merge` / `971ed3642`
- 역할: 머지 전 재수렴 리뷰어
- 범위: R3가 만든 fingerprint 재수렴 표면만 검토
- 제한 준수: 코드 수정, commit/push/checkout/브랜치 조작, 실 임포트, 공유 DB write/DDL, Docker 이미지 재빌드, 합성 데이터 사용 없음

## 1. 최종 판정

**BLOCK — fingerprint 재수렴이 끝나지 않았다.** R3가 고친 `fallbackSameNameCandidate()`와 별개로 fingerprint를 거치지 않고 기존 동명 DB 후보를 재사용하는 실행 경로가 남아 있다.

- fingerprint 미적용 취약 지점: **2개**
- 실 raw 역방향 미병합: **0그룹 / 0행**
- MANUAL 도달: **0행**(현재 V26 공유 DB에 V28 backfill 규칙을 투영한 raw-only 경로)
- Product 삭제 경로: **0개**
- 기존 SHEET 값 불변: **문자 그대로는 실패** — raw-only 후보 경로에서 729행이 기존 SHEET model-name 병합 SQL에 도달하고, 그중 **713행 / 2,264 fingerprint 필드**가 현재 DB 값과 다르다. 이 쓰기 표면은 R3 신규 delta는 아니지만 “기존 값이 바뀌지 않는다”를 승인할 수는 없다.
- `BigDecimal::compareTo` assertion: **정상** — scale만 다른 값은 같게 보고, 실 raw의 다른 금액은 같다고 보지 않는다.

## 2. fingerprint 미적용 지점 전수

### 2.1 건수와 파일:줄 목록

| 번호 | 파일:줄 | 경로 | 판정 |
|---:|---|---|---|
| 1 | `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:338` | `resolveMainCandidate()`가 `findActiveProductCodeByName(row.name())`으로 기존 동명 DB 코드를 선택하고, 340~347행에서 현재 raw에 그 코드가 없으면 DB UUID만 담은 후보를 그대로 반환한다. `productIdentity()` 비교가 없다. raw 동명이 1행이면 133~162행의 fingerprint 재그룹화 자체를 거치지 않으므로 즉시 재사용된다. | **미적용** |
| 2 | `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:141` | 동명 fingerprint 그룹 후보 필터가 `candidate.rawRow() == null`을 무조건 통과시킨다. 따라서 1번의 DB-only 동명 후보 또는 323~329행의 DB-only relation 후보는 fingerprint를 계산할 raw가 없는데도 145~147행에서 그룹 main으로 선택될 수 있다. | **미적용** |

따라서 **취약 실행 지점은 2개**다. 공통 name-only selector인 `findActiveProductCodeByName()`은 같은 파일 684~697행에 있으며, 별도 재사용 지점으로 중복 집계하지 않았다. 이 helper는 `name`만 조회하고 `created_at, product_code` 첫 행을 반환한다.

R3가 고친 경로는 같은 파일 383~396행의 `fallbackSameNameCandidate()` 하나다. 이 경로는 현재 raw에서 기존 code를 찾고 `productIdentity(existingRaw).equals(productIdentity(sameNameRows.get(0)))`일 때만 재사용하므로 안전하다. 그러나 위 1번 선행 경로에서 후보가 생기면 fallback에 도달하지 않는다.

DB-only relation 후보 생성부(323~329행)는 명시적 relation 계약이므로 “동명 selector” 건수에는 넣지 않았다. 다만 2번의 `rawRow == null` 허용 때문에 fingerprint를 증명하지 못한 후보가 동명 그룹 전체로 확장되는 두 번째 source임은 별도로 확인했다.

### 2.2 기존 테스트가 남은 경로를 고정한다

`EcountProductImporterTest.java:242`와 `:261`은 각각 DB name fallback이 현재 raw에 없는 `DB-OLD`, `DB-001`을 재사용하는 동작을 기대한다. 특히 270~274행은 imported 0 / alias 1을 명시해, fingerprint 없는 기존 DB 후보 재사용이 현재 테스트 계약으로 남아 있음을 보여준다.

현재 공유 DB + 실 raw의 raw-only 경로에서는 이 결함이 당장 발화하지 않았다.

```text
ASSUMPTION=real item CSV + relation/group omitted (R2 raw-only path)
RESOLVED_RAW_MAIN_CODES=2721
REACHED_SHEET_MODEL_NAME_ROWS=729
REACHED_SHEET_DIFFERING_ROWS=713
REACHED_SHEET_DIFFERING_FIELDS=2264
REACHED_MANUAL_MODEL_NAME_ROWS=0
REACHED_MANUAL_PRODUCT_CODE_ROWS=0
DB_ONLY_MAIN_CANDIDATES=0
DB_ONLY_MAIN_NAMES=0
```

이 0은 코드 안전성 판정이 아니라 현재 스냅샷의 발화 건수다. 기존 동명 DB 행의 nonblank `product_code`가 다음 raw에서 빠지거나, DB-only relation main이 동명 그룹에 들어오면 1~2번 경로가 도달 가능하다.

## 3. 역방향 — 병합되어야 할 것이 둘로 남는가

실 원본 `docs/migration/ecount-data/raw/품목-Excel다운로드.csv`를 현재 `EcountCsvSupport.stripCell()`, `parseMoney().toPlainString()`, `normalizeItemType()`와 동일한 규칙으로 읽기 전용 재계산했다. 추가로 금액 scale만 다른 fingerprint가 실제 같은 물건을 갈라놓는지 보기 위해 금액을 수치 동등(`Decimal.normalize`)으로도 한 번 더 묶었다.

```text
RAW_PATH=C:\dev\Samhan-Public\.claude\worktrees\t984\docs\migration\ecount-data\raw\품목-Excel다운로드.csv
RAW_DATA_ROWS=2854
NORMAL_ROWS=2853
DUPLICATE_NAME_GROUPS=164
DUPLICATE_NAME_ROWS=328
CURRENT_FINGERPRINT_MERGE_GROUPS=131
CURRENT_FINGERPRINT_MERGE_ROWS=262
NUMERIC_SEMANTIC_MERGE_GROUPS=131
NUMERIC_SEMANTIC_MERGE_ROWS=262
MISSED_MERGE_GROUPS=0
MISSED_MERGE_ROWS=0
```

판정: **PASS.** R2의 병합 성공 **131그룹 / 262행**을 그대로 재현했고, 현재 fingerprint의 문자열 scale 엄격성 때문에 갈라지는 실 raw 그룹은 **0그룹 / 0행**이다.

## 4. MANUAL 계보 덮어쓰기·삭제

현재 공유 `product_db`는 Flyway V26까지여서 V28의 실제 `lineage` 컬럼이 없다. 따라서 실제 컬럼을 직접 집계하지 않고, V28 migration의 backfill 규칙을 현재 active 1,216행에 읽기 전용으로 투영했다.

동일 DB snapshot과 실 raw 전체 code/name 대조 원문:

```text
SNAPSHOT_AT=2026-08-02 21:49:36.536043+09
DB_ACTIVE_ROWS=1216
MODEL_NAME_RAW_CODE_COLLISIONS=734
MODEL_SHEET=734
PRODUCT_CODE_RAW_CODE_COLLISIONS=0
DB_RAW_NAME_COLLISIONS=2
NAME_SHEET=2
MODEL_FINGERPRINT_DIFFERING_ROWS=718
MODEL_FINGERPRINT_DIFFERING_FIELDS=2285
```

후보 해소까지 raw-only 코드 경로로 좁힌 결과는 2.2 원문처럼 `REACHED_MANUAL_MODEL_NAME_ROWS=0`, `REACHED_MANUAL_PRODUCT_CODE_ROWS=0`이다. `UPDATE_ACTIVE_MODEL_NAME_SQL`도 582행에서 `p.lineage = 'SHEET'`를 요구한다. importer production 코드에는 Product를 삭제하거나 soft-delete하는 SQL이 없다.

판정: **MANUAL 덮어쓰기 0, 삭제 0 유지 — 단, V28 적용 후 실제 lineage 컬럼 재측정은 미판정.** 현재 공유 DB가 V26이므로 이 수치는 V28 규칙 투영치이며 운영 적용 결과로 과장하지 않는다.

## 5. 기존 행 소실·값 변경

### 5.1 행 소실

R3 diff는 `fallbackSameNameCandidate()` 후보 선택과 singleton merge reason만 바꿨고 SQL 변경은 0개다. production importer에 Product DELETE/soft-delete 경로도 없다. 따라서 R3 때문에 기존 행이 사라지는 경로는 **0개**다.

### 5.2 값 변경

R3 자체는 `upsertProduct()`, `productParams()`, `UPSERT_PRODUCT_SQL`, `UPDATE_ACTIVE_MODEL_NAME_SQL`, `restoreSoftDeletedProduct()`를 바꾸지 않았다. 즉 R3 전후 write statement와 write parameter의 delta는 **0개**다.

그러나 기존 importer 계약을 포함해 “기존 행 값이 전혀 바뀌지 않는다”를 문자 그대로 적용하면 PASS가 아니다. 실 raw-only 후보 해소 결과 기존 SHEET 729행이 `model_name = :code AND lineage = 'SHEET'` update 경로에 도달하며, 현재 DB와 raw fingerprint를 비교하면 **713행 / 2,264필드**가 다르다. 이 경로는 화면 품목명은 보존하지만 specification, 품목구분, 8개 단가 계열을 raw 값으로 갱신한다.

판정:

- **R3 delta 기준:** 기존 행 값 write 경로 변경 **0개**.
- **절대 불변 기준:** **FAIL/승인 불가** — 기존 SHEET 값 변경 노출 713행/2,264필드.
- MANUAL은 4절처럼 도달 0행이다.

## 6. `BigDecimal::compareTo` assertion 검증

assertion은 `EcountProductImporterIT.java:235`~237에서만 `usingElementComparator(BigDecimal::compareTo)`를 사용한다. AssertJ 3.26.3의 `ComparatorBasedComparisonStrategy.areEqual()`은 실제로 `comparator.compare(actual, other) == 0`일 때만 equal을 반환한다.

실 raw의 서로 다른 금액 `AAAA-00022=148512`, `AAAA-00023=247521`과 공유 DB/raw에 실제 존재하는 scale 쌍 `0.00/0`으로 실행한 원문:

```text
RAW_REAL_AMOUNT_COMPARE=-1
ASSERTJ_REAL_AMOUNT_EQUAL=false
RAW_DB_SCALE_COMPARE=0
ASSERTJ_SCALE_ONLY_EQUAL=true
```

판정: **PASS.** scale 차이만 통과하고, 실 raw의 진짜 금액 차이는 통과시키지 않는다. collection assertion도 같은 comparison strategy를 사용하므로 금액이 다르면 해당 원소를 일치 원소로 제거하지 못하고 실패한다.

## 7. 재현 원문 모음

### R3 실제 diff

```text
services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java | 6 ++++-- / 4 removed
services/product-service/src/test/java/com/samhanair/logis/product/it/EcountProductImporterIT.java   | 1 added
docs/dev-reports/2026-08-02-984-r3-ci-it-fix.md                                                     | 110 added
```

핵심 diff 원문:

```text
-            UUID existingId = existingRaw == null ? findActiveProductIdByCode(existingCode) : null;
-            if (existingRaw != null || existingId != null) {
-                return new ProductMainCandidate(existingCode, existingRaw, existingId);
+            if (existingRaw != null
+                    && productIdentity(existingRaw).equals(productIdentity(sameNameRows.get(0)))) {
+                return new ProductMainCandidate(existingCode, existingRaw, null);
```

### 원본 존재

```text
품목-Excel다운로드.csv        211984 bytes
품목관계리스트-Excel다운로드.xlsx 11416 bytes
```

관계 XLSX는 실제로 sheet 1개, `MAX_ROW=1`, `MAX_COL=1`, 회사명 meta cell 1개뿐이었다. 품목계층그룹 원본은 이 워크트리에 없다.

## 8. 이 라운드가 보지 않은 것

- 실 임포트 후 DB before/after — 실 임포트 금지로 조사하지 않음.
- V28이 적용된 DB의 실제 `lineage` 집계 — 공유 DB가 V26이므로 미판정.
- relation/group을 포함한 실 원본 경로 — 관계 XLSX가 회사명 meta 1셀뿐이고 품목계층그룹 원본이 부재해 미판정. 2~5절 DB 경로 수치는 R2와 같은 item raw-only 조건이다.
- 합성 fixture 기반 신규 재현 테스트와 기존 IT 재실행 — 합성 데이터 및 DB write 금지로 조사하지 않음.
- Docker rebuild, 전체 CI 재실행, 원격 PR 상태 — 조사하지 않음.
- R2 이전 표면과 #984의 다른 기능 — 이번 요청대로 R3 postfix 재수렴 표면 밖은 조사하지 않음.

## 9. 새 파일 경로

- `docs/dev-reports/2026-08-02-984-r4-postfix-reconvergence.md`
