# SP-09-1 NTS e-Tax 국세청 전자세금계산서 발행 shell — dev report

## 1. 슬라이스 개요

| 항목 | 내용 |
|---|---|
| 슬라이스 | SP-09-1 |
| 서비스 | accounting-service |
| 목표 | 국세청(NTS) e-Tax 전자세금계산서 실 발행 shell — DRY_RUN mock + 외부 ETaxClient 계약 수립 |
| 날짜 | 2026-05-18 |
| QA 담당 | QA agent |

---

## 2. BE 아키텍처 (shell 범위)

### 2-1. 신규 엔드포인트

| method | path | 역할 | 권한 |
|---|---|---|---|
| POST | /accounting/tax-invoices/{id}/emit-nts | ISSUED 세금계산서 → 국세청 e-Tax 전송 | ACCOUNTANT / MASTER |

### 2-2. ETaxClient 계약

```java
// ETaxClient.java (interface)
ETaxSubmitResult submit(TaxInvoice invoice);

// ETaxSubmitResult record
String eTaxExternalId   // DRY_RUN: "DRY-{taxInvoiceNo}-{epochMilli}", NTS: 홈택스 접수번호
Instant submittedAt
String submitMethod     // "DRY_RUN" | "NTS"
boolean success
String message
```

- DRY_RUN 구현체: `ETaxClientImpl` — 즉시 성공, `eTaxExternalId = "DRY-{taxInvoiceNo}-{epochMilli}"`
- NTS 실 구현체: Phase 11 sandbox 연동 후 활성 (ENV `NTS_API_KEY` + `NTS_BASE_URL` 필요)
- IT 격리: `@MockBean ETaxClient` + `lenient().when(...)` stub 필수 (feedback_it_mockbean_external_clients.md)

### 2-3. ErrorCode 2건 (SP-09-1 신규)

| 코드 | HTTP | 상황 |
|---|---|---|
| `TAX_INVOICE_NOT_EMITTABLE` | 422 | DRAFT 또는 CANCELLED 상태에서 emit-nts 호출 |
| `TAX_INVOICE_ALREADY_EMITTED` | 409 | 이미 eTaxExternalId 가 설정된 세금계산서에 재호출 |
| `ETAX_SUBMIT_FAILED` | 502 | NTS 홈택스 외부 API 응답 오류 |

### 2-4. NtsSubmitMethod

```java
// BE enum
DRY_RUN  // 기본값 — 실 API 호출 없이 유효성 검증 + mock 응답
NTS      // 운영 .env 활성 후 홈택스 실 API 호출
```

---

## 3. FE 계약

### 3-1. taxInvoiceApi.ts 신규 함수

```typescript
// SP-09-1 신규 (C-01/C-02/L-01 cycle-1 fix 반영)
// BE @Pattern(regexp = "DRY_RUN|NTS") 와 정확 일치
export type NtsSubmitMethod = 'DRY_RUN' | 'NTS'

// BE @NotNull — submitMethod 는 필수 (생략 시 400)
export interface EmitNtsRequest {
  submitMethod: NtsSubmitMethod
}

// BE EmitNtsResponse record 5 필드 (TaxInvoiceDetail 전체가 아님)
export interface EmitNtsResponse {
  taxInvoiceNo: string
  status: TaxInvoiceStatus
  eTaxExternalId: string
  submittedAt: string  // ISO-8601 (Instant → JSON)
  submitMethod: NtsSubmitMethod
}

export async function emitTaxInvoiceToNts(
  id: string,
  submitMethod: NtsSubmitMethod = 'DRY_RUN',
): Promise<EmitNtsResponse>
// POST /accounting/tax-invoices/{id}/emit-nts
```

### 3-2. TaxInvoiceDetailPage 신규 CTA

- ISSUED 상태 + ACCOUNTANT/MASTER 역할: "NTS 발행" 버튼 노출
- 클릭 시 confirm modal (DRY_RUN 모드 안내)
- 발행 성공 시 `eTaxExternalId` 배너 표시 (UUID 비공개 — "DRY-yyyyMMdd-NNNN-..." 형식)
- MANAGER/SALES/INVENTORY: 버튼 미노출

### 3-3. UUID 비공개 준수

- 화면 노출: `taxInvoiceNo` (예: `20260518-0001`) + `eTaxExternalId` (`DRY-...` 또는 홈택스 접수번호)
- 미노출: `id` / `partnerId` / `journalId` (UUID — path param, data-attribute 전용)

---

## 4. Playwright 스펙

`clients/desktop/playwright/sp-09-1-nts-etax-emit-shell/sp-09-1-nts-etax-emit-shell.spec.ts`

TC 5건:

| TC | 제목 | 핵심 검증 |
|---|---|---|
| T1 | BE 계약 | emit-nts POST mock 응답 + ErrorCode 2건 (422/409) + @MockBean ETaxClient |
| T2 | FE 계약 | "NTS 발행" 버튼 노출 + emitTaxInvoiceToNts API + ACCOUNTANT/MASTER 권한 |
| T3 | audit | TAX_INVOICE_EMIT_NTS 감사 로그 + eTaxExternalId 저장/표시 |
| T4 | UUID 비공개 | taxInvoiceNo + eTaxExternalId 노출 / UUID 텍스트 미노출 |
| T5 | 권한 가드 | ACCOUNTANT/MASTER 허용, SALES/MANAGER/INVENTORY 403 |

실행 조건:
```bash
cd clients/desktop
VITE_MOCK_MODE=1 npx vite --port 5173
npx playwright test playwright/sp-09-1-nts-etax-emit-shell/sp-09-1-nts-etax-emit-shell.spec.ts --reporter=line
```

---

## 5. IT 구현 현황 (SP-09-1 완료)

파일: `services/accounting-service/src/test/java/.../it/TaxInvoiceEmitNtsIT.java`

```java
// @MockBean 격리 — 두 외부 client 모두 격리
@MockBean private ETaxClient eTaxClient;
@MockBean private SlipServiceClient slipServiceClient;
```

IT 시나리오 8건 (구현 완료):

| 번호 | 메서드명 | 검증 내용 |
|---|---|---|
| 1 | testEmitNtsDryRunSuccess | DRY_RUN 200 + eTaxExternalId/submitMethod/submittedAt 저장 |
| 2 | testEmitNtsForbiddenForSales | SALES 역할 403 |
| 3 | testEmitNtsForbiddenForManager | MANAGER 역할 403 (ACCOUNTANT/MASTER 만 허용) |
| 4 | testEmitDraftReturns422 | DRAFT 시도 → 422 TAX_INVOICE_NOT_EMITTABLE |
| 5 | testEmitCancelledReturns422 | CANCELLED 시도 → 422 TAX_INVOICE_NOT_EMITTABLE |
| 6 | testEmitAlreadyEmittedReturns409 | 중복 발행 → 409 TAX_INVOICE_ALREADY_EMITTED |
| 7 | testEmitAuditLogRecorded | audit 기록 후 eTaxExternalId 저장 간접 검증 |
| 8 | testEmitNtsClientFailureReturns502 | ETaxClient BusinessException → 502 ETAX_SUBMIT_FAILED |

---

## 6. 도메인 정합성 SQL

```sql
-- ISSUED 상태 중 eTaxExternalId 가 설정된 건 확인
SELECT id,
       tax_invoice_no,
       status,
       e_tax_external_id,
       issued_at
  FROM tax_invoices
 WHERE status = 'ISSUED'
   AND e_tax_external_id IS NOT NULL
   AND is_deleted = false
 ORDER BY issued_at DESC;

-- eTaxExternalId 중복 확인 (unique 제약 미적용 시 이상 탐지)
SELECT e_tax_external_id, COUNT(*) AS cnt
  FROM tax_invoices
 WHERE e_tax_external_id IS NOT NULL
   AND is_deleted = false
 GROUP BY e_tax_external_id
HAVING COUNT(*) > 1;

-- DRAFT/CANCELLED 상태에서 eTaxExternalId 이상 설정 탐지
SELECT id, status, e_tax_external_id
  FROM tax_invoices
 WHERE status IN ('DRAFT', 'CANCELLED')
   AND e_tax_external_id IS NOT NULL
   AND is_deleted = false;
```

---

## 7. PNG 위치

`docs/qa/sp-09-1-nts-etax-emit-shell/screenshots/`

| 파일 | 내용 |
|---|---|
| 01-nts-emit-before-issued.png | NTS 발행 전 (ISSUED 상태 상세) |
| 02-nts-emit-confirm-modal.png | NTS 발행 confirm modal |
| 03-nts-emitted-etax-external-id.png | NTS 발행 후 eTaxExternalId 표시 |
| 04-role-guard-sales-403.png | 권한 가드 (SALES 미노출 / 403) |

---

## 8. 권고 사항 (cycle 1 QA fix 반영)

1. shell 단계: `ETaxClientImpl` DRY_RUN 구현 완료 — 운영 배포 전까지 기본값 유지
2. `TaxInvoiceController.emitNts()` 메서드 추가 + `@PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")` 필수
3. [완료] `TaxInvoice.eTaxExternalId` DB UNIQUE INDEX 적용 — V16 Flyway `ux_tax_invoices_etax_external_id` (partial: is_deleted=false AND e_tax_external_id IS NOT NULL). H3 결함 해소.
4. Phase 11 NTS sandbox 활성 후 `submitMethod=NTS` end-to-end IT 추가 (M3 fix: `REAL` → `NTS` 표기 통일)
5. 감사 로그 `TAX_INVOICE_EMIT_NTS` action — audit-service 연동 시 체계화
6. [완료] IT case 7 audit 직접 검증 — `AccountingAuditLogRepository` 직접 조회로 H2 결함 해소

---

## 9. 회귀 영향 평가

| 구성 요소 | 변경 유무 | 회귀 위험 |
|---|---|---|
| TaxInvoiceController | emit-nts 엔드포인트 추가 (신규) + TaxInvoiceEmitService 주입 | 낮음 — 기존 엔드포인트 무관 |
| TaxInvoiceEmitService | 신규 서비스 (emit-nts 흐름 전담) | 없음 |
| TaxInvoice domain | markEmitted() 도메인 메서드 신규 추가 | 낮음 — 기존 메서드 무관 |
| ETaxClient | interface + ETaxClientImpl 신규 | 없음 |
| ETaxSubmitResult | record 신규 | 없음 |
| ErrorCode | 3건 신규 (TAX_INVOICE_NOT_EMITTABLE/TAX_INVOICE_ALREADY_EMITTED/ETAX_SUBMIT_FAILED) | 없음 — 기존 코드 무관 |
| TaxInvoiceDetailPage | "NTS 발행" 버튼 추가 (FE — 본 슬라이스 범위 외) | 낮음 — ISSUED + 권한 조건부 노출 |
| taxInvoiceApi.ts | emitTaxInvoiceToNts() 추가 (FE — 본 슬라이스 범위 외) | 없음 — 기존 함수 무관 |
| TaxInvoiceEmitNtsIT | 신규 IT 8건 (@MockBean ETaxClient 격리 완료) | 없음 |

---

## 10. 관련 링크

- BE interface: `services/accounting-service/src/main/java/.../client/ETaxClient.java`
- BE result: `services/accounting-service/src/main/java/.../client/ETaxSubmitResult.java`
- ErrorCode: `shared/common/src/main/java/.../exception/ErrorCode.java`
- FE API: `clients/desktop/src/renderer/api/taxInvoiceApi.ts`
- FE Page: `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx`
- Playwright spec: `clients/desktop/playwright/sp-09-1-nts-etax-emit-shell/sp-09-1-nts-etax-emit-shell.spec.ts`
- QA PNG: `docs/qa/sp-09-1-nts-etax-emit-shell/screenshots/`
- 전 슬라이스: `docs/dev-reports/sp-08-6-6-tax-invoice-emit.md`
