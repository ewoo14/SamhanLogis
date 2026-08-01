# PR #991 R5 축 판정 계열 수정 보고서

## 작업 범위와 제한

- 대상: B-03, B-04, B-08
- 작업 위치: `fix/monthend-detail-price-variant`, 시작 HEAD `a337b272d`
- 한국어 산출물 원칙을 적용한다.
- Git 쓰기, Docker 재빌드·재기동, 공유 DB 쓰기는 수행하지 않는다.
- 모든 테스트 통과 주장은 명령과 종료코드를 함께 기록한다.

## 0. 진행 로그

- 보고서 파일을 작업 시작 전에 생성했다.
- 원문 및 저장소 규칙을 확인하는 중이다.

## 1. B-03 — exact snapshot 축 보존

### RED 원문

실행 명령:

```text
.\gradlew :services:accounting-service:test --tests 'com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.dailyDetailExactModelSnapshotWinsOverAmbiguousLabel' --rerun-tasks --no-build-cache
```

종료코드: `1`

```text
DailyClosingDetailServiceTest > B-03 exact snapshot 모델이 있으면 품명 다의성보다 exact 모델 축을 우선한다 FAILED
    java.lang.AssertionError at DailyClosingDetailServiceTest.java:253
1 test completed, 1 failed
BUILD FAILED
```

실패 이유: 품명 검색 결과가 `AMBIGUOUS`이면 exact 모델 snapshot을 사용하지 않고 판정을 중단했다.

### 변경 요지

- exact 모델 snapshot이 있으면 `product-service` 정확 모델 조회 결과를 품명 LIKE 결과보다 우선한다.
- 모델 snapshot으로 제품 ID를 확보한 뒤 기존 카테고리별 가격 이력·할인 재검증 경로를 그대로 사용한다.
- 모델을 해소하지 못한 경우에는 기존 `AMBIGUOUS`/`NOT_FOUND`를 유지해 억지 판정을 하지 않는다.

### 실측

- RED 명령 종료코드: `1`.
- 수정 후 명령: `.\gradlew :services:accounting-service:test --tests 'com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.dailyDetailExactModelSnapshotWinsOverAmbiguousLabel' --rerun-tasks --no-build-cache`
- 수정 후 종료코드: `0` (`BUILD SUCCESSFUL`, 21 actionable tasks executed).
- 이 fixture에서 `AMBIGUOUS → 가격 판정 가능` 변경: 1건.
- 기존에 맞던 판정이 틀리게 된 건수: 0건(대상 회계 테스트 클래스에서 확인).

## 2. B-04 — 혼합 전표 축별 가격

### RED 원문

미작성.

### 변경 요지

- 혼합 라인의 각 배분이 보존한 `modelName`을 exact 축으로 해소해, 첫 품명 라벨의 제품 ID를 다른 배분에 재사용하지 않도록 했다.
- 현재 축 모델 snapshot이 해소되지 않으면 기존의 모호/미상 상태를 유지한다.

### 실측

- 전용 실데이터 집계: 전체 검증 후 기록한다.

## 3. B-08 — 전환 시 확정 공급가 보존

### RED 원문

미작성.

### 변경 요지

- 혼합 매출전표를 세금계산서로 전환할 때 매출전표 라인 전체를 한 라인으로 복사하지 않고 배분 축별 세금계산서 라인으로 snapshot한다.
- 각 배분의 수량·공급가액·부가세·모델·카테고리 축을 보존한다.

### 실측

- 전용 실데이터 집계: 전체 검증 후 기록한다.

## 4. 네 모듈 전체 검증

실행 명령:

```text
.\gradlew :services:accounting-service:test :services:slip-service:test :services:partner-order-service:test :shared:common:test --rerun-tasks --no-build-cache
```

종료코드: `124` (300초 명령 제한 초과). 결과는 **미판정**이며 네 모듈 전체 통과로 보고하지 않는다.

회계 대상 두 테스트 클래스만 별도로 실행한 명령:

```text
.\gradlew :services:accounting-service:test --tests 'com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest' --tests 'com.samhanair.logis.accounting.domain.TaxInvoiceDomainTest' --rerun-tasks --no-build-cache
```

종료코드: `0`, `BUILD SUCCESSFUL`, `21 actionable tasks: 21 executed`.

## 5. 이번에 안 본 것

- B-05, B-06, B-07: Issue #1008 이관 범위
- R-03: 선재 VAT 재가산 backfill 및 모든 DB 쓰기
- 이미 통과한 B-01, B-02, B-09, B-10, R-01, R-02
- 프론트엔드 광범위 개편

## 6. 신규 파일 및 작업 트리

신규 파일:

- `docs/dev-reports/2026-08-01-991-r5-axis-judgment.md`

`git status --porcelain` 원문:

```text
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductClient.java
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/TaxInvoice.java
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/TaxInvoiceLine.java
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java
 M services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java
?? docs/dev-reports/2026-08-01-991-r5-axis-judgment.md
```

`git diff --check` 종료코드: `0`.

실데이터 건수 집계는 공유 DB 쓰기 금지 및 전체 검증 timeout으로 수행하지 못했다. 따라서 B-04·B-08의 변경 건수와 기존 정답 오변경 0건은 **미판정**이다. B-03은 전용 fixture에서 1건 변경, 기존 정답 오변경 0건을 확인했다.
