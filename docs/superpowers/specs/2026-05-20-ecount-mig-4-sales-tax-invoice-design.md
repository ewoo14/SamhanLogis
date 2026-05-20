# MIG-4 이카운트 영업·세무 raw 4종 마이그레이션 — 설계 (Design Spec)

> 작성일: 2026-05-20
> branch: `spec/2026-05-20-mig-4-sales-tax-invoice`
> PR 예정: 단일 통합 PR
> 입력 raw: `docs/migration/ecount-data/raw/` 4종
> - `세금계산서용 판매전표-Excel다운로드(20260501~20260519_1).csv`
> - `판매전표-Excel다운로드(20260501~20260519_1).csv`
> - `매출매입내역-Excel다운로드(20260501~20260519_1).csv`
> - `주문서-Excel다운로드(YYYYMMDD~YYYYMMDD_N).csv` (5 분할 파일, 2025-08 ~ 2026-05)
> 검증 raw: `매출장.xlsx`, `매입장.xlsx` (DailyClosing 대조 SQL 만)

---

## 1. 개요

MIG-3 ([회계 전표 4종, PR #271](https://github.com/.../pull/271)) 머지 직후 진입하는 **accounting-service 영업·세무 트랜잭션 transform** 슬라이스. 4 raw CSV 를 staging 멱등 적재 후 기존 `TaxInvoice` / `SalesAccountingSlip` 도메인으로 변환하고, 매출매입내역과 주문서는 staging + 검증 SQL 중심으로 처리.

- baseline: MIG-3 (4 voucher importer + V23 staging + ErrorCode MIG3 9종) 머지 직후
- 9회차 워크플로우 ([feedback_dual_5agent_review]) — Claude 기획 → Codex 개발 → 사이클(Claude+Codex review/fix N≤3) → CI green → PM 자동 머지

---

## 2. 사용자 확정 결정 (2026-05-20)

- **한 PR 통합 4 importer** (한 PR 통합 패턴 [feedback_integrated_pr_pattern]) — 사용자 결정 (이번 세션 AskUserQuestion: "4 importer 통합 — 핸드오프 명시")
- **PM 자동시작** — brainstorming HARD-GATE skip, spec → plan → Codex 개발 자동 dispatch
- **매출장/매입장 = 검증 SQL 만** (DailyClosing 대조 1~2 SELECT)
- **주문서 = staging + 검증 SQL** (도메인 변환 X, 향후 Order 도메인 신규 슬라이스 후보로 이연)

---

## 3. 산출 예정 (예상 40~50 file, 약 2.8~3.5K LOC)

| 영역 | Flyway | 신규 |
|---|---|---|
| accounting-service | V24 | `staging.ecount_tax_invoice_raw` / `ecount_sales_slip_line_raw` / `ecount_sales_purchase_summary_raw` / `ecount_order_raw` + 4 importer + 4 controller + transform service + lookup map 재사용 |
| shared/common | — | ErrorCode MIG4 7~9종 |
| auth-service | V17 | PageCode MIG4 4종 + ROLE_MASTER+MANAGER seed |

> partner / product / user / inventory 변경 없음 (MIG-2 lookup map 사용만).
> MIG-3 의 `SalesAccountingSlip` 도메인을 보강 (판매전표 line 추가 — 신규 column 없음, 기존 entity 사용).

---

## 4. 데이터 흐름

```
raw CSV (4 종, BOM + meta `데이터관리>` + strict header + trailing empty column 1개)
   ↓ OpenCSV + EcountCsvSupport (BOM strip / meta row skip / strict header / advisory lock / max length guard 재사용)
staging.ecount_*_raw (4 테이블, 멱등 키 = source_file_hash SHA-256 + source_row_no)
   ↓ transform service (pg_advisory_xact_lock + REQUIRES_NEW + lookup map 4종 정규화)
도메인 / staging
   ├─ TaxInvoice OUTBOUND (세금계산서용 판매전표) + TaxInvoiceLine
   ├─ SalesAccountingSlipLine 추가 (판매전표 — 일자-No. cross-link)
   ├─ staging 만 + 검증 SQL (매출매입내역, 주문서)
   └─ DailyClosing 대조 SELECT (매출장/매입장, 옵션)
   ↓
응답 DTO: UUID 비공개 (`taxInvoiceNo` / `slipNo` / `orderNo` 등 비즈니스 식별자 + partner/product 명만 노출)
```

---

## 5. 4 raw CSV → 도메인 매핑

### 5.1 세금계산서용 판매전표 → `TaxInvoice` OUTBOUND + `TaxInvoiceLine`

**raw 헤더 15컬럼 (+ trailing empty)**:
거래처코드 / 종사업장번호 / 거래처명 / 대표자명 / 주소1 / 업태 / 종목 / Email / 공급가액 / 부가세 / 일자 / 품목명[규격] / 수량 / 단가 / 회계전표일자-No.

| raw 컬럼 | 도메인 매핑 | 정규화 |
|---|---|---|
| 거래처코드 (이카운트 코드) | `customer.partnerId` | partner-service `/internal/partners/by-name?name=` 의 보조 lookup → `partners.ecount_code = 거래처코드` 1차 lookup |
| 거래처명 | `customer.partnerName` snapshot | trim |
| 일자 (`yyyy/MM/dd `) | `issuedAt` | LocalDate parse + ISO format |
| 공급가액 | `TaxInvoiceLine.supplyAmount` | KRW comma 제거 + BigDecimal |
| 부가세 | `TaxInvoiceLine.vatAmount` | KRW comma 제거 |
| 품목명[규격] | `TaxInvoiceLine.itemName` | trim, 규격 분리 안 함 (raw 보존) |
| 수량 | `TaxInvoiceLine.quantity` | Integer parse |
| 단가 | `TaxInvoiceLine.unitPrice` | KRW comma 제거 |
| 회계전표일자-No. | `TaxInvoiceLine.description` 에 raw 보존 (TaxInvoice 도메인 schema 변경 X) | `yyyy/MM/dd -N` → `yyyy-MM-dd-NNN` 정규화 + `description` prefix `회계전표:` |

- `direction` = `OUTBOUND` 고정
- `type` = `TAX_INVOICE` 고정 (`TaxInvoiceType` enum 존재 — MIG-2/3 와 별개)
- `status` = `MIGRATED` (`TaxInvoiceStatus` 신규 enum 값 추가 — D-MIG-4-04)
- 동일 거래처+일자 의 다중 line → 1 TaxInvoice 머리 + N TaxInvoiceLine (raw row_no 순)
- 멱등 키: `source_file_hash + source_row_no` (staging) → domain `TaxInvoice.externalRef = hash + '-' + headerRowNo`

### 5.2 판매전표 → `SalesAccountingSlipLine` 보강 (cross-link)

**raw 헤더 10컬럼 (+ trailing empty)**:
일자-No. / 거래처코드 / 거래처명 / 품목명[규격] / 수량 / 단가 / 공급가액 / 부가세 / 합계 / 입금예정일

| raw 컬럼 | 도메인 매핑 | 정규화 |
|---|---|---|
| 일자-No. (`yyyy/MM/dd -N`) | `SalesAccountingSlip.slipNo` lookup | `yyyy-MM-dd-NNN` 정규화 (MIG-3 패턴) — 미존재 시 신규 SalesAccountingSlip 적재 (멱등) |
| 거래처코드 | `partnerId` lookup | MIG-1 lookup |
| 품목명[규격] | `SalesAccountingSlipLine.itemName` | MIG-2 `item_alias` lookup (옵션) → `productId` 또는 itemName snapshot |
| 수량 / 단가 / 공급가액 / 부가세 / 합계 | line 필드 | KRW comma 제거 |
| 입금예정일 (4자리, 예 `0430`) | `SalesAccountingSlip.dueDate` 보강 (MM/DD 만) | 일자 의 연도 + 4자리 결합 → LocalDate |

- 일자-No. 가 MIG-3 매출전표 I 와 1:1 cross-link (`SalesAccountingSlip.slipNo`)
- MIG-3 적재 후 SalesAccountingSlip 이 존재하면 → line 만 추가 (보강)
- 미존재 시 → 신규 SalesAccountingSlip + line 동시 생성 (멱등)
- 결과 보고서: `linkedSlipNo` / `unlinkedSlipNo` 카운트 분리

### 5.3 매출매입내역 → staging 적재 + 검증 SQL

**raw 헤더 10컬럼 (+ trailing empty)**:
월/일 / 유형명 / 전자구분 / 거래처명 / 세부내역 / 매입공급가액 / 매입부가세 / 매출공급가액 / 매출부가세 / 매출합계

- staging `staging.ecount_sales_purchase_summary_raw` 만 적재 (도메인 변환 X)
- 검증 SQL 2~3건:
  - 일별 매출 합계 = SalesAccountingSlip 합계 (월/일 + 유형명='매출' filter)
  - 일별 매입 합계 = PurchaseAccountingSlip 합계
  - 불일치 → `MIG4_SUMMARY_BALANCE_MISMATCH` 보고서 (sample 5건 + raw 값 + 도메인 합계)

### 5.4 주문서 → staging 적재 + 검증 SQL (5 분할 파일)

**raw 헤더 13컬럼 (+ trailing empty)**:
일자-No. / 거래처명 / 담당자명 / 유효기간 / 결제조건 / 참조 / 진행상태 / 품목명[규격] / 수량 / 단가 / 공급가액[외화] / 부가세 / 품목별납기일자

- staging `staging.ecount_order_raw` 만 적재 (도메인 변환 X)
- 5 분할 파일 = 동일 importer 가 file_hash 별로 5회 멱등 import (분할 파일 자동 인식 X — 사용자 5회 upload)
- 검증 SQL 2건:
  - 진행상태='완료' 주문서가 `SalesAccountingSlip.slipNo` 와 일치하는지 (일자-No. cross-link)
  - 진행상태 unknown 값 (e.g., '진행', '취소', '대기') → 카운트 보고서
- 향후 Order 도메인 신규 슬라이스 (MIG-5+) 후보 — 본 슬라이스는 staging 만

### 5.5 매출장/매입장 (옵션 검증)

- `매출장.xlsx`, `매입장.xlsx` 는 Apache POI parser 가 본 슬라이스에 없음 (CSV 만)
- 운영 PC 에서 사용자가 CSV 로 재export 시 본 슬라이스 확장 가능
- 본 슬라이스에서는 `docs/dev-reports/ecount-mig-4-sales-tax-invoice.md` §검증 섹션에 "DailyClosing 대조 향후 슬라이스" 만 명시

---

## 6. lookup 정규화 (MIG-2 lookup map 4종 + MIG-1 partner 재사용)

- `partner-service` `/internal/partners/by-name?name=` (MIG-3 검증된 endpoint) — 거래처명 lookup
- `partner-service` `partners.ecount_code` — 거래처코드 1차 lookup (MIG-1 PoC 에서 컬럼 추가됨, MIG-2 보강)
- `staging.ecount_item_alias` — 품목명[규격] lookup (5.2 SalesAccountingSlipLine, 옵션)
- lookup miss → silent fallback 금지, `MIG4_LOOKUP_MISS` reject (sample 컬럼+raw value 포함 message) — MIG-3 D-MIG-3-05 패턴

---

## 7. 멱등 키 / 트랜잭션 / 동시성

- 멱등 키 = `source_file_hash` (SHA-256 raw CSV, VARCHAR(64)) + `source_row_no` (1부터) — MIG-2/3 통일 (MIG-3 C2 정정 패턴)
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` — MIG-3 importer 와 동일
- `pg_advisory_xact_lock(UUID namespace XOR SHA-256(hash)[:8])` — 4 namespace 분리 (TaxInvoice / SalesSlipLine / Summary / Order)
- `ON CONFLICT DO NOTHING` (staging) / `ON CONFLICT DO UPDATE WHERE same key` + 0 row 감지 (domain)
- soft-deleted row 사전 복구 CTE — MIG-3 D-MIG-3-08 패턴 (TaxInvoice / TaxInvoiceLine / SalesAccountingSlipLine)
- 트랜잭션 row-level `BusinessException` → reject sample 흡수 (MIG-3 B1 fix 패턴) — 다음 행 계속 처리

---

## 8. 사용자 검증 가드

- UUID 비공개 — 응답 DTO 는 `taxInvoiceNo / slipNo / orderNo / partnerName / itemName / accountCode` 등 비즈니스 식별자만 노출
- 한국어 commit / PR / Issue / Javadoc 의무 ([feedback_korean_commits])
- BaseEntity 7 audit + `@SQLRestriction("is_deleted = false")` 가드
- ROLE_MASTER + ROLE_MANAGER 만 can_edit, DISPATCH/MEMBER false fallback
- 실 raw `trailing empty column 1개` 허용 (MIG-3 D-MIG-3-10 패턴) + strict header 외 컬럼 변동 reject

---

## 9. ErrorCode 신규 (shared/common)

- `MIG4_TAX_INVOICE_DUPLICATE` — 동일 source_file 내 (거래처+일자+row) 중복
- `MIG4_LOOKUP_MISS` — 거래처/품목 lookup miss (sample 포함)
- `MIG4_LOOKUP_AMBIGUOUS` — 거래처명 중복 매칭 (MIG-3 C6 패턴, 사용자 조치 메시지)
- `MIG4_AMOUNT_INVALID` — 금액 parse 실패 또는 0 이하
- `MIG4_DATE_INVALID` — 일자 parse 실패 / `yyyy/MM/dd` 외 포맷
- `MIG4_SLIP_NO_INVALID` — 일자-No. 포맷 불일치 또는 회계전표일자-No. 불일치
- `MIG4_SUMMARY_BALANCE_MISMATCH` — 매출매입내역 합계 ↔ 도메인 합계 불일치
- `MIG4_ORDER_STATUS_INVALID` — 진행상태 unknown 값 (예: 알 수 없는 표기)
- `MIG4_CSV_HEADER_MISMATCH` — strict header 불일치 (EcountCsvSupport 재사용)

---

## 10. 결정 (D-MIG-4-XX)

- D-MIG-4-01 한 PR 통합 4 importer (사용자 결정 — 이번 세션)
- D-MIG-4-02 세금계산서용 판매전표 → `TaxInvoice` OUTBOUND + `TaxInvoiceLine`
- D-MIG-4-03 판매전표 → `SalesAccountingSlipLine` 보강 (cross-link MIG-3 slip), 미존재 slip 은 신규 생성
- D-MIG-4-04 `TaxInvoiceStatus.MIGRATED` 신규 enum 값 추가 (DB enum check constraint 보강 V24 안). 회계전표일자-No. cross-link 은 `TaxInvoiceLine.description` 에 prefix `회계전표:` 로 raw 보존 (TaxInvoice 도메인 schema 변경 X)
- D-MIG-4-05 매출매입내역 → staging only + 검증 SQL (도메인 변환 X)
- D-MIG-4-06 주문서 → staging only + 검증 SQL (Order 도메인 신규는 MIG-5+ 후속)
- D-MIG-4-07 매출장/매입장 → 본 슬라이스 변환 X, dev-report 명시만
- D-MIG-4-08 lookup miss = MIG4_LOOKUP_MISS reject (silent fallback 금지) — MIG-3 D-05 미러
- D-MIG-4-09 멱등 키 source_file_hash SHA-256 (VARCHAR 64) + source_row_no — MIG-2/3 통일
- D-MIG-4-10 4 namespace pg_advisory_xact_lock 분리
- D-MIG-4-11 admin UI 미구현 (관리자 화면 후속 슬라이스)
- D-MIG-4-12 PageCode MIG4 4종 (auth-service V17)
- D-MIG-4-13 ErrorCode MIG4 9종 (shared/common)
- D-MIG-4-14 PM 자동시작 (사용자 명시 자율 진행, brainstorming HARD-GATE skip)
- D-MIG-4-15 5 분할 주문서 = 동일 importer 가 file_hash 별 5회 멱등 import (5분할 자동 인식 X)

---

## 11. 후속 (9회차 워크플로우)

1. **plan 작성** ([writing-plans], `docs/superpowers/plans/2026-05-20-ecount-mig-4-sales-tax-invoice.md`)
2. **Codex 개발** (`mcp__codex__codex` sandbox=workspace-write) — 40~50 file 일괄
3. **사이클 N (최대 3)**: Claude 5-agent review + TM Claude 통합 PR comment (즉시) + Claude fix → Codex 5-agent review + TM Codex 통합 PR comment (즉시) + Codex fix
4. **CI 모두 PASS** + **잔존 결함 0** 시 PM 마지막 종합 리뷰 + `gh pr merge --squash --delete-branch` 자동 실행
5. **MIG-5 자동 진입** — Order 도메인 신규 / 주문서 → SalesAccountingSlip 전환 / 창고이동/지출결의서/입금보고서 후보

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 진행
