# SP-D3 BE 리뷰 — Cycle 1
> 리뷰어: Claude BE Agent
> 브랜치: `feat/sp-d3-slip-dispatch-permission-migration` (commit `df337cdd`)
> 작성일: 2026-05-18

---

## 1. 리뷰 범위

| 서비스 | 파일 | 변경 유형 |
|--------|------|-----------|
| slip-service | `client/DynamicPermissionClient.java` | 신규 |
| slip-service | `client/DynamicPermissionClientImpl.java` | 신규 |
| slip-service | `web/SlipController.java` | 변경 |
| slip-service | `web/ReceiptOcrController.java` | 변경 |
| arologis-service | `client/DynamicPermissionClient.java` | 신규 |
| arologis-service | `client/DynamicPermissionClientImpl.java` | 신규 |
| arologis-service | `controller/DispatchAdminV1Controller.java` | 변경 |
| notification-service | `client/DynamicPermissionClient.java` | 신규 |
| notification-service | `client/DynamicPermissionClientImpl.java` | 신규 |
| notification-service | `controller/DispatchSmsSaveHistoryController.java` | 변경 |
| slip-service IT | `SlipDynamicPermissionIT.java` | 신규 (6 케이스) |
| arologis-service IT | `ArologisDynamicPermissionIT.java` | 신규 (6 케이스) |
| notification-service IT | `NotificationDynamicPermissionIT.java` + `DispatchSmsAuditDynamicPermissionIT.java` | 신규 |

---

## 2. 이중 가드 정책 일관성

### 2.1 정책 개요 (SP-D1/D2 패턴 계승)

SP-D3 는 3개 서비스 모두에서 다음 이중 가드 체계를 일관 적용:

```
기존 @PreAuthorize ("ROLE_SALES" 등)
  ↓ 통과 후
DynamicPermissionClient.canView() / canEdit()
  ↓
canView=false → 403 FORBIDDEN
canEdit=false + canView=true → 403 (view-only override deny)
canEdit=false + canView=false → fallback 통과 (override row 없음)
actorRole null/blank → 건너뜀
```

### 2.2 검증 결과

**slip-service SlipController**

- `GET /slips?slipType=INBOUND` 경로: 4단계 가드 체인 확인
  - 1단계: `guardInboundPurchaseRead` (정적 역할)
  - 2단계: `restrictInboundWhenTypeOmitted` (타입 생략 시 범위 축소)
  - 3단계: 재가드 (restrict 결과 재검증)
  - 4단계: `checkViewPermission(role, PURCHASES_SLIP_LIST_PAGE_CODE)` — SP-D3 동적 가드
- `GET /slips?slipType=OUTBOUND` 경로: 동일 패턴 SALES_SLIP_LIST_PAGE_CODE 적용 확인
- `POST /{id}/inspect`: `checkEditPermission(roleHeader, INBOUND_INSPECTION_PAGE_CODE)` 정확히 적용

**arologis-service DispatchAdminV1Controller**

- `GET /dispatches`: `checkViewPermission(roleHeader)` — DISPATCH_BOARD_PAGE_CODE
- `POST /dispatches/auto-match`: `checkEditPermission(roleHeader)` — view-only override 정책
- `POST /dispatches/{id}/manual-assign`: `checkEditPermission(roleHeader)` 적용
- `PATCH /dispatches/{id}/driver`: `checkEditPermission(roleHeader)` 적용

**notification-service DispatchSmsSaveHistoryController**

- `GET /history`: `checkViewPermission(roleHeader)` — DISPATCH_SMS_AUDIT_PAGE_CODE
- `POST /history`: `checkEditPermission(roleHeader)` — view-only override 정책
- `GET /latest` 및 `GET /{id}`: 별도 VIEW 가드 확인 필요 (아래 결함 항목 참조)

---

## 3. DynamicPermissionClientImpl 구현 일관성

3개 서비스의 Impl 클래스가 아래 4개 장애 격리 경로를 모두 동일하게 구현:

| 경로 | 처리 | 결과 |
|------|------|------|
| `RestClientException` | `catch` → `false` | 보수적 fallback |
| 일반 `Exception` | `catch` → `false` | 보수적 fallback |
| 4xx (`is4xxClientError`) | `onStatus` handler → 예외 미발생 | `false` |
| `data`/`allowed` 필드 누락 | `null`/`isMissingNode` 검사 | `false` |

**공통 패턴 확인**: 3개 서비스 모두 `JsonNode`로 `ApiResponse.data.allowed` 래퍼 파싱, `@Qualifier("loadBalancedRestClientBuilder")` 주입, `AUTH_SERVICE_BASE = "http://auth-service"` 일관.

---

## 4. @MockBean 격리 + lenient stub 패턴 (SP-D2 P04 트랩 회귀 방지)

### 4.1 신규 IT

| IT 클래스 | @MockBean DynamicPermissionClient | @BeforeEach lenient stub |
|-----------|-----------------------------------|--------------------------|
| `SlipDynamicPermissionIT` | 확인 | canView/canEdit=true 기본값 |
| `ArologisDynamicPermissionIT` | 확인 | canView/canEdit=true 기본값 |
| `NotificationDynamicPermissionIT` | 확인 | canView/canEdit=true 기본값 |
| `DispatchSmsAuditDynamicPermissionIT` | 확인 | canView/canEdit=true 기본값 |

### 4.2 기존 IT 보강

기존 IT에 DynamicPermissionClient @MockBean 후향 추가 여부 확인:

| IT 클래스 | 보강 상태 |
|-----------|-----------|
| `SlipInspectControllerIT` | @MockBean + lenient stub 추가 확인 |
| `SlipDeliveryTagFilterIT` | @MockBean + lenient stub 추가 확인 |
| `ReceiptOcrShellIT` | @MockBean + lenient stub 추가 확인 |
| `DispatchSmsSaveHistoryIT` | @MockBean + lenient stub 추가 확인 |
| `DispatchAdminV1ControllerIT` | @MockBean + lenient stub 추가 확인 |

SP-D2 P04 트랩 재현 방지 패턴이 기존 IT 전체에 소급 적용됨.

---

## 5. 한국어 Javadoc

- `DynamicPermissionClient` 인터페이스: 클래스 레벨 + `canEdit` + `canView` 메서드 Javadoc 완비 (3개 서비스 일관)
- `DynamicPermissionClientImpl`: 클래스 레벨 + 생성자 + `canEdit`/`canView`/`checkPermission` 메서드 Javadoc 완비
- controller 변경 메서드: `checkViewPermission`/`checkEditPermission` helper 메서드 Javadoc 완비
- 이중 가드 정책 (`@param actorRole`, `@param pageCode`) 파라미터 설명 정확

---

## 6. V9 Flyway 불필요 확인

V7 `V7__add_role_page_permissions.sql` (84 row) 이 이미 SP-D3 대상 6 PageCode 모두 포함:

```
purchases.slip.list, sales.slip.list, inbound.inspection,
dispatch.board, notification.dispatch-sms.send-audit, purchases.receipt-ocr
```

7개 역할(MASTER/MANAGER/ACCOUNTANT/SALES/WAREHOUSE/DISPATCH/INVENTORY) × 12 PageCode = 84 row 확인.
V8은 SP-D2 회계 전용 신규 7 PageCode. SP-D3용 V9 불필요 — 정책 확인 완료.

---

## 7. 발견된 결함

### F-BE-01 [CRITICAL] SlipController — create/editHeader/updateV20/addLine 등 WRITE 엔드포인트에 checkEditPermission 누락

**위치**: `SlipController.java` — `@PostMapping` (create), `@PatchMapping("/{id}/header")`, `@PatchMapping("/{id}/v20")`, `@PostMapping("/{id}/lines")` 등

**증거**:
```
@PostMapping
@ResponseStatus(HttpStatus.CREATED)
@PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
public ApiResponse<SlipDetailResponse> create(...)  {
    // SP-D3 checkEditPermission 없음
    return ApiResponse.ok(slipService.create(...));
}
```

`/slips?slipType=INBOUND|OUTBOUND` GET 조회에는 checkViewPermission이 적용되나, 동일 페이지코드 범위의 POST/PATCH 쓰기 엔드포인트에 `checkEditPermission(role, SALES/PURCHASES_SLIP_LIST_PAGE_CODE)` 미적용.

`/slips/{id}/inspect` 에만 `checkEditPermission(roleHeader, INBOUND_INSPECTION_PAGE_CODE)` 적용된 것과 불일치. SALES 역할로 `sales.slip.list` canEdit=false 설정 후 `POST /slips`(OUTBOUND 전표 생성)이 통과됨 — view-only 사용자의 쓰기가 차단되지 않는 보안 취약점.

**권고**: `create`, `editHeader`, `updateV20`, `addLine`, `deleteLine` 엔드포인트에 요청 slipType에 따라 `checkEditPermission(role, SALES_SLIP_LIST_PAGE_CODE)` 또는 `checkEditPermission(role, PURCHASES_SLIP_LIST_PAGE_CODE)` 추가 필요. slipType이 결정되는 시점에서 적용.

### F-BE-02 [MINOR] V7 Flyway — SALES 역할 `dispatch.board` canView=TRUE 설정

**위치**: `V7__add_role_page_permissions.sql`, 118번 라인

**증거**:
```sql
('d1000004-0000-0000-0000-000000000011', 'SALES', 'dispatch.board', TRUE, FALSE, ...)
```

`domain-integrity-check.md` §3 SQL 검증에서 "SALES는 기본적으로 `dispatch.board` 권한이 없어야 한다"고 명시하고 있으나, V7 seed에서 SALES의 `dispatch.board` canView=TRUE로 설정됨. Playwright T1 시나리오("SALES → 배차 hidden")와 불일치.

V8 migration에서 회계 메뉴에 대한 SALES canView 보정이 이루어졌으나 `dispatch.board`에 대한 보정이 누락됨.

**권고**: V9 (또는 V8 후속 fix migration)에서 SALES `dispatch.board` canView=FALSE, canEdit=FALSE로 UPDATE 추가. 또는 AppLayout의 `showDispatchBoard` 로직을 `dynamicCanAccess('dispatch.board', 'view')` 결과에만 의존하고 있어 DB seed 값이 실제 화면 노출에 직결됨.

### F-BE-03 [MINOR] DispatchSmsSaveHistoryController — `GET /latest` 및 `GET /{id}` 상세 엔드포인트에 VIEW 가드 미적용

**위치**: `DispatchSmsSaveHistoryController.java`

목록 조회 `GET /history`에는 `checkViewPermission(roleHeader)` 적용, 저장 `POST /history`에는 `checkEditPermission(roleHeader)` 적용됨. 그러나 `GET /history/latest` (최신 이력 조회)와 `GET /history/{id}` (상세 단건 조회) 엔드포인트에 `checkViewPermission` 미적용.

SP-D3 이중 가드 정책에서 "목록/상세 GET에 VIEW 가드"로 명시되어 있으나 상세 조회 엔드포인트 누락.

**권고**: `GET /history/latest`, `GET /history/{id}` 엔드포인트에 `checkViewPermission(roleHeader)` 추가.

### F-BE-04 [INFO] SlipDynamicPermissionIT C5 — fallback 시 403 허용 여부 모호한 assertion

**위치**: `SlipDynamicPermissionIT.java` C5 케이스

`DynamicPermissionClient.canView()` RuntimeException 발생 시 `DynamicPermissionClientImpl.checkPermission()`이 `catch (Exception ex)` 블록에서 `false` 반환. 컨트롤러는 `canView=false`이면 `BusinessException(ErrorCode.FORBIDDEN)` 발생 → 403 응답.

그러나 IT C5는 "500이 아님"만 검증하고 있어 403과 200 모두 허용하는 형태. Impl이 RuntimeException을 내부에서 catch하여 false 반환하므로 실제 결과는 403이 발생하는 것이 정확한 동작. 테스트 의도와 구현 결과가 일치하나 assertion이 완전하지 않아 오해 소지.

**권고**: C5 assertion에 "실제 fallback 결과는 403" 주석 추가 또는 `status().isForbidden()` assertion으로 명확화.

---

## 8. 총평

| 항목 | 상태 |
|------|------|
| 이중 가드 정책 일관 | 부분 달성 (write 엔드포인트 누락 존재) |
| @MockBean DynamicPermissionClient 격리 | 완전 달성 |
| @BeforeEach lenient stub 패턴 | 완전 달성 |
| 한국어 Javadoc | 완전 달성 |
| V9 Flyway 불필요 확인 | 달성 |
| 장애 격리 (fallback=false) | 완전 달성 |

**사이클 1 결론**: F-BE-01(CRITICAL) 해결 없이 APPROVE 불가. F-BE-02, F-BE-03은 기능 보안 관련이므로 cycle 2 수정 권고.

---

## 9. TM 결정 권고

**cycle 2 수정 필수** — F-BE-01 (슬립 WRITE 엔드포인트 편집 가드 누락) 해결 후 재리뷰.
