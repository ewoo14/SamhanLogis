# MIG-9 Cash → Journal 자동 생성 + Partner aging snapshot view — 설계 (Design Spec)

> 작성일: 2026-05-20
> branch: `spec/2026-05-20-mig-9-cash-journal-aging`
> 입력: MIG-7 (PR #275) 머지 도메인
> - `cash_disbursements` (지출 트랜잭션) → Journal (지출/현금 분개) + Partner aging 갱신
> - `cash_receipts` (회수 트랜잭션) → Journal (현금/매출채권 분개) + Partner aging 갱신

---

## 1. 개요

MIG-8 ([PR #276, `b62c6cb8`](https://github.com/.../pull/276)) 머지 직후 진입. **D-MIG-7-04 옵션 C 이연 처리**: CashDisbursement/CashReceipt → Journal 자동 생성 + partner_aging_snapshot view 신규.

- baseline: MIG-1~8 모두 머지 완료
- 9회차 워크플로우 ([feedback_dual_5agent_review])

---

## 2. 사용자 확정 결정 (2026-05-20)

- **MIG-7 이연 처리 + Partner aging snapshot view** (사용자 명시 "진행")
- **PM 자동시작** (자율 진행, brainstorming HARD-GATE skip)
- Employee cross-link (D-MIG-8-05) 는 MIG-10+ 이연

---

## 3. 산출 예정 (35~45 file, 약 2.5~3K LOC)

| 영역 | Flyway | 신규 |
|---|---|---|
| accounting-service | V29 | partner_aging_snapshot MATERIALIZED VIEW + JournalSourceType.CASH_DISBURSEMENT / CASH_RECEIPT 추가 + Mig9CashJournalService + 2 controller |
| auth-service | V22 | PageCode MIG9 2종 + role_page_permissions |
| shared/common | — | ErrorCode MIG9 5종 + EcountMig9JournalResult DTO |

---

## 4. 변환 흐름

```
MIG-7 도메인 (이미 변환):
   ├─ cash_disbursements (journal_id NULL)
   └─ cash_receipts (journal_id NULL)
       ↓ Mig9CashJournalService.generateJournals() — REQUIRES_NEW + advisory lock
       ↓ 각 cash row 별 Journal 자동 생성
도메인:
   ├─ Journal (sourceType=CASH_DISBURSEMENT 또는 CASH_RECEIPT, status=POSTED)
   └─ JournalLine 2건 (차/대 균형)
       ↓ cash_disbursements.journal_id / cash_receipts.journal_id 갱신
       ↓ partner_aging_snapshot MATERIALIZED VIEW REFRESH (자동)
```

---

## 5. Journal 자동 생성 매핑

### 5.1 CashDisbursement → Journal (지출 분개)

```
Journal:
  journal_no   = `J-` + CashDisbursement.slip_no
  journal_date = CashDisbursement.transaction_date
  source_type  = CASH_DISBURSEMENT
  source_ref   = CashDisbursement.external_ref
  status       = POSTED

JournalLine 2건:
  1) 차변 (Debit):  지출 계정 (default: '지급수수료' 또는 운영 결정 chart_account_id) / amount
  2) 대변 (Credit): 현금/예금 (default: '보통예금' chart_account_id) / amount
  partner_id = CashDisbursement.partner_id
  description = CashDisbursement.memo
```

기본 ChartOfAccount 매핑은 **운영 설정** (env 또는 seed config) — 본 슬라이스는 default code (지출=`지급수수료`, 현금=`보통예금`) 으로 시작, 운영자가 추후 수동 정정 가능.

### 5.2 CashReceipt → Journal (회수 분개)

```
Journal:
  journal_no   = `J-` + CashReceipt.slip_no
  journal_date = CashReceipt.transaction_date
  source_type  = CASH_RECEIPT
  source_ref   = CashReceipt.external_ref
  status       = POSTED

JournalLine 2건:
  1) 차변 (Debit):  현금/예금 (default: '보통예금') / amount
  2) 대변 (Credit): 매출채권 (default: '외상매출금') / amount
  partner_id = CashReceipt.partner_id
  description = CashReceipt.memo
```

### 5.3 ChartOfAccount default lookup

- `staging.ecount_account_map.ecount_name` 기준으로 'default 지출 계정' / 'default 현금 계정' / 'default 매출채권 계정' 코드 매핑
- 4 default chart code 가 lookup 시점에 ChartOfAccount 에 존재해야 함 (MIG-2 + 회계 seed 의무)
- lookup miss → `MIG9_DEFAULT_ACCOUNT_MISSING` reject sample

---

## 6. partner_aging_snapshot MATERIALIZED VIEW

```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS partner_aging_snapshot AS
SELECT
    p.id as partner_id,
    p.name as partner_name,
    COALESCE(SUM(CASE WHEN jl.debit_amount > 0 AND jl.account_code IN ('외상매출금', ...) THEN jl.debit_amount ELSE 0 END), 0) as total_receivable,
    COALESCE(SUM(CASE WHEN jl.credit_amount > 0 AND jl.account_code IN ('외상매입금', ...) THEN jl.credit_amount ELSE 0 END), 0) as total_payable,
    COALESCE(SUM(CASE WHEN jl.debit_amount > 0 AND jl.account_code IN ('보통예금', '현금') THEN jl.debit_amount ELSE 0 END), 0) as total_receipt,
    COALESCE(SUM(CASE WHEN jl.credit_amount > 0 AND jl.account_code IN ('보통예금', '현금') THEN jl.credit_amount ELSE 0 END), 0) as total_disbursement,
    NOW() as last_refreshed_at
FROM partners p
LEFT JOIN journal_lines jl ON jl.partner_id = p.id AND jl.is_deleted = FALSE
LEFT JOIN journals j ON jl.journal_id = j.id AND j.is_deleted = FALSE AND j.status = 'POSTED'
WHERE p.is_deleted = FALSE
GROUP BY p.id, p.name;

CREATE UNIQUE INDEX idx_partner_aging_snapshot_partner_id ON partner_aging_snapshot (partner_id);
```

- MIG-9 Journal 생성 후 `REFRESH MATERIALIZED VIEW CONCURRENTLY partner_aging_snapshot`
- 운영자 조회 endpoint: `GET /admin/accounting/partner-aging-snapshot` (옵션, 본 슬라이스는 view 생성만, 화면은 MIG-10+ 후속)
- `total_receivable` / `total_payable` / `total_receipt` / `total_disbursement` 는 spec §6 기준 increase-only 누계로 정의한다. net 잔액(`debit - credit` / `credit - debit`) 산출 view 보정은 MIG-10+ 후속 슬라이스에서 처리한다.

---

## 7. 멱등 키 / 트랜잭션 / 동시성

- Journal 멱등 키: `source_type + source_ref` UNIQUE 추가 (V29 ALTER journals)
- CashDisbursement/CashReceipt 의 journal_id NOT NULL 보장 (Journal 생성 후 즉시 갱신)
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` Mig9CashJournalService
- `pg_advisory_xact_lock(NAMESPACE_CASH_JOURNAL_UUID)` 1 namespace
- 이미 journal_id 가 set 된 cash row 는 skip (멱등)
- `REFRESH MATERIALIZED VIEW CONCURRENTLY partner_aging_snapshot` 별도 트랜잭션 (트랜잭션 외 실행 의무)
- row-level reject 흡수

---

## 8. 사용자 검증 가드

- UUID 비공개 (응답 DTO journal_no/source_ref/partner_name 만)
- 한국어 commit/PR/Javadoc 의무
- BaseEntity 7 audit + @SQLRestriction
- ROLE_MASTER + ROLE_MANAGER 만
- row-level reject + DuplicateKeyException catch

---

## 9. ErrorCode 신규

- `MIG9_CASH_ROW_NOT_FOUND` — generate 대상 CashDisbursement/Receipt 미존재
- `MIG9_DEFAULT_ACCOUNT_MISSING` — 기본 ChartOfAccount code 미존재 (운영 seed 의무)
- `MIG9_JOURNAL_DUPLICATE` — source_type+source_ref 중복 (race window)
- `MIG9_AGING_REFRESH_FAILED` — MATERIALIZED VIEW refresh 실패
- `MIG9_CASH_AMOUNT_INVALID` — cash row amount drift

---

## 10. 결정 (D-MIG-9-XX)

- D-MIG-9-01 CashDisbursement/Receipt → Journal 1:1 자동 생성 (각 cash 1개당 Journal 1 + JournalLine 2)
- D-MIG-9-02 JournalSourceType enum 확장 (CASH_DISBURSEMENT, CASH_RECEIPT)
- D-MIG-9-03 journal_no = `J-` + cash slip_no (Journal 자체 number sequence 사용 X — cash_disbursement 1:1 매핑)
- D-MIG-9-04 기본 ChartOfAccount lookup (지출=지급수수료 / 현금=보통예금 / 매출채권=외상매출금) — 미존재 시 `MIG9_DEFAULT_ACCOUNT_MISSING` reject
- D-MIG-9-05 partner_aging_snapshot MATERIALIZED VIEW (`REFRESH CONCURRENTLY` 별도 트랜잭션)
- D-MIG-9-06 journals (source_type, source_ref) UNIQUE INDEX 추가 (V29 ALTER)
- D-MIG-9-07 멱등: journal_id 가 set 된 cash row 는 skip
- D-MIG-9-08 admin UI 미구현 (snapshot 화면은 MIG-10+ 후속)
- D-MIG-9-09 PageCode MIG9 2종 (auth V22)
- D-MIG-9-10 ErrorCode MIG9 5종
- D-MIG-9-11 PM 자동시작
- D-MIG-9-12 Mig9CashJournalService 단위 테스트 9~11 cases
- D-MIG-9-13 5 IT × 2 endpoint = 10 IT parameterized
- D-MIG-9-14 Employee cross-link (D-MIG-8-05) 는 본 슬라이스 범위 외, MIG-10+ 이연

---

## 11. samhan-public-overview.html 동기화

- nav-badge `Phase 10.6 · MIG-9 진행 중` → 머지 시 `Phase 10.6 · MIG-10 진행 예정`
- Phase 10.6 row sub-task `MIG-1~8 + MIG-9 #N`
- callout 누적

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 진행
