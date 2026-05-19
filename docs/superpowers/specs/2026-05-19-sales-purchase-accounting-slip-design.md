# SAS (Sales/Purchase Accounting Slip) — 출고→매출 / 입고→매입 + 홈택스 발행 자동화 디자인

> 작성일: 2026-05-19
> 작성자: PM (Claude) + 개발책임자 brainstorming
> 슬라이스 ID: SP-SAS (Sales/Purchase Accounting Slip)
> 상태: **brainstorming 진행 중** — sections §1~§N 누적 작성 중
> 후속 단계: BR-6 spec self-review → BR-8 사용자 리뷰 → writing-plans → implementation
>
> **본 spec 의 결정사항은 git tracked 의무** (사용자 명시 2026-05-19): 매 결정 후 즉시 본 문서 갱신 + commit.

---

## 0. 배경 / 동기

기존 흐름 (검증 완료):
- `slip-service` — 출고/입고 전표 (Slip, SlipType.OUTBOUND/INBOUND) + line items, state machine
- `accounting-service` — TaxInvoice (세금계산서) 도메인 + ETaxClient (NTS 홈택스 실 발행, **SP-09-1**)
- TaxInvoiceBatchService — 홈택스 일괄 업로드 양식 (.xlsx 59컬럼)

**누락된 다리** (`docs/qa/sp-09-1-nts-etax-emit-shell/claude-qa-cycle1.md:213` 인용):
> "emit-nts 엔드포인트는 slip-service 와 직접 연결되지 않는다... 'ISSUED 세금계산서 → NTS 발행' 흐름은 slip-service 의 slip 상태와 직접 연동되지 않는 설계"

→ 본 슬라이스는 **출고전표 → 매출전표(회계분개) → 세금계산서 → 홈택스 발행** 의 자동화 다리 + **입고전표 → 매입전표 → 세금계산서 수신** 대칭 패턴을 신설.

---

## 1. 핵심 결정 (D-SAS-01 ~ D-SAS-07 + VAT 추가) — 사용자 확정 2026-05-19

| # | 결정 | 근거 / 영향 |
|---|---|---|
| D-SAS-01 | **매출전표 / 매입전표 = 회계 분개 전표 (별도 도메인)** — 세금계산서와 분리. SalesAccountingSlip / PurchaseAccountingSlip 신규 엔티티 | 한국 회계 관례: 분개(차변/대변) 단위와 세금계산서 발행 단위 분리. 면세 거래도 매출/매입전표는 필요하나 세금계산서는 X |
| D-SAS-02 | **도메인 위치 = `accounting-service` 내부 신규** | cross-DB 최소, TaxInvoice 와 결합도 높음. slip-service 는 read-only 호출 대상 |
| D-SAS-03 | **트리거 = 관리자 수동** (자동 X) | 회계 정확성 우선. CONFIRMED 시 자동 생성은 검증 후 별도 슬라이스로 분리 가능 |
| D-SAS-04 | **매핑 단위 = N:M flexible — Line + Sub-amount 분할** | N 출고전표 → M 매출전표 (묶음/분할 자유). line 단위 + line 내 금액 일부 분할까지 허용 |
| D-SAS-05 | **합계 검증 = partial 허용 + 잔여 표시 + over-allocation 차단** | 출고전표 잔여 (미분할) 가시화 (UI alert/badge). 단 allocated > total 절대 차단 |
| D-SAS-06 | **세금계산서 = 매출전표 N:1 묶음 발행** (동일 거래처·동일월 기준) | 한국 일괄 발행 관례. 기존 TaxInvoiceBatchService 확장 |
| D-SAS-07 | **입고 측 100% 대칭** — PurchaseAccountingSlip + 세금계산서 수신 (NTS API 수신 또는 수동 등록) | 매출 패턴 미러 |
| **VAT** | **출고/입고전표 단가 = 부가세 포함 (VAT-inclusive)** → 매출/매입전표 변환 시 `공급가액 = 단가 / 1.1` + `부가세 = 단가 - 공급가액` 분리 | 한국 세법 요구. 면세 거래는 1.0 / 영세는 0% (D-SAS-08+ 결정 예정) |

---

## 2. Architecture Overview (디자인 §1)

```
┌──────────────────────────────────────────────────────────────┐
│  slip-service (기존, 무수정)                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Slip(OUTBOUND/INBOUND) + SlipLine                      │ │
│  │  state: DRAFT → CONFIRMED → LOCKED                     │ │
│  │  단가 = 부가세 포함 (VAT-inclusive)                     │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                   ↑ SlipServiceClient (Feign, REST)
                   │ GET /internal/slips/{id}/lines + GET /by-period
                   │ read-only contract (역방향 의존 없음)
┌──────────────────────────────────────────────────────────────┐
│  accounting-service (확장)                                    │
│                                                               │
│  [신규] SalesAccountingSlip     [신규] PurchaseAccountingSlip │
│         + Line + Allocation            + Line + Allocation   │
│         (출고전표 source 매핑)         (입고전표 source 매핑) │
│         status: DRAFT/POSTED/VOIDED                          │
│                                                               │
│  [기존] TaxInvoice ←── N:1 묶음 (동일 거래처·월)              │
│         status: DRAFT → ISSUED → EMITTED (NTS 전송)           │
│         ETaxClient → NTS 홈택스 (SP-09-1 완비)                │
│                                                               │
│  [신규] TaxInvoice 수신 분기 — 매입측                          │
│         NTS 수신 API or 관리자 수동 등록 또는 OCR (Phase 후속) │
└──────────────────────────────────────────────────────────────┘
```

**핵심**:
- accounting-service 가 slip-service 를 **read-only 호출만** (역방향 의존 없음, slip-service 무수정)
- 매출/매입 전표 = 회계 분개 + 출고/입고 line 매핑 + VAT 분리 컬럼
- 세금계산서는 매출전표를 source 로만 사용 — N:1 묶음 (기존 TaxInvoiceBatchService 확장)
- 트랜잭션 경계 = accounting_db 단일 (slip 쪽 변경 무)

---

## 3. 도메인 모델 (디자인 §2 — 승인 2026-05-19)

### 3-A. SalesAccountingSlip / PurchaseAccountingSlip (대칭)

```
SalesAccountingSlip (accounting_db 신규)
├── id UUID                            -- 내부 (사용자 비공개)
├── slip_no VARCHAR(50)                -- 사용자 노출 (예: SAS-2026-05-0001)
├── slip_date DATE                     -- 회계 일자
├── partner_id UUID                    -- 거래처
├── partner_code VARCHAR(100)          -- 거래처 코드 (denormalize)
├── partner_name VARCHAR(200)
├── total_supply_amount NUMERIC(15,2)  -- 공급가액 합 (부가세 제외)
├── total_vat_amount NUMERIC(15,2)     -- 부가세 합
├── total_amount NUMERIC(15,2)         -- = supply + vat
├── tax_type ENUM                      -- TAXABLE / EXEMPT / ZERO_RATED
├── status ENUM                        -- DRAFT / POSTED / VOIDED
├── posted_at TIMESTAMP, posted_by VARCHAR(100)
├── tax_invoice_id UUID NULL           -- 발행된 세금계산서 (N:1 묶음 시 동일 ID)
├── memo TEXT
└── BaseEntity 7 audit

SalesAccountingSlipLine
├── id UUID, slip_id UUID FK, line_no INT
├── product_code, product_name
├── qty NUMERIC(12,3), unit_price NUMERIC(15,2)   -- VAT-inclusive 단가
├── supply_amount NUMERIC(15,2)        -- = round(qty * unit_price / 1.1)
├── vat_amount NUMERIC(15,2)           -- = (qty * unit_price) - supply_amount
├── line_total NUMERIC(15,2)           -- = supply + vat
└── BaseEntity 7

SalesAccountingSlipAllocation  -- 핵심: N:M 매핑 (출고 line ↔ 매출 line)
├── id UUID
├── sales_slip_line_id UUID FK
├── source_slip_id UUID                -- slip-service 출고전표 (read-only ref)
├── source_slip_no VARCHAR(50)         -- denormalize
├── source_line_id UUID                -- 출고전표 line (read-only ref)
├── source_line_no INT                 -- denormalize
├── allocated_qty NUMERIC(12,3)        -- sub-qty 분할
├── allocated_amount NUMERIC(15,2)     -- sub-amount 분할 (VAT-inclusive)
└── BaseEntity 7
```

**Purchase 측은 100% 대칭** (source_slip = 입고전표).

### 3-B. 잔여 추적 view — slip-service 무수정

```sql
CREATE VIEW v_outbound_slip_allocation AS
SELECT
  source_slip_id, source_line_id,
  SUM(allocated_qty)    AS allocated_qty_sum,
  SUM(allocated_amount) AS allocated_amount_sum
FROM sales_accounting_slip_allocations
WHERE is_deleted = false
GROUP BY source_slip_id, source_line_id;
```

→ 역방향 의존 없음. Admin UI 에서 `GET /admin/sales-slips/outbound-allocation/{slipId}` 호출로 잔여 표시.

### 3-C. over-allocation 차단 가드 (트랜잭션 내부)

```java
BigDecimal alreadyAllocated = repo.sumAllocatedAmount(sourceLineId);
BigDecimal sourceLineTotal  = slipServiceClient.getLineTotal(sourceLineId);
if (alreadyAllocated.add(request.allocatedAmount).compareTo(sourceLineTotal) > 0) {
    throw new BusinessException(ErrorCode.SAS_OVER_ALLOCATION, ...);
}
```

### 3-D. TaxInvoice 묶음 매핑 (D-SAS-06)

```
N SalesAccountingSlip ─── 1 TaxInvoice
        (동일 partner + 동일월)
```

발행 시점:
1. 관리자가 매출전표 N장 선택 (예: 2026-05 + 거래처 X)
2. `POST /admin/tax-invoices/batch-from-sales-slips`
3. accounting-service 가 N장 합계로 TaxInvoice 1장 생성 (DRAFT)
4. N장의 `tax_invoice_id` 동일 UUID
5. 관리자 검토 → ISSUED → NTS 발행 (기존 SP-09-1)

---

## 4. 워크플로우 (디자인 §3 — 일마감 통합)

### 4-A. 매출 측 (출고 → 매출 → 일마감 → 세금계산서 → NTS)

```
[1] slip-service: 출고전표 CONFIRMED  (기존, 무수정)
        │ (VAT-inclusive 단가)
        ↓
[2] 매출전표 작성 화면 — 관리자 수동 (D-SAS-03)
    ├── 출고전표 검색 (기간/거래처/잔여 필터)
    ├── N장 묶음 또는 1장 line/sub-amount 분할 선택 (D-SAS-04)
    ├── 잔여 표시 + over-allocation 차단 (D-SAS-05)
    ├── VAT 자동 분리 (공급가액 / 부가세, D-SAS-VAT)
    └── SalesAccountingSlip DRAFT 생성
        ↓
[3] 매출전표 검토 → POSTED (회계분개 확정, 일마감 집계 source 진입)
        ↓
[4] 일마감 화면 (기존 DailyClosingPage 확장)
    ├── **마감 일자 = 하루 단위 단일 검색** (사용자 명시 2026-05-19, 월별/기간 검색 X)
    ├── 단일 date picker 만 노출 (기존 SP-08-6-5 의 일별/월별 토글 제거)
    ├── 마감 일자 선택 → 매출전표 POSTED 집계 (해당 1일치만)
    ├── 표: 매출전표번호 / 거래처명 / 공급가액 / 부가세 / 합계
    ├── 마감 실행 → DailyClosing snapshot 잠금 (기존 SP-08-6-5 패턴)
    └── 일마감 후 매출전표 수정 차단 (POSTED → VOIDED 만 허용)
        ↓
[5] 세금계산서 발행 묶음 화면 (D-SAS-06)
    ├── 동일 거래처 · 동일월 매출전표 N장 선택
    ├── POST /admin/tax-invoices/batch-from-sales-slips
    └── TaxInvoice 1장 DRAFT → 관리자 검토 → ISSUED
        ↓
[6] NTS 홈택스 전송 (기존 SP-09-1, 무수정)
    └── ETaxClient.submit(taxInvoice) → EMITTED
```

### 4-B. 매입 측 (입고 → 매입 → 일마감 → 세금계산서 수신)

```
[1] slip-service: 입고전표 CONFIRMED (기존)
        ↓
[2] 매입전표 작성 화면 — 매출 패턴과 100% 대칭 (D-SAS-07)
    ├── 입고전표 검색/묶음/분할
    └── PurchaseAccountingSlip DRAFT 생성
        ↓
[3] 매입전표 검토 → POSTED
        ↓
[4] 매입 일마감 화면 (신규 — 매출 일마감과 대칭)
    └── DailyClosing 도메인 확장 (closing_kind: SALES / PURCHASE 컬럼 추가)
        ↓
[5] 세금계산서 수신 화면 (신규)
    ├── (옵션 A) NTS 홈택스 수신 API — 공급자가 발행한 전자세금계산서 자동 수신
    ├── (옵션 B) 관리자 수동 등록 (PDF/이미지 첨부, OCR 후속)
    └── 매입전표 N장과 매칭 (allocation 패턴 미러)
        ↓
[6] 매입 분개 완료 + 부가세 신고 데이터 확보
```

### 4-C. 일마감 통합 — 기존 SP-08-6-5 확장 (사용자 명시 "GAS 참고 UI/UX")

기존 자료 활용:
- 도메인: `accounting_db.daily_closings` (SP-08-6-5 V15 migration, 기존)
- API: `GET /accounting/closings/daily?date=YYYY-MM-DD` (기존)
- UI: `clients/desktop/src/renderer/routes/DailyClosingPage.tsx` (기존)
- 디자인 mockup: `docs/qa/sp-08-6-5-accounting-daily-ledger/gen_pngs.py` 의 1280×900 패턴 — 사이드바 + 마감일자 picker + 일별/월별 토글 + 마감 목록 표 + 일별 Detail 표

**확장 (본 SAS 슬라이스)**:

| 변경 | 영향 |
|---|---|
| `DailyClosing.closingKind ENUM` 추가 (`SALES` / `PURCHASE`) | 매출/매입 일마감 분리 집계 |
| `DailyClosing.source_kind ENUM` (`TAX_INVOICE` / `SALES_SLIP` / `PURCHASE_SLIP`) | source 다양화 (기존 TaxInvoice + 신규 매출/매입전표 둘 다 지원) |
| Daily Detail 표에 매출전표번호 (SAS-2026-05-0001) + 출고전표번호 (denormalize 노출) 컬럼 추가 | 추적성 |
| Flyway V?? migration | 도메인 schema 확장 |
| `DailyClosingPage.tsx` 우측 상단 토글 추가 — 매출 / 매입 / 통합 (종류) | UI 확장 |
| **단일 date picker 유지** — 일별/월별 토글 제거 (사용자 명시: "일마감은 하루 단위로 검색") | 검색 simplify |
| 일마감 표 검증 SQL — 일마감.xlsx 양식 (사용자 추가) 의 컬럼 매핑 | QA scenarios.md |

**참조 입력**: `docs/migration/ecount-data/raw/일마감.xlsx` — 이카운트 일마감 양식, 본 슬라이스의 UI 컬럼/표 디자인 근거.

### 4-D. State machine

```
SalesAccountingSlip:
  DRAFT ─── post() ──→ POSTED ─── (DailyClosing 잠금 후) ──→ (수정 차단)
         ↘ void() ──→ VOIDED
  POSTED ─── void() ──→ VOIDED (DailyClosing 미잠금일 때만)

TaxInvoice (기존):
  DRAFT ─── issue() ──→ ISSUED ─── emitNts() ──→ EMITTED
                                          ↘ failed → ISSUED (retry)

DailyClosing (기존 + 확장):
  생성(isLocked=false) ─── lock() ──→ isLocked=true (재집계 차단)
                       ↘ unlock() ──→ isLocked=false (MASTER 만)
```

---

## 5. VAT 계산 + 면세/영세 처리 (디자인 §4)

### 5-A. 한국 세법 3 분류

| tax_type | VAT 율 | 세금계산서 | 매출전표 발행 |
|---|---|---|---|
| **TAXABLE** (과세) | 10% | 세금계산서 의무 | 분개 + VAT 분리 |
| **ZERO_RATED** (영세율) | 0% | 세금계산서 의무 (영세율 표시) | 분개, VAT=0 |
| **EXEMPT** (면세) | 없음 | 계산서 (면세계산서, 별도 양식) | 분개, VAT=0 |

### 5-B. 분리 계산 공식 (VAT-inclusive 단가 → 공급가액 + 부가세)

```java
// TAXABLE
BigDecimal lineTotal    = qty.multiply(unitPrice);             // VAT-inclusive 총액
BigDecimal supplyAmount = lineTotal.divide(BD_110, 0, FLOOR)   // 공급가액 = 총액 / 1.1 (절사)
                                   .multiply(BD_100);
BigDecimal vatAmount    = lineTotal.subtract(supplyAmount);    // 부가세 = 잔액 (round-trip 정확성)

// 또는 더 직관적:
BigDecimal supplyAmount = lineTotal.multiply(BD_100)
                                   .divide(BD_110, 0, FLOOR);  // line 단위 절사
BigDecimal vatAmount    = lineTotal.subtract(supplyAmount);

// ZERO_RATED / EXEMPT
BigDecimal supplyAmount = lineTotal;  // 전체 = 공급가액
BigDecimal vatAmount    = BigDecimal.ZERO;
```

**반올림 규칙**: `RoundingMode.FLOOR` (절사) — 한국 회계 관례 (사용자 세부 결정 가능).

### 5-C. tax_type 결정 — 거래처 기본값 + 매출전표 override

```
1. 매출전표 작성 시 default = Partner.taxType (거래처 도메인 기본값)
2. 관리자가 매출전표 헤더 level 에서 override 가능 (drop-down)
3. 매출전표 1장 = 단일 tax_type (line 단위 다른 tax_type 금지)
   — 회계 단순성 우선. 혼합 거래는 매출전표 2장 분리 발행
```

**Partner 도메인 확장** (Phase 12+ MIG-2 결정 의존):
- `Partner.taxType ENUM` 신규 컬럼 (default TAXABLE)
- MIG-2 거래처 import 시 이카운트 export 의 "사업자유형" 매핑

본 SAS 슬라이스는 Partner.taxType 컬럼이 없을 경우 매출전표 작성 시 매번 관리자 입력 (default TAXABLE).

### 5-D. 검증 SQL

```sql
-- (1) 매출전표 합계 = supply + vat 무결성
SELECT id, slip_no FROM sales_accounting_slips
WHERE is_deleted=false
  AND total_amount <> total_supply_amount + total_vat_amount;
-- 기대: 0건

-- (2) Allocation 합계 = 매출전표 line_total 무결성
SELECT sl.id, sl.line_no FROM sales_accounting_slip_lines sl
WHERE EXISTS (
  SELECT 1 FROM sales_accounting_slip_allocations a
  WHERE a.sales_slip_line_id = sl.id
  GROUP BY a.sales_slip_line_id
  HAVING SUM(a.allocated_amount) <> sl.line_total
);
-- 기대: 0건

-- (3) tax_type 별 분포
SELECT tax_type, COUNT(*), SUM(total_amount)
FROM sales_accounting_slips WHERE is_deleted=false
GROUP BY tax_type;
```

### 5-E. 부가세 신고 데이터 (Phase 후속)

매출전표 + 매입전표 의 tax_type / supply_amount / vat_amount 컬럼으로 부가세 신고 양식 (월·분기) 자동 산출 가능 — 별도 슬라이스 SP-SAS-VAT-REPORT 후속.

---

## 6. 에러 처리 + Audit (디자인 §5)

### 6-A. ErrorCode 신규

| 코드 | HTTP | 상황 |
|---|---|---|
| `SAS_SOURCE_SLIP_NOT_FOUND` | 404 | 출고/입고전표 UUID 없음 |
| `SAS_SOURCE_SLIP_NOT_CONFIRMED` | 422 | 출고/입고전표가 CONFIRMED 상태 아님 |
| `SAS_OVER_ALLOCATION` | 422 | 할당 합계가 출고/입고 line 잔여 초과 |
| `SAS_LINE_AMOUNT_MISMATCH` | 422 | 매출/매입전표 line 의 supply+vat ≠ line_total |
| `SAS_TAX_TYPE_MIXED` | 422 | 단일 매출/매입전표에 line 단위 다른 tax_type 시도 |
| `SAS_ALREADY_POSTED` | 409 | 이미 POSTED 매출/매입전표 수정 시도 |
| `SAS_DAILY_CLOSING_LOCKED` | 409 | 해당 일자 DailyClosing 이미 잠긴 상태에서 매출/매입전표 수정 시도 |
| `SAS_TAX_INVOICE_ALREADY_LINKED` | 409 | 이미 TaxInvoice 와 매핑된 매출전표 재발행 시도 |
| `SAS_PARTNER_MONTH_MISMATCH` | 422 | N:1 묶음 시 거래처 또는 월이 다른 매출전표 포함 |

### 6-B. Audit log

`accounting_audit_logs` 테이블 (기존) 에 SAS 관련 action 추가:

| action | 컨텍스트 |
|---|---|
| `SAS_SALES_SLIP_CREATE` | 매출전표 DRAFT 생성 — source 출고전표 UUID 목록 + allocation snapshot |
| `SAS_SALES_SLIP_POST` | POSTED 전이 |
| `SAS_SALES_SLIP_VOID` | VOIDED — DailyClosing 잠금 여부 검증 |
| `SAS_PURCHASE_SLIP_*` | 매입 대칭 |
| `SAS_TAX_INVOICE_BATCH_CREATE` | N:1 묶음 발행 — 매출전표 UUID 목록 |

actor 정보 = `X-User-Id` + `X-User-Role` 헤더 (기존 패턴). UUID raw 노출 금지 — 사용자 노출은 `slip_no` / `tax_invoice_no`.

### 6-C. 트랜잭션 경계

- 매출/매입전표 생성·수정·POST = 단일 DB 트랜잭션 (accounting_db)
- slip-service 호출은 read-only (조회만, 외부 client failure 시 fail-fast)
- TaxInvoice 묶음 발행 = REQUIRES_NEW 격리 (audit 트랜잭션 독립, 기존 SP-09-1 패턴 유지)
- DailyClosing 잠금 + 매출/매입전표 수정 차단 = DB-level CHECK constraint 또는 application-level 가드

### 6-D. 회귀 가드

- 기존 TaxInvoice 흐름 무변경 — 본 슬라이스가 신규 매출전표 → TaxInvoice 매핑만 추가, 기존 수동 TaxInvoice 등록 path 보존
- 기존 DailyClosing snapshot 잠금 메커니즘 무변경 — sourceKind 컬럼만 추가
- 기존 ETaxClient 무변경 (SP-09-1 NTS 발행 path)
- slip-service 무변경 (read-only client 호출만)

---

## 7. Admin UI (디자인 §6) + 기존 코드 개정 항목

### 7-A. 메뉴 구조 (회계 사이드바 전체 통합) — 사용자 명시 2026-05-19

기존 legacy GAS 회계 메뉴 (PR #118 "GAS B 회계 4건" 이식 + 후속 확장) + 본 SAS 신규 4건 모두 포함.

PageCode 기준 회계 카테고리 전체:

| 분류 | 메뉴 | 라우트 | PageCode | 출처 |
|---|---|---|---|---|
| **전표 (신규 SAS)** | 매출전표 | `/accounting/sales-slips` | `accounting.sales-slip.list` ⚡신규 | 본 슬라이스 |
| | 매입전표 | `/accounting/purchase-slips` | `accounting.purchase-slip.list` ⚡신규 | 본 슬라이스 |
| **세금계산서** | 세금계산서 목록 | `/accounting/tax-invoices` | `accounting.tax-invoice.list` | 기존 (SP-09 시리즈) |
| | 세금계산서 발행 묶음 | `/accounting/tax-invoices/batch` | `accounting.tax-invoice.batch-issue` ⚡신규 | 본 슬라이스 |
| | 세금계산서 수신 | `/accounting/tax-invoices/inbound` | `accounting.tax-invoice.inbound` ⚡신규 | 본 슬라이스 |
| | NTS 발행 | (action) | `accounting.tax-invoice.emit-nts` | 기존 (SP-09-1) |
| **마감** | 일마감 ⚠개정 | `/accounting/daily-closing` | `accounting.daily-closing` | 기존 (SP-08-6-5) — §7-G 개정 |
| | 월말 마감 | `/accounting/period-close` | `accounting.period-close` | 기존 |
| **원장/조회** | 원장 | `/accounting/general-ledger` | `accounting.general-ledger` | 기존 (PR #118) |
| | 거래처 원장 | `/accounting/partner-ledger` | `accounting.partner-ledger` | 기존 |
| | 분개장 | `/accounting/journals` | `accounting.journals` | 기존 |
| | 시산표 | `/accounting/balances` | `accounting.balances` | 기존 |
| **기준정보** | 계정과목 | `/accounting/accounts` | `accounting.accounts` | 기존 |
| **출력/거래** | 거래명세서 일괄 | `/accounting/statements/batch` | `accounting.statement-batch` | 기존 (PR #118) |
| | 입금 매칭 | `/accounting/deposit-match` | `accounting.deposit-match` | 기존 |
| **보고서** | 재무 보고서 | `/accounting/reports` | `accounting.reports` | 기존 |

### 7-A-1. 사이드바 트리 구조 (Electron `AppLayout` 또는 sidebar 컴포넌트)

```
회계 (ACCOUNTANT / MASTER)
├── 전표
│   ├── 매출전표              ⚡신규
│   └── 매입전표              ⚡신규
├── 세금계산서
│   ├── 목록 (기존)
│   ├── 발행 묶음            ⚡신규  ← 매출전표 N장 → TaxInvoice 1장
│   └── 수신                ⚡신규  ← NTS API 또는 수동 등록
├── 마감
│   ├── 일마감 ⚠ 개정         ← DailyClosingPage 확장 (sourceKind/closingKind, 하루 단위)
│   └── 월말 마감 (기존)
├── 원장/조회
│   ├── 원장 (총계정원장)
│   ├── 거래처 원장
│   ├── 분개장
│   └── 시산표
├── 기준정보
│   └── 계정과목
├── 출력/거래
│   ├── 거래명세서 일괄 (PR #118 이식)
│   └── 입금 매칭
└── 보고서
    └── 재무 보고서 (B/S, P/L, 자금일보 등)
```

### 7-A-2. PageCode 신규 등록 (auth-service 의무)

본 슬라이스 BE 작업 시 `services/auth-service/.../PageCode.java` 에 4건 추가:

```java
ACCOUNTING_SALES_SLIP_LIST("accounting.sales-slip.list", "매출전표"),
ACCOUNTING_PURCHASE_SLIP_LIST("accounting.purchase-slip.list", "매입전표"),
ACCOUNTING_TAX_INVOICE_BATCH_ISSUE("accounting.tax-invoice.batch-issue", "세금계산서 발행 묶음"),
ACCOUNTING_TAX_INVOICE_INBOUND("accounting.tax-invoice.inbound", "세금계산서 수신"),
```

신규 Flyway migration (auth-service) — `role_page_permissions` 시드 row 추가:
- ACCOUNTANT/MASTER → view+edit
- SALES → view (매출전표만 자기 거래처)
- DISPATCH → 차단

### 7-A-3. 회귀 가드

- 기존 회계 메뉴 13건 모두 **표시 + 라우트 + 권한 무변경**
- 신규 4건은 추가만 (기존 권한 시드에 영향 X)
- legacy GAS B 회계 4건 (PR #118 원장/거래명세서/계산서/일마감) 흐름 100% 보존

### 7-B. 매출전표 작성 페이지 (`/accounting/sales-slips/new`)

```
┌──────────────────────────────────────────────────────────────┐
│  매출전표 작성  (ACCOUNTANT / MASTER)                          │
├──────────────────────────────────────────────────────────────┤
│  [헤더]                                                       │
│  거래처: [검색▼] (주)한국공조 (P-2026-0001)                    │
│  슬립일자: [2026-05-19 ▼]  과세구분: [● 과세 ○ 영세 ○ 면세]    │
│  메모: [_____________________________________________]        │
├──────────────────────────────────────────────────────────────┤
│  [출고전표 선택]  잔여 미할당 출고전표만 표시 / 동일거래처 필터  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ □ 출고번호      일자        품목        수량   잔여금액 │  │
│  │ ☑ OUT-...0042  2026-05-15  RX다배관    10     1,650,000 │  │
│  │ ☑ OUT-...0043  2026-05-18  RX다배관    5      825,000   │  │
│  │ ☐ OUT-...0044  2026-05-19  ...        ...    ...        │  │
│  └────────────────────────────────────────────────────────┘  │
│  [선택 line 추가 →]   [전체 추가 (1:1) →]                       │
├──────────────────────────────────────────────────────────────┤
│  [매출전표 lines]                                              │
│  │ #  품목       수량  단가(VAT포함)  공급가액   부가세  합계  │
│  │ 1  RX다배관   10    150,000       1,363,636  136,364 1,500K│
│  │ 2  RX다배관   3     150,000       409,091    40,909  450K │  ← 출고 line 일부 분할
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│  │ 합계                              1,772,727  177,273 1,950K│
├──────────────────────────────────────────────────────────────┤
│  [⚠ 잔여]  OUT-...0043 line#1 잔여 375,000 (allocation 미완)   │
│  [임시저장 (DRAFT)]  [확정 (POSTED)]   [취소]                  │
└──────────────────────────────────────────────────────────────┘
```

**핵심 UX**:
- VAT-inclusive 단가 입력 → 공급가액/부가세 실시간 자동 분리 표시
- 출고전표 선택 시 잔여만 표시 + 분할 슬라이더 (sub-amount 분할 시)
- over-allocation = 행 빨간 알림 + 확정 버튼 비활성
- 임시저장 / 확정 분리 (DRAFT 는 수정 자유)

### 7-C. 매출전표 목록 페이지 (`/accounting/sales-slips`)

표 컬럼: `매출전표번호 / 일자 / 거래처 / 과세구분 / 공급가액 / 부가세 / 합계 / 상태 / 세금계산서번호 / 작업`

필터: 기간 / 거래처 / 상태 (DRAFT / POSTED / VOIDED) / 과세구분 / 세금계산서 발행 여부

행 액션: 상세 / 수정 (DRAFT 만) / 확정 / 취소 / 세금계산서 발행 묶음 추가

### 7-D. 매입전표 페이지 — 매출 100% 대칭 (`/accounting/purchase-slips`)

매출 패턴 동일, source = 입고전표.

### 7-E. 세금계산서 발행 묶음 페이지 (`/accounting/tax-invoices/batch`)

```
[1단계] 매출전표 N장 선택
  ├── 필터: 거래처 + 발행월
  ├── 표: 매출전표번호 / 일자 / 거래처 / 공급가액 / 부가세 / 합계 / 발행여부
  ├── ☑ 다중 선택 (체크박스)
  └── [선택 N장 → 세금계산서 1장 생성]
[2단계] 묶음 미리보기
  ├── 거래처 동일성 검증 (PARTNER_MONTH_MISMATCH 가드)
  ├── 월 동일성 검증
  ├── 합계 표시
  └── [DRAFT 생성]
[3단계] TaxInvoice DRAFT → ISSUED → NTS 발행 (기존 TaxInvoiceController 흐름)
```

### 7-F. 세금계산서 수신 페이지 (`/accounting/tax-invoices/inbound`)

옵션 A (NTS 수신 API) 또는 옵션 B (수동 등록, PDF/이미지 첨부 → OCR 후속).

매입전표와 매칭 화면 (allocation 패턴 미러).

### 7-G. 일마감 페이지 ⚠ **기존 코드 개정 의무**

기존: `clients/desktop/src/renderer/routes/DailyClosingPage.tsx` (SP-08-6-5, source=TaxInvoice ISSUED)

**개정 항목 (사용자 명시 2026-05-19 "기존 코드 개정 필요")**:

#### BE 개정 (accounting-service)

| 파일 | 개정 내역 |
|---|---|
| `domain/DailyClosing.java` | `closingKind` ENUM (SALES/PURCHASE) + `sourceKind` ENUM (TAX_INVOICE/SALES_SLIP/PURCHASE_SLIP) 필드 신규. `create()` overload 추가. 기존 메서드 시그니처는 backward-compat 으로 deprecated 표시 |
| `service/DailyClosingService.java` | source_kind 분기 — SALES_SLIP/PURCHASE_SLIP 인 경우 신규 SalesAccountingSlipRepository / PurchaseAccountingSlipRepository 집계. TAX_INVOICE 는 기존 TaxInvoiceRepository 유지 (backward-compat) |
| `web/dto/CreateDailyClosingRequest.java` | `closingKind` + `sourceKind` 필드 추가 (default SALES + TAX_INVOICE for backward-compat) |
| `web/dto/DailyClosingResponse.java` | Daily Detail 표 컬럼 추가 — `salesSlipNo` / `sourceSlipNo` (매출전표·출고전표 번호 노출) |
| `web/DailyClosingController.java` | `?kind=SALES&sourceKind=SALES_SLIP&date=YYYY-MM-DD` query param 분기. 기존 path 무변경 (default = SALES+TAX_INVOICE) |
| 신규 Flyway migration (V??) | `daily_closings.closing_kind` + `source_kind` 컬럼 추가, 기존 row backward fill (SALES + TAX_INVOICE) |
| `repository/DailyClosingRepository.java` | `findByClosingDateAndPartnerIdAndClosingKindAndSourceKind` 신규 메서드 |

#### FE 개정 (clients/desktop)

| 파일 | 개정 내역 |
|---|---|
| `routes/DailyClosingPage.tsx` | **일별/월별 토글 제거** (사용자 명시 "하루 단위 검색"). 단일 date picker 만 노출. 매출/매입/통합 종류 토글 신규 추가 |
| 동일 페이지 Daily Detail 표 | `taxInvoiceNo` (기존) + `salesSlipNo` / `sourceSlipNo` (신규) 컬럼 추가 |
| `api/accountingApi.ts` (또는 동등) | `getDailyClosingDaily(date, kind, sourceKind)` 시그니처 확장 |
| 기존 SP-08-6-5 mockup PNG (`docs/qa/sp-08-6-5-...`) | 본 슬라이스 신규 mockup PNG 으로 superseded (sourceKind 토글 + 새 컬럼 반영) |

#### 회귀 가드

- 기존 SP-08-6-5 단위/IT 테스트 — `closingKind=SALES` + `sourceKind=TAX_INVOICE` default 로 통과 보장
- 기존 `DailyClosingResponse` 소비자 (다른 화면/리포트) — 신규 필드는 nullable, 기존 필드 무변경
- legacy GAS 12번 일마감 흐름 호환 (TaxInvoice ISSUED 집계 경로 유지)

### 7-H. 공통 UX 가드

- UUID 비공개: 모든 화면에서 partnerCode / slipNo / taxInvoiceNo 만 노출, UUID raw X
- 권한: 매출/매입전표 = ACCOUNTANT/MASTER. 세금계산서 발행 묶음 = MASTER only (대량 발행 위험)
- 일마감 잠금 시 매출전표 수정 차단 (UI 비활성 + BE 가드 SAS_DAILY_CLOSING_LOCKED)

---

## 8. 테스트 전략 (디자인 §7)

### 8-A. 단위 테스트 (Mockito, 격리)

**accounting-service 신규**:
- `SalesAccountingSlipServiceTest` — DRAFT 생성 / POSTED 전이 / VOIDED / over-allocation 가드 / VAT 분리 정확성 (TAXABLE / ZERO_RATED / EXEMPT)
- `PurchaseAccountingSlipServiceTest` — 매출 대칭
- `SalesAccountingSlipAllocationTest` — N:M 매핑, sub-amount 분할, 잔여 view 집계
- `VatCalculatorTest` — `RoundingMode.FLOOR` 절사 정확성 + line 합계 검증 + 면세/영세 분기
- `TaxInvoiceBatchFromSalesSlipsServiceTest` — N:1 묶음 (거래처/월 동일성 가드)
- `DailyClosingServiceTest` (개정) — `sourceKind` 분기 (TAX_INVOICE / SALES_SLIP / PURCHASE_SLIP) + 기존 케이스 backward-compat 유지

**slip-service 신규**: 무변경 (read-only client 호출만)

### 8-B. IT 테스트 (Testcontainers Postgres + Spring Boot)

- `SalesAccountingSlipControllerIT` — POST /admin/sales-slips (multipart 또는 JSON), Flyway V?? 적용 후 schema 검증, 잔여 view query 동작
- `PurchaseAccountingSlipControllerIT` — 대칭
- `TaxInvoiceBatchFromSalesSlipsIT` — 매출전표 5장 → TaxInvoice 1장 시나리오, NTS DRY_RUN 발행까지 풀 흐름
- `DailyClosingIT` (개정) — `?kind=SALES&sourceKind=SALES_SLIP&date=...` 분기 + 기존 default (TAX_INVOICE) 통과
- 외부 client (`SlipServiceClient`, `PartnerLookupClient`) 는 `@MockBean` 격리 ([feedback_it_mockbean_external_clients])

### 8-C. QA 시나리오 (`docs/qa/sp-sas/scenarios.md`)

| # | 시나리오 |
|---|---|
| S1 | 출고전표 1장 (line 2개) → 매출전표 1장 (1:1 묶음) — VAT 자동 분리 |
| S2 | 출고전표 3장 → 매출전표 1장 (N:1 묶음) — 동일 거래처 가드 |
| S3 | 출고전표 1장 → 매출전표 2장 (1:N 분할, line 단위) — 잔여 표시 |
| S4 | 출고전표 1장 → 매출전표 2장 (1:N 분할, sub-amount) — 잔여 표시 |
| S5 | over-allocation 시도 → SAS_OVER_ALLOCATION 422 |
| S6 | tax_type mixed (line 단위 다른 과세) 시도 → SAS_TAX_TYPE_MIXED 422 |
| S7 | 매출전표 N:1 → TaxInvoice 1장 → ISSUED → NTS DRY_RUN |
| S8 | DailyClosing 잠금 후 매출전표 수정 시도 → SAS_DAILY_CLOSING_LOCKED 409 |
| S9 | 면세 거래처 매출전표 → VAT=0 + 면세계산서 분기 |
| S10 | 영세율 매출전표 → VAT=0 + 세금계산서 (영세율 표시) |
| S11 | 매입전표 (입고 → 매입) 100% 대칭 |
| S12 | 일마감 sourceKind=SALES_SLIP 집계 + Daily Detail 표 매출전표번호 노출 |
| S13 | 일마감 잠금 후 unlock (MASTER 만) — 기존 SP-08-6-5 가드 회귀 |
| S14 | 회귀: 기존 DailyClosing TAX_INVOICE 집계 default 흐름 PASS |
| S15 | 회귀: 기존 TaxInvoice NTS 발행 (SP-09-1) 무변경 PASS |

각 시나리오 화면 mockup PNG 또는 실제 캡처 (`docs/qa/sp-sas/screenshots/`) — [feedback_pr_qa_screenshots] 의무.

### 8-D. 회귀 회로

| 영역 | 회귀 보장 방법 |
|---|---|
| 기존 SP-08-6-5 일마감 흐름 | default `sourceKind=TAX_INVOICE` + backward-compat 단위/IT 통과 |
| 기존 SP-09-1 NTS 발행 | ETaxClient 무변경 + 기존 TaxInvoiceEmitService IT 통과 |
| slip-service 무변경 | accounting-service 가 read-only client 만 호출, slip 도메인/repo 무수정 |
| 기존 회계 메뉴 13건 | PageCode 추가만 (기존 row/시드 무변경), role_page_permissions 신규 4건만 INSERT |
| Partner 도메인 호환 | `Partner.taxType` 컬럼은 본 슬라이스에서 optional (없으면 매출전표 작성 시 매번 입력) |

### 8-E. 사전 컴파일 + Docker IT (PM 통합 가드 의무, [feedback_pm_integration_build_check])

- BE 작업 완료 후 PM 사전 검증: `.\gradlew.bat :services:accounting-service:test :services:auth-service:test` BUILD SUCCESSFUL
- Docker postgres IT: samhan-postgres 컨테이너에서 V?? migration + 실 매출전표 생성/POSTED/일마감 잠금 end-to-end 검증 (사용자 명시 "실서버 테스트 Docker 사용")
- FE typecheck: `cd clients/desktop && npm run typecheck` partnerApi/accountingApi 정합 확인
- legacy GAS 회계 메뉴 13건 회귀 검증: `playwright test --grep accounting` 기존 패턴 통과

---

## 9. 슬라이스 분해 (writing-plans 단계 입력)

전체 spec → implementation plan 단계에서 N개 슬라이스 분해 예정 (각 슬라이스는 [feedback_dual_5agent_review] cycle 1 진행):

- **SP-SAS-1** — SalesAccountingSlip 도메인 + 매출 흐름 (출고→매출, allocation, VAT)
- **SP-SAS-2** — PurchaseAccountingSlip 도메인 + 매입 흐름 (입고→매입)
- **SP-SAS-3** — 매출전표 N:1 묶음 → TaxInvoice 발행 (기존 TaxInvoiceBatchService 확장)
- **SP-SAS-4** — TaxInvoice 수신/등록 + 매입전표 매칭
- **SP-SAS-5** — Admin UI (4 페이지: 매출전표 / 매입전표 / 세금계산서 발행 / 세금계산서 수신)

---

## 10. 후속 메모리 / 핸드오프 갱신 의무

- `migration/decisions/DECISIONS.md` — `D-SAS-00 ~ D-SAS-NN` entry 추가
- `docs/handoff/CURRENT-WORK.md` — 최상단 §A 본 슬라이스 갱신
- `.claude/memory/MEMORY.md` — 본 슬라이스 메모리 entry (`project_sales_purchase_accounting_slip.md`) 추가 검토
- `services/accounting-service/README.md` — 신규 도메인 + endpoint 갱신 (구현 후)
- `clients/desktop/src/renderer/...README.md` — 관련 UI 페이지 갱신 (구현 후)

[feedback_continuous_docs_sync] 준수 — 별도 docs PR 금지, 본 슬라이스 구현 PR 에 일괄 포함.
