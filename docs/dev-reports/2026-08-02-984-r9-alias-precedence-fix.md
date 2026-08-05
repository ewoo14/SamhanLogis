# PR #984 R9 — 승인 품목코드 우선순위 fix

- 작성일: 2026-08-03 KST
- 작업 브랜치: `fix/ecount-import-model-code-merge`
- 대상: 이카운트 품목 importer의 `00130 → AJ030RXH4BC1` 역방향 미병합
- 제한: 실 임포트·공유 DB write/DDL·Docker 이미지 재빌드·git commit/push/checkout 미수행

## 1. 결론

R7의 결함은 fingerprint 자체가 아니라, **승인된 코드 대표 후보를 fingerprint 후보로 다시 심사한 이중 gate**였다. R9는 후보에 식별자 출처를 보존하고, 명시 관계와 승인된 `코드 == 품목명` 대표 규칙만 fingerprint보다 우선하도록 고쳤다.

결과:

- `00130 → AJ030RXH4BC1`은 같은 Product 1건과 alias 2건으로 수렴한다.
- 업무값 fingerprint 기반 후보는 계속 fingerprint 일치일 때만 통과한다.
- 기존 이름-only 병합으로 인한 33품목/59필드 소실 방지는 완화하지 않았다.
- 기존의 무근거 `rawRow == null` 일반 fingerprint 우회는 제거하고, 명시 관계 DB-only singleton만 명시적 예외로 남겼다.

## 2. 순번코드↔모델코드 관계의 우선순위 근거

이 프로젝트의 확정 도메인은 다음과 같다.

```text
품목코드 = 모델명
products.product_code = 옛 순번코드
products.model_name = 모델명 = 새 품목코드
```

따라서 `00130`과 `AJ030RXH4BC1`의 차이는 서로 다른 물건의 업무값 차이가 아니라, 같은 물건의 식별 코드 전환이다. 출하가·입고단가·규격명은 코드 전환 시점이나 표기 행에 따라 달라질 수 있는 설명/업무값이고, 승인된 코드 관계는 물건의 동일성을 직접 선언한다. 그러므로 이 경우에는 **승인된 품목코드 관계가 fingerprint보다 우선**해야 한다.

근거 출처는 다음과 같다.

1. `docs/migration/ecount-data/raw/품목관계리스트-Excel다운로드.xlsx`가 관계 원본 경로다. 현재 워크트리 파일은 1개 non-empty cell뿐이어서 유효한 관계 행 자체는 0행이다. 따라서 이번 실측의 `00130 → AJ030RXH4BC1` 원본 행은 관계표가 아니라 raw 품목 CSV와 이미 확정된 importer의 승인 규칙(`코드 == 품목명`, 공백 제거, 괄호 앞)을 통해 판정했다.
2. `docs/dev-reports/2026-08-02-984-r8-postfix-reconvergence.md`의 raw CSV SHA `7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678`에서 실제 두 행이 확인됐다.
3. 해당 raw 행은 `00130, AJ030RXH4BC1`과 `AJ030RXH4BC1, AJ030RXH4BC1 (RX다배관)`이며, R7 전에는 승인 raw main `AJ030RXH4BC1`로 수렴했고 R7 후에만 fingerprint gate 때문에 `00130`으로 갈라졌다.

버린 대안:

- **같은 품목명 전체를 다시 병합**: R2의 33품목/59필드 소실을 재발시킨다.
- **모든 후보의 fingerprint gate를 해제**: 다른 물건의 동명 행까지 합쳐져 값 보존 불변식 ③을 깨뜨린다.
- **`00130`과 `AJ030RXH4BC1`을 하드코딩**: 승인 규칙의 계열을 해결하지 못하고 다음 코드 전환에서 같은 결함을 반복한다.

## 3. RED 원문

먼저 `EcountProductImporterSameNameMergeTest`에 다음 실패 테스트를 추가했다.

```java
@Test
void 승인된_순번코드와_모델코드는_fingerprint가_달라도_같은_품목으로_병합된다() {
    EcountProductImportResult result = importer.importCsv(
            itemCsv(
                    row("00130", "AJ030RXH4BC1", "627,000", "652,080", ""),
                    row("AJ030RXH4BC1", "AJ030RXH4BC1 (RX다배관)", "627,000", "1,254,000", "다배관")),
            null, null, "r9-alias-precedence-red");

    assertThat(result.imported()).isOne();
    assertThat(result.aliasImported()).isEqualTo(2);
    assertThat(result.skippedGroupCount()).isZero();
}
```

RED 실행 원문:

```text
EcountProductImporterSameNameMergeTest > 승인된_순번코드와_모델코드는_fingerprint가_달라도_같은_품목으로_병합된다() FAILED
expected: 1
 but was: 2
1 test completed, 1 failed
```

실패 원인은 `00130` 후보가 `findApprovedRawMainRow`에서 `AJ030RXH4BC1`을 얻은 뒤, identity 그룹 재수렴 단계의 `isFingerprintCompatibleCandidate`에서 fingerprint 불일치로 탈락한 것이다.

## 4. Fix와 긴장 해소 방식

`ProductMainCandidate`에 `trustedIdentity` 출처 플래그를 추가했다.

- `true`: 명시 품목관계 main/alias, 관계 main raw 행, 승인된 raw 대표 규칙
- `false`: DB 이름 fallback, singleton self, fingerprint fallback, canonical fallback

그룹 재수렴 규칙은 다음과 같다.

```text
trustedIdentity + raw main 존재       → fingerprint보다 우선
trustedIdentity + DB-only singleton   → 명시 관계의 alias-only 예외로 통과
trustedIdentity + DB-only 동명 다중행  → 대표 승격 금지
그 외 raw 후보                       → fingerprint 일치일 때만 통과
```

이 방식은 “코드 관계라는 권위 축”과 “업무값 fingerprint라는 안전 축”을 같은 판정값으로 섞지 않는다. R2의 넓은 이름-only 병합도, R7의 과도한 전수 gate도 되돌리지 않는다. 기존의 `rawRow == null && existingProductId != null && sameNameRowCount == 1` 일반 우회는 제거했고, 현재 남은 singleton 예외는 후보가 `trustedIdentity`인 명시 관계에만 한정된다.

## 5. GREEN

타깃 테스트:

```text
./gradlew.bat :services:product-service:test \
  --tests 'com.samhanair.logis.product.service.EcountProductImporterSameNameMergeTest' \
  --tests 'com.samhanair.logis.product.service.EcountProductImporterTest' --no-daemon
BUILD SUCCESSFUL
28 tests completed, 0 failed
```

## 6. 불변식 1~5 실측

수치는 실 품목 CSV와 `[DEV-SEED]` 투영을 구분했다. 실 임포트는 금지되어 실행하지 않았다.

| 불변식 | R9 결과 | 데이터 출처/검증 |
|---|---|---|
| 1. 승인 코드 관계 우선 | `00130 → AJ030RXH4BC1` 1그룹/2행 수렴 | 실데이터 raw CSV + R9 회귀 테스트. 관계 XLSX는 유효 행 0행이라 원본 관계표 실측은 미판정 |
| 2. 역방향 미병합 | **0그룹/0행** | 실데이터 raw CSV의 R8 재계산 1그룹/2행 결함을 R9 테스트로 해소 |
| 3. 오병합/소실 | 소실 품목 **33→0**, 소실 필드 **59→0** 유지 | 실데이터 raw CSV. fingerprint 병합은 좁은 identity 단위 유지 |
| 4. 구조적 fingerprint 우회 | 일반 우회 **0경로**; 명시 관계 DB-only singleton 예외 1경로 | 코드 정적 확인. 현재 실데이터 발화 0행; 관계 XLSX 유효 행 0행 |
| 5. MANUAL/병합/delta | MANUAL **0행/0경로**, fingerprint 병합 **131그룹/262행**, R9 신규 Product delta **0행** | MANUAL·131/262는 실 raw + `[DEV-SEED]` 읽기 전용 투영. R9 delta는 R8에서 확인된 R7 신규 delta 1행을 승인 후보 수렴으로 제거한 정적 투영 |

추가로 R9 테스트에서 `imported=1`, `aliasImported=2`, `skippedGroupCount=0`을 확인했다. 이는 합성 fixture 기반 단위 검증이며 실 임포트 결과가 아니다.

## 7. product-service 모듈 전체 테스트

강제 재실행 원문:

```text
./gradlew.bat :services:product-service:test --no-daemon --rerun-tasks
BUILD SUCCESSFUL in 2m 33s
```

XML 결과 집계:

```text
files=65 tests=646 failures=0 errors=0 skipped=0
```

직전 기준 645에서 RED 회귀 테스트 1개가 추가되어 646개이며, 테스트 수 감소는 없다.

## 8. 파일별 변경량

`git diff --stat` 기준:

```text
services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java       +16 / -13
services/product-service/src/test/java/com/samhanair/logis/product/service/EcountProductImporterSameNameMergeTest.java +13 / -0
docs/dev-reports/2026-08-02-984-r9-alias-precedence-fix.md                                                   +148 / -0
```

## 9. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-984-r9-alias-precedence-fix.md`

기존 R8 보고서는 수정하거나 축약하지 않았다.
