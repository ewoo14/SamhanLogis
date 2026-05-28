# 권한 체계 전면 재편 — Phase 0 인벤토리: 아로로지스 (arologis) 배차 도메인

> **본 문서는 읽기 전용 감사 산출물입니다.** 코드 변경 없음. 8개 PageCode 에 대해 7개 액션
> (VIEW/CREATE/UPDATE/DELETE/RESTORE/DOWNLOAD/PRINT) 의 구현 상태를 BE `@RequirePermission`
> + 컨트롤러 HTTP verb 와 FE 라우트/메뉴 근거로 판정한다.
>
> **운영 단위 주의** — 아로로지스(arologis)는 Samhan Public 마이크로서비스에서 분리된 **독립 운영
> 단위**다. 자체 데스크탑/모바일 클라이언트를 가지며, 14-service 묶음의 desktop/mobile 클라이언트와는
> 별개다.

## 실제 클라이언트 디렉토리 (clients/ 하위에서 확인)

`clients/` 직속 디렉토리 6개 중 아로로지스 전용 2개:

| 디렉토리 | 종류 | 프로그램 |
|---|---|---|
| `clients/arologis-desktop` | Electron + React (HashRouter), `@samhan/design-system` | 아로로지스 배차 admin 데스크탑 (배차 / 기사 관리) |
| `clients/arologis-mobile` | React Native + Expo | **기사앱** (arologis.driver). 휴대번호 passwordless 로그인 + GPS + 서명/사진 |

> 나머지 `clients/desktop`, `clients/mobile`, `clients/mobile-staff`, `clients/web` 는 Samhan Public 14-service 용으로 아로로지스 도메인과 무관.

### 데스크탑 라우트/메뉴 (근거)
- 상단 nav 메뉴 2개: **배차**(`/dispatches`), **기사 관리**(`/drivers`) — `clients/arologis-desktop/src/renderer/components/AppLayout.tsx`
- `/dispatches` 하위 탭: `manual`, `pre-classify`, `unassigned`, `reconcile`, `detail/:dispatchCode` — `clients/arologis-desktop/src/renderer/routes/index.tsx`
- 저장내역(복원) 공통 탭: `HistoryTab.tsx` + `RestoredBanner.tsx` (`routes/dispatches/`)
- **지역/구역 관리 FE 화면 없음** (BE `RegionAdminController` 만 존재, region 은 pre-classify/regional 응답 필드로만 등장)
- **수정요청/승인 FE 화면 없음** (데스크탑에 edit-requests/pending/approve UI 미존재)
- 기사 CRUD 는 `arologis.ts` 에서 `NOT_IMPLEMENTED` reject stub

### 모바일 (기사앱) 네비게이션 (근거)
- `RootNavigator.tsx`: GPS 권한 → 휴대번호 로그인 → `DriverTabNavigator`
- 화면: `DriverDashboardScreen`, `DriverSignatureScreen`, `DriverPhotoScreen`, `DriverSlipDetailScreen`, `DriverLocationTrackingScreen`

---

## PageCode 매핑 주의 (중요)

요청된 8개 PageCode 중 `@RequirePermission` 으로 직접 사용되는 코드는 6개뿐이며, 2개는 별도 성격:

- **`arologis.admin` (배차 관리)** — `@RequirePermission` 에 미사용. `ArologisAdminPermissionGuard.PAGE_ADMIN` 상수(프로그래밍 방식 동적 RBAC 가드, "22 endpoint" 주석)로만 존재. 실제 엔드포인트는 `arologis.dispatch.admin` 으로 어노테이션됨 → 본 표에서는 `arologis.dispatch.admin` 과 동일 엔드포인트 집합으로 판정.
- **`arologis.region` (지역/구역 관리)** — `RegionAdminController#list` 의 VIEW 코드 + `ArologisAdminPermissionGuard.PAGE_REGION` 상수. 편집은 별도 코드 `arologis.region.manage`.
- **`arologis.dispatch.admin` (배차 admin)** = 카톡 파싱/배차 생성/수동배차/자동매칭/기사배정/정차상태/소프트삭제 + V1 admin UI 5종.
- **`arologis.dispatch.ops` (배차 운영)** = 가배차분류/미배차/지방가배차/운송사비교(reconcile)/저장내역(save-history)/audit-log/SSE.
- **`arologis.region.manage` (지역 편집)** = region 추가/CSV import/수정/소프트삭제.
- **`arologis.edit-requests` (수정 요청)** = 수정/삭제 요청 생성(POST).
- **`arologis.edit-requests.decide` (수정 요청 승인)** = PENDING 조회 + approve/reject.
- **`arologis.driver` (기사앱)** = 오늘 배차/위치보고/서명+사본/사진업로드/전표상세.

---

## 인벤토리 표

| PageCode | 프로그램 | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---|---|---|---|---|---|---|---|
| `arologis.admin` (배차 관리) | desktop 배차 (legacy 가드 코드) | ✅ `arologis.dispatch.admin` 과 동일 엔드포인트 집합 (아래 행 참조) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `arologis.dispatch.admin` (배차 admin) | desktop 배차(manual/detail) | ✅ GET `/admin/arologis/dispatches`,`/{id}`,`/drivers`; GET `/api/v1/.../dispatches`,`/drivers/available`; FE `/dispatches/manual`+`detail` (`ArologisAdminController#list/findById/listDrivers`, `DispatchAdminV1Controller#listDispatches/availableDrivers`) | ✅ POST `/dispatches`,`/dispatches/manual`,`/dispatches/manual/preview` (`ArologisAdminController#create/manualCreate`) | ✅ PUT `/dispatches/{id}/.../stops/{stopSeq}/status`; PATCH `/api/v1/.../driver`; POST assign/auto-match (`ArologisAdminController#updateStopStatus`, `DispatchAdminV1Controller#changeDriver`) | ✅ soft-delete PUT `/dispatches/{id}/delete` (`ArologisAdminController#softDelete` → `dispatchService.softDelete`) | ❌ 버전 이력/롤백 없음 | ❌ Excel/PDF/PNG export 없음 | ❌ 인쇄뷰 없음 |
| `arologis.region` (지역/구역 관리) | (FE 화면 없음 — BE only) | ✅ GET `/admin/arologis/regions` (`RegionAdminController#list`, action=VIEW) | ⚠️ CREATE 는 코드 `arologis.region.manage` 로 가드됨 (이 코드 자체는 VIEW 전용) | ⚠️ 동일 (`region.manage`) | ⚠️ 동일 (`region.manage`) | ❌ | ❌ | ❌ |
| `arologis.dispatch.ops` (배차 운영) | desktop 배차(pre-classify/unassigned/reconcile/history) | ✅ GET `/dispatches/pre-classify`,`/unassigned`,`/regional`,`/{id}/audit-logs`,`/{id}/realtime`(SSE); GET `/dispatches/history`(목록/상세/latest) + FE 라우트 4종 (`ArologisAdminController#preClassify/unassigned/regional/listAuditLogs/subscribeRealtime`, `DispatchSaveHistoryController#list/detail/latest`) | ✅ POST `/dispatches/history` 저장내역 저장; POST `/dispatch/reconcile`(운송사 비교) (`DispatchSaveHistoryController#save`, `DispatchReconcileController#reconcile`) | ⚠️ 별도 UPDATE 엔드포인트 없음 — 저장내역은 append-only(저장)·복원만, reconcile 은 비교 연산 | ❌ ops 전용 삭제 없음 (배차 삭제는 `dispatch.admin`) | ⚠️ **부분** — 저장내역 스냅샷 복원 (`DispatchSaveHistory` JSONB 저장 → `detail`/`latest` 조회 → FE `HistoryTab`+`RestoredBanner` 로 실행 탭 복원). 단 entity 버전 이력/롤백 아님(이름붙인 스냅샷 복구) | ❌ 결과 Excel/CSV/PDF export 없음 (reconcile 은 엑셀 **업로드**만) | ❌ |
| `arologis.region.manage` (지역 편집) | (FE 화면 없음 — BE only) | (조회는 `arologis.region`) | ✅ POST `/admin/arologis/regions`; POST `/regions/import`(CSV 업로드) (`RegionAdminController#create/importCsv`, action=EDIT) | ✅ PUT `/regions/{id}` (`RegionAdminController#update`, action=EDIT) | ✅ soft-delete DELETE `/regions/{id}` (`RegionAdminController#softDelete` → `regionService.softDelete`, action=EDIT) | ❌ 버전 이력/롤백 없음 | ❌ region export 없음 (CSV 는 import=업로드 방향) | ❌ |
| `arologis.edit-requests` (수정 요청) | (전용 FE 화면 미확인 — BE only) | ⚠️ 전용 VIEW 엔드포인트 없음 (요청 목록 조회는 `edit-requests.decide` 의 `/pending`) | ✅ POST `/dispatches/{id}/edit-requests` 수정/삭제 요청 생성 (`ArologisAdminController#createEditRequest`, action=EDIT) | (요청은 생성 후 승인/거절로만 처리) | (생성 시 DELETE 요청 타입 포함 — `EditRequestType.DELETE`) | ⚠️ **부분** — DISPATCHED/DELIVERED 후 본문 mutation 채널 = 수정요청→승인 워크플로우(`ArologisEditRequest`). 진정한 버전 롤백은 아님 | ❌ | ❌ |
| `arologis.edit-requests.decide` (수정 요청 승인) | (전용 FE 화면 미확인 — BE only) | ✅ GET `/edit-requests/pending` PENDING 대시보드 (`ArologisAdminController#listPending`, action=VIEW) | (승인/거절만) | ✅ POST `/edit-requests/{id}/approve`·`/reject` (`ArologisAdminController#approveEditRequest/rejectEditRequest`, action=EDIT) | (해당 없음) | ⚠️ 승인 시 잠긴 엔티티 mutation 허용(요청 1회 소진) = 부분 RESTORE 성격 | ❌ | ❌ |
| `arologis.driver` (기사앱) | `clients/arologis-mobile` 기사앱 | ✅ GET `/driver-app/arologis/dispatches/today`; GET `.../slip-detail` (`ArologisDriverAppController#today/slipDetailToday`, action=VIEW) + FE `DriverDashboardScreen`/`DriverSlipDetailScreen` | ✅ POST `/locations` 위치보고; POST `.../sign`(deprecated)/`sign-and-send-copy`; POST `.../photos/{photoType}` (`ArologisDriverAppController#reportLocation/sign/signAndSendCopyToday/uploadStopPhotoToday`, action=EDIT) | ⚠️ 명시적 UPDATE 없음 — 서명/사진은 append. 정차상태 변경은 admin 측 | ❌ 기사앱 삭제 없음 | ❌ | ⚠️ **부분** — sign-and-send-copy 가 출고전표 사본 **PNG 합성/응답** → mobile 이 `expo-sharing` Share Sheet 으로 인수자에게 전달 (`ArologisDriverAppController#signAndSendCopyToday`; `clients/arologis-mobile/src/api/arologis.ts` `image/png` 처리, `DriverSignatureScreen`). Excel/PDF 아님·기사 자체 다운로드 저장은 공유 시트 경유 | ❌ 인쇄뷰 없음 (PNG 합성으로 대체) |

범례: ✅ 구현됨 · ⚠️ 부분/우회 · ❌ 미구현

---

## 신규 구현 필요 집계

### 공통 (전 PageCode 해당)
- **RESTORE (버전 이력 + 롤백)**: 전 PageCode 미구현(❌). 현존하는 것은 (a) `dispatch.ops` 의 이름붙인 스냅샷 저장/복원(`DispatchSaveHistory`), (b) `edit-requests`/`edit-requests.decide` 의 수정요청→승인 mutation 채널뿐 → **부분(⚠️)**. 진정한 엔티티 revision 이력 + rollback 은 신규 구현 필요. (단, `ArologisAuditLog` 변경 이력 timeline 은 조회만 존재 — 롤백 기능 없음)
- **DOWNLOAD (Excel/PDF/PNG export)**: 데스크탑 전 화면 미구현. `arologis.driver` 만 PNG 사본 공유(⚠️). 가배차/미배차/지방가배차/운송사비교 결과의 Excel/PDF/CSV **내보내기** 신규 필요. (reconcile·region CSV 는 업로드 방향이라 download 아님)
- **PRINT (인쇄뷰)**: 전 PageCode 미구현. 배차표/정차표 인쇄뷰 신규 필요.

### PageCode 별 보강 포인트
- **`arologis.admin`**: 어노테이션 코드(`arologis.admin`)와 실제 엔드포인트 코드(`arologis.dispatch.admin`) **불일치** — 권한 재편 시 코드 정합화(통합 또는 명시 분리) 필요. `ArologisAdminPermissionGuard` 의 legacy 동적 가드(PAGE_ADMIN/PAGE_REGION)와 신규 `@RequirePermission` **이중 가드 정리** 필요.
- **`arologis.region` / `arologis.region.manage`**: BE 만 존재, **FE 화면(데스크탑 라우트/메뉴) 부재** → VIEW/CREATE/UPDATE/DELETE 모두 화면 신규 필요. VIEW 코드(`region`)와 편집 코드(`region.manage`) 2분할 구조 유지/통합 결정 필요.
- **`arologis.edit-requests` / `arologis.edit-requests.decide`**: BE 워크플로우만 존재, **전용 FE 화면(요청 생성 폼·PENDING 승인 대시보드) 부재** → 화면 신규 필요. `edit-requests` 의 전용 VIEW 엔드포인트 없음(목록 조회가 `decide` 쪽 `/pending` 에 귀속).
- **`arologis.dispatch.ops`**: 별도 UPDATE/DELETE 엔드포인트 부재(저장내역 append-only). 결과 export(DOWNLOAD)·인쇄(PRINT)가 핵심 신규 항목.
- **`arologis.driver`**: 명시적 UPDATE/DELETE 부재(append 모델). PRINT 는 PNG 공유로 대체됨 — 권한 모델에서 PRINT 액션 적용 여부 정책 결정 필요.

### 참조 파일 경로
- BE 컨트롤러: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/{ArologisAdminController, DispatchAdminV1Controller, RegionAdminController, DispatchReconcileController, ArologisDriverAppController}.java`
- BE 저장내역: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/DispatchSaveHistoryController.java`, `.../domain/DispatchSaveHistory.java`
- BE legacy 동적 가드: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAdminPermissionGuard.java`
- BE 수정요청: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/realtime/domain/ArologisEditRequest.java`
- FE 데스크탑: `clients/arologis-desktop/src/renderer/{routes/index.tsx, components/AppLayout.tsx, routes/dispatches/*, api/*}`
- FE 기사앱: `clients/arologis-mobile/src/{navigation/RootNavigator.tsx, screens/driver/*, api/arologis.ts}`
