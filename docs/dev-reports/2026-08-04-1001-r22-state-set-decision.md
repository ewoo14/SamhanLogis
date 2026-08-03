# R22 — 개발책임자 결정 반영 (원장 상태 집합)

## 작업 범위

- 시작 시각: 2026-08-04
- 대상: 원장 상태 집합에 `INSPECTING`, `SHIPPING` 추가
- 제외: `SALE_SUMMARY` slip 없는 journal 매출 정책 변경
- 금지: commit, push, Docker build/up/restart, 전체 Playwright/Gradle suite

## 진행 로그

- [2026-08-04] `git pull` 실행: `Already up to date.`
- [2026-08-04] 조사 시작. 상태 집합 정의 위치와 세 소비 경로를 확인할 예정.
- [2026-08-04] 정본 확인: `shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerContract.java` 한 곳. `slip-service` internal projection이 이를 사용하고, `accounting-service` 집계·상세·인쇄가 같은 client projection을 소비한다.
- [2026-08-04] RED: `SlipPartnerLedgerInternalControllerIT.returnsEveryOutboundStatusAfterInventoryDispatchWithLinesAndNoUuid`가 3건 기대에서 5건 기대로 바꾼 뒤 실패. 기존 정본이 `INSPECTING`·`SHIPPING`을 제외하는 것을 재현했다.

## RED-A / RED-B

정본 cohort 기대값(화면 기본 기간과 동일한 `2026-01-01`~`2026-03-31`): 활성 OUTBOUND `CONFIRMED · DELIVERED · COMPLETED · INSPECTING · SHIPPING` = 31전표 / 89라인 / 354,121,900원.

RED 원문:

```text
SlipPartnerLedgerInternalControllerIT > returnsEveryOutboundStatusAfterInventoryDispatchWithLinesAndNoUuid() FAILED
java.lang.AssertionError at SlipPartnerLedgerInternalControllerIT.java:88
1 test completed, 1 failed
BUILD FAILED
```

RED-A: 기존 정본은 21전표 / 62라인 / 197,476,400원이며, 결정 반영 cohort는 31전표 / 89라인 / 354,121,900원이어야 한다. 이 수치는 `slip_date BETWEEN 2026-01-01 AND 2026-03-31`, 활성 OUTBOUND, 활성 line 기준 read-only SQL로 확인했다.

RED-B: 기존 정본은 `CONFIRMED · DELIVERED · COMPLETED`만 사용했다. 계약 정의 위치는 한 곳이었고, 세 경로는 공통 계약에서 파생된 같은 상태 집합을 소비한다.

## 변경 내용

`PartnerLedgerContract.CANONICAL_SALE_STATUSES`에 `INSPECTING`, `SHIPPING`을 추가했다. `SALE_SUMMARY` 처리, 집계·상세·인쇄 로직 자체, slip 없는 journal 매출 정책은 변경하지 않았다.

## GREEN

GREEN 원문:

```text
BUILD SUCCESSFUL in 30s
18 actionable tasks: 3 executed, 15 up-to-date
```

대상 테스트: `SlipPartnerLedgerInternalControllerIT.returnsEveryOutboundStatusAfterInventoryDispatchWithLinesAndNoUuid`.

## 거래처별 금액 증감

read-only SQL 측정 결과:

| 상태 | 전표 | 라인 | 금액 |
|---|---:|---:|---:|
| COMPLETED | 7 | 17 | 58,492,500원 |
| CONFIRMED | 4 | 10 | 32,138,700원 |
| DELIVERED | 10 | 35 | 106,845,200원 |
| INSPECTING | 5 | 12 | 87,841,600원 |
| SHIPPING | 5 | 15 | 68,803,900원 |
| 합계 | 31 | 89 | 354,121,900원 |

실측 SQL은 `BEGIN READ ONLY` / `ROLLBACK`으로 실행했다. 현재 DB에는 2026-08-03의 별도 INSPECTING 1전표/4라인/1,739,100원이 추가되어 있어 전체 기간으로 조회하면 32전표/93라인/355,861,000원이지만, 화면 정본 cohort 기간 밖이므로 RED-A/GREEN 기준에는 포함하지 않았다.

## R9 불변식 확인

R9 기준 실측에서 추가되는 거래처별 금액은 다음과 같다(상태 `INSPECTING`·`SHIPPING`, 위 기본 기간).

| 거래처 표시명 | 추가 전표 | 추가 라인 | 증가 금액 |
|---|---:|---:|---:|
| 거래처-P-2026-0006 | 1 | 1 | 6,316,200원 |
| 거래처-P-2026-0017 | 1 | 2 | 12,276,000원 |
| 거래처-P-2026-0027 | 1 | 2 | 15,559,500원 |
| 거래처-P-2026-0028 | 1 | 3 | 30,567,900원 |
| 거래처-P-2026-0029 | 1 | 4 | 23,122,000원 |
| 거래처-P-2026-0034 | 1 | 4 | 11,379,500원 |
| 거래처-P-2026-0035 | 1 | 5 | 21,428,000원 |
| 거래처-P-2026-0036 | 1 | 1 | 3,682,800원 |
| 거래처-P-2026-0037 | 1 | 2 | 10,626,000원 |
| 거래처-P-2026-0038 | 1 | 3 | 21,687,600원 |
| 합계 | 10 | 27 | 156,645,500원 |

R9 항목 유지 확인: 상태 집합 변경은 원장 read projection의 모집단만 넓히며, `무필터 43행 · '-' 0행 · 선등록 14행`, UUID 노출 0건, `SALE_SUMMARY` 거래처당 1건·문서번호 중복 0, 사업자번호 `1653510155 → P-2026-0005` 계약은 코드상 변경하지 않았다. 상태 확대에 따라 위 10개 거래처의 금액만 증가한다.

## 새 파일 목록

- `docs/dev-reports/2026-08-04-1001-r22-state-set-decision.md`

## 최종 검증

- `:services:slip-service:test --tests com.samhanair.logis.slip.it.SlipPartnerLedgerInternalControllerIT`: `BUILD SUCCESSFUL`.
- `:services:accounting-service:test --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest --tests com.samhanair.logis.accounting.service.PartnerLedgerReadServiceTest`: `BUILD SUCCESSFUL`.
- `git diff --check`: 통과.
- 변경 파일은 정본 1개와 정본 소비 계약을 검증하는 테스트 1개다. 기존 untracked QA 디렉터리 `clients/desktop/playwright/1001-r5-ledger-real-qa/`, `1001-r6-ledger-real-qa/`는 건드리지 않았다.
