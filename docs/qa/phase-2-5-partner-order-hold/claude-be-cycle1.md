# Phase 2.5 — Partner-Order 보류(ON_HOLD) BE 코드 리뷰 (Claude Cycle 1)

- 리뷰어: Claude BE Agent
- 브랜치: feat/phase-2-5-partner-order-hold-status-filter
- diff 범위: bbe45bf6..HEAD (BE 파일만)
- 리뷰 일시: 2026-05-30

---

## 종합 판정: BE APPROVE (결함 없음)

전이 가드, list 필터 분기, 트랜잭션 패턴, IT @MockBean 격리, RESTORE 연계 모두 규칙 준수.
아래에 항목별 상세 점검 결과를 기록한다.

---

## 1. 전이 가드 (markOnHold / releaseHold)

**판정: PASS**

- `PartnerOrder.markOnHold()` — `this.status != DRAFT` 조건으로 DRAFT 이외 전체 거부 후 409. 단일 허용 상태 방어이므로 ON_HOLD → ON_HOLD 중복 호출도 409로 차단됨.
- `PartnerOrder.releaseHold()` — `this.status != ON_HOLD` 조건으로 ON_HOLD 이외 전체 거부 후 409. CONFIRMED/CONFIRMING/CANCELED/DRAFT 전부 차단.
- 409에 ResponseStatusException 사용 — 기존 `requireRestorable()` 패턴과 동일. 컨벤션 일관.
- CONFIRMING 상태에서 markOnHold() 호출 시도 → 409 정확히 차단됨 (중간 전이 상태 보호).

---

## 2. list 보정 정합 (PartnerOrderQueryService.toSpec)

**판정: PASS — 단, 주의사항 1건 Minor 기록**

### 2-1. DRAFT/ON_HOLD createdAt 분기
```java
boolean preConfirm = filter.status() == PartnerOrderStatus.DRAFT
        || filter.status() == PartnerOrderStatus.ON_HOLD;
String dateField = preConfirm ? "createdAt" : "confirmedAt";
```
- DRAFT/ON_HOLD 는 `confirmedAt=null` — confirmedAt 기반 기간 필터 시 전 row 제외됨. createdAt 분기 설계 정확.
- 정렬(Pageable sort)과 기간필터 모두 동일 `dateField` 문자열을 참조 → 정렬/필터 필드 불일치 없음.

### 2-2. status=null (전체 조회) 시 동작
- `preConfirm = false` → dateField = "confirmedAt".
- DRAFT/ON_HOLD 주문의 confirmedAt=null 이므로 기간 필터 적용 시 해당 주문은 제외된다.
- **Minor [Minor] QueryService:141** — status=null + 기간 필터 조합 시 DRAFT/ON_HOLD 주문이 무음으로 제외됨. 현재 FE 기본값이 status=DRAFT 필터이므로 실운영 영향은 없으나, 추후 "전체 조회 + 기간" 기능 추가 시 혼란 가능성이 있다. 설계 의도(status 미지정이면 CONFIRMED 기준 조회)가 Javadoc에 명시적으로 언급되어 있어 의도적 결정으로 확인됨. 당장의 결함은 아니나 추후 슬라이스에서 재검토 권장.

### 2-3. CONFIRMING/CANCELED 기간 기준
- `preConfirm = false` → confirmedAt 기준. CONFIRMING은 `confirmedAt = LocalDateTime.now()`(생성자 설정), CANCELED는 CONFIRMED 후 전이이므로 confirmedAt이 존재함. 정합.

### 2-4. 페이지네이션 영향
- `Specification<PartnerOrder>` 기반 `findAll(spec, pageable)` — countQuery도 동일 spec 적용. dateField가 상수로 spec 클로저에 캡처됨. 페이지 간 일관성 유지.

---

## 3. hold/release API

**판정: PASS**

- 권한: `@RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.UPDATE)` — 기존 edit 권한 재사용. UPDATE action은 IT 케이스8에서 deny/bypass 양쪽 검증됨.
- `PartnerOrderIdResolver.findByIdentifier()` — orderNo 또는 UUID 양쪽 조회 지원. 기존 다른 서비스와 동일 패턴.
- `saveAndFlush()` — 트랜잭션 내 즉시 flush. 응답 전 DB 반영 보장. 정상.
- `PartnerOrderDetailResponse.from(order)` — 신규 메서드 없음, 기존 from() 재사용. 정합.
- `actorId/actorName` 미사용 인자 — Javadoc에 "미래 STATUS revision 캡처 연결 대비 시그니처 유지" 명시. 설계 의도 문서화 완료. 현 단계 결함 아님.
- HTTP method: POST `/hold`, POST `/release` — 상태 전이는 POST 관례 준수.

---

## 4. confirm 흐름 영향 없음 확인

**판정: PASS**

- `PartnerOrderConfirmService`는 `PartnerOrderDraft` (임시 draft) → `PartnerOrder.create()` 로 새 row INSERT(status=CONFIRMING). ON_HOLD는 `createFromEstimate` 경로의 `PartnerOrder` 엔티티 상태이며 confirm INSERT 경로와 완전 분리.
- `PartnerOrderDeleteService.DELETABLE_STATUSES = EnumSet.of(DRAFT, CONFIRMING)` — ON_HOLD가 포함되지 않아 ON_HOLD 주문은 직접 삭제 불가. 보류 중 실수 삭제 방지 역할. 단, 이는 의도적 정책인지 확인 필요.
  - **Minor [Minor] DeleteService:34** — ON_HOLD 주문 삭제를 허용하려면 DELETABLE_STATUSES에 ON_HOLD 추가 필요. 현재 ON_HOLD 주문을 삭제하려면 release 후 삭제해야 함. spec에 명시된 정책인지 확인 권장. 기능 결함은 아님.
- `PartnerOrderEditRequestService.freeStatuses(DRAFT, CONFIRMING)` — ON_HOLD가 free status에 포함되지 않아 ON_HOLD 주문에 편집 요청이 가능한지 확인 필요.
  - **Minor [Minor] EditRequestService:74** — ON_HOLD 주문에 CONFIRMED 흐름 편집요청 생성이 가능한 코드 경로. Phase 2.5 scope 밖이지만 향후 정책 정리 필요.

---

## 5. IT 검증

**판정: PASS**

### 5-1. @MockBean 격리
다음 외부 client 전부 @MockBean 선언 확인:
- EstimateClient, DcConfigClient, ProductClient, InventoryClient, SlipServiceClient, PartnerAuthClient, PartnerLookupClient, ProductCatalogLookupClient, DynamicPermissionClient (9종)
- Eureka 미등록 환경에서 500 없이 정상 동작. feedback_it_mockbean_external_clients 규칙 준수.

### 5-2. DynamicPermissionClient 7-action stub
```java
lenient().when(dynamicPermissionClient.canView(...)).thenReturn(true);
lenient().when(dynamicPermissionClient.canEdit(...)).thenReturn(true);
lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class))).thenReturn(true);
```
- canView/canEdit/check 3개 stub 확인. 기존 IT 패턴과 동일.
- 케이스8a에서 UPDATE 권한 deny 오버라이드(when + eq matcher) 정상.

### 5-3. AbstractPostgresIT 상속 / skipped=0
- `extends AbstractPostgresIT` — Docker 미가용 시 자동 skip. Testcontainers 패턴 준수.
- Docker 가용 환경에서는 skipped=0 예상. 전체 8케이스(8a, 8b 포함 9 @Test) 실행.

### 5-4. list 필터 케이스
- 케이스5(DRAFT), 케이스6(ON_HOLD), 케이스7(CONFIRMED) — 각 3종의 status를 동시 INSERT 후 특정 status만 반환 검증. `totalElements=1` + `content[0].status` 값 단언으로 오염 없음 확인.
- status=null(전체) 필터 케이스는 없음 — Minor 수준. 현재 FE가 status 없는 전체 조회를 사용하지 않으므로 P2 이하.

### 5-5. DB 단언
- 케이스1/2: `jdbcTemplate.queryForObject("SELECT status FROM partner_orders WHERE id = ?")` — API 응답 외 실 DB 값 검증. 정확.

---

## 6. 트랜잭션 / 컨벤션

**판정: PASS**

- `PartnerOrderHoldService`: `@Transactional` (readOnly=false) — hold/release 양쪽 정확 적용.
- `PartnerOrderQueryService`: `@Transactional(readOnly = true)` 클래스 레벨 — list/detail 전부 readOnly. 기존과 동일.
- 도메인 메서드 체인: setter 직접 사용 없음. `markOnHold()` / `releaseHold()` 통해서만 상태 변경.
- 한국어 Javadoc: PartnerOrderStatus, PartnerOrder#markOnHold/releaseHold, PartnerOrderHoldService, PartnerOrderHoldController 전부 한국어 작성 확인.

---

## 7. RESTORE 연계 (Phase 2.4 requireRestorable)

**판정: PASS**

```java
public void requireRestorable() {
    if (this.status == PartnerOrderStatus.CONFIRMING
            || this.status == PartnerOrderStatus.CANCELED) {
        throw new ResponseStatusException(...);
    }
}
```
- 제외목록 방식 — CONFIRMING/CANCELED만 거부, 나머지 전부 허용.
- ON_HOLD는 제외목록에 없음 → 복원 허용. Phase 2.4 Javadoc에 "추후 ON_HOLD 추가 시 이 가드 수정 불필요 (허용 기본)" 주석 선제 기재.
- Phase 2.5 ON_HOLD 추가로 인한 requireRestorable() 회귀 없음 확인.
- `PartnerOrderRevisionService.restore()` 흐름도 `requireRestorable()` 통과 후 ON_HOLD 주문 복원 가능.

---

## 결함 집계

| 등급 | 건수 | 내용 |
|---|---|---|
| P0 | 0 | 없음 |
| P1 | 0 | 없음 |
| P2 | 0 | 없음 |
| Minor | 3 | status=null+기간 필터 DRAFT/ON_HOLD 무음 제외(설계 의도 문서화됨) / ON_HOLD 삭제 불가 정책 명시 필요 / EditRequest freeStatuses ON_HOLD 미포함 |

Minor 3건 모두 현재 scope 밖이거나 의도적 설계 결정으로, 차단 결함 없음.

---

**BE APPROVE**
