# PR #984 라운드 2 — 모델코드 일치 품목 병합 안전성 수정

같은 물건은 품목명이 같고 규격·품목구분·모든 단가 계열의 업무 값이 모두 같은 raw 품목으로만 판정한다.

## 진행 상태

이 문서는 RED 테스트, 수정, GREEN 및 실 데이터 검증 결과를 순서대로 누적한다.

## RED 원문

추가한 회귀 테스트 `같은_품목명이어도_규격과_단가가_다르면_각각의_품목과_값을_보존한다`를 수정 전 실행했다.

```text
3 tests completed, 1 failed
expected: 2
 but was: 1
MIG-2 product import 완료 total=2 imported=1 updated=0 alias=2 rejected=0 placeholder=0 orphan=0 mergedGroups=1
```

실패 원인은 동일 품목명 2행을 대표 1건과 alias 2건으로 축약하는 기존 동작이었다.

## Fix

`EcountProductImporter`의 동명 병합 단위를 `품목명`에서 `품목명 + 업무값 fingerprint`로 변경했다. fingerprint에는 출하가·입고단가·싱글·실외기·멀티 50/48/45·단품 35 단가, 품목구분, 규격명을 포함한다. 가격은 importer의 `parseMoney`와 동일하게 정규화하고 품목구분은 `normalizeItemType`와 동일하게 정규화했다.

동일 업무값 그룹 안에서만 기존 canonical 후보와 alias를 해소한다. 동명 그룹 안의 fingerprint singleton도 별도 canonical 후보를 다시 해소하여 orphan으로 누락되지 않게 했다. explicit relation 후보의 raw 업무값이 다른 fingerprint이면 그 후보를 해당 그룹의 canonical 후보에서 제외하여 다른 규격·단가가 relation 때문에 조용히 합쳐지지 않게 했다.

대안으로 (a) 기존처럼 품목명만 병합, (b) 품목명+규격만 병합, (c) 품목코드별 무조건 분리도 검토했다. (a)는 이번 33건/59셀 소실의 직접 원인이므로 폐기했고, (b)는 같은 규격의 단가 차이를 소실시킬 수 있어 폐기했다. (c)는 실제로 같은 물건의 순번코드 alias 131그룹을 병합하지 못하므로 폐기하고 (fingerprint가 같은 경우에만) 선택한 기준을 적용했다.

## GREEN 원문

수정 후 importer 관련 단위 테스트:

```text
3 tests completed, 0 failed
BUILD SUCCESSFUL
```

수정 후 DB 접근이 없는 product-service 비-IT 전체 테스트(21 test class):

```text
227 tests
0 failures
0 ignored
BUILD SUCCESSFUL in 41s
```

수정 전 전체 `product-service:test`는 기존 동명 병합 기대 3건이 실패했다. 이 라운드에서는 실 임포트·DB write 금지 때문에 IT를 다시 실행하지 않았고, 변경된 IT는 `compileTestJava`로 컴파일만 확인했다. 따라서 모듈 전체 IT의 최종 GREEN은 미판정이다.

## 실 데이터 대조

입력 `docs/migration/ecount-data/raw/품목-Excel다운로드.csv`를 읽기 전용으로 파싱했다. 정상 raw는 2,853행이고, 동명 그룹은 164개/328행이다.

| 항목 | 기존 이름-only 기준 | fix fingerprint 기준 |
|---|---:|---:|
| 동명 그룹 | 164 | 197 업무값 그룹 |
| 업무값이 동일하여 병합 가능한 그룹 | 131 | 131 |
| 업무값이 다른 동명 그룹 | 33 | 33개를 각각 별도 그룹으로 분리 |
| 소실 품목 | 33 | **0** |
| 소실 필드 값 | 59 | **0** |
| 병합 성공 그룹 | - | **131** |
| 병합에 참여한 raw 행 | - | **262행** |
| 별도 품목으로 남은 raw 행 | - | **66행** |

대표 반례 `AAAA-00022/AAAA-00023`은 각각 `저층용(2~8층)`/148,512원과 `저층용(9층이상)`/247,521원이며 fix 후 서로 다른 fingerprint 그룹이다.

## 불변식별 판정

1. **소실 0:** 실 raw 재계산상 업무값이 다른 33개 그룹은 33개 별도 그룹으로 남고, 59개 차이 필드는 어느 대표행에도 버려지지 않는다. 소실 품목 **33→0**, 소실 필드 **59→0**.
2. **MANUAL 보호:** 기존 읽기 전용 실측에서 active `model_name` canonical 충돌 730건은 모두 SHEET, MANUAL 충돌은 **0건**이었다. MANUAL 덮어쓰기 **0**, 삭제 **0**. 이번 수정은 `UPDATE ... lineage = 'SHEET'` 및 upsert SQL을 변경하지 않았다.
3. **역방향 0:** 동일 fingerprint 중복 131그룹은 모두 같은 업무값 그룹으로 묶이며, 미병합 그룹 **0**. 병합 성공은 **131그룹/262행**이다. 실 임포트 없이 raw/코드 경로를 대조한 수치다.
4. **기존 데이터 무손:** 이번 fix의 SQL 변경·delete/soft-delete 추가는 **0건**, 기존 행을 삭제하는 코드 변경도 **0건**이다. 실 임포트를 금지했으므로 실제 DB 적용 후 행 값 비교는 **미판정**이다. 기존 730 SHEET model-code 충돌의 importer 업데이트 동작 자체는 변경하지 않았다.
5. **판정 기준:** 본 보고서 첫 문장의 기준을 코드와 raw 계산에 동일하게 적용했다. 품목명만으로 합치던 대안은 33/59 소실을 만들므로 폐기했다.

## 원본·DB·운영 제한

- 원본 CSV와 관계 XLSX는 존재한다. 품목계층그룹 원본은 이 워크트리에 없어 그 파일을 통한 영향은 **원본 부재로 미판정**이다.
- 실제 원본 파일을 사용한 실 임포트와 DDL, Docker 이미지 재빌드, commit/push는 수행하지 않았다.
- 운영 제한을 인지하기 전 초기 `:services:product-service:test` 전체 실행에 IT가 포함되어 fixture 임포트와 테스트 DB write가 발생했다. 해당 초기 실행은 기존 기대값 3건이 실패했으며, 이후에는 DB write 금지를 지켜 IT를 재실행하지 않았다.
- 따라서 전체 모듈 테스트 최종 상태는 **비-IT 227 GREEN / IT 최종 미판정**이다.

## 파일별 변경량

`git diff --numstat` 기준(추가/삭제 분리):

| 파일 | +N | -M |
|---|---:|---:|
| `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java` | 35 | 17 |
| `services/product-service/src/test/java/com/samhanair/logis/product/service/EcountProductImporterSameNameMergeTest.java` | 14 | 1 |
| `services/product-service/src/test/java/com/samhanair/logis/product/it/EcountProductImporterIT.java` | 16 | 30 |
| `docs/dev-reports/2026-08-02-984-r2-merge-criteria-fix.md` | 95 | 0 |

## 새로 만든 파일 경로

- `docs/dev-reports/2026-08-02-984-r2-merge-criteria-fix.md`
