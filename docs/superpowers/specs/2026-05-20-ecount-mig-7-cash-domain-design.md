# MIG-7 Cash 도메인 신규 + MIG-5 staging 변환 — 설계 (Design Spec)

> 작성일: 2026-05-20
> branch: `spec/2026-05-20-mig-7-cash-domain`
> PR 예정: 단일 통합 PR
> 입력: MIG-5 (PR #273) 머지 staging 2표
> - `staging.ecount_expense_voucher_raw` (지출결의서) → CashDisbursement 도메인 변환
> - `staging.ecount_deposit_report_raw` (입금보고서) → CashReceipt 도메인 변환

---

## 1. 개요

MIG-6 ([PR #274, `5c15db2b`](https://github.com/.../pull/274)) 머지 직후 진입. MIG-5 staging-only 패턴을 **Cash 도메인 (CashDisbursement / CashReceipt) 신규 + 변환** 으로 완성한다. Partner aging snapshot 갱신 + Journal 연계는 D-MIG-7-04 옵션 C에 따라 MIG-8 후속 슬라이스로 이연한다.

- baseline: MIG-1~6 (PR #262/#270/#271/#272/#273/#274) 모두 머지 완료
- 9회차 워크플로우 ([feedback_dual_5agent_review])

---

## 2. 사용자 확정 결정 (2026-05-20)

- **CashDisbursement + CashReceipt 도메인 신규 + MIG-5 staging 변환** (사용자 명시 "진입 요청")
- **PM 자동시작** (자율 진행, brainstorming HARD-GATE skip)
- Order 도메인은 후속 MIG-8+ 로 이연

---

## 3. 산출 예정 (40~50 file, 약 2.8~3.5K LOC)

| 영역 | Flyway | 신규 |
|---|---|---|
| accounting-service | V27 | `cash_disbursements` + `cash_receipts` 도메인 테이블 + 2 transform service + 2 controller |
| auth-service | V20 | PageCode MIG7 2종 + ROLE_MASTER+MANAGER seed |
| shared/common | — | ErrorCode MIG7 6종 |

> partner/product/user/inventory 변경 없음 (MIG-1 partner + MIG-5 staging 재사용만).

---

## 4. 데이터 흐름

```
MIG-5 staging (이미 적재됨):
   ├─ staging.ecount_expense_voucher_raw (지출결의서)
   └─ staging.ecount_deposit_report_raw (입금보고서)
       ↓ MIG-7 transform service (pg_advisory_xact_lock + REQUIRES_NEW)
도메인:
   ├─ CashDisbursement (지출 트랜잭션, partner_id + amount + slip_no + journal_id 연계)
   └─ CashReceipt (회수 트랜잭션, 동일 구조)
       ↓ MIG-8+
   Partner aging snapshot 갱신 + Journal 자동 생성 (D-MIG-7-04 옵션 C 이연)
```

---

## 5. 도메인 매핑

### 5.1 지출결의서 → `CashDisbursement` 신규 도메인

**소스**: `staging.ecount_expense_voucher_raw` (transform_status = 'PENDING')

| staging 컬럼 | 도메인 매핑 | 정규화 |
|---|---|---|
| slip_no | `CashDisbursement.slipNo` | 기 정규화 (yyyy-MM-dd-NNN) |
| amount | `CashDisbursement.amount` | BigDecimal |
| partner_id (MIG-5 lookup 결과) | `CashDisbursement.partnerId` | UUID |
| description | `CashDisbursement.memo` | trim |
| transaction_type ('지출결의서') | `CashDisbursement.kind` = `EXPENSE_VOUCHER` | enum 고정 |
| source_file_hash + source_row_no | `CashDisbursement.externalRef` | hash + '-' + row_no |

**도메인 컬럼**:
- BaseEntity 7 audit
- `slip_no` VARCHAR(30) NOT NULL UNIQUE
- `partner_id` UUID NOT NULL
- `amount` NUMERIC(15,2) NOT NULL
- `transaction_date` DATE NOT NULL (slip_no 의 yyyy-MM-dd 파싱)
- `kind` VARCHAR(30) NOT NULL (`EXPENSE_VOUCHER` 시작, 향후 `MANUAL_DISBURSEMENT` 등 확장)
- `memo` TEXT
- `journal_id` UUID NULL (Journal 자동 생성 시 cross-link)
- `external_ref` VARCHAR(100) (멱등 키)

### 5.2 입금보고서 → `CashReceipt` 신규 도메인

5.1 동일 패턴, `kind` = `DEPOSIT_REPORT`.

### 5.3 변환 controller

- `POST /admin/accounting/cash-disbursements/transform-from-staging` — staging PENDING → 도메인 batch transform
- `POST /admin/accounting/cash-receipts/transform-from-staging`
- 응답: `imported / updated / skipped / rejected + sample 20`

---

## 6. Partner aging cross-link (MIG-8 이연)

MIG-5 의 `validateAgainstAging` 검증을 변환 후 실제 aging 갱신으로 확장하는 안을 검토했으나, MIG-7에서는 스코프를 Cash 도메인 변환에 고정한다. aging snapshot 갱신과 Journal 자동 생성은 함께 MIG-8+ 후속 슬라이스에서 처리한다.

- CashDisbursement 적재 → Partner aging `total_expense` 반영: MIG-8+ 후속
- CashReceipt 적재 → Partner aging `total_receipt` 반영: MIG-8+ 후속
- `JournalLineRepository` 기존 aging 계산 로직과 일치성 확인: MIG-8+ 후속

**aging 갱신 옵션** (D-MIG-7-04):
- 옵션 A: CashDisbursement/Receipt insert 시 Journal 자동 생성 → JournalLine 통해 aging 자동 반영
- 옵션 B: aging snapshot view 만 갱신 (Journal 생성 X, MIG-7 minimal)
- **옵션 C 채택**: aging snapshot 갱신 + Journal 자동 생성 모두 MIG-8 후속 슬라이스로 이연. 본 슬라이스는 CashDisbursement/CashReceipt 도메인 변환만 수행.

---

## 7. 멱등 키 / 트랜잭션 / 동시성

- 멱등 키 = `source_file_hash + source_row_no` (staging PK 그대로)
- 도메인 멱등 키 = `external_ref` UNIQUE + soft-delete CTE 복구
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` transform service
- `pg_advisory_xact_lock` 2 namespace 분리 (Disbursement / Receipt)
- `ON CONFLICT (external_ref) DO UPDATE` + soft-delete restore
- staging.transform_status 갱신: PENDING → TRANSFORMED 또는 REJECTED

---

## 8. 사용자 검증 가드

- UUID 비공개 — 응답 DTO `slipNo / partnerName / amount / kind` 등 비즈니스 식별자만
- 한국어 commit/PR/Javadoc 의무
- BaseEntity 7 audit + `@SQLRestriction("is_deleted = false")`
- ROLE_MASTER + ROLE_MANAGER 만 can_edit
- row-level BusinessException → reject sample 흡수
- DuplicateKeyException catch (race window)

---

## 9. ErrorCode 신규

- `MIG7_STAGING_ROW_NOT_FOUND` — transform 대상 staging row 미존재
- `MIG7_LOOKUP_MISS` — partner_id 누락 (MIG-5 fix 못 받은 경우)
- `MIG7_AMOUNT_INVALID` — staging amount 형식 불일치 (drift)
- `MIG7_DATE_INVALID` — slip_no yyyy-MM-dd parse 실패
- `MIG7_DUPLICATE_EXTERNAL_REF` — 동일 external_ref 도메인 중복 (race)
- `MIG7_KIND_INVALID` — staging transaction_type 외 값

---

## 10. 결정 (D-MIG-7-XX)

- D-MIG-7-01 CashDisbursement + CashReceipt 도메인 신규 (cash 도메인 별 변환 service 2종)
- D-MIG-7-02 MIG-5 staging-only → MIG-7 도메인 변환 단방향 (staging 재사용)
- D-MIG-7-03 transform_status 추적: PENDING → TRANSFORMED / REJECTED
- D-MIG-7-04 **옵션 C**: aging snapshot 갱신 + Journal 자동 생성 모두 MIG-8 후속 슬라이스로 이연. 본 슬라이스는 CashDisbursement/CashReceipt 도메인 변환만 수행.
- D-MIG-7-05 lookup miss = `MIG7_LOOKUP_MISS` reject (silent fallback 금지)
- D-MIG-7-06 멱등 키 = `external_ref` UNIQUE (hash + row_no)
- D-MIG-7-07 2 namespace pg_advisory_xact_lock
- D-MIG-7-08 soft-delete CTE 복구 (CashDisbursement + CashReceipt 양쪽)
- D-MIG-7-09 admin UI 미구현 (후속)
- D-MIG-7-10 PageCode MIG7 2종 (auth V20)
- D-MIG-7-11 ErrorCode MIG7 6종
- D-MIG-7-12 PM 자동시작
- D-MIG-7-13 2 transform service 단위 테스트 7~9 케이스 (MIG-4/5/6 회고 적용)
- D-MIG-7-14 IT 5 case × 2 endpoint = 10 IT parameterized
- D-MIG-7-15 MIG7_CSV_HEADER_MISMATCH 부재 — 본 슬라이스는 CSV 직접 import X (staging → 도메인)

---

## 11. samhan-public-overview.html 동기화 ([feedback_samhan_public_overview_sync])

- nav-badge: `Phase 10.6 · MIG-7 진행 중` → 머지 시 `Phase 10.6 · MIG-8 진행 예정`
- Phase 10.6 row sub-task `MIG-1~6 + MIG-7 #N`
- callout 누적 갱신

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 진행
