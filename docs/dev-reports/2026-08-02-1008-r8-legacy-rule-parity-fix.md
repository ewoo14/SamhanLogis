# PR #1058 / Issue #1008 R8 — 레거시 규칙 parity fix

> 대상 브랜치: `feat/1008-daily-closing` / 작업 기준 HEAD `09430399a`
> 판정: **BLOCK — 불변식 1의 권위 있는 63→0 실측을 완료하지 못했으므로 중단**

## 1. 5개 항목 대조표

| 항목 | 현행 R7 동작 | `Code.js:568-659` 레거시 동작 | 일치 여부 | R8 수정 내용 |
|---|---|---|---|---|
| ① 후보 순서 | 전체 세트를 endpoint/group 삽입 순서로 한 번 순회 | 현재 실내기 토큰의 후보만 사용하고 구성품 수 내림차순 정렬 | 불일치 | 실내기 토큰별 후보군을 만들고 구성품 수 내림차순 stable 정렬 |
| ② 동점 처리 | DB/응답 순서에 의존 | JavaScript stable sort로 원래 `indoorToSets` 순서 보존 | 불일치 | 같은 크기 후보는 원본 catalog 순서를 유지 |
| ③ 가격 원천 | `releasePrice` 우선, null일 때만 `deliveryPrice` | `pCols[1]`인 두 번째 `납품가` 사용 | 불일치 | 세트 구성품 매칭 가격을 `deliveryPrice` 우선으로 변경 |
| ④ 합계 비교 | 각 구성품 단가가 개별적으로 같아야 성공 | 존재하는 옵션만 합산하고 `abs(invoice 합계) == abs(납품가 합계 - 옵션 DC)` 완전일치 | 불일치 | 필수 실내기·실외기 + 실제 존재 옵션을 합산하고 세트 DC 차감 후 절댓값 비교 |
| ⑤ 수량 전개 | `AxisKey`별 한 행으로 집계하여 수량을 전개하지 않음 | 싱글 pool을 `abs(qty)`만큼 전개하고 성공 단위를 소비 | 불일치 | 누적 수량을 독립 pool line으로 전개하고 성공 match 인덱스만 소비 |

추가로 성공한 match의 실내기만 결과 map에 넣던 결함을 제거했다. 성공한 실내기·실외기·실제 옵션 pool 인덱스를 모두 `(partnerCode, modelToken)`에 매핑한다. 모델 토큰이 없는 운임/서비스 행은 matcher pool에서 제외하여 기존 fallback을 유지한다.

## 2. RED

실패 테스트를 먼저 추가했다.

```text
LegacySetMatcherTest.matchesOutdoorWhenOptionalCatalogComponentIsNotOnTheInvoice()
```

실내기와 실외기는 존재하지만 catalog 옵션은 전표에 없는 fixture를 사용했다. 레거시 규칙상 이 경우 완성 세트여야 하나 현행 matcher는 모든 catalog 구성품을 필수로 요구했으므로 다음과 같이 실패했다.

```text
LegacySetMatcherTest > matchesOutdoorWhenOptionalCatalogComponentIsNotOnTheInvoice() FAILED
java.lang.AssertionError at LegacySetMatcherTest.java:37
2 tests completed, 1 failed
```

fixture는 실 catalog에서 가능한 실내기·실외기·옵션 구성품 상태만 사용했다.

## 3. fix

- `LegacySetMatcher`를 실내기별 후보 정렬, 필수/선택 구성품 판정, 합계+세트 DC 비교, 수량 pool 소비 결과를 반환하는 구조로 변경했다.
- `MonthEndCloseService`가 거래처별 전역 DC를 matcher에 전달하고, `deliveryPrice`를 후보 가격으로 사용하도록 변경했다.
- `DiscountRevalidator.GlobalDiscount`에 세트 코드별 옵션 정액 DC 조회를 추가했다.
- `DailyClosingDetailServiceTest`에 실내기·실외기 모두 matched set token을 받는 회귀 테스트를 추가했다.

## 4. GREEN

다음 부분 테스트는 통과했다.

```text
.\gradlew.bat :services:accounting-service:test \
  --tests '*LegacySetMatcherTest' \
  --tests '*DailyClosingDetailServiceTest.dailyDetailAppliesMatchedSetToIndoorAndOutdoor' \
  --tests '*DailyClosingDetailServiceTest.dailyDetailKeepsModelTokenFallbackWhenSetMatchFails' \
  --no-daemon --console=plain

BUILD SUCCESSFUL in 20s
5 tests completed
```

## 5. 불변식 1~6 실측

### 5.1 실외기 63→0 전수 재집계 — 미완료 / BLOCK

R7 보고서에 기록된 기준은 `실내기 97 + 실외기 97`, `63→63`이었다. R8에서 같은 공개 GViz CSV endpoint를 다시 읽은 결과는 다음이었다.

```text
sourceRange=싱글 구성품!A1:N1737
dataRows=1735
현재 AC/AP 실내기·실외기 후보=212행 (실내기 106 / 실외기 106)
```

즉 현재 live 원본은 R7의 97+97 모집단과 달라 동일한 63행을 재현하지 못했다. 또한 공유 product-service에 배포하여 실제 endpoint catalog와 일마감 API를 재실행하는 E2E도 금지된 Docker 재빌드 없이 수행하지 않았다. 따라서 **63→0을 실측했다고 보고하지 않는다**. 이 라운드의 바운드에 따라 추가 규칙 추측·수정은 중단한다.

### 5.2 과차감 0행 / 0원

코드 회귀 범위에서는 R5/R6 benchmark를 다시 발생시키는 임의 parent 선택 경로를 추가하지 않았다. 그러나 실 DB benchmark 재집계 및 63행과 동일한 권위 모집단의 end-to-end 금액 측정은 위 BLOCK 때문에 **미검증**이다.

### 5.3 실내기 불일치 0

새 서비스 회귀 테스트에서 matched set이 실내기와 실외기 모두에 적용되는 것을 확인했다. 실 원본 1,735행 전수의 실내기 불일치 수치는 모집단 불일치로 **미검증**이다.

### 5.4 옵션 미보유 164곳 / 0원 변화

이번 변경은 옵션이 pool에 없으면 옵션 가격을 합산하지 않는 레거시 규칙을 사용한다. 164곳/0원 실 DB benchmark의 R8 재실측은 **미검증**이다.

### 5.5 fallback

```text
dailyDetailKeepsModelTokenFallbackWhenSetMatchFails: PASS
```

후보가 완성되지 않으면 matched set map을 만들지 않고 기존 `modelToken` fallback을 유지한다. 테스트에서 기존 토큰과 납품가를 확인했다.

### 5.6 조회 비용 N+2 / bulk 100 제한

`estimateComponents("SINGLE_SET")`와 `estimateComponents("COMMERCIAL_MULTI")` 두 호출만 유지했다. 따라서 기존 distinct model lookup N에 +2가 추가되는 구조는 유지된다. 이번 라운드에는 Docker 재빌드나 공유 DB write/DDL을 하지 않았으며, 실 endpoint 재호출 검증은 **미검증**이다.

## 6. accounting-service 모듈 전체 테스트

전체 테스트를 시도했으나 과거 timeout 구간을 넘겨 334초에서 종료되었다.

```text
.\gradlew.bat :services:accounting-service:test --no-daemon --console=plain
command timed out after 334037 milliseconds
exit code: 124
```

성공했다고 주장하지 않으며 CI를 권위로 둔다.

## 7. 파일별 변경량

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java` | +5 | -0 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacySetMatcher.java` | +100 | -29 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java` | +36 | -16 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java` | +45 | -0 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/LegacySetMatcherTest.java` | +55 | -0 |
| `docs/dev-reports/2026-08-02-1008-r8-legacy-rule-parity-fix.md` | +123 | -0 |

## 8. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1008-r8-legacy-rule-parity-fix.md`

커밋·push·checkout·브랜치 조작·Docker 이미지 재빌드·공유 DB write/DDL은 수행하지 않았다.
