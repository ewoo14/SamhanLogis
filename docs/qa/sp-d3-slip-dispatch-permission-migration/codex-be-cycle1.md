# Codex BE Review — SP-D3 PR #243 Cycle 1

대상 commit: `df337cdd`  
범위: slip-service / arologis-service / notification-service 동적 RBAC 이중 가드 read-only 검토

## 결론

**Cycle 2 진입 권고. merge blocker 존재.**

## Findings

### F-BE-01 [BLOCKER] `/dispatch-board` FE 라우트의 실제 BE endpoint 에 동적 `dispatch.board` 가드가 없다

- FE `/dispatch-board` 라우트는 `PermissionGuard pageCode="dispatch.board"` 를 사용한다: `clients/desktop/src/renderer/routes/index.tsx:947`.
- 실제 페이지 `DispatchBoardPage` 는 slip-service API 를 호출한다:
  - `GET /admin/dispatch-board/undispatched-slips`: `clients/desktop/src/renderer/api/dispatchBoard.ts:116`
  - dispatch task CRUD: `clients/desktop/src/renderer/routes/dispatch-board/DispatchBoardPage.tsx` 주석 및 hooks
- 해당 slip-service 컨트롤러는 정적 `@PreAuthorize` 만 있고 `DynamicPermissionClient` 가 없다:
  - `DispatchBoardAdminController`: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dispatch/DispatchBoardAdminController.java:28`
  - `DispatchTaskAdminController`: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dispatch/DispatchTaskAdminController.java:39`
- 반면 PR 의 동적 `dispatch.board` BE 가드는 arologis `DispatchAdminV1Controller` 에 적용되어 있다: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/DispatchAdminV1Controller.java:64`, `:98`, `:129`, `:172`, `:203`.

즉 6 PageCode 매핑 의무 기준에서 FE `/dispatch-board` 와 실제 BE controller 상수가 1:1로 맞지 않는다. DB에서 `DISPATCH dispatch.board canEdit=false` 로 내려도 slip-service dispatch task write API 는 기존 정적 role 로 계속 통과한다.

### F-BE-02 [BLOCKER] V7 seed 값이 SP-D3 역할별 hidden 정책과 불일치한다. V9 미발급은 정당화되지 않는다

V7은 6 PageCode를 포함하지만 값이 SP-D3 기대값과 다르다.

- `SALES dispatch.board` 가 `TRUE`: `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:118`
- `WAREHOUSE purchases.receipt-ocr` 가 `FALSE`: `V7__add_role_page_permissions.sql:128`
- `WAREHOUSE sales.slip.list` 가 `TRUE`: `V7__add_role_page_permissions.sql:130`
- `DISPATCH notification.dispatch-sms.send-audit` 와 `dispatch.board` 의 `canEdit` 가 `TRUE`: `V7__add_role_page_permissions.sql:140`, `:145`

문서/시나리오 기대값은 SALES/WAREHOUSE/DISPATCH가 본인 카테고리만 보도록 요구한다. 따라서 "V7에 84 row가 이미 있으므로 V9 불필요" 판단은 row 존재 여부만 본 것으로, 값 정합성 검증을 통과하지 못한다.

### F-BE-03 [IMPORTANT] slip-service 전표 write endpoint 에 `sales.slip.list` / `purchases.slip.list` edit 동적 가드가 연결되지 않았다

`SlipController` 주석은 생성/수정 write 요청에 `checkEditPermission` 을 적용한다고 설명한다: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:72`.

하지만 실제 write endpoint 들은 정적 `@PreAuthorize` 만 있고 `checkEditPermission` 호출이 없다:

- `POST /slips`: `SlipController.java:180`
- `PATCH /slips/{id}/header`: `SlipController.java:191`
- `PATCH /slips/{id}/v20`: `SlipController.java:218`
- `POST /slips/{id}/lines`: `SlipController.java:229`
- `DELETE /slips/{id}/lines/{lineId}`: `SlipController.java:241`

동적 `checkEditPermission` 메서드는 정의되어 있으나 `inspect` 외 전표 write 흐름에 쓰이지 않는다: `SlipController.java:545`. View-only override 정책(`canEdit=false + canView=true -> 403`)이 전표 write 에는 적용되지 않는다.

### F-BE-04 [OK] 3 service `DynamicPermissionClientImpl` 의 `ApiResponse.data.allowed` 파싱 패턴은 SP-D1 cycle 2 fix 와 일관

- slip-service: `services/slip-service/src/main/java/com/samhanair/logis/slip/client/DynamicPermissionClientImpl.java`
- arologis-service: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/DynamicPermissionClientImpl.java`
- notification-service: `services/notification-service/src/main/java/com/samhanair/logis/notification/client/DynamicPermissionClientImpl.java`

세 구현 모두 `JsonNode root.path("data").path("allowed").asBoolean(false)` 흐름이며, 4xx/예외 시 `false` 반환이다.

### F-BE-05 [OK] 기존 IT 보강용 `@MockBean DynamicPermissionClient` + lenient stub 는 지정 파일에 적용됨

확인 파일:

- `ReceiptOcrShellIT`: canView/canEdit lenient true (`:139-140`)
- `SlipInspectControllerIT`: canView/canEdit lenient true (`:103-107`)
- `SlipDeliveryTagFilterIT`: canView/canEdit lenient true (`:115-119`)
- `DispatchAdminV1ControllerIT`: canView/canEdit lenient true (`:109-110`)
- `DispatchSmsSaveHistoryIT`: canView/canEdit lenient true (`:77-82`)

## BE Decision

**merge blocker.** 최소 cycle 2 에서 `dispatch.board` 실제 slip-service endpoint 동적 가드, V9 fix migration, slip write edit guard 정책 중 PR 범위로 약속한 부분을 정리해야 한다.
