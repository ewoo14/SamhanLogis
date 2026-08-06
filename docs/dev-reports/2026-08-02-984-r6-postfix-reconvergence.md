# PR #984 R6 — R5 postfix 재수렴 리뷰

- 작성 시각: 2026-08-03 KST
- 역할: 머지 전 재수렴 리뷰어
- 대상: `fix/ecount-import-model-code-merge`의 R5 fingerprint sweep fix 이후
- 판정 기준: 같은 품목명이어도 `품목명 + 단가 8종 + 품목구분 + 규격명` fingerprint가 같은 raw만 같은 물건으로 재사용·병합할 수 있다.
- 제한 준수: 코드 수정, git 조작, 실 임포트, 공유 DB write/DDL, Docker 이미지 재빌드, 합성 데이터 생성·실행 없음. 공유 DB 조회는 `BEGIN READ ONLY`로만 수행했다.

## 1. 최종 판정

**BLOCK — fingerprint 우회 계열이 아직 수렴하지 않았다.**

- 남은 취약 실행 경로: **1개**
- 그 경로를 구성하는 fingerprint 미검증 단정 지점: **2곳**
- 현재 실 품목 raw + `[DEV-SEED]` DB 스냅샷에서의 발화: **0행**
- 역방향 미병합: **0그룹 / 0행** — 실데이터 raw
- MANUAL 덮어쓰기·삭제: **0행 / 0경로** — `[DEV-SEED]` V28 backfill 규칙 투영 + 정적 코드
- R5로 새로 바뀌는 행: **0행** — 실데이터 raw + `[DEV-SEED]` 현재 스냅샷의 delta 기준
- 소실 품목 **33→0**, 소실 필드 **59→0**, 병합 **131그룹/262행** — 실데이터 raw

현재 스냅샷의 발화 0은 코드 안전성 0을 뜻하지 않는다. 아래 경로는 DB 동명 정본 코드가 다음 raw에도 존재하지만 그 코드 행의 이름·규격·단가가 현재 동명 행과 달라진 정상적인 재임포트 상태에서 도달 가능하다.

## 2. fingerprint 우회 지점 전수 목록·건수

### 2.1 남은 1개 실행 경로를 이루는 2개 단정 지점

| 번호 | 파일:줄 | 실제 단정 내용 | 판정 |
|---:|---|---|---|
| 1 | `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:336-340` | `findActiveProductCodeByName(row.name())`으로 DB 동명 후보 코드를 고른 뒤, 그 코드가 현재 raw의 `itemsByCode`에 있기만 하면 `dbMainRaw`를 반환한다. `productIdentity(dbMainRaw)`와 `productIdentity(row)` 비교가 없다. | **취약** |
| 2 | `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:136-137` | 현재 raw에서 같은 이름이 1행이면 fingerprint 재그룹화 전체를 건너뛴다. 따라서 1번에서 반환한 미검증 `dbMainRaw`가 141-142행의 fingerprint filter를 거치지 않고 179-204행의 upsert/alias 병합까지 생존한다. | **취약** |

건수는 **미검증 단정 지점 2곳 / 취약 실행 경로 1개**다. 두 지점은 독립적인 두 병합 경로가 아니라 하나의 도달 가능한 경로를 앞뒤에서 구성하므로 두 수치를 함께 명시한다.

실행 흐름은 다음과 같다.

```text
현재 raw 이름 N은 1행
  → DB active 품목 중 name=N의 첫 product_code=C 선택                 (:336)
  → 이번 raw에도 code=C인 행 R이 존재하면 fingerprint 비교 없이 반환 (:338-340)
  → N의 raw count가 1이므로 fingerprint 재그룹화를 skip              (:136-137)
  → N행을 C/R의 main으로 upsert·alias 병합                             (:179-204)
```

여기서 `R.name`, 규격 또는 단가가 N행과 달라도 현재 코드는 막지 않는다. 즉 “DB에서 이름이 같았던 코드가 이번 파일에도 있다”를 “이번 raw 업무값도 같다”로 잘못 단정한다.

### 2.2 나머지 후보·재사용 단정의 disposition

| 단정 | 위치 | fingerprint 우회 여부 |
|---|---|---|
| 동명 fingerprint 그룹의 기존 후보 선택 | `EcountProductImporter.java:139-145` | `rawRow != null && productIdentity(rawRow).equals(identity)`가 있으므로 **안전** |
| 동명 fallback | `EcountProductImporter.java:377-390` | DB 코드의 현재 raw가 있고 그 identity가 그룹 첫 행과 같을 때만 재사용하므로 **안전** |
| DB-only 동명 후보 | `EcountProductImporter.java:336-342` | R5가 DB-only 반환을 제거해 **안전**. 이번 결함은 DB-only가 아니라 DB 코드가 raw에도 있는 경우다. |
| 명시적 relation main | `EcountProductImporter.java:321-330` | 이름 추정이 아니라 명시적 관계 계약. 동명 그룹으로 승격할 때는 141-142행 fingerprint filter 적용. **본 계열 아님** |
| 승인된 코드 규칙 main | `EcountProductImporter.java:332-374` | 코드==명/공백 제거/괄호 앞 코드라는 명시 규칙. 동명 selector가 아니다. **본 계열 아님** |
| SHEET `model_name=:code` 갱신 | `EcountProductImporter.java:440-445, 533-579` | 품목명 동명 선택이 아니라 raw 품목코드와 SHEET model_name의 식별자 일치 경로다. `lineage='SHEET'` 제한. **본 계열 아님** |
| soft-deleted product 복원 | `EcountProductImporter.java:581-628` | `product_code=:code` 식별자 일치 경로. **본 계열 아님** |
| alias resolve/reservation | `EcountAliasResolveService.java:38-58`, `EcountAliasReservationService.java:31-69` | 이미 저장된 alias→UUID를 해소·예약할 뿐 이름 후보를 만들지 않는다. **본 계열 아님** |
| 시트 동기화 재사용 | `ProductSheetSyncService.java:1249-1277` | `modelCode` 정확일치로 Product를 찾는다. 이카운트 동명 후보 선택 경로가 아니다. **본 계열 아님** |

`findActiveProductCodeByName()` helper 자체는 678-691행에 1개다. 독립 취약 경로로 중복 집계하지 않고 실제 호출 결과를 소비하는 336-340행을 집계했다.

### 2.3 R5 테스트가 고정하지 않은 경계

현재 테스트는 `DB-only` 후보와 `DB-only relation` 후보를 각각 막는다.

```text
278:    void importCsv_동명_DB_only_후보는_raw_fingerprint_없이_재사용하지_않는다() {
294:    void importCsv_동명그룹의_DB_only_relation_후보는_fingerprint_없는_main으로_승격하지_않는다() {
```

그러나 “DB 동명 후보의 product_code가 이번 raw에도 존재하지만 그 raw의 fingerprint가 현재 동명 singleton과 다르다”는 경계는 고정하지 않는다. 합성 데이터 금지 때문에 신규 테스트를 만들거나 실행하지 않았고, 코드 흐름으로만 판정했다.

## 3. 각도 2 — 역방향 0 유지

데이터 출처: **실데이터** `docs/migration/ecount-data/raw/품목-Excel다운로드.csv`.

현재 `stripCell`, `parseMoney().toPlainString()`, `normalizeItemType`, `productIdentity`와 같은 규칙으로 raw를 읽기 전용 재계산했다.

```text
RAW_PATH=C:\dev\Samhan-Public\.claude\worktrees\t984\docs\migration\ecount-data\raw\품목-Excel다운로드.csv
RAW_DATA_ROWS=2854
NORMAL_ROWS=2853
DUPLICATE_NAME_GROUPS=164
DUPLICATE_NAME_ROWS=328
FINGERPRINT_GROUPS_WITHIN_DUP_NAMES=197
HETEROGENEOUS_NAME_GROUPS=33
LOST_PRODUCTS_NAME_ONLY=33
LOST_FIELDS_NAME_ONLY=59
CURRENT_FINGERPRINT_MERGE_GROUPS=131
CURRENT_FINGERPRINT_MERGE_ROWS=262
MISSED_MERGE_GROUPS=0
MISSED_MERGE_ROWS=0
```

판정: **PASS — 0그룹 / 0행.** 같은 fingerprint인 동명 raw는 모두 131개 그룹에 남아 있으며 262행 전부 병합 대상이다.

## 4. 각도 3 — MANUAL 덮어쓰기·삭제 0 유지

데이터 출처: DB는 사용자 지정대로 **`[DEV-SEED]`**, 품목 입력은 **실데이터 raw**다.

공유 `product_db`는 Flyway V26이므로 `lineage` 실제 컬럼이 없다. V28의 확정 backfill 규칙을 읽기 전용 스냅샷에 투영했다.

```text
ASSUMPTION=real item CSV + relation/group omitted (raw-only path)
RESOLVED_RAW_MAIN_CODES=2721
MODEL_NAME_HIT_ROWS=729
MODEL_NAME_MANUAL_ROWS=0
MODEL_NAME_SHEET_ROWS=729
MODEL_NAME_ECOUNT_ROWS=0
PRODUCT_CODE_MANUAL_ROWS=0
PRODUCT_CODE_SHEET_ROWS=0
PRODUCT_CODE_ECOUNT_ROWS=0
PRODUCT_DELETE_PATHS_IN_IMPORTER=0
```

- 기존 행 갱신 도달 729행은 모두 V28 투영상 SHEET다.
- MANUAL `model_name` 갱신 도달은 0행, MANUAL `product_code` upsert 충돌도 0행이다.
- importer에는 `DELETE FROM products` 또는 `markDeleted()`가 없다. 581-628행은 soft-deleted 동일 `product_code` 1건을 찾아 `is_deleted=FALSE`로 복원하는 반대 방향이다.

판정: **PASS — MANUAL 덮어쓰기 0행, Product 삭제 경로 0개.** 단, V28 적용 DB의 실제 lineage 실측은 아니다.

## 5. 각도 4 — R5 신규 delta 행 0

데이터 출처: 품목은 **실데이터 raw**, DB는 **`[DEV-SEED]`**다.

```text
R5_REAL_RAW_DEV_SEED_ACTIVATED_BYPASS_ROWS=0
R5_REAL_RAW_DEV_SEED_NEW_DELTA_ROWS=0
```

R5가 바꾼 것은 DB-only 후보 반환 제거와 fingerprint filter 강화이고, R5 보고서에 기록된 production SQL/write parameter 변경은 0이다. 현재 실 raw + `[DEV-SEED]` 조합에서는 R5 전환 조건과 이번에 찾은 잔존 경로 모두 발화 0행이므로 임포트 본업의 원래 SHEET 갱신을 제외한 신규 delta는 **0행**이다.

판정: **현재 스냅샷 기준 PASS.** 다만 이 수치는 잔존 코드 경로의 안전성을 증명하지 않는다. DB 동명 코드가 raw에도 나타나는 다음 재임포트에서는 2절 경로가 발화할 수 있다.

## 6. 각도 5 — 소실·병합 수 유지

데이터 출처: **실데이터 raw**.

| 항목 | 이름-only | 현재 fingerprint |
|---|---:|---:|
| 업무값이 다른 동명 그룹 | 33 | 33개를 별도 identity로 보존 |
| 소실 품목 | 33 | **0** |
| 소실 필드 | 59 | **0** |
| 동일 fingerprint 병합 | 미적용 | **131그룹 / 262행** |
| 서로 다른 fingerprint인데 합쳐지는 raw partition | 33그룹 | **0그룹 / 0행** |

판정: **PASS.** raw partition 자체는 R5 이후에도 `33→0`, `59→0`, `131/262`를 유지한다. BLOCK 사유는 이 partition을 우회할 수 있는 DB 동명 후보 경로다.

## 7. 재현 원문

### 7.1 후보 단정문 sweep

실행:

```powershell
rg -n 'findActiveProductCodeByName|productIdentity\(|normalNameCounts|getOrDefault\(identity.name|rawRow\(\) != null|fallbackSameNameCandidate|new ProductMainCandidate' services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java
```

관련 원문:

```text
136:            if (normalRowsByName.getOrDefault(identity.name(), List.of()).size() < 2) {
141:                    .filter(candidate -> candidate != null && candidate.rawRow() != null
142:                            && productIdentity(candidate.rawRow()).equals(identity))
145:                    .orElseGet(() -> fallbackSameNameCandidate(identity.name(), sameProductRows, itemsByCode));
336:        String dbMainCode = findActiveProductCodeByName(row.name());
340:                return new ProductMainCandidate(dbMainCode, dbMainRaw, null);
343:        if (normalNameCounts.getOrDefault(row.name(), 0) == 1) {
379:        String existingCode = findActiveProductCodeByName(name);
383:                    && productIdentity(existingRaw).equals(productIdentity(sameNameRows.get(0)))) {
```

### 7.2 `[DEV-SEED]` 읽기 전용 DB 스냅샷

실행은 `BEGIN READ ONLY` 안에서 수행했다.

```text
BEGIN
          snapshot_at
-------------------------------
 2026-08-03 00:23:43.385921+09

 active_rows | active_status_rows
-------------+--------------------
        1220 |               1216

              created_by              | count
--------------------------------------+-------
 00000000-0000-0000-0000-000000000001 |  1119
 system                               |   100
 qa-seed                              |     1

COMMIT
```

### 7.3 실 원본 존재/부재

```text
품목-Excel다운로드.csv              211984 bytes
품목관계리스트-Excel다운로드.xlsx     11416 bytes
RELATION_XLSX_SHEETS=1
RELATION_XLSX_MAX_ROW=1
RELATION_XLSX_MAX_COL=1
RELATION_XLSX_NONEMPTY_CELLS=1
GROUP_SOURCE_CANDIDATES=0
```

따라서 품목 CSV 수치는 실데이터로 판정했다. 관계 XLSX는 회사명 meta 1셀뿐이며, 품목계층그룹 원본은 **원본 부재로 미판정**이다.

## 8. 이 라운드가 보지 않은 것

- 실 임포트 전후 DB — 실 임포트 금지로 조사하지 않음.
- V28이 실제 적용된 DB의 `lineage` — 공유 DB가 V26이므로 조사하지 않음. V28 backfill 규칙만 투영.
- 품목관계 실데이터 경로 — 제공 XLSX가 meta 1셀뿐이므로 조사하지 않음.
- 품목계층그룹 실데이터 경로 — 원본 부재로 미판정.
- 합성 fixture로 잔존 경로를 실행하는 RED 테스트 — 합성 데이터 금지로 조사하지 않음.
- product-service 643 tests 재실행 — R5 결과를 인수했으며 이번 제약상 DB write가 발생하는 테스트를 실행하지 않음.
- 원격 PR/CI 상태, commit diff, 브랜치/HEAD — git 조작 금지에 따라 조사하지 않음.
- 운영/공유 실데이터 DB — 로컬 DB가 `[DEV-SEED]`이므로 조사하지 않음.
- Docker 이미지 rebuild 및 서비스 재배포 — 수행하지 않음.

## 9. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-984-r6-postfix-reconvergence.md`

