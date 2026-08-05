# PR #984 R7 — fingerprint gate 잔여 2곳 수정 보고서

- 작성일: 2026-08-03 KST
- 브랜치: `fix/ecount-import-model-code-merge`
- 범위: `product-service`의 이카운트 품목 importer fingerprint 우회 2곳
- 제한 준수: commit/push/checkout/브랜치 조작 없음, 실 임포트 없음, 공유 DB write/DDL 없음, Docker 이미지 재빌드 없음

## 1. 결론

R6에서 확인된 단일 실행 경로의 fingerprint 우회 2곳을 수정했다. 이번 라운드는 발견된 두 줄만 치환하지 않고, 동명 후보가 main으로 승격·재사용되는 지점을 전부 열거한 뒤 공통 gate와 singleton 재그룹화로 수렴시켰다.

핵심 결과:

- fingerprint 우회: **0곳** — 아래 전수표의 모든 동명 추정·재사용 경로에 판정 또는 명시적 계약 근거가 있다.
- RED 2건: 현재 코드에서 각각 실패 확인
- R7 전용 GREEN: 2/2 통과
- `product-service` 모듈 전체: **645 tests / 0 failed / 0 errors / 0 skipped**
- 실 임포트와 DB write를 하지 않았으므로 DB 행 변경: **0행**

## 2. fingerprint 판정 필요 지점 전수표

판정 기준은 R6와 동일하다. `productIdentity`는 품목명 + 단가 8종 + 품목구분 + 규격명으로 구성된다. 단, 명시적 relation main 또는 승인된 raw 코드 규칙은 이름 추정이 아닌 별도 식별자 계약이므로 fingerprint 후보로 분류하지 않고, 동명 identity 그룹에 들어갈 때 최종 group gate를 통과시킨다.

| 번호 | 위치/경로 | 후보 성격 | 실제 gate 통과 여부 | 근거 및 disposition |
|---:|---|---|---|---|
| 1 | `resolveMainCandidate` 316-325행 | `explicitMainCode`가 지정된 relation main | 해당 없음(명시 계약) / group 진입 시 6번 | raw에 없으면 `existingProductId`로 alias-only 처리한다. 이름 기반 후보가 아니다. |
| 2 | 327-328행 | `relationMainCodes`의 raw main | 해당 없음(명시 계약) / group 진입 시 6번 | relation CSV가 지정한 main이다. |
| 3 | 330-332행 | 코드==명·공백 제거·괄호 앞 코드의 승인 raw main | 해당 없음(승인 규칙) / group 진입 시 6번 | 코드-명 일치 규칙으로 선택되며, 동명 identity 그룹에서는 최종 gate를 거친다. |
| 4 | 334-338행 | DB 동명 후보 코드가 현재 raw에도 존재 | **통과** | `sameFingerprint(dbMainRaw, row)`가 true일 때만 반환한다. 불일치·null이면 반환하지 않는다. |
| 5 | 342행 singleton fallback | DB 후보가 gate를 통과하지 못한 뒤 raw 자기 자신을 선택 | **통과** | singleton도 더 이상 재그룹화를 건너뛰지 않는다. 6번 group gate에서 자기 raw identity를 재확인한다. |
| 6 | 136-144행 identity별 group candidate | 앞 단계의 후보를 동명 fingerprint 그룹에 승격 | **통과** | 모든 identity 그룹(동명 singleton 포함)이 `isFingerprintCompatibleCandidate`를 거친다. raw 후보는 identity 일치가 필수다. |
| 7 | 375-384행 `fallbackSameNameCandidate` | DB 동명 후보 fallback | **통과** | `sameFingerprint(existingRaw, sameNameRows.get(0))`가 true일 때만 DB raw를 재사용한다. 실패하면 identity 그룹의 canonical raw를 선택한다. |
| 8 | 124-125행 예외 처리 | 후보를 만들지 못한 singleton | 우회 아님(실패 폐쇄) | 동명 singleton에서 후보가 없으면 `MIG2_NO_MAIN_CANDIDATE`를 재throw한다. 판정 없이 upsert로 진행하지 않는다. |
| 9 | 692-702행 `findActiveProductCodeByName` | DB 코드 조회 helper | 판정 지점 아님 | 코드를 조회만 하며, 결과 소비자는 4번·7번에서 모두 fingerprint gate를 거친다. helper 자체를 별도 취약 경로로 중복 집계하지 않는다. |

따라서 R6에서 지적된 **2개 미검증 단정 지점**은 각각 4번과 5~6번 경로에서 제거됐다. 특히 기존의 `normalRowsByName.size() < 2` 조기 `continue`를 삭제해 singleton도 6번 gate를 반드시 통과한다. 명시적 DB-only relation singleton의 alias-only 계약만 `existingProductId != null && sameNameRowCount == 1`로 보존했으며, 동명 복수 그룹에서는 raw fingerprint 후보만 허용한다.

### 선택한 설계와 폐기한 대안

1. **선택: 공통 `sameFingerprint` + 모든 identity 그룹 재검증**
   - DB 동명 raw 재사용, group 후보, fallback을 같은 identity 비교로 묶었다.
   - singleton skip을 제거해 다음 R 라운드에서 같은 형태의 조기 탈출이 생기지 않게 했다.
   - 명시적 relation의 DB-only singleton만 alias-only로 유지했다.

2. **폐기: 보고된 336-340행만 조건 추가**
   - 이번 두 줄만 고치면 singleton group skip이 남아 동일 계열의 다른 입력 조합이 다시 우회할 수 있다.
   - 네 차례 반복된 “발견 지점만 수정” 패턴을 재현하므로 폐기했다.

3. **폐기: DB 동명 후보 재사용 자체를 전면 제거**
   - 기존 active product의 동일 fingerprint 재임포트와 alias 수렴 계약까지 불필요하게 바꾼다.
   - 이번 결함은 DB 후보 재사용 자체가 아니라 fingerprint 없는 재사용이므로 범위를 과도하게 넓힌다.

## 3. RED — 실패 테스트 2건

fixture는 실 raw가 만들 수 있는 상태를 최소화했다. 현재 raw에 `DB-MAIN` 코드가 존재하지만 이름·단가·규격 fingerprint가 달라지고, DB 동명 조회는 `DB-MAIN`을 반환한다. 두 테스트 모두 현재 코드에서 같은 잘못된 main 재사용으로 실패했다.

### RED 1 — DB 동명 코드가 현재 raw에 존재하는 경우

테스트:

`EcountProductImporterTest.importCsv_동명_DB코드가_현재_raw에_있어도_fingerprint가_다르면_재사용하지_않는다`

실행:

```text
> Task :services:product-service:test

EcountProductImporterTest > importCsv_동명_DB코드가_현재_raw에_있어도_fingerprint가_다르면_재사용하지_않는다() FAILED
    org.opentest4j.AssertionFailedError at EcountProductImporterTest.java:333

2 tests completed, 2 failed
BUILD FAILED
```

이 fixture에서 기존 구현은 `DB-MAIN` raw가 `itemsByCode`에 있다는 이유로 `RAW-001`의 main으로 반환했다. 기대값은 서로 다른 fingerprint인 두 품목을 각각 import하는 `imported=2`, `aliasImported=2`다.

### RED 2 — 동명 singleton 재그룹화 skip

테스트:

`EcountProductImporterTest.importCsv_동명_singleton도_fingerprint_재그룹화를_건너뛰지_않는다`

실행 시 같은 원문:

```text
EcountProductImporterTest > importCsv_동명_singleton도_fingerprint_재그룹화를_건너뛰지_않는다() FAILED
    org.opentest4j.AssertionFailedError at EcountProductImporterTest.java:355

2 tests completed, 2 failed
BUILD FAILED
```

기존 `normalRowsByName.size() < 2` 조기 `continue`가 DB 후보의 fingerprint 불일치를 재검증하지 못하게 했다. 두 RED 테스트는 production fix 전에 실행했으며, 현재 결함을 잡는 실패를 확인했다.

## 4. Fix

- `resolveMainCandidate`의 DB 동명 후보 반환에 `sameFingerprint(dbMainRaw, row)`를 추가했다.
- identity group loop의 singleton 조기 `continue`를 제거했다.
- group candidate도 `isFingerprintCompatibleCandidate`를 통해 raw identity를 확인한다.
- fallbackSameNameCandidate의 기존 raw 재사용도 공통 `sameFingerprint`를 사용한다.
- raw가 없는 명시적 relation main은 `existingProductId`를 통한 alias-only 경로로 유지하되, 동명 복수 그룹에서는 raw fingerprint 후보가 아니므로 승격하지 않는다.

## 5. GREEN

R7 두 테스트와 기존 relation 회귀 테스트를 함께 실행:

```text
BUILD SUCCESSFUL
```

이후 `product-service` 전체 테스트:

```text
> Task :services:product-service:test

BUILD SUCCESSFUL in 2m 38s
645 tests completed, 0 failed, 0 errors, 0 skipped
```

첫 전체 실행에서 발견된 relation 회귀 1건은 위 명시적 DB-only singleton 계약 조건을 좁혀 수정했고, 동일 테스트 묶음과 전체 모듈 테스트를 다시 실행해 통과를 확인했다.

## 6. 불변식 실측

### 6.1 데이터 출처 구분

- **실데이터 raw**: `docs/migration/ecount-data/raw/품목-Excel다운로드.csv`
- **시드 DB**: `[DEV-SEED]` 읽기 전용 스냅샷 수치(2026-08-03 R6 재수렴 보고서 인수)
- **R7 fixture**: 테스트 전용 합성 fixture. 실 DB나 실 import가 아니다.
- R7에서는 실 임포트를 금지했으므로 DB 전후 write 측정은 하지 않았다.

### 6.2 불변식 표

| 불변식 | R7 결과 | 출처/판정 |
|---|---:|---|
| 1. fingerprint 우회 지점 | **0곳** | 본 보고서 2절 전수표. 동명 추정·재사용 4·6·7번은 모두 gate 통과, singleton skip 제거. |
| 2. 역방향 미병합 | **0그룹 / 0행** | 실데이터 raw 정적 fingerprint 재계산 결과를 R6에서 인수. R7은 raw/DB를 변경하지 않았다. |
| 3. MANUAL 덮어쓰기·삭제 | **0행 / 0경로** | `[DEV-SEED]` + 실 raw 읽기 전용 투영 결과: MANUAL model_name/product_code 0행. importer에 Product 삭제 SQL/호출 없음. |
| 4. 이번 fix 신규 변경 행(delta) | **0행** | 실 임포트·공유 DB write를 하지 않았고 변경은 코드/테스트/보고서뿐이다. 따라서 R7 fix가 DB에 만든 delta는 0행. |
| 5. 소실·병합 보존 | **33→0 품목**, **59→0 필드**, **131그룹/262행 병합** | 실데이터 raw 기준. 이름-only 오류를 fingerprint partition으로 분리한 R6 수치를 R7 코드 변경 후에도 유지하며, R7은 raw/DB를 쓰지 않았다. |

불변식 2~5의 수치는 실 임포트 전후 재측정이 아니라, 실 임포트 금지 조건에서의 실 raw 정적 계산 및 `[DEV-SEED]` 읽기 전용 투영 결과다. V28 lineage가 실제 적용된 공유 DB 전후 실측과 실 임포트 전후 delta는 이번 라운드에서 수행하지 않았다.

## 7. 모듈 전체 테스트

실행 명령:

```powershell
.\gradlew.bat :services:product-service:test --no-daemon
```

결과:

```text
645 tests completed, 0 failed, 0 errors, 0 skipped
BUILD SUCCESSFUL
```

직전 기준 643건보다 2건 증가했다. Testcontainers skip은 이번 결과에서 0건이며, 실 임포트·공유 DB write/DDL은 테스트 범위에 포함하지 않았다.

## 8. 파일별 변경량

`git diff --numstat` 기준:

| 파일 | 변경 |
|---|---:|
| `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java` | `+22 / -8` |
| `services/product-service/src/test/java/com/samhanair/logis/product/service/EcountProductImporterTest.java` | `+43 / -0` |
| `docs/dev-reports/2026-08-02-984-r7-fingerprint-gate-fix.md` | 새 파일, `+` 보고서 본문 |

소스/테스트 변경 합계는 `+65 / -8`이다. 보고서 자체는 새 파일이며 기존 R6 보고서는 수정하지 않았다.

## 9. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-984-r7-fingerprint-gate-fix.md`

기존 파일 변경:

- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/service/EcountProductImporterTest.java`
