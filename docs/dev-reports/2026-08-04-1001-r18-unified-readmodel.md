# PR #1061 R18 — 통합 원장 산출 결과

- 시작일: 2026-08-04
- 근거: `docs/dev-reports/2026-08-04-1001-r17-structural-diagnosis.md`
- 범위: 집계·상세·인쇄의 원장 산출 결과 통합 및 R7 회귀 고정
- 운영 제한: commit/push 및 Docker build/up/restart 없음. 기존 실데이터·`docs/qa/**` 변경 없음.

## 0. 착수 기준

R17의 최소 변경 제안 A를 채택한다. accounting-service에 공통 `PartnerLedgerReadModel` 산출기를 두고, 집계와 상세가 동일한 `documents`/`totals`를 소비하도록 한다. 인쇄는 상세 API의 동일 응답을 소비하므로 동일한 산출 결과 계약을 사용한다.

정책 결정 전 이번 라운드의 정본은 다음과 같다.

- 원장 상태 집합: 현행 집계 기준인 `COMPLETED`, `DELIVERED`, `CONFIRMED`.
- slip 없는 journal 매출: 현행 집계 금액을 보존하고 상세·인쇄에도 `SALE_SUMMARY` 문서로 표시한다.
- 두 정책은 공통 산출기 한 곳에서만 정의하며, 후속 결정 시 해당 정의만 변경한다.

## 1. RED

구현 전 R7 실측 회귀를 테스트로 고정한다. 각 테스트 실행 원문은 아래에 append한다.

### RED-A/B/C 실행 원문

```text
> .\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest --no-daemon
...
> Task :services:accounting-service:compileTestJava FAILED
error: no suitable constructor found for Sale(..., UUID, ...)
error: cannot find symbol class PartnerLedgerReadModelService
error: package PartnerLedgerReadModel does not exist
BUILD FAILED
```

실패 원인: UUID를 내부 응답에 보존하는 계약과 공통 산출기가 아직 구현되지 않은 상태다.

## 2. 구현 구조

- 공통 산출기: `services/accounting-service/.../PartnerLedgerReadModelService.java`
- 산출 결과: `PartnerLedgerReadModel.java`의 내부 `partnerId`, public 업무 식별자 snapshot, `documents`, `salesTotal`, `paymentTotal`, `receivableBalance`.
- 집계: `SalesAggregateService`가 운영 경로에서 산출기의 `Partner` totals를 `SalesAggregateRow`로 변환한다.
- 상세: `PartnerLedgerReadService`가 같은 산출기의 선택 `Partner.documents`를 `PartnerLedgerResponse`로 변환한다.
- 인쇄: 기존처럼 상세 응답을 다시 요청하지만 동일 accounting 산출기/계약을 소비하므로 계산·필터 규칙을 재구현하지 않는다.
- 내부 slip 응답: `PartnerLedgerSalesResponse.partnerId`를 유지한다. accounting 내부 client가 UUID-only 전표를 partner master에 연결하며 public `PartnerLedgerResponse`에는 UUID 필드가 없다.
- 상태 정본: `shared/common/.../PartnerLedgerContract.java` 한 곳의 `CANONICAL_SALE_STATUSES`를 accounting과 slip이 함께 사용한다.
- journal-only 정본: `PartnerLedgerReadModelService.JOURNAL_ONLY_DOCUMENT = SALE_SUMMARY`; 문서번호는 내부 그룹 키일 뿐 public UUID가 아니다.

## 3. GREEN 원문

### RED-A

```text
> .\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest --no-daemon
BUILD SUCCESSFUL in 19s
```

UUID-only 판매전표가 `partnerId`로 해소되어 `12276000`원 문서·합계로 남고, journal-only `26000000`원이 `SALE_SUMMARY`로 남는 테스트가 통과했다.

### RED-B

```text
> .\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest --tests com.samhanair.logis.accounting.service.PartnerLedgerReadServiceTest --tests com.samhanair.logis.accounting.service.SalesAggregateServiceTest --no-daemon
BUILD SUCCESSFUL in 19s
```

집계와 상세의 기존 회귀 및 공통 산출기 계약 테스트가 동시에 통과했다. 집계 totals와 상세 documents의 매출 합은 같은 `PartnerLedgerReadModel` 산출값을 사용한다.

### RED-C

```text
> .\gradlew :services:slip-service:test --tests com.samhanair.logis.slip.web.dto.PartnerLedgerSalesResponseTest --tests com.samhanair.logis.slip.it.SlipPartnerLedgerInternalControllerIT --no-daemon
BUILD SUCCESSFUL in 41s
```

실 DB read-only 측정도 canonical 상태 집합으로 재현했다: `CONFIRMED 4건/32,138,700원`, `DELIVERED 10건/106,845,200원`, `COMPLETED 7건/58,492,500원` = **21건/197,476,400원**. `INSPECTING`·`SHIPPING`은 이 계약에서 제외된다.

## 4. 실측 및 R7 유지 확인

read-only SQL 기준 거래처별 정본 금액:

| 거래처 | journal 401 | canonical slip | 공통 산출 결과 기준 |
|---|---:|---:|---:|
| P-2026-0005 | 26,000,000 | 없음 | **26,000,000 (`SALE_SUMMARY`)** |
| P-2026-0017 | 20,000,000 | 없음 (INSPECTING 제외) | **20,000,000 (`SALE_SUMMARY`)** |
| P-2026-0026 | 23,000,000 | 5,656,200 (COMPLETED) | **5,656,200 (SALE documents)** |

canonical 식별 불가 cohort는 **21건/62라인/197,476,400원**으로 측정되었다. 따라서 오염 기준값은 0건/0원이 아니며, 금액이 버려지지 않고 정본 상태 집합의 식별 불가 행으로 보존된다. `INSPECTING 87,841,600원 + SHIPPING 68,803,900원`은 canonical 집계에 포함하지 않는다.

R7 PASS 유지:

- 사업자번호 `1653510155`는 `P-2026-0005`로 exact lookup된다.
- 상세·인쇄 public 응답에는 사업자번호가 유지된다.
- 식별 불가 행은 UUID나 전표번호를 사용자 식별자로 내보내지 않고, 기존 화면의 상세/인쇄 진입 차단 계약을 유지한다.

## 5. 새 파일 및 변경 파일

새 파일:

- `docs/dev-reports/2026-08-04-1001-r18-unified-readmodel.md`
- `shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerContract.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModel.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelServiceTest.java`

기존 변경:

- accounting `PartnerLedgerSalesClient`, `SalesAggregateService`, `PartnerLedgerReadService`
- slip `PartnerLedgerSalesResponse`, `SlipInternalController` 및 해당 계약 테스트

commit/push, Docker build/up/restart, 전체 Playwright/전체 Gradle suite는 실행하지 않았다.

## 6. 최종 검증 메모

```text
> .\gradlew :services:accounting-service:compileJava :services:slip-service:compileJava --no-daemon
BUILD SUCCESSFUL in 11s
> git diff --check
(출력 없음)
```

두 모듈 전체 테스트 작업은 장시간 무출력으로 실행되어 사용자 범위(전체 Gradle suite 금지)에 맞춰 중단했다. 앞의 R18 대상 accounting 테스트 3종과 slip 계약 테스트 2종은 각각 fresh `BUILD SUCCESSFUL`로 완료되어 있다.
