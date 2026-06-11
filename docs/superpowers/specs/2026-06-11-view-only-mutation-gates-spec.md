# SPEC — view-only 계정 변경 액션 차단 (FE canAccess 게이트, 6페이지) — PR #462 cycle-3

> 결함-계열 폴드인(개발책임자 결정 2026-06-11). #6 `SalesOrderApprovalsPage` 가 추가한 FE 권한게이트와 **동형 패턴**을, route=VIEW 가드인데 변경 액션이 BE `@RequirePermission(UPDATE/CREATE/DELETE)` 인 6개 화면에 적용한다. BE 는 이미 서버단 403 enforce 중이므로 보안홀은 아니며, FE 방어심층 UX 정합(view-only 계정에 비활성 버튼 노출). 4-종 원자 체크리스트: BE대조 → FE전환 → mock 동기화 → spec 박제.

## 패턴 원본 (#6, 반드시 먼저 Read)
`clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx`
- import `usePermissions`; `const { canAccess } = usePermissions()`; `const canX = canAccess(page, action)`
- 변경 핸들러 첫 줄 `if (!canX) return`; 변경 버튼 `disabled={mutation.isPending || !canX}`

## 공통 사실 (grep 실측)
- `usePermissions().canAccess(pageCode, action)` — action 기본 `'view'`, `'edit'`→`'update'` 정규화, 로딩 중 false(보수적 deny). `renderer/hooks/usePermissions.ts`
- mock `/auth/admin/permissions/my`: 비-MASTER 는 `cell.edit=true`→`['CREATE','UPDATE','DELETE']`, `cell.view=true`→`['VIEW','DOWNLOAD','PRINT']` 파생. `?mockPerms=<base64 JSON [{pageCode,view,edit}]>` 로 per-test override. `renderer/api/mock.ts`
- mock 신규 seed **0건**: 6 page-code 전부 `SP_D1_PAGES`+역할 seed 에 이미 존재 → view-only 재현은 `?mockPerms=[{pageCode, view:true, edit:false}]` override 로만.
- import 경로 깊이: `routes/admin/*` → `'../../hooks/usePermissions'`, `routes/*` → `'../hooks/usePermissions'`, `routes/dispatch-board/*` → `'../../hooks/usePermissions'`.

---

## 1) SlipEditRequestsPage — `routes/admin/SlipEditRequestsPage.tsx`
- **BE**: `slip-service .../editrequest/web/SlipEditRequestController.java` approve(L98-99)·reject(L124-125) `@RequirePermission(page="slip.edit-requests.decide", action=UPDATE)` → **`canAccess('slip.edit-requests.decide','update')`**
- **FE**: import 추가(L57 다음). `const queryClient`(L91) 다음에 `const { canAccess } = usePermissions()` + `const canDecide = canAccess('slip.edit-requests.decide','update')`. early-return: `handleApprove`(L134)·`handleOpenReject`(L150)·`handleRejectSubmit`(L155, `if(!rejectTarget)return` 다음). disabled: 수락(L268)·거절(L278) 버튼에 `|| !canDecide`. 제외: query/polling/필터.
- **mock**: seed 존재(SP_D1_PAGES). `?mockPerms=[{pageCode:'slip.edit-requests.decide',view:true,edit:false}]`.
- **spec**: 신규 묶음 spec 에 케이스. 행 1건 mock 주입 후 approve/reject 버튼 disabled(view-only)/enabled(edit).

## 2) AccountingEditRequestsPage — `routes/admin/AccountingEditRequestsPage.tsx`
- **BE**: `accounting-service .../editrequest/web/AccountingEditRequestController.java` approve(L82-83)·reject(L100-101) UPDATE → **`canAccess('accounting.edit-requests.decide','update')`**
- **FE**: import(L18 다음). `const queryClient`(L54) 다음 `const { canAccess } = usePermissions()` + `const canDecide = canAccess('accounting.edit-requests.decide','update')`. early-return: `handleApprove`(L91)·`handleOpenReject`(L103)·`handleRejectSubmit`(L108). disabled: 수락(L219)·거절(L229) `|| !canDecide`. 제외: query(L59)/polling.
- **mock**: seed 존재. `?mockPerms=[{pageCode:'accounting.edit-requests.decide',view:true,edit:false}]`.
- **spec**: row testid = `req.id.slice(0,8)` → mock id 고정(`aaaaaaaa-...`) 또는 prefix selector `[data-testid^="admin-accounting-edit-requests-approve-"]`.

## 3) DispatchBoardPage — `routes/dispatch-board/DispatchBoardPage.tsx` + `components/VehicleGroupColumn.tsx`
- **BE**: `slip-service .../web/dispatch/DispatchTaskAdminController.java` 모든 write(create/addGroup/removeGroup/assignSlip/reorderSlips/removeSlip/dispatch/modification/cancellation) 단일 `@RequirePermission(page="dispatch.board", action=UPDATE)` → **`canAccess('dispatch.board','update')`**
- **FE B-1 (Page)**: import(L43 다음). `usePageTitle`(L73) 다음 `const { canAccess } = usePermissions()` + `const canEditDispatch = canAccess('dispatch.board','update')`. `handleDragEnd`(L121) 첫 줄 `if (!canEditDispatch) return`(assign/reorder mutation 봉쇄). `<VehicleGroupColumn>`(L195)에 `canEditDispatch={canEditDispatch}` prop.
- **FE B-2 (VehicleGroupColumn)**: props(L32-42)에 `canEditDispatch: boolean` 추가, 구조분해(L100-109)에 추가. L124 `const canEdit = isEditableStatus(taskStatus)` → `const canEdit = isEditableStatus(taskStatus) && canEditDispatch`(단일 합성 지점 → +차량추가 L286·배차완료 canDispatch·자식 canEdit 일괄 차단). 제외: taskQuery, 상세모달 진입(canOpenDetail L130).
- **mock**: `dispatch.board` DISPATCH 자연 view-only 존재. 확정 재현 `?mockPerms=[{pageCode:'dispatch.board',view:true,edit:false}]`.
- **spec**: URL `?mockRole=DISPATCH&mockPerms=...`. `page.route` 광범위 glob 금지(SP-D3 SPA redirect 간섭) — in-process mock. 단언: `[data-testid="dispatch-board-add-vehicle-button"]` disabled(view-only)/enabled(edit). 배차완료는 슬립0 시 항상 disabled → add-vehicle 로 게이트 단언.

## 4) ChatRoomsPage — `routes/admin/ChatRoomsPage.tsx` + `ChatRoomGroupRows` ⚠️정정
- **BE 정정**: `notification-service .../controller/ChatRoomMappingAdminController.java`(GroupwareAdminController 아님). delete(L144-145) DELETE, create 단건추가(L107-108)·import CSV(L127-128) CREATE. **approve/reject 액션 없음**. → 삭제=**`canAccess('messenger.admin','delete')`**, 추가/업로드=**`canAccess('messenger.admin','create')`**
- **FE**: import(L56 다음). `const queryClient`(L110) 다음 `const { canAccess } = usePermissions()` + `const canDeleteChatRoom = canAccess('messenger.admin','delete')` + `const canCreateChatRoom = canAccess('messenger.admin','create')`. early-return: `handleDelete`(L146) 첫 줄 `if (!canDeleteChatRoom) return`. disabled: 단건추가(L219-226)·CSV업로드(L227-234) 버튼 `disabled={!canCreateChatRoom}`. 삭제버튼은 `ChatRoomGroupRows` 자식(L394-404) → props(L335-339)에 `canDelete: boolean` 추가·호출부(L290-301) `canDelete={canDeleteChatRoom}`·구조분해(L341-345) 추가·버튼 `disabled={deletingId===row.id || !canDelete}`. 제외: 검색/그룹표/polling.
- **mock**: `messenger.admin` MANAGER edit→CRUD. `?mockPerms=[{pageCode:'messenger.admin',view:true,edit:false}]` → delete/create 동시 미도출.
- **spec**: 행 mock(`**/api/v1/notification/admin/chat-rooms**` GET 1건). add/import/delete 버튼 disabled(view-only)/enabled(edit).

## 5) AligoAddressBookPage — `routes/admin/AligoAddressBookPage.tsx`
- **BE**: `notification-service .../controller/AligoAddressBookController.java` sync(L46-47) `@RequirePermission(page="aligo.address-book", action=UPDATE)` → **`canAccess('aligo.address-book','update')`**. CSV 다운로드는 read-export → **게이트 제외**.
- **FE**: import(L48 다음). `usePageTitle`(L55) 다음 `const { canAccess } = usePermissions()` + `const canSync = canAccess('aligo.address-book','update')`. sync 버튼 onClick(L130) `() => { if (!canSync) return; syncMutation.mutate() }`. disabled: 동기화실행(L125-133) `disabled={syncPending || !canSync}`. CSV다운로드(L116-124) 게이트 안 함.
- **mock**: `?mockPerms=[{pageCode:'aligo.address-book',view:true,edit:false}]`.
- **spec**: `[data-testid="admin-aligo-sync-btn"]` disabled/enabled. CSV 버튼은 양쪽 enabled 회귀 가드.

## 6) DispatchSmsPage (경계) — `routes/DispatchSmsPage.tsx` + `PreviewSection`
- **BE**: `notification-service .../controller/DispatchBatchAdminController.java` send(L70-71)·**preview(L51-52 도 CREATE)** `@RequirePermission(page="dispatch.batch", action=CREATE)` → **`canAccess('dispatch.batch','create')`**. 저장(history)은 별도 page-code `dispatch.sms-save-history` → 제외.
- **FE**: import(L30 다음, `../hooks/`). `const queryClient`(L141) 다음 `const { canAccess } = usePermissions()` + `const canBatch = canAccess('dispatch.batch','create')`. early-return: `handlePreview`(L205)·`handleSend`(L319). disabled: `sendDisabled`(L317) 합성에 `|| !canBatch` 추가(SendSection L613 단일지점). preview 버튼(`PreviewSection` L481-488) → props 에 `canPreview: boolean` 추가·호출부(L372-383) `canPreview={canBatch}`·버튼 `disabled={!canPreview}`. 제외: 날짜/탭/저장내역 탭/restore/"내역으로 저장"(save-history).
- **mock**: `?mockPerms=[{pageCode:'dispatch.batch',view:true,edit:false}]`.
- **spec**: URL `?mockRole=DISPATCH&mockPerms=...`. `[data-testid="dispatch-sms-preview-button"]` disabled/enabled(send 버튼은 `!preview`로 이미 disabled라 preview 로 게이트 단언).

---

## 구현 순서
1. 단순 단일파일(#1·#2·#5 핸들러+버튼; #4 자식 prop 1개) → 2. 자식 prop 분산(#3 VehicleGroupColumn `canEdit` 합성, #6 PreviewSection `canPreview`) → 3. `npm run typecheck`(desktop, raw tsc 금지 [[desktop-typecheck-command]]) → 4. 묶음 spec `playwright/menu-5category-view-only-gates/view-only-mutation-gates.spec.ts`(페이지당 view-only disabled / has-action enabled 2케이스, sp-d3 헬퍼 `withMockPerms`/`mockPerms`/false-green 가드 재사용).

## 검증 주의
- **전체 mock suite 필수**([[fe-guard-removal-contract-tests]],[[defect-family-sweep-fix]]): 버튼 disabled 조건/소스계약 변경 → 기존 spec(sp-d3, sp-08-3-dispatch-parity, sp-08-3-4-dispatch-sms-history, menu-5category-real-qa)이 "버튼 enabled" 암묵전제 시 깨질 수 있음.
- **mock seed 동기화**: page-code 인자 BE 와 1글자라도 다르면 mock `/permissions/my` 가 키 미하달 → 항상 disabled(silent regression). has-action 케이스가 적발. (A) grep 실측값 그대로(테마틱 금지).
- **#3·#6 단일 합성 지점**: `canEdit`/`sendDisabled` OR 추가 시 기존 비활성 조건과 결합 → has-action 케이스는 상태 의존 적은 add-vehicle/preview 버튼으로 게이트만 분리 단언.
- **실 게이트웨이 캡처([[real-server-check-screenshot]])**: 머지 전 mock 끄고 실 Docker(:8080)+실 로그인 view-only(DISPATCH on dispatch.board) 변경 버튼 비활성 1장.
