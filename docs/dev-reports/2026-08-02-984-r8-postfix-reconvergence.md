# PR #984 R8 — R7 postfix 머지 전 재수렴 리뷰

- 작성일: 2026-08-03 KST
- 역할: 머지 전 재수렴 리뷰어
- 대상 브랜치: `fix/ecount-import-model-code-merge`
- 판정 대상: R7 `fingerprint gate 전수 적용` 이후의 역방향 미병합, gate 우회, MANUAL 보호, 신규 delta, 값 소실
- 제한 준수: 코드 수정 없음, git 상태 변경 없음, 실 임포트 없음, 공유 DB write/DDL 없음, Docker 이미지 재빌드 없음, 합성 데이터 생성·실행 없음

## 1. 결론

**BLOCK — R7이 실제 raw의 승인된 품목코드 대표 규칙을 1곳 과차단하여, 같은 물건 1그룹/2행을 둘로 가른다.**

핵심 수치는 다음과 같다.

| 검증 항목 | R8 결과 | 데이터 출처 | 판정 |
|---|---:|---|---|
| 동일 fingerprint 병합 | **131그룹 / 262행** | 실데이터 raw | 유지 |
| 동일 fingerprint 내부 미병합 | **0그룹 / 0행** | 실데이터 raw + 현재 코드 정적 투영 | 유지 |
| 승인된 코드 대표 규칙까지 포함한 역방향 미병합 | **1그룹 / 2행** | 실데이터 raw | **회귀** |
| R7로 main이 새로 바뀌는 raw | **1행** | 실데이터 raw, R7 전/후 코드 투영 | **회귀** |
| R7로 새로 생기는 Product delta | **1행** | 실데이터 raw + `[DEV-SEED]` 읽기 전용 투영 | **회귀** |
| fingerprint 구조적 우회 | **1경로** | 독립 코드 전수 훑기 | R7의 `0곳`과 불일치 |
| 위 우회의 현재 실데이터 발화 | **0행** | 관계 원본 1셀 + 실데이터 raw | 현재 미발화 |
| MANUAL 덮어쓰기 / Product 삭제 | **0행 / 0경로** | 실데이터 raw + `[DEV-SEED]` + 정적 코드 | 유지 |
| 이름-only 소실 품목 | **33 → 0** | 실데이터 raw | 유지 |
| 이름-only 소실 필드 | **59 → 0** | 실데이터 raw | 유지 |

R7 보고서의 `미병합 0그룹/0행`은 **이미 같은 fingerprint인 행끼리만 다시 묶어 센 좁은 지표**로는 맞다. 그러나 importer에는 fingerprint 이전부터 승인된 `코드 == 다른 행의 품목명` 대표 규칙이 있다. R7은 singleton까지 재그룹화하면서 이 명시 규칙의 실제 1건을 fingerprint 불일치로 탈락시켰고, 그 결과 같은 물건을 두 Product로 분리한다.

## 2. 데이터 출처와 현재 스냅샷

### 2.1 실데이터 raw

현재 품목 원본은 다음 파일이다.

```text
RAW_PATH=C:\dev\Samhan-Public\.claude\worktrees\t984\docs\migration\ecount-data\raw\품목-Excel다운로드.csv
RAW_SHA256=7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678
RAW_DATA_ROWS=2854
NORMAL_ROWS=2853
UNIQUE_RAW_CODES=2853
DUPLICATE_RAW_CODE_ROWS=0
```

`rg --files`는 `.gitignore` 때문에 이 파일을 숨기므로 직접 디렉터리를 열어 존재를 확인했다. 이 보고서의 33/59, 131/262, 역방향 1/2는 모두 위 SHA의 실 품목 CSV에서 다시 계산했다.

관계 원본은 현재 유효 관계표가 아니다.

```text
RELATION_FILE_BYTES=11416
RELATION_XLSX_SHEETS=1
RELATION_XLSX_NONEMPTY_CELLS=1
```

품목계층그룹 원본은 디렉터리에 없다. 따라서 관계·그룹 파일이 실제 내용을 가진 경우의 동작은 이 라운드에서 판정하지 않았다.

### 2.2 `[DEV-SEED]` 읽기 전용 DB

공유 `product_db`는 아직 V28 `lineage` 컬럼이 없으므로, V28의 확정 backfill 식을 SELECT 안에서만 투영했다. 실행 원문은 다음과 같다.

```text
BEGIN
 projected_lineage | active_rows | active_status_rows | model_name_rows | product_code_rows
-------------------+-------------+--------------------+-----------------+-------------------
 MANUAL            |         101 |                 97 |             101 |               100
 SHEET             |        1119 |               1119 |            1119 |                 0
(2 rows)

 staging_item_rows
-------------------
                 0
(1 row)
COMMIT
```

실 임포트는 실행하지 않았고 staging도 0행이었다.

## 3. 1순위 — 역방향 미병합 실측

### 3.1 좁은 fingerprint partition은 유지된다

현재 production과 같은 `stripCell`, `parseMoney`, `normalizeItemType`, `productIdentity` 규칙으로 실 raw를 재계산한 원문이다.

```text
DUPLICATE_NAME_GROUPS=164
DUPLICATE_NAME_ROWS=328
HETEROGENEOUS_NAME_GROUPS=33
CURRENT_FINGERPRINT_MERGE_GROUPS=131
CURRENT_FINGERPRINT_MERGE_ROWS=262
MISSED_MERGE_GROUPS=0
MISSED_MERGE_ROWS=0
```

따라서 **동일 fingerprint만 기준으로 보면** 병합 성공 131그룹/262행과 미병합 0그룹/0행은 유지된다. 각 `ProductIdentity` 그룹의 모든 행을 133~157행에서 하나의 `groupCandidate`로 다시 써 주므로, 같은 identity 내부가 둘로 갈리는 경로는 현재 raw에서 없다.

### 3.2 그러나 승인된 코드 대표 규칙에서 실제 1그룹/2행이 갈린다

R7 전/후 후보 해소를 실 raw에 투영한 실행 원문이다.

```text
NEW_SPLIT_GROUPS_R7=0
NEW_SPLIT_ROWS_R7=0
R7_CHANGED_RAW_ROWS=1
CHANGED_ROWS_BEGIN
63|00130|AJ030RXH4BC1|AJ030RXH4BC1|00130|approved_raw|fallback_canonical|False
CHANGED_ROWS_END
```

앞의 `NEW_SPLIT_* = 0`은 fingerprint identity 내부만 세는 좁은 집계다. 바로 다음 줄이 R7 때문에 바뀐 실제 행이다. 원본 두 행은 다음과 같다.

```text
LINE=65 00130,AJ030RXH4BC1,0,0,,,627000,652080,689700,815100,[상품],,YES
LINE=653 AJ030RXH4BC1,AJ030RXH4BC1 (RX다배관),1254000,0,,,627000,652080,689700,815100,[상품],다배관,YES
```

R7 전후 흐름은 다음과 같다.

```text
R7 전
  raw code=00130, name=AJ030RXH4BC1
    → findApprovedRawMainRow exact: code AJ030RXH4BC1 행 선택
    → singleton은 identity 재그룹화를 건너뜀
    → mainCode=AJ030RXH4BC1

R7 후
  같은 approved raw 후보
    → singleton도 isFingerprintCompatibleCandidate 진입
    → 후보 행 name/spec/출하가가 달라 fingerprint 불일치
    → 후보 탈락, fallback canonical=self
    → mainCode=00130
```

두 번째 raw 행은 계속 `mainCode=AJ030RXH4BC1`이다. 즉 R7 전에는 두 행이 `AJ030RXH4BC1` 하나로 수렴했지만 R7 후에는 `00130`과 `AJ030RXH4BC1` 두 main으로 갈린다.

이것이 사용자가 요구한 넓은 의미의 **역방향 미병합 1그룹/2행**이다. 두 행의 fingerprint가 다른 것은 사실이나, R7 전부터 importer가 명시적으로 승인해 온 `코드 == 품목명` 식별자 계약이 같은 물건임을 결정한다. R7 표 3번도 이 경로를 “승인 규칙 main”으로 분류했지만, gate가 그 계약을 무효화해 실제 행을 가르는지는 세지 않았다.

### 3.3 `[DEV-SEED]`에서 신규 Product 1행 delta

관련 기존 Product를 읽기 전용으로 조회한 원문이다.

```text
BEGIN
AJ030RXH4BC1||ACTIVE|f|SHEET
COMMIT
```

존재 건수를 코드별로 다시 확인했다.

```text
BEGIN
1|0|0
COMMIT
```

순서대로 active `model_name=AJ030RXH4BC1` 1행, active `model_name=00130` 0행, active `product_code=00130` 0행이다.

- R7 전: 두 raw 모두 기존 `AJ030RXH4BC1` SHEET 행으로 수렴해 원래 importer 갱신만 수행한다.
- R7 후: `AJ030RXH4BC1`은 기존 SHEET 행을 갱신하지만 `00130`은 model/product code hit가 없어 ECOUNT Product를 새로 INSERT한다.

따라서 **이번 fix로 새로 바뀌는 Product delta는 0이 아니라 1행**이다. 이는 실 임포트를 실행한 결과가 아니라, 실 raw와 `[DEV-SEED]`을 production 분기/SQL에 읽기 전용 투영한 값이다.

## 4. 독립 fingerprint 전수 훑기와 R7 표 대조

R7의 표를 출발점으로 삼지 않고 다음 네 축을 먼저 검색했다.

1. raw code/name index를 만드는 지점
2. `ProductMainCandidate`를 생성·교체하는 모든 지점
3. `resolvedCandidates`를 다시 쓰는 지점
4. 최종 `mainCode`를 cache/upsert/alias가 소비하는 지점

### 4.1 독립 판정표

| 독립 번호 | 판정 지점 | 현재 보호 | 실데이터 발화 | R7 표와 대조 |
|---:|---|---|---:|---|
| I-1 | `itemsByCode.putIfAbsent` raw code index | fingerprint 없음, 품목코드 식별자 계약 | 중복 raw code **0행** | R7 표 누락. 현재 발화 없음 |
| I-2 | explicit relation main이 raw에 있음 | group raw fingerprint gate | 관계 원본 유효 행 0 | R7 1번과 일치 |
| I-3 | explicit relation main이 DB에만 있음 | **`rawRow==null && existingProductId!=null && sameNameRowCount==1`이면 fingerprint 없이 통과** | **0행** | R7 1·6번이 “gate 통과”로 표현했으나 실제로는 무지문 예외 |
| I-4 | relation main raw 행 | group raw fingerprint gate | 관계 원본 유효 행 0 | R7 2번과 일치 |
| I-5 | 코드==명/공백 제거/괄호 앞 approved raw main | group raw fingerprint gate | **1행 과차단** | R7 3번은 gate 존재만 확인해 역방향 회귀 누락 |
| I-6 | DB 동명 코드가 현재 raw에 있음 | `sameFingerprint(dbMainRaw,row)` + group gate | R7 delta 발화 0 | R7 4번과 일치 |
| I-7 | singleton self 후보 | group raw fingerprint gate | 정상 | R7 5번과 일치하나 I-5 후보까지 다시 거르며 회귀 발생 |
| I-8 | identity group 후보 승격 | raw는 fingerprint, DB-only singleton은 무지문 예외 | I-5 1행, I-3 0행 | R7 6번의 “모두 gate” 표현은 부정확 |
| I-9 | fallback DB 동명 raw | `sameFingerprint` | 발화 0 | R7 7번과 일치 |
| I-10 | fallback canonical raw | 해당 identity 그룹 내부 최솟값 | I-5 1행 | R7 7번에 포함됐으나 역방향 결과 미집계 |
| I-11 | `productByMainCode` 최종 cache 재사용 | fingerprint 없음, mainCode exact 계약 | 서로 다른 fingerprint의 동일 mainCode **0경로** | R7 표 누락. 후보 gate 뒤의 최종 수렴 sink |
| I-12 | `UPSERT_PRODUCT_SQL` / alias map | product_code/main UUID exact 계약 | 다중 fingerprint 재사용 0, I-5 신규 Product 1 | R7 표 누락. 최종 write 경계 |

### 4.2 `fingerprint 우회 0` 재판정

독립 grep 원문에서 공통 gate 내부 예외가 직접 확인된다.

```text
432:                && (candidate.rawRow() == null
433:                        ? candidate.existingProductId() != null && sameNameRowCount == 1
```

이 분기는 fingerprint를 계산하거나 비교하지 않는다. `existingProductId`와 동명 raw count 1만으로 candidate를 통과시킨다. 명시적 relation이라는 별도 식별자 계약을 보존하려는 의도는 이해되지만, **“fingerprint gate 우회 0곳”이라는 총괄 표현은 사실이 아니다.**

- 구조적 fingerprint 우회: **1경로**
- 현재 실데이터 발화: **0행** — 관계 XLSX가 1셀뿐이라 explicit relation이 없다.
- disposition: 명시 relation을 fingerprint보다 우선하는 의도적 예외라면 이름과 보고서를 “우회 1, 승인 예외 1”로 고쳐야 한다. fingerprint가 절대 gate라면 현재 코드는 미수렴이다.

최종 cache도 R7 표에는 없었다.

```text
188:            UpsertProductResult upsert = productByMainCode.get(mainCode);
193:                productByMainCode.put(mainCode, upsert);
```

현재 실 raw는 중복 품목코드 0이고, 관계 입력도 비어 있어 서로 다른 fingerprint가 같은 `mainCode`로 최종 cache 재사용되는 실제 경로는 0이었다. 따라서 I-11은 이번 BLOCK의 직접 원인이 아니지만, “후보를 만든 지점만” 센 R7 표가 최종 수렴 경계를 전수하지 않았다는 대조 결과다.

## 5. 각도 3~5 실측

### 5.1 MANUAL 덮어쓰기·삭제

실 raw의 현재 main 투영과 `[DEV-SEED]` V28 backfill 투영 결과다.

```text
CURRENT_RESOLVED_MAIN_CODES=2722
DEV_SEED_SHEET_MODEL_NAME_HITS=729
DEV_SEED_MANUAL_MODEL_NAME_MATCHES_BUT_SQL_GUARDED=0
DEV_SEED_MANUAL_PRODUCT_CODE_OVERWRITE_HITS=0
```

`UPDATE_ACTIVE_MODEL_NAME_SQL`은 다음 조건을 가진다.

```text
590:               AND p.lineage = 'SHEET'
```

`UPSERT_PRODUCT_SQL`의 `product_code` conflict에는 lineage 제한이 없어 구조적으로 MANUAL update 가능 경로는 존재하지만, 현재 실 raw + `[DEV-SEED]` 교집합은 0행이다. importer 안에는 Product를 delete/soft-delete하는 SQL·호출이 없고, soft-deleted 동일 코드를 복원하는 반대 방향만 있다.

판정: **현재 스냅샷 MANUAL 덮어쓰기 0행, Product 삭제 0경로 유지.** V28이 실제 적용된 DB 실측은 아니다.

### 5.2 이번 R7 fix의 신규 delta

```text
R7_CHANGED_RAW_ROWS=1
```

3.3절의 `[DEV-SEED]` hit 결과와 결합하면 기존 SHEET 갱신 외 신규 ECOUNT Product가 **1행** 생긴다. 따라서 R7 보고서의 “실 임포트를 하지 않았으므로 delta 0행”은 **리뷰가 DB를 쓰지 않았다는 사실**과 **fix가 향후 import 결과를 바꾸는 행 수**를 혼동한 것이다.

판정: **0 유지 실패 — 신규 Product delta 1행.**

### 5.3 소실 품목·필드와 병합 수

실 raw 재계산 원문이다.

```text
HETEROGENEOUS_NAME_GROUPS=33
LOST_PRODUCTS_NAME_ONLY=33
LOST_FIELDS_NAME_ONLY=59
CURRENT_FINGERPRINT_MERGE_GROUPS=131
CURRENT_FINGERPRINT_MERGE_ROWS=262
```

판정:

- 이름-only 병합 대비 소실 품목 **33→0 유지**
- 소실 필드 **59→0 유지**
- 동일 fingerprint 병합 **131그룹/262행 유지**
- 다만 별도 승인 식별자 계약에서 **중복 Product 1그룹/2행**이 새로 발생하므로 전체 재수렴은 실패

## 6. 최종 판정

**BLOCK.**

R7은 기존 세 번의 fingerprint 우회를 막았지만, singleton 전체를 동일 gate에 넣으면서 다른 방향의 실제 회귀를 만들었다. `00130`은 승인된 exact-code main `AJ030RXH4BC1`에서 분리되고, `[DEV-SEED]` 기준 신규 Product 1행이 생긴다. 또한 `rawRow==null` DB-only relation singleton은 공통 gate 이름 아래에서 fingerprint 없이 통과하므로 “우회 0곳”도 성립하지 않는다.

머지 전 최소 수렴 조건은 다음 두 가지다.

1. approved raw main의 명시 식별자 계약을 fingerprint 추정과 분리해 `00130 → AJ030RXH4BC1` 수렴을 복원할 것
2. DB-only relation singleton 무지문 예외를 의도된 우회로 문서화할지, 실제 fingerprint 자료 없이는 fail-closed할지 계약을 명시할 것

본 라운드는 리뷰 전용이므로 코드를 수정하지 않았다.

## 7. 이 라운드가 보지 않은 것

- 실 임포트 전후 DB: 실 임포트 금지로 조사하지 않음.
- 공유 DB write/DDL 및 Docker 이미지 rebuild: 수행하지 않음.
- V28이 실제 적용된 DB의 실제 `lineage`: 현재 공유 DB가 V28 이전이므로 조사하지 않음. V28 backfill SELECT 투영만 사용.
- 유효한 품목관계 원본: 현재 XLSX가 1셀뿐이라 조사하지 않음.
- 품목계층그룹 원본: 파일 부재로 미판정.
- 합성 fixture 및 product-service 테스트 재실행: 합성 데이터 금지 제약 때문에 조사하지 않음. R7의 645 tests 결과를 R8 증거로 인수하지도 않음.
- 운영 DB/운영 import 결과: `[DEV-SEED]`만 조회했으므로 조사하지 않음.
- 원격 PR/CI 상태 및 배포 이미지: 조사하지 않음.
- R7 범위 밖의 product-service 기능 회귀: 조사하지 않음.

## 8. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-984-r8-postfix-reconvergence.md`

이 라운드가 새로 만든 파일은 위 1개뿐이다. 기존 보고서는 덮어쓰거나 축약하지 않았다.
