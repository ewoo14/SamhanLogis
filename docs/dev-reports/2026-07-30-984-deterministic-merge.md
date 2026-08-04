# PR #984 R5 라운드 fix — 동명 병합 canonical 선택 결정성

## 최종 판정

**PASS — 같은 품목명 병합은 유지하면서 CSV 행 순서가 canonical code·규격·입고단가를 바꾸는 경로를 제거했다.**

- 동명 그룹은 계속 product 1행으로 병합한다.
- 모든 raw 행과 alias는 계속 보존한다.
- 후보 선택과 후보가 없는 fallback의 기준을 코드와 테스트에 명문화했다.
- RED에서 `DET984MERGEB`가 정본이 되던 행 순서 의존을 확인했고, GREEN에서 두 순서 모두 `DET984MERGEA / 규격-A / 100,000원`으로 수렴했다.
- R4 구 보고서의 `.gitkeep` 출력과 “3개 raw 파일 사용” 문장 모순은 원문을 보존한 정정 표시를 오독 위치에 추가했다.

## 1. 원인

`EcountProductImporter`는 exact 품목명으로 raw 행을 그룹화한 뒤, 관계·승인 raw 대표·DB 정본 후보가 없으면 `fallbackSameNameCandidate()`에서 `sameNameRows.get(0)`을 사용했다. 이후 해당 row의 code·specification·inbound price가 `products`에 기록됐다. 따라서 같은 두 행의 순서만 바꾸면 canonical 품목과 단가가 바뀌었다.

추가로 후보가 여러 개 발견되는 경우에도 그룹의 첫 번째 raw 행에서 처음 발견된 `ProductMainCandidate`를 사용했다. 이 경로 역시 입력 순서에 의존할 수 있으므로 그룹 후보를 `mainCode` 오름차순으로 선택하도록 함께 고정했다.

근거 코드:

- 그룹 병합: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java`
- 수정 전 fallback: `sameNameRows.get(0)`
- 수정 후 선택: `Comparator.comparing(ProductMainCandidate::mainCode)` 및 raw `ItemRow` code 오름차순

## 2. 선택 규칙

동일한 입력 집합과 동일한 DB 상태에서 동명 그룹의 canonical을 다음 순서로 선택한다.

1. 관계·개발책임자 승인 raw 대표·기존 DB 정본에서 만들어진 후보가 있으면, 후보의 `mainCode`를 문자열 오름차순으로 정렬해 가장 작은 후보를 선택한다.
2. 후보가 없으면 기존 활성 DB 정본을 먼저 재사용한다. 기존 DB 정본 조회는 `created_at ASC, product_code ASC`로 이미 결정적이다.
3. 기존 DB 정본도 없으면 raw 동명 행 중 `code` 문자열 오름차순의 행을 선택한다.
4. 선택 row의 code·규격·입고단가 등 제품 컬럼만 product canonical에 저장한다.
5. 선택되지 않은 raw 행도 삭제하지 않는다. 각 행은 `staging.ecount_item_raw`에 남고, `MERGED_SAME_NAME` reason에 선택·폐기 행의 규격과 단가를 기록한다. 모든 raw code는 같은 product를 가리키는 alias로 남긴다.

이 규칙은 동명 병합을 규격별 분리로 되돌리지 않으며, 이카운트 원본 자체를 병합하지 않는다. canonical product 1행과 staging raw 보존을 동시에 유지한다.

## 3. RED-first 재현

### 입력

같은 품목명에 다음 두 raw 행을 사용했다.

| code | specification | inbound price |
|---|---|---:|
| `DET984MERGEA` | `규격-A` | 100,000 |
| `DET984MERGEB` | `규격-B` | 200,000 |

첫 번째 호출은 `B → A`, 두 번째 호출은 같은 행 집합을 `A → B`로 뒤집었다. 테스트는 두 실행의 canonical code·규격·입고단가가 같고, canonical code가 오름차순 규칙인 `DET984MERGEA`인지 검사한다.

### RED 명령 원문

```powershell
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t21'; .\gradlew.bat :services:product-service:test --tests 'com.samhanair.logis.product.it.EcountProductImporterIT.sameNameMerge*' --rerun-tasks --no-build-cache --no-daemon --console=plain
```

수정 전 구현에서의 실패 원문:

```text
> Task :services:product-service:test

EcountProductImporterIT > sameNameMerge_행순서가_달라도_정본코드_규격_입고단가가_같고_raw는_보존된다() FAILED
    org.opentest4j.AssertionFailedError at EcountProductImporterIT.java:238

> Task :services:product-service:test FAILED
13 actionable tasks: 13 executed
1 test completed, 1 failed

expected: "DET984MERGEA"
 but was: "DET984MERGEB"

FAILURE: Build failed with an exception.

BUILD FAILED
```

이 RED는 첫 실행에서 파일 첫 행 `DET984MERGEB`가 정본이 되고, 역순 실행에서 `DET984MERGEA`가 정본이 되어 결과가 달라졌음을 증명한다.

## 4. 수정 및 GREEN

### 코드 수정

`EcountProductImporter`에서 다음을 변경했다.

- 후보가 여러 개인 동명 그룹을 `ProductMainCandidate.mainCode` 오름차순으로 선택한다.
- 후보가 없는 fallback을 raw `ItemRow.code` 오름차순으로 선택한다.
- `MERGED_SAME_NAME`의 폐기 raw 요약도 code 오름차순으로 정렬한다.
- 동명 병합, alias 생성, staging raw 기록, transaction 경계는 유지했다.

### 행 순서 역전 회귀 GREEN 원문

```text
> Task :services:product-service:test

BUILD SUCCESSFUL in 55s
13 actionable tasks: 13 executed
```

이 테스트는 실행 후 다음을 함께 확인한다.

- 두 순서 모두 `imported=1`, `aliasImported=2`
- 두 순서 모두 canonical `DET984MERGEA / 규격-A / 100,000원`
- 두 raw 행 모두 `staging.ecount_item_raw`에 남음
- 폐기 행의 `MERGED_SAME_NAME` reason에 `규격-A / 100,000`과 `규격-B / 200,000`이 모두 남음

### product-service 전체 실 PostgreSQL GREEN 원문

```powershell
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t21'; .\gradlew.bat :services:product-service:test --rerun-tasks --no-build-cache --no-daemon --console=plain
```

```text
> Task :services:product-service:test

BUILD SUCCESSFUL in 2m 13s
13 actionable tasks: 13 executed
```

Testcontainers PostgreSQL XML 집계 원문:

```text
xmlSuites : 62
tests     : 628
failures  : 0
errors    : 0
skipped   : 0
```

`--rerun-tasks --no-build-cache`를 사용했으며 `UP-TO-DATE`와 `FROM-CACHE`로 성공을 대체하지 않았다. 전체 suite에 신규 역순 IT와 기존 product-service IT가 함께 포함됐다.

## 5. 불변식별 확인

| # | 불변식 | 이번 fix에서 확인한 방법 | 결과 |
|---:|---|---|---|
| 1 | 같은 입력 집합이면 CSV 행 순서와 무관하게 canonical code·규격·입고가가 같다 | `EcountProductImporterIT.sameNameMerge_행순서가_달라도_정본코드_규격_입고단가가_같고_raw는_보존된다`가 B→A와 A→B를 각각 import하고 동일 snapshot 및 오름차순 canonical을 assert | GREEN |
| 2 | 선택 규칙이 산출물에 명시된다 | 본 문서 §2와 `EcountProductImporter` 주석에 후보 `mainCode` 오름차순, DB 정본 우선, raw code 오름차순을 기록 | 확인 |
| 3 | 버려진 규격·단가가 보존된다 | 신규 IT가 두 raw row 수를 2로 확인하고 `MERGED_SAME_NAME`에 양쪽 specification/inbound price가 있는지 확인 | GREEN |
| 4 | 동명 병합은 유지되고 다른 이름은 합쳐지지 않는다 | 기존 `sameNameSequenceCodes_are_all_aliases_and_lookupable` 및 전체 product-service suite를 재실행. 기존 12그룹 24 alias 경로와 동명 1 product assertion을 유지 | GREEN |
| 5 | 기존 검증 결과를 깨뜨리지 않는다 | R5의 24/24 lookup, 726건 downstream·전표·재고, rollback·세 실행 수렴·품목명 보존 증거를 유지하고, 변경 범위를 importer 선택 로직과 해당 IT/문서로 제한했다. 이어 product-service 전체 62 suites/628 tests에서 failures/errors/skipped=0으로 회귀 확인 | GREEN |
| 6 | 멱등이다 | 기존 `sameNameSequenceCodes_are_all_aliases_and_lookupable`가 같은 파일을 두 번 import해 두 번째 `imported=0`, `updated=12`, alias 24를 확인하며, 전체 suite에서도 통과 | GREEN |

불변식 5의 기존 실측 수치는 이번에 공유 DB에 write하지 않았다. R5 원문을 근거로 재사용했고, 이번 변경은 해당 downstream 계약을 호출하거나 변경하지 않는다. 전체 suite는 그 회귀 범위와 importer transaction 경계를 다시 실행했다.

## 6. EVIDENCE-1 정정

정정은 구 보고서의 오독 위치에 넣었다.

- 파일: `docs/dev-reports/2026-07-29-984-r4-product-lineage-verification.md`
- 위치: `### 3.7 복구 전 실 원본 파일 존재 확인` 제목 직후, 명령과 `.gitkeep` 출력 원문보다 앞
- 원문 보존 위치: 같은 절의 기존 “위 3개 raw 파일을 읽기 전용으로 사용했다” 문장에 `[원문 보존, 위 정정의 대상]` 표시

정정 내용은 다음과 같다.

> 해당 출력은 host/container raw 디렉터리에 `.gitkeep`만 있었음을 보여주므로 raw 3개 파일의 존재·내용·사용을 증명하지 않는다. `6.1`/`6.3`의 multipart 경로와 동일 hash 응답은 별도 기록이지만, `3.7` 파일 존재 확인과 혼동해서는 안 된다.

같은 이유로 `docs/dev-reports/2026-07-30-984-same-name-merge.md`의 수정 전 “파일 순서상 첫 행” 서술에도 수정 전 관찰 표시와 현재 선택 규칙을 추가했다. 과거 관찰 자체는 지우지 않았다.

## 7. 격리·운영 제한 확인

- 신규 IT 식별자: `DET984MERGE%`, actor `deterministic-merge-984`
- cleanup 순서: `product_aliases` → `staging.ecount_item_alias` → `staging.ecount_item_raw`/relation/group staging → `product_estimate_exposure` → `price_history` → `products`
- cleanup은 `@BeforeEach`와 `@AfterEach`에 있으며, 테스트 중간에도 forward 결과를 회수한 뒤 reverse 입력을 실행한다.
- Docker Compose 스택을 재배포하거나 중단하지 않았다.
- 공유 `samhan-postgres`에는 write SQL을 실행하지 않았다. 테스트는 `AbstractPostgresIT`의 Testcontainers PostgreSQL을 사용했다.
- git add/commit/push/checkout을 실행하지 않았다.
- `docs/handoff/CURRENT-WORK.md`를 수정하지 않았다.

