# R61 라이브QA 보고서 — PR #1057 · 이슈 #874

## 컨테이너 상태 — 재배포 없음

이번 라운드는 재배포·재빌드·중지 없이 기존 컨테이너의 `created`/`started`만 확인했다.

| 컨테이너 | created | started | 상태 |
|---|---|---|---|
| `samhan-api-gateway` | `2026-08-05T13:55:20.45079612Z` | `2026-08-05T13:55:30.333688993Z` | running |
| `samhan-accounting-service` | `2026-08-05T11:35:22.04655355Z` | `2026-08-05T11:35:25.824979054Z` | running |
| `samhan-slip-service` | `2026-08-05T14:17:51.44867138Z` | `2026-08-05T14:17:55.498813686Z` | running |
| `samhan-product-service` | `2026-08-05T10:17:39.747773714Z` | `2026-08-05T10:17:43.342187543Z` | running |
| `samhan-dc-config-service` | `2026-07-29T15:14:34.210417664Z` | `2026-08-05T10:02:11.2910491Z` | running |
| `samhan-partner-order-service` | `2026-07-31T15:51:50.533560637Z` | `2026-08-05T10:02:11.273150908Z` | running |

## 실행 조건

- 기준 HEAD: `80f7e9dc7`
- 브라우저: 내장 브라우저 미사용. `clients/desktop`에서 `import { chromium } from '@playwright/test'` Node 드라이버 사용
- 렌더러: `VITE_API_BASE_URL=http://localhost:8080`, `VITE_MOCK_MODE=false`, `--host localhost --port 5217 --strictPort`
- 계정: `dev_master / dev_p05_pass!`
- 직접 DB SQL 쓰기: 없음
- 일마감 실행: 하지 않음. `POST /accounting/daily-closings`는 DB 쓰기이므로 가드레일상 금지
- UI 저장: 거래처 DC 설정 화면의 PATCH 1건만 수행

## 판정 요약

| 항목 | 판정 | 근거 |
|---|---|---|
| riUsage 조회 원천/API 식별 | PASS | 코드와 실 API 경로를 확인함 |
| 세트 riUsage 실 원천 행 생성 및 화면 판정 | 미실시 | 세트 마스터는 있으나 `POSTED` 회계 전표 원천이 없어 상세/재검증 배열이 0건 |
| 거래처 전역DC 관리 화면 설정 | PASS | 실 화면에서 `PATCH .../4348703365` HTTP 200, `48%/49%` 저장·재조회 확인 |
| 전역DC 값의 신규 전표 반영 | 미실시 | 저장한 거래처와 일치하는 실 전표가 없고, 신규 주문/전표 생성은 추가 DB 쓰기라 수행하지 않음 |
| 이번 라운드 본 주제 완주 | 미실시 | riUsage와 전표 반영 모두 실 발화까지 도달하지 못함 |

## 1. riUsage 조회 원천은 무엇인가

코드 기준 원천은 다음과 같다.

1. 화면은 `GET /api/v1/accounting/closings/daily?date=...&kind=SALES&sourceKind=SALES_SLIP`를 호출한다.
2. `AccountingReportController`의 `dailyDetail()`이 `MonthEndCloseService.getDailyDetail()`을 호출한다.
3. `SALES_SLIP` 분기는 `SalesAccountingSlipRepository.findBySlipDateAndStatusWithLines()`를 사용한다.
4. 쿼리 조건은 `sales_accounting_slips.slip_date = :slipDate AND status = POSTED`이며, `sales_accounting_slip_lines`를 함께 읽는다.
5. 라인과 allocation을 세트 후보 pool로 만든 뒤 `product-service`의 세트 구성품 조회와 `dc-config-service`의 거래처 전역DC 조회를 거쳐 `LegacyVerificationChain.riUsageDecision()`이 `verified`/`revalidationStatus`를 만든다.

즉, `bundle_component`의 세트 마스터 행만으로는 riUsage가 실행되지 않는다. 반드시 회계 서비스의 `sales_accounting_slips`에 `POSTED`인 매출 회계전표와 라인이 있어야 한다.

## 2. 세트 riUsage 도달성 실측

### 확인한 실 데이터

- 실 출고전표 API: `GET /api/v1/slips?slipType=OUTBOUND&page=...&size=250&includeDeleted=true`
- 전 페이지 실측: 2,420건
- 확인된 날짜: `2026-08-05`, `2026-08-03`, `2026-08-01` 등
- 세트가 포함된 기존 실 전표 상세도 확인함. 예: `2026/08/03-6`은 4개 라인과 `parentSetModel`을 표시한다.

### 일마감 원천 API 실측

위 출고전표 날짜를 전부 순회하여 `SALES_SLIP` 상세 API를 조회했다. 최근 핵심 날짜 결과는 다음과 같다.

| 날짜 | HTTP | `taxInvoices` | `productSummaries` | 화면 |
|---|---:|---:|---:|---|
| `2026-08-05` | 200 | 0 | 0 | `상세 전표가 없습니다` / `모델별 재검증 결과가 없습니다` |
| `2026-08-03` | 200 | 0 | 0 | 동일 |
| `2026-08-01` | 200 | 0 | 0 | 동일 |

화면에서도 같은 세 날짜를 선택하여 동일 문구를 확인했다. 캡처: [03-daily-closing-live-empty.png](screenshots/03-daily-closing-live-empty.png)

따라서 이번 라운드에서 PASS/FAIL을 만들 수 있는 riUsage 행 자체가 없었다. 세트 마스터를 새로 만들거나 `bundle_component`를 직접 쓰는 것은 회계 원천 행을 만들지 않으며, `sales_accounting_slips`/라인을 DB에 직접 삽입하는 것은 금지된 경로다. 일마감 실행은 원천을 만드는 기능이 아니라 기존 원천을 읽고 마감하므로 해결책도 아니다.

### 구조적 원인 판정

- 단순히 `bundle_component` 데이터가 없는 상태는 아니다. 세트 마스터/구성품은 실 화면과 기존 전표 상세에 존재한다.
- 이 PC에 riUsage 코드와 API가 없는 것도 아니다. 코드, 화면, HTTP 200 응답은 존재한다.
- 막힌 지점은 `sales_accounting_slips`의 `POSTED` 회계 원천 행이다. 현재 실 출고전표의 `DRAFT/SENT/INSPECTING` 상태는 이 조회의 입력이 아니다.
- #1064/#1065 계열 선행 기능 오류 HTTP/원문은 이번 경로에서 발생하지 않았다. 해당 선행 기능을 호출하기 전에 원천 배열이 0건으로 끝났다.

## 3. 거래처 전역DC 관리 화면

`/sales/partner-dc-config`를 `dev_master`로 열고 첫 거래처 `4348703365 / 주식회사 엠엠시스템에어(고영현)`의 값을 화면에서 변경했다.

- 기존 홈멀티DC: `46%`
- 입력값: 홈멀티DC `48%`, 상업멀티DC `49%`
- 요청: `PATCH /api/v1/partner-dc-configs/4348703365`
- 응답: HTTP `200`
- 응답 원문 핵심: `homeMultiDc="48%"`, `commercialMultiDc="49%"`
- 저장 후 목록 재조회: HTTP `200`

캡처: [01-dc-config-before.png](screenshots/01-dc-config-before.png), [02-dc-config-saved.png](screenshots/02-dc-config-saved.png)

이는 관리 화면에서 `dc_configs` 값(홈·상업율 및 옵션 정액 필드)을 실제로 설정할 수 있다는 PASS다. 직접 DB SQL은 사용하지 않았다.

## 4. 전역DC 값의 전표 반영 여부

저장한 `4348703365`와 일치하는 실 출고전표는 현재 2,420건 중 0건이었다. 따라서 그 거래처의 새 가격 계산 결과를 기존 전표에서 비교할 수 없었다.

별도로 사업자번호/거래처 코드가 일치하는 기존 전표 `2148720659`도 확인했다. 이 전표의 기존 설정은 홈멀티DC `45%`였고, 상세 전표는 이미 저장된 라인 단가를 표시하며 `discountInfo`는 null이었다. 세트 라인은 보이지만 현재 전표의 저장 단가에 이번 저장값이 반영됐다고 판정할 수 있는 필드는 없었다. 캡처: [04-existing-set-slip-detail.png](screenshots/04-existing-set-slip-detail.png)

코드상 신규 전표/주문 가격 반영은 `partner-order-service → POST /internal/price-calculations` 경로이며, 이 호출은 `price_calculation_logs`를 기록한다. 실제 신규 주문·전표 생성 또는 internal 가격계산 호출은 DB 쓰기를 추가로 발생시키므로 이번 라운드에서는 수행하지 않았다. 따라서 전표 반영 항목은 미실시다.

## 결론

이번 라운드의 질문인 “발화 조건을 실 경로로 만들 수 있는가”에 대한 답은 **현재 허용된 QA 경로와 데이터로는 riUsage까지 만들 수 없다**이다. 세트 마스터와 전역DC 관리 화면은 존재하고 전역DC 저장은 PASS했지만, riUsage가 읽는 `POSTED` 회계 매출전표 원천이 0건이다. 그러므로 본 주제 전체를 PASS로 올리지 않으며, 미실시를 PASS로 세지 않는다.

## 새 파일 목록

- `docs/qa/874-riusage-r61-real-qa/qa-report.md`
- `docs/qa/874-riusage-r61-real-qa/r61-api-probe.json`
- `docs/qa/874-riusage-r61-real-qa/daily-ui-observations.json`
- `docs/qa/874-riusage-r61-real-qa/dc-network.json`
- `docs/qa/874-riusage-r61-real-qa/dc-save-network.json`
- `docs/qa/874-riusage-r61-real-qa/screenshots/01-dc-config-before.png`
- `docs/qa/874-riusage-r61-real-qa/screenshots/02-dc-config-saved.png`
- `docs/qa/874-riusage-r61-real-qa/screenshots/03-daily-closing-live-empty.png`
- `docs/qa/874-riusage-r61-real-qa/screenshots/04-existing-set-slip-detail.png`

지정된 `clients/desktop/playwright/874-riusage-real-qa.spec.ts`는 수정하지 않았다.
