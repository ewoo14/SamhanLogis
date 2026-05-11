# dev-report: P2 통합 4건 — 견적서 + 월말마감 + 매출마감 + 재고실사

## 슬라이스 정보

| 항목 | 값 |
|------|-----|
| Branch | `feature/p2-quotation-closing-audit` |
| 작업일 | 2026-05-11 |
| 담당 | BE agent |
| 연관 매뉴얼 | `docs/manual/01-영업/06-견적서.md`, `docs/manual/03-회계/04-월말-마감.md`, `docs/manual/02-창고/04-매출-마감.md`, `docs/manual/02-창고/05-재고-실사.md` |

---

## 구현 범위

### P2-1: 견적서 (slip-service)

| 계층 | 파일 | 상태 |
|------|------|------|
| Entity | `Estimate`, `EstimateLine`, `EstimateNumberSequence`, `EstimateStatus` | 기구현 확인 |
| Repository | `EstimateRepository`, `EstimateLineRepository` | 기구현 확인 |
| Service | `EstimateService`, `EstimateToSlipConverter`, `EstimateNumberService` | 기구현 확인 |
| Controller | `EstimateController` | 기구현 확인 |
| Migration | `V13__add_estimate.sql` | 기구현 확인 |
| 도메인 테스트 | `EstimateDomainTest` | 기구현 확인 |
| **IT 신규** | `EstimateControllerIT` | **이번 PR 신규** |

**endpoint 목록** (gateway: `/api/v1/slips/estimates/...`):

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/slips/estimates` | 인증 | 페이지 조회 (status/partnerId/기간 필터) |
| GET | `/slips/estimates/{id}` | 인증 | 단건 상세 (라인 포함) |
| POST | `/slips/estimates` | SALES/MANAGER/MASTER | 견적서 생성 (DRAFT) |
| PUT | `/slips/estimates/{id}` | SALES/MANAGER/MASTER | 수정 (DRAFT/SENT) |
| POST | `/slips/estimates/{id}/send` | SALES/MANAGER/MASTER | DRAFT → SENT |
| POST | `/slips/estimates/{id}/accept` | SALES/MANAGER/MASTER | SENT → ACCEPTED |
| POST | `/slips/estimates/{id}/reject` | SALES/MANAGER/MASTER | SENT → REJECTED |
| POST | `/slips/estimates/{id}/convert` | SALES/MANAGER/MASTER | ACCEPTED → CONVERTED + Slip 자동 발행 |

**상태 머신**:
```
QUOTE_DRAFT → QUOTE_SENT → QUOTE_ACCEPTED → QUOTE_CONVERTED
                    ↘ QUOTE_REJECTED
```

**변환 정책**: `EstimateToSlipConverter` — Slip(OUTBOUND DRAFT) 자동 생성, `sourceType=ESTIMATE`, `sourceId=견적번호`.

---

### P2-3: 월말 마감 lock (accounting-service)

| 계층 | 파일 | 상태 |
|------|------|------|
| Entity | `AccountingPeriod`, `PeriodStatus`, `PeriodType` | 기구현 확인 |
| Repository | `AccountingPeriodRepository` | 기구현 확인 |
| Service | `MonthEndCloseService` | 기구현 확인 |
| Controller | `MonthEndCloseController` | 기구현 확인 |
| Guard | `AccountingPeriodGuard` | 기구현 확인 (분개 차단) |
| Migration | `V3__add_accounting_period.sql` | 기구현 확인 |
| 도메인 테스트 | `AccountingPeriodDomainTest` | 기구현 확인 |
| IT | `MonthEndCloseControllerIT` | 기구현 확인 |

**endpoint 목록** (gateway: `/api/v1/accounting/closings/...`):

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| POST | `/accounting/closings` | ACCOUNTANT/MASTER | 마감 실행 (DAILY/MONTHLY) |
| GET | `/accounting/closings` | ACCOUNTANT/MASTER | 마감 목록 조회 |
| POST | `/accounting/closings/{id}/reverse` | MASTER | 역마감 (CLOSED → OPEN) |

**분개 차단**: `AccountingPeriodGuard` interceptor — 마감 기간 내 분개/세금계산서 입력 409 CONFLICT.

---

### P2-4: 매출 마감 (accounting-service)

`MonthEndCloseService` 내 통합 구현. slip-service.lockByPeriod 호출 + POSTED 분개 합계 자동 집계.

집계 계정과목 (한국 일반기업회계기준):
- 매출 합계: 4xx (REVENUE) — credit-debit 잔액
- 매입 합계: 5xx (COST_OF_SALES) — debit-credit 잔액
- 판관비 합계: 8xx (SGA) — debit-credit 잔액

---

### P2-6: 재고 실사 (inventory-service)

| 계층 | 파일 | 상태 |
|------|------|------|
| Entity | `InventoryAudit`, `InventoryAuditLine`, `AuditStatus` | 기구현 확인 |
| Repository | `InventoryAuditRepository`, `InventoryAuditLineRepository` | 기구현 확인 |
| Service | `InventoryAuditService` | 기구현 확인 |
| Controller | `InventoryAuditController` | 기구현 확인 |
| Migration | `V3__add_inventory_audit.sql`, `V4__add_inventory_audit_logs_and_edit_requests.sql` | 기구현 확인 |
| IT | `InventoryAuditControllerIT` | 기구현 확인 |

**endpoint 목록** (gateway: `/api/v1/inventory/audits/...`):

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/inventory/audits` | MASTER/MANAGER/ACCOUNTANT 등 | 목록 조회 (warehouse/year/status) |
| GET | `/inventory/audits/{id}` | 조회 권한 | 단건 상세 (라인 포함) |
| POST | `/inventory/audits` | MASTER/MANAGER/INVENTORY | 실사 생성 (PLANNED + snapshot) |
| POST | `/inventory/audits/{id}/start` | MASTER/MANAGER/INVENTORY | PLANNED → IN_PROGRESS |
| POST | `/inventory/audits/{id}/lines` | MASTER/MANAGER/WAREHOUSE/INVENTORY | 라인 실사 수량 입력 |
| PUT | `/inventory/audits/{id}/lines/{lineId}` | 동상 | 라인 수정 |
| POST | `/inventory/audits/{id}/complete` | MASTER/MANAGER/INVENTORY | IN_PROGRESS → COMPLETED + 차이 분개 |
| POST | `/inventory/audits/{id}/cancel` | MASTER/MANAGER/INVENTORY | 취소 |

**차이 자동 분개** (한국 일반기업회계기준):
- 차이(−): 차변 919 재고감모손실 / 대변 150 재고자산
- 차이(+): 차변 150 재고자산 / 대변 919 재고감모손실 (환입)

---

## 신규 파일

| 경로 | 설명 |
|------|------|
| `services/slip-service/src/test/.../estimate/it/EstimateControllerIT.java` | 견적서 Controller IT (5 시나리오) |
| `docs/dev-reports/p2-quotation-closing-audit.md` | 본 dev-report |

---

## 테스트 시나리오 요약

### EstimateControllerIT (P2-1)
1. 견적서 생성 201 + 단건 조회 — status=QUOTE_DRAFT, estimateNo 채번 확인
2. 전체 라이프사이클 — DRAFT → SENT → ACCEPTED → CONVERTED + convertedSlipId 기록
3. 견적서 수정 — DRAFT 단계 헤더 + 라인 replace 200
4. 견적서 목록 조회 200
5. 권한 없는 역할(VIEWER) 생성 시도 → 403

### AccountingPeriodDomainTest (P2-3 기존)
- create → OPEN, close → CLOSED + 합계 stamp, reverse → OPEN 복귀, 이중 마감 차단

### MonthEndCloseControllerIT (P2-4 기존)
- DAILY 마감 201 + slip-service 호출 + lockedCount stamp
- 마감 후 동일 일자 분개 → 409 (AccountingPeriodGuard)
- ACCOUNTANT reverse 403, MASTER reverse 200

### InventoryAuditControllerIT (P2-6 기존)
- 전체 라이프사이클 (PLANNED → IN_PROGRESS → COMPLETED) + 차이 분개 trigger

---

## 가드 준수

| 가드 | 준수 여부 |
|------|-----------|
| UUID 사용자 비공개 | estimateNo / auditNo / periodDate 사용자 노출 식별자, UUID는 path key 전용 |
| IT @MockBean 외부 client | ProductClient / InventoryClient / Notification* / Partner* 전체 MockBean |
| 한국어 Javadoc | 모든 신규/확인 entity/service/controller 한국어 Javadoc 완비 |
| Soft Delete only | markDeleted() 패턴 (BaseEntity 상속) |
| 한국 회계기준 계정과목 | 150 재고자산 / 919 재고감모손실 / 4xx 매출 / 5xx 매입 / 8xx 판관비 |
| 도메인 메서드 의무 | status 전이는 send/accept/reject/markConverted/close/reverse/start/complete/cancel 도메인 메서드만 사용 |
