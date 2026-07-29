# #895 대시보드 일정관리 — 정찰·기획 (조기 PR)

- 작성일: 2026-07-29 (집PC 세션)
- 브랜치: `feat/895-dashboard-schedule`
- 이슈: 일정 등록·조회·공유

## 1. 이 트랙이 답해야 할 것

이슈는 *"일정 등록·조회·공유"* 세 단어다. **무엇을 만드는지가 아직 정해져 있지 않다.**
그러므로 구현 전에 **이 저장소에 이미 있는 것부터** 확인한다 — 없는 것을 새로 만드는 것보다
있는 것을 잘못 중복하는 쪽이 이 저장소에서 더 비쌌다.

## 2. 정찰 질문 (구현 전에 답한다)

1. **일정/캘린더 성격의 기능이 이미 있는가.** `dashboard-service`·`groupware-service`·배차(dispatch)
   쪽에 날짜 기반 목록·알림이 이미 있다면 그것과의 관계를 먼저 정한다.
   🚨 이 저장소는 **grep 0 매치가 기능 부재를 뜻하지 않는다** — 실제 라우트·화면으로 확인할 것.
2. **어느 서비스가 소유자인가.** `dashboard-service` 인가 `groupware-service` 인가.
   결재·메신저·단톡방 매핑이 그룹웨어에 있으므로 "공유" 의 의미가 그룹웨어 쪽에 가까울 수 있다.
3. **"공유" 의 범위** — 개인 일정인가, 부서 일정인가, 전사 일정인가.
   권한 모델(`@RequirePermission` page-code)과 어떻게 붙는가.
4. **알림이 필요한가.** 필요하면 기존 알림 경로(`notification-service`)를 쓰는가.
5. 화면은 **데스크톱·웹·모바일 중 어디**에 붙는가. 모바일이면 카드화·풀스크린 모달 규약이 이미 있다.

### 2.1 정찰 결과 (2026-07-29)

> **핵심 결론:** 신규 일정 엔티티나 `dashboard-service` 전용 일정 API를 만들 근거는 없다. `groupware-service`에 일정 저장·참여자·기간 조회·수정·soft delete가 이미 있다. 현재 비어 있는 부분은 데스크톱 일정 화면/클라이언트 배선과, 참여자·부서·전사 공유의 명시적 조회 정책이다.

#### ① 기존 유사 기능 유무

| 영역 | 확인한 구현·라우트 | 중복 방지 판단 |
|---|---|---|
| `groupware-service` 일정 | `POST /admin/groupware/schedules`, `GET /admin/groupware/schedules`, `PUT /admin/groupware/schedules/{scheduleId}`, `DELETE /admin/groupware/schedules/{scheduleId}` | **이미 있음.** 신규 일정 도메인/테이블을 만들지 말고 기존 일정 기능을 확장한다. |
| `dashboard-service` | `GET /admin/dashboard/kpi`, `GET /admin/dashboard/realtime-stock`, `GET /admin/dashboard/sales-aggregate`, `POST /admin/dashboard/refresh` | 날짜 범위는 KPI·매출 집계용이다. 개인/공유 일정과는 별개다. |
| 대시보드 공지 | `GET /app/notices/active` 및 공지 CRUD. `startAt`·`endAt` 게시기간으로 활성 여부 판정 | 날짜 기반 **공지**이지 캘린더 일정이 아니다. 일정 저장소로 재사용하지 않는다. |
| dispatch | `GET /admin/dispatch-tasks`의 `from`·`to`·`dispatchDate`, `GET /admin/dispatch-board/undispatched-slips` | 배차 작업일/전표 영업일이라는 물류 도메인이다. 일반 일정과 합치지 않고 필요하면 대시보드에서 별도 링크/집계한다. |
| `notification-service` | `GET /notifications/my`, `GET /notifications/history`, `POST /internal/notifications` | 알림 수신함/발행 경로는 있으나, 일정 자체의 저장·기간 조회나 일반 일정 리마인더 스케줄러는 이번 정찰에서 확인하지 못했다. |

일정 도메인이 이미 있다는 가장 직접적인 근거는 다음과 같다.

`services/groupware-service/src/main/java/com/samhanair/logis/groupware/GroupwareServiceApplication.java:12-14`

> “결재선 + 메신저 + 일정 도메인의 단일 진입점. 3 entity (ApprovalLine + Message + Schedule) + 2 부속 entity (ApprovalStep + ScheduleParticipant) + 3 enum (ApprovalStatus / MessageStatus / ScheduleStatus) + 2 controller (Internal / Admin) + 3 service.”

`services/groupware-service/src/main/resources/db/migration/V1__init_groupware.sql:105-158`

```sql
-- 4) schedules — 일정 1건.
status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'  -- DRAFT / CONFIRMED / CANCELLED
CREATE TABLE schedules (... owner_id UUID NOT NULL, title VARCHAR(200) NOT NULL,
  starts_at TIMESTAMP NOT NULL, ends_at TIMESTAMP NOT NULL, ...);
CREATE TABLE schedule_participants (... schedule_id UUID NOT NULL, participant_id UUID NOT NULL, ...);
```

`services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java:280-330`

```java
@PostMapping("/schedules")
@RequirePermission(page = "messenger.send", action = PermissionAction.CREATE)
public ResponseEntity<ScheduleResponse> createSchedule(...)

@GetMapping("/schedules")
@RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
public ResponseEntity<List<ScheduleResponse>> findSchedules(...)
```

같은 컨트롤러에는 수정과 삭제도 있다.

```java
@PutMapping("/schedules/{scheduleId}")
@RequirePermission(page = "messenger.send", action = PermissionAction.UPDATE)
@DeleteMapping("/schedules/{scheduleId}")
@RequirePermission(page = "messenger.admin", action = PermissionAction.DELETE)
```

조회는 현재 공유 조회가 아니라 등록자 본인 조회다. 컨트롤러의 `GET` 구현은 `X-User-Id`를 읽고, `ownerId` query parameter는 호환성 때문에 무시하며, `ScheduleService.findInRange(UUID ownerId, ...)`는 `ScheduleRepository.findOwnedInRange`를 호출한다. repository JPQL도 `s.ownerId = :ownerId`와 날짜 겹침 조건만 사용한다. 따라서 참여자 행이 존재한다는 사실만으로 “참여자가 조회할 수 있다”고 말할 수 없다.

반면 dispatch는 다음처럼 날짜가 명시된 별도 물류 작업이다.

`services/slip-service/src/main/java/com/samhanair/logis/slip/web/dispatch/DispatchTaskAdminController.java:50-70`

```java
@RequestMapping("/admin/dispatch-tasks")
// GET /admin/dispatch-tasks — 배차 이력 목록
// from, to: 배차일(dispatchDate) 범위
```

`services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchTask.java`

> `dispatchDate`는 배차 작업의 날짜이며, `taskCode`가 사용자 식별자다. UUID는 내부 식별자다.

이는 일정 기능과 이름이 겹치는 날짜 필드이지, 개인/부서/전사 일정의 대체 기능은 아니다. 배차 알림도 `notification-service`의 dispatch batch와 연결된 `[배차안내]` SMS 경로이며 일반 일정 알림으로 재사용하지 않는다.

#### ② 소유 서비스 판정

| 후보 | 현재 담당 근거 | 판정 |
|---|---|---|
| `dashboard-service` | `DashboardAdminController` Javadoc이 “KPI 조회 / 실시간 재고 / 매출 집계 / materialized view refresh”라고 명시한다. `V1__init_dashboard.sql`도 `kpi_snapshots`, `sales_aggregates`와 materialized view를 만든다. | 일정 원장 소유자로 부적합. 대시보드는 표시·집계 진입점으로만 연결한다. |
| `groupware-service` | 애플리케이션 Javadoc에 결재선·메신저·일정의 단일 진입점이라고 되어 있고, `schedules`·`schedule_participants`와 `ScheduleService` CRUD가 이미 있다. 결재와 메신저가 함께 있는 협업 경계다. | **일정 소유자.** 기존 일정 API·테이블·서비스를 기준으로 확장한다. |
| `notification-service` | `/notifications`는 사용자 알림 조회/acknowledge이고 `/internal/notifications`는 알림 발행이다. 단톡방 매핑도 실제 저장소/컨트롤러는 이 서비스에 있다. | 일정 원장이 아니라 전달·수신함 소유자. |

“공유”와 그룹웨어의 관계는 UI/업무 경계와 데이터 소유를 나누어 봐야 한다. 데스크톱 `AppLayout.tsx:12-18`은 그룹웨어 범주에 `링크발송/알리고 주소록/단톡방 매핑`을 묶고, `:1270-1352`에서 `/messenger`와 `/admin/chat-rooms`를 그룹웨어 메뉴로 노출한다. 그러나 단톡방 매핑의 실제 route는 다음과 같이 notification-service 소유다.

`services/notification-service/src/main/java/com/samhanair/logis/notification/controller/ChatRoomMappingAdminController.java`

```java
@RequestMapping("/api/v1/notification/admin/chat-rooms")
@RequirePermission(page = "messenger.admin", action = PermissionAction.VIEW)
```

`services/notification-service/src/main/resources/db/migration/V2__add_partner_chat_room_mapping.sql:4-6`

> 거래처 ↔ 카카오톡 단톡방 N:M 매핑이며 주문 발송 라우팅에 사용한다.

즉 그룹웨어는 결재·메신저·일정처럼 사람 간 협업을 묶는 화면/업무 경계이고, 단톡방 매핑은 그 화면에 노출되는 알림 라우팅 마스터다. 단톡방 매핑을 일정 공유 ACL로 간주해서는 안 된다. 일정의 소유·공유 원장은 `groupware-service`, 일정 알림 전달은 `notification-service`로 분리하는 것이 현재 구조와 맞다.

#### ③ 기존 권한 체계로 “공유” 표현하기

현재 일정 route는 이미 `@RequirePermission`을 쓰지만 메시지 page-code를 재사용한다.

| 현재 route | 현재 page-code/action | 문제 |
|---|---|---|
| `POST /admin/groupware/schedules` | `messenger.send / CREATE` | 일정 등록 권한이 메신저 발송 권한에 묶인다. |
| `GET /admin/groupware/schedules` | `messenger.send / VIEW` | 일정 조회와 메신저 조회의 의미가 섞인다. |
| `PUT /admin/groupware/schedules/{id}` | `messenger.send / UPDATE` | 일정 수정 권한을 독립적으로 관리할 수 없다. |
| `DELETE /admin/groupware/schedules/{id}` | `messenger.admin / DELETE` | 일정 삭제가 메신저 관리자 권한에 묶인다. |

기존 page-code 명명 실례는 `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:239-245,416-421`의 `groupware.approvals`, `groupware.approval-templates`, `messenger.admin`, `messenger.send`, `notifications.center`이고, dispatch는 `:454-457`의 `dispatch.board`, `dispatch.batch`다. 따라서 권한 **체계**를 새로 만들지 않고, 기존 `page-code + VIEW/CREATE/UPDATE/DELETE` 모델 안에서 `groupware.schedules`라는 일정 전용 page-code를 후보로 추가하는 것이 맞다. 현재 registry에 이 code가 이미 등록되어 있는지는 확인하지 못했으며, 실제 추가 여부는 구현 단계에서 permission seed/registry를 확인해야 한다.

개인·부서·전사는 page-code를 세 개로 늘리는 문제가 아니라 일정 데이터의 `scope`/`visibility`와 행 단위 정책으로 표현한다.

| 일정 범위 | 행 단위 조회 정책 제안 | page-code와의 관계 |
|---|---|---|
| 개인 | 소유자 본인. 초대 참여자를 포함할지 여부는 공유 정책으로 명시한다. 현재 구현은 소유자만 조회한다. | `groupware.schedules / VIEW`를 통과한 뒤 owner 조건을 적용한다. |
| 부서 | 일정에 기록한 부서 또는 소유자의 부서 구성원만 조회한다. 현재 부서 구성원 전체 조회 경로는 확인하지 못했다. | page-code가 아니라 조직 멤버십/행 정책으로 판정한다. |
| 전사 | 활성 내부 사용자 전체가 조회한다. 공개 생성/수정/삭제 권한은 별도로 제한한다. | 동일한 `groupware.schedules` page-code와 행 범위 정책을 조합한다. |

이 분리는 결재 쪽에도 근거가 있다. `shared/approval-core/src/main/java/com/samhanair/logis/approval/ApprovalStepBase.java:120-126`은 `X-User-Groups`에서 행위자 그룹 ID를 다루므로, page-code만으로 객체의 대상 범위를 표현하지 않는다. 따라서 page-code는 “이 기능/행위를 사용할 수 있는가”, `scope`와 owner/participant/조직 멤버십은 “이 일정 행을 볼 수 있는가”로 나누는 제안이다. `X-User-Id`·`X-User-Groups` 기반 호출은 현재 그룹웨어 컨트롤러가 사용하지만, 부서/전사 일정의 실제 조직 조회 정책은 확인하지 못했다.

#### ④ 화면 위치

현재 확인된 대시보드 화면은 데스크톱이다.

`clients/desktop/src/renderer/routes/index.tsx:349-350`

```tsx
{ path: '/', element: <DashboardPage /> },
{ path: '/notifications', element: <NotificationHistoryPage /> },
```

`clients/desktop/src/renderer/routes/DashboardPage.tsx:1-8`

> 대시보드 환영 화면 + 4개 통계 카드. 실제 backend 호출은 오늘 출고전표이고, 저재고 알림·미확인 메시지·결재 대기는 `준비중`이다.

또한 `clients/desktop/src/renderer/routes/index.tsx:351-414`에는 `/groupware/approvals`, `/groupware/approvals/new`, `/messenger`가 있고, `:1562-1570`에는 `messenger.admin`으로 보호된 `/admin/chat-rooms`가 있다. 따라서 첫 화면은 새 서비스가 아니라 데스크톱의 기존 그룹웨어 메뉴/대시보드 shell에 붙이는 것이 자연스럽다. 다만 실제 일정 화면 route와 일정 API client는 이번 파일 정찰에서 확인하지 못했다.

`clients/web` 및 `clients/mobile-staff`·`clients/arologis-mobile`의 확인 범위에서는 일정/캘린더 화면 route를 확인하지 못했고, 모바일에서 확인된 날짜 화면은 dispatch board의 `dispatchDate`였다. 웹/모바일에 일정 화면이 전혀 없다고 단정하지는 않는다. 이번 라운드에는 브라우저 실행이나 각 앱의 런타임 화면 확인을 하지 않았다.

화면 구현 시에는 `ScheduleResponse`의 `scheduleId`·`ownerId` 같은 UUID를 사용자 화면에 표시하지 않고 제목·일시·상태·업무 식별자만 표시해야 한다. 현재 response DTO에 UUID가 있는 것은 내부 API 계약의 사실이며, 사용자 노출을 허용한다는 뜻은 아니다.

#### ⑤ 알림 필요 여부와 기존 경로

첫 슬라이스인 “등록한 일정을 등록한 사람이 다시 본다”에는 알림이 **필요하지 않다**. 저장 직후 기존 `GET /admin/groupware/schedules?from=...&to=...`를 재조회하면 되며, 별도 알림·스케줄러·외부 발송을 추가하지 않는다.

나중에 일정 리마인더나 공유 대상 통지가 요구될 때만 다음 기존 경로를 검토한다.

`services/notification-service/src/main/java/com/samhanair/logis/notification/web/NotificationCenterInternalController.java:22-35`

```java
@RequestMapping("/internal/notifications")
@PostMapping
@PreAuthorize("hasRole('MASTER')")
```

`NotificationPublishRequest`는 `targetRole` 또는 `targetUserId` 중 하나를 대상으로 받고, `sourceService`, `sourceRefId`, `deeplink`도 받는다. 사용자는 `GET /notifications/my`로 수신함을 조회하고 acknowledge한다. 현재 알림 migration은 `target_role` 또는 `target_user_id`만 허용하므로 부서 자체를 알림 수신자로 보내는 계약은 확인하지 못했다. 부서 통지는 대상 사용자를 해석해 user 단위로 발행할지부터 결정해야 한다.

또한 `notification-service`의 dispatch 알림에는 `scheduledAt`이 있지만 이는 `[배차안내]` SMS 템플릿의 배차 예정 시각이다. 일반 일정 리마인더의 스케줄러/outbox와 groupware 생성 이벤트가 notification-service로 연결되는 경로는 이번 정찰에서 확인하지 못했다. 그러므로 알림을 MVP 기본 범위에 넣지 않는다.

#### ⑥ 슬라이스 제안

1. **등록한 일정을 등록한 사람이 다시 본다.** 기존 `groupware-service` API를 그대로 사용해 데스크톱 그룹웨어 화면에서 등록 후 동일 사용자의 기간 조회 결과를 다시 표시한다. 신규 엔티티·migration·알림·공유 정책은 넣지 않는다.
2. **등록자 기준 수정·삭제와 기간 이동.** 기존 `PUT`·soft delete `DELETE`와 owner 검사를 데스크톱 화면에 연결하고, 날짜 범위를 바꿔도 등록자의 일정 목록을 조회한다. UUID는 화면에 표시하지 않는다.
3. **명시적 참여자 공유.** `scope`/참여자 조회 정책을 먼저 결정한 뒤, `groupware.schedules` 후보 page-code의 action gate와 owner/participant 행 정책을 분리해 참여자 조회를 추가한다. 부서·전사는 조직 멤버십 확인이 필요하므로 이 슬라이스에 섞지 않는다.
4. **부서·전사 범위 및 리마인더(후순위).** 조직 대상자 해석과 일정 알림 발행/스케줄링을 별도 결정한 다음 진행한다. 현재 기능과 중복되는 dispatch SMS를 사용하지 않고, 필요할 때만 notification center 경로를 사용한다.

#### ⑦ 이번 정찰이 보지 않은 것

- 실제 실행 중인 DB의 `schedules`·`schedule_participants` 행 수와 데이터는 확인하지 못했다.
- API gateway를 거친 실제 인증/권한 seed, 현재 사용자별 `groupware.schedules` 권한 부여 상태는 확인하지 못했다.
- 웹/모바일의 브라우저 런타임 화면, Playwright 캡처, 실제 API 응답은 확인하지 못했다.
- 부서 구성원 조회 API와 전사 공개의 조직 정책은 완전히 확인하지 못했다.
- 일정 생성·수정 이벤트가 notification-service로 전달되는 현재 경로와 리마인더 scheduler/outbox는 확인하지 못했다.
- 코드 수정, 테스트·빌드·Docker 실행은 하지 않았다.

## 3. 불변식 (수단 미지시)

1. 등록한 일정은 **등록한 사용자가 다시 볼 수 있어야 한다** — 조회 경로 없이 저장만 되면 안 된다.
2. 공유된 일정은 **볼 권한이 있는 사람에게만** 보여야 한다. 권한 판정은 이 저장소의 기존
   `@RequirePermission` page-code 체계를 따른다 — 새 권한 체계를 만들지 않는다.
3. 날짜·시간은 이 저장소의 **KST 전역 표준**을 따른다.
4. UUID 는 사용자 화면에 노출하지 않는다.
5. 신규 엔티티는 **BaseEntity 7 audit + Soft Delete** 규약을 따른다.

## 4. 격리 조건 (병렬 트랙 다수와 공유 자원)

- **Docker·서비스 재기동·이미지 빌드 금지** — 정찰 단계는 스택이 필요 없다.
  DB 확인은 `docker exec ... psql` **읽기 전용 SELECT 만**.
- `clients/web/order-app/**` · `clients/desktop/src/renderer/components/documentTemplate/**` ·
  `clients/web/design-system/**` **수정 금지** (각각 다른 PR 진행 중).
- 새 이슈 등록 금지.

## 5. 이 문서의 상태

**정찰 전 기획서다.** §2 의 답이 채워지기 전에는 코드를 쓰지 않는다.
이 저장소는 "있는 걸 못 찾고 새로 만드는" 비용을 여러 번 치렀다.
