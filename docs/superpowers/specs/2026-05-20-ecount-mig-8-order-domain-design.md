# MIG-8 Order 도메인 신규 + MIG-4 주문서 staging 변환 — 설계 (Design Spec)

> 작성일: 2026-05-20
> branch: `spec/2026-05-20-mig-8-order-domain`
> 입력: MIG-4 (PR #272) 머지 staging
> - `staging.ecount_order_raw` (주문서, 13컬럼, 5 분할 파일 적재됨) → Order + OrderLine 도메인 변환

---

## 1. 개요

MIG-7 ([PR #275, `9fd88bc5`](https://github.com/.../pull/275)) 머지 직후 진입. MIG-4 staging-only 패턴을 **Order + OrderLine 도메인 신규 + 변환** 으로 완성. SalesAccountingSlip cross-link (진행상태='완료' 인 주문서 → Slip 연결).

- baseline: MIG-1~7 모두 머지 완료
- 9회차 워크플로우 ([feedback_dual_5agent_review])

---

## 2. 사용자 확정 결정 (2026-05-20)

- **Order + OrderLine 도메인 신규 + MIG-4 staging 변환** (사용자 명시 "진행")
- **PM 자동시작** (자율 진행, brainstorming HARD-GATE skip)
- aging snapshot + Journal 자동 생성 (D-MIG-7-04 옵션 C 이연)은 MIG-9+ 후속

---

## 3. 산출 예정 (35~45 file, 약 2.5~3K LOC)

| 영역 | Flyway | 신규 |
|---|---|---|
| accounting-service | V28 | `orders` + `order_lines` 도메인 + Mig8OrderTransformService + controller + SalesAccountingSlip cross-link |
| auth-service | V21 | PageCode MIG8 1종 + role_page_permissions |
| shared/common | — | ErrorCode MIG8 7종 + EcountMig8TransformResult DTO |

---

## 4. 변환 흐름

```
MIG-4 staging (이미 적재):
   └─ staging.ecount_order_raw (transform_status='PENDING', 13컬럼)
       ↓ Mig8OrderTransformService (pg_advisory_xact_lock + REQUIRES_NEW)
       ↓ 동일 order_no 다중 raw row → 1 Order + N OrderLine 그룹화
도메인:
   ├─ Order (order_no UNIQUE + partner_id + manager_name + valid_until + progress_status + ...)
   └─ OrderLine (order_id FK + product_id + quantity + unit_price + supply_amount + vat_amount + item_due_date)
       ↓ progress_status='완료' 인 경우 → SalesAccountingSlip.slip_no cross-link 시도 (linkSalesSlip)
       ↓ staging.transform_status = 'TRANSFORMED' / 'REJECTED'
```

---

## 5. 도메인 매핑

### 5.1 staging.ecount_order_raw → Order + OrderLine

**raw 컬럼 13종**: 일자-No. / 거래처명 / 담당자명 / 유효기간 / 결제조건 / 참조 / 진행상태 / 품목명[규격] / 수량 / 단가 / 공급가액 / 부가세 / 품목별납기일자

| staging 컬럼 | 도메인 매핑 |
|---|---|
| order_no (일자-No.) | `Order.orderNo` UNIQUE (yyyy-MM-dd-NNN 정규화) |
| partner_name | `Order.partnerId` (MIG-1 partner lookup, MIG-7 패턴) |
| manager_name | `Order.managerName` snapshot (lookup X — Employee cross-link 은 MIG-9+ 이연) |
| valid_until | `Order.validUntil` LocalDate (옵션, 빈 값 허용) |
| payment_terms | `Order.paymentTerms` TEXT |
| reference | `Order.reference` TEXT |
| progress_status | `Order.progressStatus` enum (COMPLETED / IN_PROGRESS / CANCELED / PENDING) |
| item_name | `OrderLine.itemName` snapshot + product_id (MIG-2 item_alias lookup, fail-soft) |
| quantity / unit_price / supply_amount / vat_amount | `OrderLine.*` |
| item_due_date | `OrderLine.itemDueDate` LocalDate |
| source_file_hash + source_row_no | `Order.externalRef` (hash + '-' + headerRowNo) |

### 5.2 Order 도메인 컬럼

- BaseEntity 7 audit + `@SQLRestriction("is_deleted = false")`
- `order_no` VARCHAR(30) UNIQUE
- `partner_id` UUID NOT NULL
- `partner_name` VARCHAR(200) snapshot
- `manager_name` VARCHAR(100)
- `valid_until` DATE NULL
- `payment_terms` TEXT
- `reference` TEXT
- `progress_status` VARCHAR(20) (`COMPLETED` / `IN_PROGRESS` / `CANCELED` / `PENDING`)
- `total_supply_amount` NUMERIC(15,2) (line 합산 자동)
- `total_vat_amount` NUMERIC(15,2)
- `linked_slip_no` VARCHAR(30) NULL (SalesAccountingSlip cross-link, `progress_status='COMPLETED'` 일 때만)
- `external_ref` VARCHAR(100) UNIQUE
- `kind` VARCHAR(20) = `ECOUNT_MIG8` (향후 신규 추가 시 enum 확장)

### 5.3 OrderLine 도메인 컬럼

- BaseEntity 7 audit
- `order_id` UUID FK + UNIQUE (order_id, line_no)
- `line_no` INT (1부터)
- `product_id` UUID NULL (MIG-2 item_alias lookup miss 허용)
- `item_name` VARCHAR(200) snapshot
- `quantity` INT
- `unit_price` NUMERIC(15,2)
- `supply_amount` / `vat_amount` NUMERIC(15,2)
- `item_due_date` DATE NULL

### 5.4 변환 controller

- `POST /admin/accounting/orders/transform-from-staging`
- multipart 없음 (batch trigger)
- ROLE_MASTER + ROLE_MANAGER
- 응답 `EcountMig8TransformResult` (imported / updated / skipped / rejected + completedLinkedSlipCount / sample 20)

---

## 6. SalesAccountingSlip cross-link (progress_status='완료')

- `progress_status` = `COMPLETED` 일 때만 SalesAccountingSlip cross-link 시도
- `order_no` (yyyy-MM-dd-NNN) ↔ `SalesAccountingSlip.slip_no` 매칭
- 매칭 성공 시 `Order.linked_slip_no` 값 설정
- 매칭 실패 시 `Order.linked_slip_no = NULL` + `MIG8_SLIP_LINK_MISS` warning (reject 아님 — 정보성)
- COMPLETED 가 아닌 경우 → linked_slip_no NULL 유지 (정상)

---

## 7. 멱등 키 / 트랜잭션 / 동시성

- 멱등 키 = `external_ref` UNIQUE + soft-delete CTE 복구
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)`
- `pg_advisory_xact_lock(NAMESPACE_ORDER_UUID)` 1 namespace
- 동일 order_no 다중 raw row → 1 Order + N OrderLine 그룹화 (line_no 1부터 증가)
- `ON CONFLICT (external_ref) DO UPDATE` + soft-delete restore
- staging.transform_status 갱신: PENDING → TRANSFORMED / REJECTED
- row-level BusinessException reject 흡수 + DuplicateKeyException catch

---

## 8. 사용자 검증 가드

- UUID 비공개 — 응답 DTO `orderNo / partnerName / managerName / progressStatus / itemName / linkedSlipNo` 비즈니스 식별자만
- 한국어 commit/PR/Javadoc 의무
- BaseEntity 7 audit + `@SQLRestriction`
- ROLE_MASTER+MANAGER seed
- row-level reject + DuplicateKeyException catch

---

## 9. ErrorCode 신규

- `MIG8_STAGING_ROW_NOT_FOUND` — transform 대상 staging row 미존재
- `MIG8_LOOKUP_MISS` — partner_id 누락
- `MIG8_AMOUNT_INVALID` — staging amount/quantity 형식 불일치
- `MIG8_DATE_INVALID` — order_no yyyy-MM-dd parse 실패 / valid_until / item_due_date 포맷
- `MIG8_PROGRESS_STATUS_INVALID` — 완료/진행/취소/대기 외 값
- `MIG8_SLIP_LINK_MISS` — progress_status='완료' 인데 SalesAccountingSlip 매칭 실패 (warning, reject X)
- `MIG8_DUPLICATE_EXTERNAL_REF` — race window

---

## 10. 결정 (D-MIG-8-XX)

- D-MIG-8-01 Order + OrderLine 도메인 신규 (accounting-service)
- D-MIG-8-02 MIG-4 staging.ecount_order_raw → 도메인 변환 단방향
- D-MIG-8-03 progress_status enum 4종 (COMPLETED / IN_PROGRESS / CANCELED / PENDING)
- D-MIG-8-04 SalesAccountingSlip cross-link 은 progress_status='COMPLETED' 일 때만 시도 (linked_slip_no NULL fallback 허용)
- D-MIG-8-05 매니저명 = snapshot 만 (Employee cross-link MIG-9+ 이연)
- D-MIG-8-06 동일 order_no 다중 row → 1 Order + N OrderLine 그룹화
- D-MIG-8-07 멱등 키 = `external_ref` UNIQUE
- D-MIG-8-08 1 namespace pg_advisory_xact_lock (NAMESPACE_ORDER_UUID)
- D-MIG-8-09 soft-delete CTE 복구 (Order + OrderLine 양쪽)
- D-MIG-8-10 admin UI 미구현 (후속)
- D-MIG-8-11 PageCode MIG8 1종 (auth V21)
- D-MIG-8-12 ErrorCode MIG8 7종
- D-MIG-8-13 PM 자동시작
- D-MIG-8-14 transform service 단위 테스트 9~11 케이스 (MIG-7 회고 적용)
- D-MIG-8-15 IT 5 case × 1 endpoint = 5 IT parameterized
- D-MIG-8-16 SalesAccountingSlip cross-link 회귀 테스트 의무

---

## 11. samhan-public-overview.html 동기화

- nav-badge: `Phase 10.6 · MIG-8 진행 중` → 머지 시 `Phase 10.6 · MIG-9 진행 예정`
- Phase 10.6 row sub-task `MIG-1~7 + MIG-8 #N`
- callout 누적 갱신

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 진행
