# MIG-5 이카운트 창고이동·지출결의서·입금보고서 raw 3종 마이그레이션 — 설계 (Design Spec)

> 작성일: 2026-05-20
> branch: `spec/2026-05-20-mig-5-stock-expense-deposit`
> PR 예정: 단일 통합 PR
> 입력 raw: `docs/migration/ecount-data/raw/` 3종
> - `창고이동-Excel다운로드(20260501~20260519_1).csv` (7컬럼 + trailing empty)
> - `지출결의서-Excel다운로드(20260501~20260519_1).csv` (5컬럼 + trailing empty, MIG-3 매입전표 I 동일 구조)
> - `입금보고서-Excel다운로드(20260501~20260519_1).csv` (5컬럼 + trailing empty, 동일 구조)

---

## 1. 개요

MIG-4 ([영업·세무 raw 4종, PR #272](https://github.com/.../pull/272)) 머지 직후 진입하는 **inventory 도메인 변환 + accounting staging-only** 슬라이스. 창고이동은 기존 `StockTransfer` 도메인으로 변환, 지출결의서/입금보고서는 staging + Partner aging cross-link 검증.

- baseline: MIG-4 (4 importer + V24/V17 + soft-delete CTE + footer 정확 매칭) 머지 직후
- 9회차 워크플로우 ([feedback_dual_5agent_review]) — Claude 기획 → Codex 개발 → 사이클(Claude+Codex review/fix N≤3) → CI green → PM 자동 머지

---

## 2. 사용자 확정 결정 (2026-05-20)

- **한 PR 통합 3 importer** (한 PR 통합 패턴 [feedback_integrated_pr_pattern])
- **PM 자동시작** — brainstorming HARD-GATE skip, spec → plan → Codex 개발 자동 dispatch ([feedback_arologis_extract_autopilot] 일반화)
- **지출결의서/입금보고서 = staging only** (cash disbursement/receipt 도메인 신규는 후속 슬라이스, Partner aging 검증만)
- **창고이동 = 기존 `StockTransfer` 도메인 변환** (신규 도메인 X)

---

## 3. 산출 예정 (예상 35~45 file, 약 2.5~3K LOC)

| 영역 | Flyway | 신규 |
|---|---|---|
| inventory-service | V13 | `staging.ecount_stock_transfer_raw` + `EcountStockTransferImporter` + controller |
| accounting-service | V25 | `staging.ecount_expense_voucher_raw` + `staging.ecount_deposit_report_raw` + 2 importer + 2 controller + Partner aging cross-check SQL |
| shared/common | — | ErrorCode MIG5 10종 |
| auth-service | V18 | PageCode MIG5 3종 + ROLE_MASTER+MANAGER seed |

> partner / product / user 변경 없음 (MIG-1 partner + MIG-2 lookup map 4종 사용만).

---

## 4. 데이터 흐름

```
raw CSV (3 종, BOM + meta `데이터관리>` + strict header + trailing empty column 1개)
   ↓ OpenCSV + EcountCsvSupport (MIG-2/3/4 통일 헬퍼)
staging.ecount_*_raw (3 테이블, 멱등 키 = source_file_hash SHA-256 + source_row_no)
   ↓ transform service (pg_advisory_xact_lock + REQUIRES_NEW + lookup map 사용)
도메인 / staging
   ├─ StockTransfer + StockTransferLine (창고이동, 기존 도메인 변환, soft-delete CTE 복구)
   ├─ staging only (지출결의서) + Partner aging 지출 누계 검증 SQL
   └─ staging only (입금보고서) + Partner aging 회수 누계 검증 SQL
   ↓
응답 DTO: UUID 비공개 (`transferNo / slipNo / partnerName / itemName / warehouseCode` 등 비즈니스 식별자만 노출)
```

---

## 5. 3 raw CSV → 도메인 매핑

### 5.1 창고이동 → `StockTransfer` + `StockTransferLine`

**raw 헤더 7컬럼 (+ trailing empty)**:
일자-No. / 출고창고명 / 입고창고명 / 품목명[규격] / 수량 / 금액(수량*입고단가) / 적요

| raw 컬럼 | 도메인 매핑 | 정규화 |
|---|---|---|
| 일자-No. (`yyyy/MM/dd -N`) | `StockTransfer.transferNo` | `yyyy-MM-dd-NNN` 정규화 (MIG-3/4 패턴 일관) |
| 출고창고명 | `sourceWarehouseId` | MIG-2 `staging.ecount_warehouse_map` lookup |
| 입고창고명 | `destinationWarehouseId` | MIG-2 warehouse_map lookup |
| 품목명[규격] | `StockTransferLine.productId` | product-service `/products/internal/by-name?name=` lookup (품목코드 ≠ 품목명 [[project_ecount_product_identity_rule]] 적용) |
| 수량 | `StockTransferLine.quantity` | Integer parse |
| 금액(수량*입고단가) | staging.ecount_stock_transfer_raw.amount 보존만 (도메인 변환 X) | KRW comma 제거 + BigDecimal (빈 값 허용 — raw 일부 null). StockTransferLine 도메인은 amount 컬럼 미보유 — 후속 슬라이스에서 inventory 도메인 보강 시 검토. |
| 적요 | `StockTransfer.memo` | trim |

- 상태: `CONFIRMED` (마이그레이션은 운영 완료 transfer 만 대상)
- 동일 transferNo 다중 line → 1 StockTransfer 머리 + N StockTransferLine
- 멱등 키: `source_file_hash + source_row_no` (staging) → domain `StockTransfer.externalRef = hash + '-' + headerRowNo`
- soft-deleted row 사전 복구 CTE — MIG-4 C1-CODEX-P2-1 패턴 일관

### 5.2 지출결의서 → `staging.ecount_expense_voucher_raw` + Partner aging 검증

**raw 헤더 5컬럼 (+ trailing empty)**: 전표번호 / 거래유형 / 금액 / 거래처명 / 적요명 (MIG-3 매입전표 I 와 동일 구조)

- staging 적재만 (도메인 변환 X)
- 컬럼: `slip_no / transaction_type / amount / partner_name / partner_id (lookup 결과) / description + file_hash/row_no`
- 거래유형 = `지출결의서` 고정 검증 (다른 값은 `MIG5_TRANSACTION_TYPE_INVALID` reject)
- `validateAgainstAging()` 검증 method: 거래처별 지출 누계 합산 vs Partner aging 잔액 cross-check (JdbcTemplate query)
- 불일치 → `MIG5_AGING_BALANCE_MISMATCH` 보고서 (sample 5건)
- 응답 DTO: `imported / agingMismatchCount / agingMismatchSamples`

### 5.3 입금보고서 → `staging.ecount_deposit_report_raw` + Partner aging 검증

**raw 헤더 5컬럼 (+ trailing empty)**: 동일 5컬럼 (전표번호 / 거래유형 / 금액 / 거래처명 / 적요명)

- staging 적재만
- 컬럼: 5.2 와 동일 패턴
- 거래유형 = `입금보고서` 고정 검증
- `validateAgainstAging()` 검증: 거래처별 회수 누계 vs Partner aging 회수액 cross-check
- 불일치 → `MIG5_AGING_BALANCE_MISMATCH` 보고서
- 응답 DTO: 동일 패턴

---

## 6. lookup 정규화 (MIG-1/2 lookup map 재사용)

- `staging.ecount_warehouse_map` (MIG-2) — 출고/입고 창고명 → Warehouse.id
- `product-service` `/products/internal/by-name?name=` — 품목명[규격] → Product.id (inventory-service DB 경계 준수)
- `partner-service` `/internal/partners/by-name` (MIG-3 endpoint) — 거래처명 → Partner.id
- lookup miss → silent fallback 금지, 거래처는 `MIG5_LOOKUP_MISS`, 창고는 `MIG5_WAREHOUSE_LOOKUP_MISS`, 품목은 `MIG5_PRODUCT_LOOKUP_MISS` reject (sample 컬럼+raw value 포함 message) — MIG-3 D-05 / MIG-4 패턴

---

## 7. 멱등 키 / 트랜잭션 / 동시성

- 멱등 키 = `source_file_hash` (SHA-256 raw CSV, VARCHAR(64)) + `source_row_no` (1부터) — MIG-2/3/4 통일
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` — 모든 importer 적용
- `pg_advisory_xact_lock(UUID namespace XOR SHA-256(hash)[:8])` — 3 namespace 분리 (StockTransfer / Expense / Deposit)
- `ON CONFLICT DO NOTHING` (staging) / CTE atomic upsert (StockTransfer/StockTransferLine domain) — MIG-4 C1-CODEX-P2-1 패턴
- soft-deleted row 복구 CTE — StockTransfer / StockTransferLine 모두 적용
- row-level `BusinessException` → reject sample 흡수 (다음 행 계속 처리) — MIG-3 B1 회고
- `DuplicateKeyException` row-level catch (race window) — MIG-4 C1-MIN-2 회고

---

## 8. 사용자 검증 가드

- UUID 비공개 — 응답 DTO 는 `transferNo / slipNo / partnerName / itemName / warehouseCode` 등 비즈니스 식별자만 노출
- 한국어 commit / PR / Issue / Javadoc 의무 ([feedback_korean_commits])
- BaseEntity 7 audit + `@SQLRestriction("is_deleted = false")` 가드
- ROLE_MASTER + ROLE_MANAGER 만 can_edit, DISPATCH/MEMBER false fallback
- 실 raw `trailing empty column 1개 허용` (MIG-3/4 패턴 일관) + strict header 외 컬럼 변동 reject
- footer 정확 매칭 (MIG-4 C1-CODEX-P2-2 회고) — 빈 일자 + nonblank 금액 row 는 silent skip X, `MIG5_DATE_INVALID` reject

---

## 9. ErrorCode 신규 (shared/common)

- `MIG5_TRANSFER_NO_DUPLICATE` — 동일 source_file 내 transferNo 중복
- `MIG5_LOOKUP_MISS` — 거래처 lookup miss (sample 포함)
- `MIG5_WAREHOUSE_LOOKUP_MISS` — 창고명 lookup miss (출고/입고 창고명 sample 포함)
- `MIG5_PRODUCT_LOOKUP_MISS` — 품목명 lookup miss (품목명 sample 포함)
- `MIG5_LOOKUP_AMBIGUOUS` — 거래처명/창고명 중복 매칭
- `MIG5_AMOUNT_INVALID` — 금액 parse 실패 또는 음수
- `MIG5_DATE_INVALID` — 일자 포맷 불일치
- `MIG5_TRANSACTION_TYPE_INVALID` — 지출결의서/입금보고서 거래유형 값 불일치
- `MIG5_AGING_BALANCE_MISMATCH` — 지출/입금 합계 ↔ Partner aging 불일치
- `MIG5_CSV_HEADER_MISMATCH` — strict header 불일치

---

## 10. 결정 (D-MIG-5-XX)

- D-MIG-5-01 한 PR 통합 3 importer (PM 자동시작)
- D-MIG-5-02 창고이동 → `StockTransfer` + `StockTransferLine` (기존 도메인, status=CONFIRMED 적재)
- D-MIG-5-03 지출결의서/입금보고서 → staging only + Partner aging cross-check (cash 도메인 신규는 후속 슬라이스)
- D-MIG-5-04 lookup miss = 거래처 `MIG5_LOOKUP_MISS`, 창고 `MIG5_WAREHOUSE_LOOKUP_MISS`, 품목 `MIG5_PRODUCT_LOOKUP_MISS` reject (silent fallback 금지)
- D-MIG-5-05 멱등 키 source_file_hash SHA-256 (VARCHAR 64) + source_row_no — MIG-2/3/4 통일
- D-MIG-5-06 3 namespace pg_advisory_xact_lock 분리
- D-MIG-5-07 soft-delete CTE 복구 (StockTransfer / StockTransferLine 모두)
- D-MIG-5-08 admin UI 미구현 (관리자 화면 후속 슬라이스)
- D-MIG-5-09 PageCode MIG5 3종 (auth-service V18)
- D-MIG-5-10 ErrorCode MIG5 10종 (shared/common)
- D-MIG-5-11 PM 자동시작 (사용자 명시 자율 진행, brainstorming HARD-GATE skip)
- D-MIG-5-12 footer 정확 매칭 (MIG-4 C1-CODEX-P2-2 회고 적용)
- D-MIG-5-13 4 importer behavior 단위 테스트 필수 (MIG-4 C1-P0-1 회고 — 처음부터 적용)
- D-MIG-5-14 IT 5 case × 3 endpoint = 15 IT parameterized (MIG-4 C1-P2-4 회고)
- D-MIG-5-15 창고이동 금액은 staging 보존만 (도메인 변환 X) — StockTransferLine 도메인 영향 최소 우선

---

## 11. 후속 (9회차 워크플로우)

1. **plan 작성** ([writing-plans], `docs/superpowers/plans/2026-05-20-ecount-mig-5-stock-expense-deposit.md`)
2. **Codex 개발** (`mcp__codex__codex` sandbox=workspace-write) — 35~45 file 일괄
3. **사이클 N (최대 3)**: Claude 5-agent review + TM Claude 통합 PR comment (즉시) + Claude fix → Codex 5-agent review + TM Codex 통합 PR comment (즉시) + Codex fix
4. **CI 모두 PASS** + **잔존 결함 0** 시 PM 마지막 종합 리뷰 + `gh pr merge --squash --delete-branch` 자동 실행
5. **MIG-6 자동 진입** — Cash disbursement/receipt 도메인 신규 + Order 도메인 신규 (주문서) + 잔여 raw (있다면)

---

## 12. samhan-public-overview.html 동기화 의무 ([feedback_samhan_public_overview_sync])

본 PR 안에 `docs/samhan-public-overview.html` 갱신 포함:
- nav-badge: `Phase 10.6 · MIG-5 진행 중` → 머지 시 `Phase 10.6 · MIG-5 완료`
- Phase 10.6 row callout: MIG-5 추가
- progress 표 sub-task `MIG-1 #262 / MIG-2 #270 / MIG-3 #271 / MIG-4 #272 / MIG-5 #N` 갱신

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 진행
