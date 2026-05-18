# SP-08-6-5 일마감 + 원장 endpoint dev-report

작성일: 2026-05-18
브랜치: `feat/sp-08-6-5-accounting-daily-ledger`
담당: BE (accounting-service)

## 1. Scope

legacy GAS B 회계 4건 중 거래명세서/계산서(SP-08-6-4) 이후 나머지 2건 잠금:
- 일마감 (GAS 12번 "일마감 프로그램")
- 원장 (GAS 3번 "거래처별 원장생성" 기간 통합 버전)

신규 endpoint 2그룹 + Flyway V15 migration + Entity + IT 8 case.

## 2. 설계 결정

### 2-1. DailyClosing vs AccountingPeriod 분리

| 구분 | AccountingPeriod (기존) | DailyClosing (신규) |
|---|---|---|
| 목적 | 분개 입력 잠금/역마감 (회계 기간 가드) | 매출 전표(세금계산서) 집계 snapshot |
| 데이터 | totalSales/Purchase/Expense + lockedSlipCount | totalSupply/Vat/Amount + slipCount |
| 상태 | OPEN → CLOSED (역마감 가능) | isLocked=false → true (unlock 가능) |
| slip-service 호출 | lock-by-period (CONFIRMED → LOCKED) | 없음 (TaxInvoiceRepository 직접) |

두 엔티티는 역할이 다르므로 별도 테이블로 분리. AccountingPeriod 수정 없음.

### 2-2. 원장(Ledger) view 처리

별도 `ledger_entries` 테이블 불필요 — `journal_lines` (POSTED 분개) 로 실시간 조회.
`LedgerImageService` (단일 거래처 + 단톡방 포함)와 별개로 `LedgerService` (다중 거래처 + 합계 요약) 신규 추가.

### 2-3. Flyway V15 선택

V14 (supplier_profile) 이후 V15. `daily_closings` 테이블만 신규. 원장은 view 없음.

## 3. 변경 파일 목록

### Flyway Migration
- `V15__add_daily_closings.sql` — daily_closings 테이블 + partial unique index 2개

### Domain
- `domain/DailyClosing.java` — Entity (BaseEntity 상속, isLocked/lockedAt/By + recalculate/lock/unlock)

### Repository
- `repository/DailyClosingRepository.java` — findByClosingDate*, findByDateRange, findAllByDateRange
- `repository/JournalLineRepository.java` — findAllPostedLinesInRange 쿼리 추가

### Service
- `service/DailyClosingService.java` — close/list/unlock (PartnerLookupClient + TaxInvoiceRepository 의존)
- `service/LedgerService.java` — getLedger (JournalLineRepository + PartnerLookupClient 의존)

### DTO
- `web/dto/CreateDailyClosingRequest.java`
- `web/dto/DailyClosingResponse.java`
- `web/dto/LedgerResponse.java` (LedgerLine 내부 record 포함)

### Controller
- `web/DailyClosingController.java` — POST/GET/POST unlock (ACCOUNTANT/MANAGER/MASTER)
- `web/LedgerController.java` — GET (ACCOUNTANT/MANAGER/MASTER)

### Test
- `it/DailyClosingIT.java` — 8 case (전체 거래처 마감/중복409/SALES403/기간조회/거래처마감/404/원장전체/원장필터)

## 4. API 요약

### 일마감

| Method | Path | Role | 설명 |
|---|---|---|---|
| POST | /api/v1/accounting/daily-closings | ACCOUNTANT/MANAGER/MASTER | 일마감 실행 (201) |
| GET | /api/v1/accounting/daily-closings?from=&to= | ACCOUNTANT/MANAGER/MASTER | 기간 조회 (200, 페이지) |
| POST | /api/v1/accounting/daily-closings/unlock?closingDate=&partnerCode= | MASTER | 잠금 해제 (200) |

### 원장

| Method | Path | Role | 설명 |
|---|---|---|---|
| GET | /api/v1/accounting/ledgers?from=&to=&partnerCode= | ACCOUNTANT/MANAGER/MASTER | 원장 조회 (200) |

## 5. IT 케이스

| # | 케이스명 | 예상 결과 |
|---|---|---|
| 1 | testCreateDailyClosingForDate | 201 + isLocked=true |
| 2 | testCreateDailyClosingDuplicate | 409 CONFLICT |
| 3 | testCreateDailyClosingForbiddenForSales | 403 |
| 4 | testGetDailyClosingsRange | 200 + page |
| 5 | testCreateDailyClosingWithPartner | 201 + partnerCode |
| 6 | testCreateDailyClosingPartnerNotFound | 404 |
| 7 | testGetLedgersAllPartners | 200 + lines array |
| 8 | testGetLedgersWithPartnerFilter | 200 + partnerCode |

## 6. 컴파일 검증

```
./gradlew :services:accounting-service:compileJava        → BUILD SUCCESSFUL
./gradlew :services:accounting-service:compileTestJava    → BUILD SUCCESSFUL
./gradlew :services:accounting-service:assemble           → BUILD SUCCESSFUL
```

## 7. 미해결 항목

- `LedgerService.resolvePartnerCode(UUID)` — `PartnerLookupClient.findByPartnerId` 는 현재 placeholder (빈 Optional 반환). partner-service 가 UUID 기반 internal endpoint 를 제공하면 즉시 연동 가능.
- 원장 라인 수가 대용량일 때 페이지네이션 미적용 (현재 전체 반환). 필요 시 `findAllPostedLinesInRange` → Page 버전으로 전환.
- 일마감 unlock 후 AccountingPeriod CLOSED 와 DailyClosing isLocked=false 간 정합성은 운영 정책으로 결정 필요 (현재 독립 운영).

## 8. QA 결과 (SP-08-6-5)

작성일: 2026-05-18  QA 담당: QA agent

### Playwright spec 5/5 PASS

파일: `clients/desktop/playwright/sp-08-6-5-accounting-daily-ledger/sp-08-6-5-accounting-daily-ledger.spec.ts`

실행 결과: **5 passed (3.9s, chromium)**

| 케이스 | 검증 포인트 | 결과 |
|---|---|---|
| T1 | BE-A12 endpoint 선언 + Flyway V15 스키마 + DailyClosingDetailResponse UUID 무(필드) | PASS |
| T2 | BE-A9 endpoint + partnerCode 필수 파라미터 + LedgerImageResponse UUID 필드 없음 | PASS |
| T3 | MonthEndClosingPage testid 6종 + getDailyClosingDetail 호출 + closingApi 권한 함수 | PASS |
| T4 | PartnerLedgerPage testid 8종 + getLedgerData + partnerLedgerApi 필드 계약 | PASS |
| T5 | 역마감 MASTER 독점 + 원장/일마감 ACCOUNTANT/MANAGER/MASTER 접근 권한 | PASS |

### UUID 비공개 가드 검증

- `DailyClosingDetailResponse.java`: UUID 타입 record 파라미터 없음 — `taxInvoiceNo` / `partnerName` 만 노출
- `LedgerImageResponse.java`: UUID 타입 record 파라미터 없음 — `partnerCode` / `journalNo` 만 노출
- `partnerLedgerApi.ts`: 인터페이스 필드 `partnerId` 선언 없음
- `MonthEndClosingPage.tsx`: closing.id 를 화면 표시에 사용하지 않음

### 도메인 정합성 SQL

```sql
-- Journal 복식부기 invariant (sum(debit) == sum(credit) per journal)
SELECT j.journal_no, SUM(jl.debit_amount) - SUM(jl.credit_amount) AS diff
FROM journals j
JOIN journal_lines jl ON jl.journal_id = j.id
WHERE j.status = 'POSTED' AND j.is_deleted = FALSE
GROUP BY j.id, j.journal_no
HAVING ABS(SUM(jl.debit_amount) - SUM(jl.credit_amount)) > 0.01;

-- DailyClosing partial unique 검증 (0건이어야 정상)
SELECT closing_date, partner_id, COUNT(*) AS cnt
FROM daily_closings
WHERE is_deleted = FALSE
GROUP BY closing_date, partner_id
HAVING COUNT(*) > 1;
```

### QA 스크린샷

경로: `docs/qa/sp-08-6-5-accounting-daily-ledger/screenshots/`

| 파일명 | 내용 |
|---|---|
| `01-daily-closing-screen.png` | 일마감 처리 화면 — testid 어노테이션 포함 |
| `02-daily-closing-confirm-modal.png` | 일마감 완료 confirm modal |
| `03-partner-ledger-screen.png` | 거래처별 원장 조회 화면 — 집계 + 라인 표 |
| `04-partner-ledger-print-preview.png` | 원장 인쇄 미리보기 — UUID 미노출 확인 |

### 회귀 영향

| 영역 | 영향 |
|---|---|
| MonthEndClosingPage | BE-A12 read-only 추가 — 기존 마감/역마감 기능 무변경 |
| PartnerLedgerPage | 신규 페이지 — 기존 회계 라우트 영향 없음 |
| accounting-service V15 | daily_closings 신규 테이블 — V1~V14 무변경 |
| closingApi.ts | getDailyClosingDetail 추가 — 기존 함수 무변경 |
