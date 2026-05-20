# MIG-3 이카운트 회계 전표 4종 마이그레이션 — 설계 (Design Spec)

> 작성일: 2026-05-20
> branch: `spec/2026-05-20-mig-3-voucher`
> PR 예정: 단일 통합 PR
> 입력 raw: `docs/migration/ecount-data/raw/` 4종 — 매입전표 I / 매출전표 I / 일반전표 / 회계전표분개

---

## 1. 개요

MIG-2 의 자동 lookup map 4종 (`item_alias` / `account_map` / `department_map` / `warehouse_map`) 의존 해소 후 진입하는 **accounting-service 첫 트랜잭션 transform** 슬라이스. 이카운트 회계 전표 4 raw CSV 를 staging 멱등 적재 후 기존 SAS 시리즈 (PurchaseAccountingSlip / SalesAccountingSlip) 및 Journal 도메인으로 변환.

- baseline: MIG-1 PoC (`EcountPartnerImporter`) + MIG-2 (5 importer + lookup map 4종) + SAS 시리즈 5/5 (PR #267~269)
- 9회차 워크플로우 ([feedback_dual_5agent_review]) — Claude 기획 → Codex 개발 → 사이클(Claude+Codex review/fix N≤3) → CI green → PM 자동 머지

---

## 2. 사용자 확정 결정 (2026-05-20)

- **한 PR 통합 4 raw** (한 PR 통합 패턴 [feedback_integrated_pr_pattern])
- **PM 자동시작** — brainstorming HARD-GATE skip, spec → plan → Codex 개발 자동 dispatch
- **세금계산서용 판매전표 / 판매전표 / 매출매입내역 / 매출장 / 매입장 = MIG-4 후속**

---

## 3. 산출 예정 (예상 35~45 file, 약 2.5~3K LOC)

| 영역 | Flyway | 신규 |
|---|---|---|
| accounting-service | V23 | staging.ecount_purchase_slip_raw / sales_slip_raw / general_voucher_raw / journal_entry_raw + 4 importer + 4 controller + 멱등 키 + transform service |
| shared/common | — | ErrorCode MIG3 5~8종 (예: MIG3_VOUCHER_NO_DUPLICATE / MIG3_LOOKUP_MISS / MIG3_SLIP_AMOUNT_MISMATCH 등) |
| auth-service | V16 | PageCode MIG3 4종 + ROLE_MASTER+MANAGER seed |

> product / user / inventory 변경 없음 (MIG-2 lookup map 사용만, 도메인 변경 X).

---

## 4. 데이터 흐름

```
raw CSV (4 종)
   ↓ OpenCSV + BOM strip + meta row `데이터관리>` 인식 + strict header (EcountCsvSupport)
staging.ecount_*_raw (4 테이블, 멱등 키 = source_file_hash + source_row_no)
   ↓ transform service (pg_advisory_xact_lock + REQUIRES_NEW + lookup map 4종 정규화)
도메인 (PurchaseAccountingSlip / SalesAccountingSlip / Journal+JournalLine)
   ↓
자동 lookup map 결과 (사용자 가시 화면 = 비즈니스 코드 + 거래처/품목 명만 노출, UUID 비공개)
```

---

## 5. 4 raw CSV → 도메인 매핑

### 5.1 `매입전표 I-Excel다운로드` → `PurchaseAccountingSlip`

| raw 컬럼 | 도메인 매핑 | 정규화 |
|---|---|---|
| 전표번호 (yyyy/MM/dd -N) | `slipNo` (재가공) | yyyy-MM-dd-NNN format 정규화 |
| 거래유형 (`매입전표 I(매입)`) | `slipType` = PURCHASE | 고정 |
| 금액 | `totalAmount` (VAT-inclusive) | KRW comma 제거 |
| 거래처명 | `partnerId` | `partner_db.partners.name` lookup (UUID 정규화) |
| 적요명 | `description` | trim |

→ status = MIGRATED (신규 enum 값 또는 IMPORTED 재사용).

### 5.2 `매출전표 I-Excel다운로드` → `SalesAccountingSlip`

5.1 과 동일 패턴, `slipType` = SALES.

### 5.3 `일반전표-Excel다운로드` → `Journal + JournalLine`

| raw 컬럼 | 도메인 매핑 |
|---|---|
| 전표번호 | `journalNo` |
| 거래유형 (`일반전표`) | `sourceType` = MANUAL |
| 금액 / 거래처명 / 적요명 | line 1건 생성 (`description` + `amount`) |

차변/대변 정보가 없어 단일 line 만 생성. POSTED 직접 전이 X — DRAFT 로 적재 후 후속 수동 분개 보강.

### 5.4 `회계전표분개-Excel다운로드` → `Journal + JournalLine` (차/대 분개 raw)

| raw 컬럼 | 도메인 매핑 |
|---|---|
| 일자-No-순번 | journalNo + lineSequence |
| 계정명 | account_code lookup (MIG-2 `account_map.account_name` 역방향 검색) |
| 거래처명 | partner_id lookup |
| 차변금액 / 대변금액 | debitAmount / creditAmount |
| 적요 | line.description |

차/대 합계 일치 검증 → POSTED 전이 (검증 통과 시) 또는 DRAFT 유지 (불일치 시 + 결함 보고서).

---

## 6. lookup 정규화 (MIG-2 4 lookup map 사용)

- `staging.ecount_account_map` — `계정명 → ChartOfAccount.id` 정규화 (5.4 회계전표분개)
- `partner_db.partners.name` — `거래처명 → Partner.id` (MIG-1 PoC + 5.1/5.2/5.3/5.4)
- `staging.ecount_department_map` — 부서명 lookup (필요 시)
- `staging.ecount_warehouse_map` — 창고명 lookup (필요 시)
- `staging.ecount_item_alias` — 품목명 lookup (적요 텍스트 안 품목명 추출, 옵션)

lookup miss 시 → `MIG3_LOOKUP_MISS` reject (sample 컬럼+raw value 포함 message).

---

## 7. 멱등 키 / 트랜잭션 / 동시성

- 멱등 키 = `source_file_hash` (MD5 raw CSV) + `source_row_no` (1부터)
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` 5 importer 와 동일
- `pg_advisory_xact_lock(UUID namespace XOR MD5(hash))` 4 namespace 분리 (Purchase/Sales/General/Journal entry)
- `ON CONFLICT DO NOTHING` (staging) / `ON CONFLICT DO UPDATE WHERE same key` + 0 row 감지 (domain)
- soft-deleted row 사전 복구 CTE (UPDATE ... WHERE is_deleted=TRUE) — 5 importer 패턴

---

## 8. 사용자 검증 가드

- UUID 비공개 — 모든 응답 DTO 는 `slipNo / journalNo / partnerName / accountCode` 등 비즈니스 식별자만 노출
- 한국어 commit/PR/Issue/Javadoc 의무
- BaseEntity 7 audit + `@SQLRestriction("is_deleted = false")` 가드
- ROLE_MASTER + ROLE_MANAGER 만 can_edit, DISPATCH/MEMBER false fallback

---

## 9. ErrorCode 신규 (shared/common)

- `MIG3_VOUCHER_NO_DUPLICATE` — 동일 source_file 내 전표번호 중복
- `MIG3_LOOKUP_MISS` — 계정명/거래처명/부서명/창고명 lookup miss (sample 포함)
- `MIG3_SLIP_AMOUNT_INVALID` — 금액 parse 실패 또는 0 이하
- `MIG3_JOURNAL_BALANCE_MISMATCH` — 회계전표분개 차/대 합계 불일치 (POSTED 전이 차단, DRAFT 유지 + 보고서)
- `MIG3_CSV_HEADER_MISMATCH` — strict header (5 컬럼 ≠ expected) — EcountCsvSupport 재사용

---

## 10. 결정 (D-MIG-3-XX)

- D-MIG-3-01 한 PR 통합 4 raw
- D-MIG-3-02 매입전표 I → PurchaseAccountingSlip + 매출전표 I → SalesAccountingSlip (SAS 시리즈 기존 도메인 활용)
- D-MIG-3-03 일반전표 / 회계전표분개 → Journal + JournalLine (기존 도메인 활용)
- D-MIG-3-04 회계전표분개 차/대 합계 일치 시 POSTED, 불일치 시 DRAFT + 보고서
- D-MIG-3-05 lookup miss = MIG3_LOOKUP_MISS reject (silent fallback 금지)
- D-MIG-3-06 멱등 키 source_file_hash + source_row_no (MIG-1/2 패턴)
- D-MIG-3-07 4 namespace pg_advisory_xact_lock 분리
- D-MIG-3-08 세금계산서/판매전표/매출매입내역 = MIG-4 후속
- D-MIG-3-09 admin UI 미구현 (관리자 화면 후속 슬라이스)
- D-MIG-3-10 PageCode MIG3 4종 (auth-service V16)
- D-MIG-3-11 ErrorCode MIG3 5종 (shared/common)
- D-MIG-3-12 PM 자동시작 (사용자 명시 자율 진행)

---

## 11. 후속 (9회차 워크플로우)

1. **plan 작성** ([writing-plans], `docs/superpowers/plans/2026-05-20-ecount-mig-3-voucher.md`)
2. **Codex 개발** (mcp__codex__codex sandbox=workspace-write) — 35~45 file 일괄
3. **사이클 N (최대 3)**: Claude 5-agent review + Claude fix → Codex 5-agent review + Codex fix
4. **CI 모두 PASS** + **잔존 결함 0** 시 PM 마지막 종합 리뷰 + `gh pr merge --squash --delete-branch` 자동 실행
5. **MIG-4 자동 진입** — 세금계산서/판매전표/매출매입내역 묶음

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 진행
