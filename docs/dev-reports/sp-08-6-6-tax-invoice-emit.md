# SP-08-6-6 세금계산서 발행 — dev report

## 1. 슬라이스 개요

| 항목 | 내용 |
|---|---|
| 슬라이스 | SP-08-6-6 |
| 서비스 | accounting-service |
| 목표 | 기존 TaxInvoiceController + TaxInvoiceView 회귀 검증 + emit endpoint 옵션 분석 |
| 날짜 | 2026-05-18 |
| QA 담당 | QA agent |

---

## 2. 기존 인프라 현황 (회귀 검증 범위)

### 2-1. BE 엔드포인트

| method | path | 역할 |
|---|---|---|
| POST | /accounting/tax-invoices | DRAFT 생성 |
| PUT | /accounting/tax-invoices/{id} | DRAFT 수정 |
| POST | /accounting/tax-invoices/{id}/issue | DRAFT → ISSUED + 자동 분개 (110/255/401) |
| POST | /accounting/tax-invoices/{id}/cancel | ISSUED → CANCELLED + 역분개 |
| GET | /accounting/tax-invoices | 페이지 조회 (legacy) |
| GET | /accounting/tax-invoices/history | 페이지 조회 (P0-4, type 필터 포함) |
| GET | /accounting/tax-invoices/{id} | 단건 + lines |
| GET | /accounting/tax-invoices/{id}/print | 인쇄용 응답 |
| POST | /accounting/tax-invoices/issue-request | P0-4 신규 DTO DRAFT 생성 |

핵심 emit 흐름: `TaxInvoiceService.issue()` → `TaxInvoiceNumberService.next()` → `JournalService.postAutoJournal()` → `TaxInvoice.linkJournal()`

### 2-2. 도메인 상태 머신

```
DRAFT → ISSUED → CANCELLED
```

- DRAFT: 수정 가능, tax_invoice_no NULL
- ISSUED: 수정 불가, tax_invoice_no 채번, 분개 자동 생성 (110/255/401)
- CANCELLED: 역분개 자동, cancel_reason 5자 이상 필수

### 2-3. 기존 IT 커버리지

| 파일 | 시나리오 수 | 커버 내용 |
|---|---|---|
| TaxInvoiceControllerIT | 4 | DRAFT 생성·auth / issue+분개 / cancel+역분개 / update DRAFT→ISSUED 충돌 |
| TaxInvoiceP04IT | 4 | issue-request 201 / 사업자번호 400 / print 인쇄 한글금액 / history type 필터 |
| TaxInvoiceBatchEndToEndIT | - | 일괄발행 E2E |
| TaxInvoiceBatchIT | - | 일괄발행 단위 |

---

## 3. QA 회귀 검증 결과

### 3-1. 옵션 A/B/C 분석

**옵션 A — 현행 유지 (추가 emit 엔드포인트 불필요)**
- `POST /accounting/tax-invoices/{id}/issue` 가 이미 완전히 구현됨
- IT 4건 (TaxInvoiceControllerIT) + 단위 테스트 포함
- 회귀 위험: 낮음

**옵션 B — 신규 emit 엔드포인트 추가**
- 별도 `POST /accounting/tax-invoices/{id}/emit` 추가 시 `/issue` 와 중복
- 이익 없음, 혼란 야기 가능
- 권고: 불필요

**옵션 C — 외부 홈택스 전자세금계산서 연동 emit**
- `eTaxExternalId` 필드가 이미 `TaxInvoiceDetail` 에 존재
- 현재 BE 에서 외부 연동 로직 미구현 (NULL 보존)
- 전자세금계산서 발행 API (홈택스/웹빌) 연동 시 신규 슬라이스 필요
- 권고: 현 SP-08-6-6 범위 외, SP-08-6-7 또는 별도 슬라이스로 분리

**결론: 옵션 A 유지 권고 — 기존 issue 엔드포인트 완비, 추가 emit 불필요**

### 3-2. FE 회귀 검증

| 화면 | 검증 항목 | 결과 |
|---|---|---|
| TaxInvoiceListPage | 상태 라벨 한국어 (임시저장/발행/취소) | 정상 — TAX_INVOICE_STATUS_LABEL 매핑 확인 |
| TaxInvoiceListPage | UUID 비공개 — id 컬럼 미포함 | 정상 — rowKey 만 내부 사용 |
| TaxInvoiceDetailPage | "발행" 버튼 DRAFT 상태에서만 노출 | 정상 — isDraft && canMutate 조건 |
| TaxInvoiceDetailPage | 취소 modal — 사유 5자 검증 | 정상 — trim().length < 5 버튼 disabled |
| TaxInvoiceDetailPage | journalId null일 때 분개 링크 미노출 | 정상 |
| TaxInvoiceDetailPage | AuditLockedBanner ISSUED/CANCELLED | 정상 |

### 3-3. UUID 비공개 확인 항목

- `TaxInvoiceListPage`: id 컬럼 렌더 없음, rowKey 내부만 사용
- `TaxInvoiceDetailPage`: `data-testid="tax-invoice-detail-no"` 에 taxInvoiceNo 표시 (UUID 아님)
- `taxInvoiceApi.ts`: 주석으로 UUID 비공개 원칙 명시

---

## 4. IT 격리 검증 (feedback_it_mockbean_external_clients)

TaxInvoiceControllerIT / TaxInvoiceP04IT 양쪽 모두:
- `@MockBean private SlipServiceClient slipServiceClient;` 선언 확인
- `Mockito.lenient().when(...)` stub 적용 확인
- AbstractPostgresIT 싱글턴 컨테이너 상속 확인

---

## 5. 도메인 정합성 SQL

```sql
-- 복식부기 invariant: 세금계산서 발행 분개 차/대 합계 일치 검증
SELECT j.id, j.description,
       SUM(jl.debit_amount)  AS total_debit,
       SUM(jl.credit_amount) AS total_credit
  FROM journals j
  JOIN journal_lines jl ON jl.journal_id = j.id
  JOIN tax_invoices ti ON ti.journal_id = j.id
 WHERE j.is_deleted = false
   AND jl.is_deleted = false
   AND ti.status = 'ISSUED'
 GROUP BY j.id, j.description
HAVING SUM(jl.debit_amount) <> SUM(jl.credit_amount);
-- 결과 0건이어야 정합성 충족

-- ISSUED 상태 세금계산서 중 tax_invoice_no NULL 이상 탐지
SELECT id, status, tax_invoice_no, supply_date
  FROM tax_invoices
 WHERE status = 'ISSUED'
   AND tax_invoice_no IS NULL
   AND is_deleted = false;

-- CANCELLED 상태 중 cancel_reason 5자 미만 이상 탐지
SELECT id, status, cancel_reason
  FROM tax_invoices
 WHERE status = 'CANCELLED'
   AND (cancel_reason IS NULL OR char_length(trim(cancel_reason)) < 5)
   AND is_deleted = false;
```

---

## 6. Playwright 스펙 위치

`clients/desktop/playwright/sp-08-6-6-tax-invoice-emit/sp-08-6-6-tax-invoice-emit.spec.ts`

TC 5건:
- T1: BE emit endpoint — POST /{id}/issue ISSUED 전이
- T2: FE 발행 CTA + 권한 (ACCOUNTANT)
- T3: 한국어 라벨 (목록 컬럼·필터·상태)
- T4: UUID 비공개 (가시 텍스트에서 UUID 미노출)
- T5: 권한 가드 (VIEWER 발행·취소 버튼 미노출)

---

## 7. PNG 위치

`docs/qa/sp-08-6-6-tax-invoice-emit/screenshots/`

| 파일 | 내용 |
|---|---|
| 01-draft-before-issue.png | 발행 전 DRAFT 상태 |
| 02-issue-confirm-modal.png | 발행 confirm 모달 |
| 03-issued-status-after-emit.png | 발행 후 ISSUED 상태 |
| 04-viewer-role-guard.png | 권한 가드 (VIEWER 접근 차단) |

---

## 8. 권고 사항

1. 옵션 A 유지 — 기존 `/issue` 엔드포인트가 완비되어 추가 emit 불필요
2. `eTaxExternalId` 활용한 홈택스 전자세금계산서 실발행 연동은 별도 슬라이스 (SP-08-6-7 후보)
3. `TaxInvoiceNumberService.next()` 의 월별 순번 채번 시퀀스 경쟁 조건 — 고부하 환경에서 DB UNIQUE 제약으로 방어 중, 추후 DB SEQUENCE 전환 고려

---

## 9. 회귀 영향 평가

| 구성 요소 | 변경 유무 | 회귀 위험 |
|---|---|---|
| TaxInvoiceController | 없음 | 낮음 |
| TaxInvoiceService | 없음 | 낮음 |
| TaxInvoiceDetailPage | 없음 | 낮음 |
| TaxInvoiceListPage | 없음 | 낮음 |
| TaxInvoiceBatchPage | 없음 (별도 슬라이스) | 없음 |

---

## 10. 관련 링크

- BE: `services/accounting-service/src/main/java/.../web/TaxInvoiceController.java`
- FE: `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx`
- IT: `services/accounting-service/src/test/.../it/TaxInvoiceControllerIT.java`
- IT: `services/accounting-service/src/test/.../it/TaxInvoiceP04IT.java`
- Migration: `V11__add_tax_invoice_issuance_fields.sql`
