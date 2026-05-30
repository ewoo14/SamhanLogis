# dev-report — 주문(Partner-Order) 보류(ON_HOLD) 상태 + 리스트 상태 필터 (Phase 2.5)

> Phase 2.4 RESTORE 확장(D-RST-07) 직후 슬라이스. ON_HOLD 신규 enum + 보류/해제 도메인 메서드 + hold/release API + FE 라벨/버튼/필터 + STATUS revision 캡처. 리스트 필터 및 기간 기준 분기 인프라는 grounding 결과 **이미 완성** — 실제 신규 구현 범위를 spec이 정확히 축소했다.
> (spec: `docs/superpowers/specs/2026-05-31-partner-order-hold-status-filter-design.md`)

---

## 1. 개요 / 목적

거래처 주문이 들어오면 자동으로 **진행중**(DRAFT)이 되고, 출고전표 전환 시 **완료**(CONFIRMED)가 된다. 기존에는 "멈춘 편집 가능 상태"를 표현할 status가 없어 담당자가 메모에 "보류" 텍스트를 남기는 비공식 운영이 있었다.

본 슬라이스는:
- **ON_HOLD(보류) 신규 enum**: 진행중과 완료 사이의 공식 중간 상태 확립.
- **보류/해제 전이 API**: `POST /{id}/hold` / `POST /{id}/release` — edit 권한(UPDATE) 재사용.
- **라벨 업무용어 통일**: DRAFT='작성중' → '진행중', CONFIRMED='확정' → '완료'.
- **리스트 상태 필터**: 기존 인프라(드롭다운 + Specification) 그대로 ON_HOLD 값 추가.
- **STATUS revision 첫 실사용**: Phase 2.4에서 예약한 STATUS 유형을 보류/해제 전이 캡처에 활용.

---

## 2. 상태 모델

### 2.1 enum 정의 (PartnerOrderStatus.java)

| 업무 용어 | enum | 편집/복원 | 전이 규칙 |
|---|---|---|---|
| 진행중 | **DRAFT** | 편집 가능 | → ON_HOLD(보류) / → CONFIRMING → CONFIRMED(출고전표 전환) |
| 보류 | **ON_HOLD** (Phase 2.5 신규) | 편집 가능 | → DRAFT(해제) / → CONFIRMING → CONFIRMED(출고전표 전환) |
| (전환중) | CONFIRMING | 편집 불가 (transient, advisory lock 진행 중) | 사용자 비노출 |
| 완료 | CONFIRMED | 복원 가능, 직접 편집 불가 | slip 발행됨 |
| 취소 | CANCELED | 불가 | 사용자 비노출 |

### 2.2 업무 용어 라벨 통일

Phase 2.4 업무용어 확정(D-RST-07)과 일관하여 FE 라벨을 개발책임자 표현으로 통일한다.

| enum | 기존 FE 라벨 | Phase 2.5 이후 |
|---|---|---|
| DRAFT | 작성중 | **진행중** |
| ON_HOLD | (없음) | **보류** (신규) |
| CONFIRMED | 확정 | **완료** |
| CONFIRMING | 확정 처리중 | 확정 처리중 (사용자 비노출, 유지) |
| CANCELED | 취소 | 취소 (사용자 비노출, 유지) |

---

## 3. 상태 전이 도메인 메서드

### 3.1 markOnHold() — DRAFT → ON_HOLD

```java
/** PartnerOrder.java */
public void markOnHold() {
    if (this.status != PartnerOrderStatus.DRAFT) {
        throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "진행중(DRAFT) 주문만 보류할 수 있습니다. 현재 상태: " + this.status);
    }
    this.status = PartnerOrderStatus.ON_HOLD;
}
```

- DRAFT가 아니면 409 CONFLICT.
- **완료(CONFIRMED)는 보류 불가**: 출고전표(slip)가 이미 발행된 상태이므로 보류 전환 시 slip 정합성이 파괴된다. 완료 주문을 보류로 만드는 business need가 없고, 이미 발행된 slip은 별도 취소/재발행 슬라이스 영역이다.

### 3.2 releaseHold() — ON_HOLD → DRAFT

```java
public void releaseHold() {
    if (this.status != PartnerOrderStatus.ON_HOLD) {
        throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "보류(ON_HOLD) 주문만 해제할 수 있습니다. 현재 상태: " + this.status);
    }
    this.status = PartnerOrderStatus.DRAFT;
}
```

- ON_HOLD가 아니면 409 CONFLICT.
- 해제 후 DRAFT로 복귀 — 이후 일반 confirm(출고전표 전환) 흐름 재진입 가능.

### 3.3 전이 권한

보류/해제 모두 `sales.partner-order.edit` UPDATE action 재사용. 신규 page 추가 불필요 (D-PO-04 매트릭스 행 증가 최소화 방침 일관).

### 3.4 confirm 가드 조정 — ON_HOLD도 전환 허용

`markConfirming()`이 기존에 DRAFT만 허용했으나, **보류 주문도 confirm(출고전표 전환)이 가능해야 한다**는 업무 요구를 반영하여 가드를 `DRAFT 또는 ON_HOLD`로 확대한다. 보류 상태에서 직접 전환하면 ON_HOLD → CONFIRMING → CONFIRMED 경로가 발생한다.

---

## 4. API

### 4.1 보류 전이 endpoint (PartnerOrderHoldController.java)

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| POST | `/api/v1/partner-orders/{id}/hold` | `sales.partner-order.edit` UPDATE | DRAFT → ON_HOLD. DRAFT가 아니면 409. |
| POST | `/api/v1/partner-orders/{id}/release` | `sales.partner-order.edit` UPDATE | ON_HOLD → DRAFT. ON_HOLD가 아니면 409. |

- 응답: `ApiResponse<PartnerOrderDetailResponse>` — 전이 후 주문 상세.
- `{id}`: 주문번호(YYYY/MM/DD-N 또는 YYYY-MM-DD-N 안전 path) 또는 내부 UUID 모두 허용. 화면에는 주문번호만 표시 (UUID 비공개 가드).
- `X-User-Id` / `X-User-Name` 헤더 → 감사 로그(PartnerOrderAuditLog) 기록.

### 4.2 STATUS revision 캡처 (첫 실사용)

Phase 2.4에서 `revision_type = STATUS`를 "향후 취소·보류 전이 예약"으로 선언했다. Phase 2.5 보류/해제 전이가 STATUS 유형의 **첫 실사용**이다.

- `hold()` 완료 직후 `revisionService.capture(order, STATUS, ...)` 호출 → `partner_order_revisions`에 STATUS 행 삽입.
- `release()` 완료 직후 동일 패턴.
- changeSummary: `headerChanged=1`(status 필드 변경), lineAdded/lineRemoved/lineModified=0.

---

## 5. confirm 경로와 ON_HOLD의 관계

**ON_HOLD 주문은 PartnerOrderDraft confirm 경로와 무관하다.**

이 점을 명확히 하는 이유: `PartnerOrderDraft`는 거래처 포털에서 작성한 임시저장 문서이며, `PartnerOrderDraft.confirm`이 호출되면 새 `PartnerOrder`가 INSERT된다. 이때 신규 주문은 CONFIRMING → CONFIRMED 경로를 바로 밟는다 — DRAFT나 ON_HOLD를 거치지 않는다.

반면 `PartnerOrder.createFromEstimate`로 생성된 주문은 견적 전환 직후 status=DRAFT로 시작하며, 이 주문이 보류(ON_HOLD)→해제(DRAFT)→confirm(출고전표 전환) 흐름을 탄다.

따라서:
- `PartnerOrderDraft` confirm은 ON_HOLD를 전혀 거치지 않는다.
- `PartnerOrder`(createFromEstimate 생성분)의 DRAFT/ON_HOLD는 draft confirm 흐름과 별도다.
- 보류 API(`POST /{id}/hold`)는 이미 INSERT된 `PartnerOrder` 엔티티의 상태 전이이며, `PartnerOrderDraft` 임시저장과는 다른 엔티티다.

---

## 6. 리스트 정렬 / 기간 필터 분기 (PartnerOrderQueryService)

### 6.1 인프라 현황

grounding 결과 리스트 status 필터 인프라는 **이미 완성**되어 있었다:
- `PartnerOrderListController` — `status` query param 수신.
- `PartnerOrderQueryService.toSpec()` — `JpaSpecificationExecutor` 기반 status Specification.
- `PartnerOrderRepository` — `JpaSpecificationExecutor` 상속.

ON_HOLD enum 추가만으로 `status=ON_HOLD` 필터가 자동 동작한다.

### 6.2 기간 필터 기준 필드 분기

DRAFT와 ON_HOLD는 `confirmedAt = null`이다. confirmedAt 기준으로 날짜 필터를 적용하면 이 두 상태의 주문이 항상 제외된다. Phase 2.5에서 `toSpec()` 내부에 분기를 추가했다.

```java
// DRAFT/ON_HOLD 는 confirmedAt=null → createdAt 기준으로 기간필터 적용
boolean preConfirm = filter.status() == PartnerOrderStatus.DRAFT
        || filter.status() == PartnerOrderStatus.ON_HOLD;
String dateField = preConfirm ? "createdAt" : "confirmedAt";
```

| status 필터 | 기간 기준 필드 | 근거 |
|---|---|---|
| DRAFT (진행중) | `createdAt` | confirmedAt=null이므로 생성일 기준이 자연스러움 |
| ON_HOLD (보류) | `createdAt` | 동일. confirmedAt=null |
| CONFIRMED (완료) | `confirmedAt` | 출고전표 전환 확정 시각이 업무 기준 |
| CONFIRMING / CANCELED / 미지정 | `confirmedAt` | 기본값 |

### 6.3 리스트 기본 필터

FE 리스트 드롭다운 기본값은 **진행중(DRAFT)**. 보류(ON_HOLD) 주문은 기본 보기에서 분리 — 담당자가 별도 선택해야 확인 가능하다. 이는 진행중 주문 목록을 간결하게 유지하는 업무 결정이다.

---

## 7. 프론트엔드

### 7.1 라벨 / 필터 드롭다운 (sales.ts)

`PARTNER_ORDER_STATUS_LABEL` 맵 업무용어 통일:

```ts
export const PARTNER_ORDER_STATUS_LABEL: Record<PartnerOrderStatus, string> = {
  DRAFT: '진행중',        // 기존 '작성중' → 업무용어 통일
  ON_HOLD: '보류',        // Phase 2.5 신규
  CONFIRMING: '확정 처리중',
  CONFIRMED: '완료',      // 기존 '확정' → 업무용어 통일
  CANCELED: '취소',
};
```

### 7.2 상태 필터 드롭다운 (SalesPartnerOrderListPage.tsx)

기존 `statusFilter` state + Select 드롭다운이 이미 구현되어 있다. ON_HOLD 옵션 추가:

```ts
<option value="">전체</option>
<option value="DRAFT">진행중</option>
<option value="ON_HOLD">보류</option>
<option value="CONFIRMED">완료</option>
```

기본값: `DRAFT` (진행중만 기본 표시).

### 7.3 보류/해제 버튼 (SalesPartnerOrderDetailPage.tsx)

주문 상세 화면에 상태 기반 버튼 노출:

| 현재 status | 버튼 | 호출 API |
|---|---|---|
| DRAFT | "보류" 버튼 | `POST /{id}/hold` |
| ON_HOLD | "보류 해제" 버튼 | `POST /{id}/release` |
| CONFIRMED / CONFIRMING / CANCELED | 버튼 없음 | - |

- edit 권한(`canUpdate`) 게이트: 권한 없으면 버튼 미표시.
- 성공 후 `['partner-order', id]` + `['partner-orders']` 쿼리 무효화 (Phase 2.4 무효화 패턴 일관).
- 낙관적 잠금 충돌(409) 시 "다른 사용자가 먼저 변경했습니다." 토스트.

---

## 8. 테스트

### 8.1 BE 단위 테스트 (4케이스)

| 케이스 | 검증 |
|---|---|
| UT-1 | `markOnHold()` — DRAFT → ON_HOLD 전이 성공 |
| UT-2 | `markOnHold()` — ON_HOLD 상태에서 호출 → 409 예외 |
| UT-3 | `releaseHold()` — ON_HOLD → DRAFT 전이 성공 |
| UT-4 | `releaseHold()` — DRAFT 상태에서 호출 → 409 예외 |

### 8.2 BE 통합 테스트 IT (8케이스, Testcontainers)

`PartnerOrderHoldStatusFilterIT` — 실 PostgreSQL + 실 Flyway. `@MockBean DynamicPermissionClient` 격리.

| 케이스 | 내용 |
|---|---|
| IT-1 | DRAFT → hold → ON_HOLD 확인 + STATUS revision 캡처 확인 |
| IT-2 | ON_HOLD → release → DRAFT 확인 + STATUS revision 캡처 확인 |
| IT-3 | CONFIRMED 주문 hold 시도 → 409 CONFLICT |
| IT-4 | `status=DRAFT` 필터 조회 → DRAFT 주문만 반환, ON_HOLD 미포함 |
| IT-5 | `status=ON_HOLD` 필터 조회 → ON_HOLD 주문만 반환 |
| IT-6 | `status=CONFIRMED` 필터 조회 → CONFIRMED 주문만 반환 |
| IT-7 | ON_HOLD 주문 confirm(출고전표 전환) → CONFIRMING → CONFIRMED 성공 |
| IT-8 | ON_HOLD 주문 복원(Phase 2.4 연계) → `requireRestorable()` 통과(제외목록 방식, 수정 불필요) |

### 8.3 FE Playwright (3케이스)

`playwright/specs/partner-order-hold-status-filter.spec.ts` — mock 모드.

| 케이스 | 내용 |
|---|---|
| PW-1 | 리스트 기본 진입 → DRAFT(진행중) 필터 적용 확인 |
| PW-2 | 필터 드롭다운 "보류" 선택 → ON_HOLD 주문 목록 표시 |
| PW-3 | 상세 화면 — DRAFT 주문에 "보류" 버튼 표시, 클릭 → ON_HOLD 전환 + 버튼 "보류 해제"로 전환 |

---

## 9. 마이그레이션 불필요 근거

`partner_orders` 테이블 V1 DDL:

```sql
status VARCHAR(20) NOT NULL
```

**CHECK 제약 없음** — PostgreSQL이 VARCHAR 값을 DB 레벨에서 검증하지 않는다. `PartnerOrderStatus` enum의 JPA `@Enumerated(EnumType.STRING)` 매핑이 Java 레이어에서 유효한 enum 값만 삽입을 허용한다.

따라서 ON_HOLD 추가를 위한 **Flyway 마이그레이션(V8)이 불필요하다**. 선택적으로 조회 성능을 위한 `status` 컬럼 인덱스만 고려할 수 있으나, 현재 주문 건수 기준으로 Full Scan 대비 이득이 크지 않아 후속 모니터링 후 결정한다.

---

## 10. 관련 파일

| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `domain/PartnerOrderStatus.java` | 수정 | ON_HOLD 추가 |
| `domain/PartnerOrder.java` | 수정 | markOnHold() / releaseHold() 도메인 메서드 + markConfirming() 가드 확대 |
| `service/PartnerOrderHoldService.java` | 신규 | hold/release 처리 + AuditLog + STATUS revision 캡처 |
| `web/PartnerOrderHoldController.java` | 신규 | POST /{id}/hold, POST /{id}/release |
| `service/PartnerOrderQueryService.java` | 수정 | toSpec() DRAFT/ON_HOLD → createdAt 기간 분기 |
| `clients/desktop/src/renderer/api/sales.ts` | 수정 | PARTNER_ORDER_STATUS_LABEL 라벨 통일 + ON_HOLD 추가 |
| `clients/desktop/src/renderer/pages/SalesPartnerOrderListPage.tsx` | 수정 | ON_HOLD 필터 옵션 추가 |
| `clients/desktop/src/renderer/pages/SalesPartnerOrderDetailPage.tsx` | 수정 | 보류/해제 버튼 |
| `src/test/java/.../PartnerOrderHoldStatusFilterIT.java` | 신규 | IT 8케이스 |
| `playwright/specs/partner-order-hold-status-filter.spec.ts` | 신규 | Playwright 3케이스 |

dev-report: `docs/dev-reports/phase-2-5-partner-order-hold-status-filter.md` (본 파일)
