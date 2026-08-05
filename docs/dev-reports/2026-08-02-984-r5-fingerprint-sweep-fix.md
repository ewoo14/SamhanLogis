# PR #984 R5 — fingerprint 재수렴 전수 sweep fix

- 일자: 2026-08-02 (KST)
- 브랜치/HEAD: `fix/ecount-import-model-code-merge` / `b29265b04`
- 범위: R4가 지적한 fingerprint 미적용 재수렴 2곳의 RED→GREEN fix
- 제한 준수: commit/push/checkout/브랜치 조작 없음, 실 임포트 없음, 공유 DB write/DDL 없음, Docker 이미지 재빌드 없음

## 1. 취약 지점 판정표 및 전수 sweep

### 1.1 확정된 2곳

| 번호 | 위치 | 단정 내용 | R5 판정 | 처리/근거 |
|---:|---|---|---|---|
| 1 | `EcountProductImporter.java:336~344` `resolveMainCandidate()` | `findActiveProductCodeByName(row.name())`가 raw에 없는 DB code를 찾으면 `findActiveProductIdByCode()`로 DB-only 후보를 만들어 동명 raw의 fingerprint 없이 재사용했다. | **전환** | raw code가 현재 임포트에 없으면 DB-only 후보를 반환하지 않고 raw singleton 또는 fingerprint 그룹 fallback으로 전환했다. DB-only에는 `productIdentity()`를 계산할 원천 행이 없으므로 동명 재사용의 증거가 될 수 없다. |
| 2 | `EcountProductImporter.java:139~145` 동명 fingerprint 그룹 후보 필터 | `candidate.rawRow() == null`을 허용해 DB-only main/relation 후보가 fingerprint 비교 없이 그룹 main으로 선택될 수 있었다. | **전환** | 후보는 `rawRow != null`이고 `productIdentity(rawRow).equals(identity)`일 때만 선택한다. 그 외에는 `fallbackSameNameCandidate()`로 내려가고, 이 helper는 raw fingerprint를 비교한 뒤 불일치하면 canonical raw를 택한다. |

### 1.2 같은 계열 전수 sweep

단순 파일명 검색이 아니라 “fingerprint 판정을 우회해 동명 후보를 재사용·병합하는가”를 기준으로 `EcountProductImporter`의 후보 생성, 그룹 선택, fallback, DB name selector, write 진입을 전수 추적했다.

| 분류 | 건수 | 판정 |
|---|---:|---|
| fingerprint 미적용 취약 실행 지점 | **2** | 위 1.1의 두 지점이며 모두 이번에 전환 |
| fingerprint 적용 동명 fallback | 1 | `fallbackSameNameCandidate()`에서 기존 raw와 첫 동명 raw의 `productIdentity()`를 비교. 불일치 시 DB 후보를 반환하지 않음 |
| 명시적 relation DB-only 후보 생성 | 1 source | `explicitMainCode`가 raw에 없고 active DB code가 있는 경우. 이는 name-only selector가 아닌 명시적 relation 계약이므로 **불필요(그 경로는 동명 병합 selector가 아님)**. 단, 이 후보를 동명 group main으로 승격시키던 1.1-2를 차단함 |
| 제품 삭제/soft-delete 경로 | 0 | importer에 Product 삭제 SQL 없음 |

따라서 이번 정의의 전수 결과는 **취약 지점 2곳, 미판정 0곳**이다. `findActiveProductCodeByName()`은 name-only 조회 helper이지만 독립 실행 경로로 중복 집계하지 않고, 위 두 호출 지점의 처리 결과를 판정했다.

## 2. RED — 실패 테스트와 원문

신규 실패 테스트 2개를 production code 수정 전에 추가했다.

- `importCsv_동명_DB_only_후보는_raw_fingerprint_없이_재사용하지_않는다()`
- `importCsv_동명그룹의_DB_only_relation_후보는_fingerprint_없는_main으로_승격하지_않는다()`

실행:

```text
./gradlew :services:product-service:test --tests com.samhanair.logis.product.service.EcountProductImporterTest
```

RED 원문:

```text
22 tests completed, 2 failed

importCsv_동명_DB_only_후보는_raw_fingerprint_없이_재사용하지_않는다()
expected: 1
 but was: 0

importCsv_동명그룹의_DB_only_relation_후보는_fingerprint_없는_main으로_승격하지_않는다()
expected: 1
 but was: 0
```

두 실패 모두 기존 후보가 raw upsert로 가지 않고 DB UUID에 alias만 연결된 결과(`imported=0`, `aliasImported=1/2`)를 재현했다.

## 3. Fix

`EcountProductImporter.java`에서 다음만 변경했다.

1. 동명 DB name 조회 결과가 현재 raw에 없으면 DB UUID를 조회·반환하지 않는다. 이후 raw singleton 또는 동명 fingerprint 그룹의 canonical raw 해소로 진행한다.
2. 동명 fingerprint 그룹 후보 필터를 `candidate != null && candidate.rawRow() != null && productIdentity(candidate.rawRow()).equals(identity)`로 제한한다.

기존 `fallbackSameNameCandidate()`의 fingerprint 비교, upsert SQL, alias SQL, MANUAL 계보 조건, 삭제 부재는 변경하지 않았다.

## 4. GREEN

대상 테스트:

```text
BUILD SUCCESSFUL
EcountProductImporterTest: 22/22
```

모듈 전체 재실행:

```text
./gradlew :services:product-service:test --rerun-tasks --console=plain

BUILD SUCCESSFUL in 3m 19s
tests=643 failures=0 errors=0 skipped=0
```

Testcontainers skip은 없었다. 이 결과를 로컬 모듈 검증 권위로 기록하며, 원격 CI 결과는 이번 작업에서 실행하지 않았다.

## 5. 불변식 1~6 실측

| 불변식 | R5 결과 | 근거/범위 |
|---:|---|---|
| 1. 2곳 각각 판정·처리 | **PASS** | 1.1 표에 두 위치를 각각 `전환`으로 기록. 명시적 relation source는 `불필요`로 별도 판정. 미판정 0곳 |
| 2. 같은 계열 전수 | **PASS** | 후보 생성→그룹 선택→fallback→DB name selector→write 진입을 내용 기준으로 sweep. 취약 실행 지점 2곳 |
| 3. 역방향 0 | **PASS (read-only raw 재계산 근거)** | R4 읽기 전용 실 raw 재계산에서 `MISSED_MERGE_GROUPS=0`, `MISSED_MERGE_ROWS=0`. R5는 merge partition을 넓히지 않았고 raw write를 실행하지 않음 |
| 4. MANUAL 덮어쓰기·삭제 0 | **PASS (코드/기존 read-only 투영 근거)** | importer Product 삭제 경로 0개, MANUAL 도달 0행이라는 R4 읽기 전용 결과 유지. 공유 DB write 및 V28 적용 DB 실측은 금지 범위라 미검증 |
| 5. 이번 fix 신규 delta 행 0 | **PASS (코드 delta 기준)** | 변경은 후보 선택뿐이며 upsert/update/alias SQL 및 parameter 계약은 변경 없음. 실 임포트 before/after는 금지되어 DB 행 delta는 미검증 |
| 6. 소실/병합 수 | **PASS (read-only raw 재계산 근거)** | `소실 품목 33→0`, `소실 필드 59→0`, `병합 131그룹/262행` 유지. R4 기준의 raw-only 재계산 결과를 R5 코드 변경과 대조했으며 실 임포트는 하지 않음 |

불변식 5의 “행 0”은 임포트 본업의 원천값 갱신을 금지한다는 의미가 아니라, R5 코드 변경으로 추가 발생하는 delta가 0이라는 의미다. 이번 diff에는 SQL/write parameter 변경이 없다.

## 6. 모듈 전체 테스트

| 항목 | 결과 |
|---|---:|
| product-service 전체 테스트 | **643** |
| failures | **0** |
| errors | **0** |
| skipped | **0** |
| 직전 기준 | 641 |
| R5 신규 테스트 | +2 |

## 7. 파일별 변경량

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java` | +4 | −10 |
| `services/product-service/src/test/java/com/samhanair/logis/product/service/EcountProductImporterTest.java` | +41 | −2 |
| `docs/dev-reports/2026-08-02-984-r5-fingerprint-sweep-fix.md` | +126 | −0 |

최종 `git diff --numstat` 기준 합계: **+171 / −12**. 새 보고서는 untracked 파일이므로 `git diff --numstat` 기본 출력에는 나타나지 않지만, UTF-8 126행을 새 파일 추가량으로 포함했다.

## 8. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-984-r5-fingerprint-sweep-fix.md`

기존 `docs/dev-reports/2026-08-02-984-r4-postfix-reconvergence.md`는 읽기만 했고 수정하지 않았다.
