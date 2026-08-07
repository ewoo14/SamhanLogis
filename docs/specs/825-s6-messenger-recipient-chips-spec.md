# 기획서 — T2 · Issue #866 [FEAT] #825 슬6 쪽지(메신저) 수신자 칩 복수선택 + BE 복수 수신 API

- 작성: OPUS 4.8 기획 단계 (캐논 워크플로우 1단계)
- 기준 main: `4892b1c0d` · 열린 PR 0 · 병렬 트랙 T1(#868) / T3(#824) 동시 진행
- 상태: **기획(프로덕션 코드 0줄)**. 브랜치·커밋·PR 은 PM 이 수행.

---

## 0. 🚨 기획 착수 즉시 확인된 최대 변수 (실측)

> **쪽지(메신저) 발송 FE 화면이 존재하지 않는다.**

이슈 본문은 *"FE 수신자 입력 → 칩 복수선택 컴포넌트 적용"* 이라고 적었지만, 정찰 결과 **적용할 입력 화면 자체가 없다**. 실측 근거(§1):

- `clients/**` 전체에서 `recipientId` 0건, `/messages` 호출 0건, `messenger.send` 를 쓰는 화면 0건 (`messenger.send` 는 `permissionsApi.ts` PageCode 유니온과 권한 매트릭스에만 존재).
- 알림 mock 은 `deeplink: '/messenger'` 를 발행하는데(`clients/desktop/src/renderer/api/mock.ts:1905`) **`/messenger` 라우트가 라우터에 없다** → 현재 dangling deeplink.
- BE 는 발송/수신함/미열람카운트 3개 엔드포인트가 살아 있고 IT 로 검증돼 있다.

**결론 = 이 슬라이스는 "칩으로 교체" 가 아니라 "쪽지 발송 UI 신설 + BE 복수 수신 API 신설" 이다.**
도달성 축 머지 게이트(③ 라이브QA = 실서버 실제 실행, 실 사용자 경로)를 충족하려면 **사용자가 실제로 클릭할 화면이 반드시 있어야 하므로**, FE 최소 발송 화면 신설은 선택이 아니라 게이트 요건이다. 다만 화면 범위는 §1.6 처럼 **발송 + 수신함 읽기 전용**으로 동결한다.

---

## 1. 정찰 결과 (전부 파일 직접 확인)

### 1.1 BE 도메인 — groupware-service

| 항목 | 경로 | 실측 내용 |
|---|---|---|
| 엔티티 | `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/Message.java` | `Message extends BaseEntity`, `@SQLRestriction("is_deleted = false")`. 필드 = `id, senderId, recipientId, body(≤2000), status, sentAt, readAt`. **정적 팩토리 `send(sender, recipient, body)`** 가 self-send 를 `IllegalArgumentException("자기 자신에게 메신저를 보낼 수 없습니다")` 로 차단. Javadoc 에 *"그룹/단체 메신저는 본 entity 다중 row 발행으로 표현(수신자 1명 = row 1건)"* 이 이미 명시 — 즉 **복수 수신은 설계상 예정돼 있던 확장**이다. |
| 상태 | `domain/MessageStatus.java` | `UNREAD` / `READ` |
| 저장소 | `repository/MessageRepository.java` | `findAllByRecipientIdOrderBySentAtDesc(Pageable)`, `countByRecipientIdAndStatus` 2개뿐 |
| 서비스 | `service/MessageService.java` | `send(req, senderId)` — ① `userClient.exists(senderId)` ② `userClient.exists(req.recipientId())` ③ `Message.send` ④ `repository.save` ⑤ `NotificationPublisherSupport.publishAfterCommit(...)` (채널 `MESSENGER`, deeplink `/messenger`, body 80자 절삭). `inbox`, `unreadCount`, `markRead` 보유 |
| 요청 DTO | `dto/MessageSendRequest.java` | `record(UUID senderId /*deprecated·무시*/, @NotNull UUID recipientId, @NotBlank @Size(max=2000) String body)` |
| 응답 DTO | `dto/MessageResponse.java` | `messageId, senderId, recipientId, body, status, sentAt, readAt` — **UUID 3종을 그대로 반환한다**(§5 참조) |

### 1.2 BE 엔드포인트 (실측 전량)

| 메서드 | 경로 | 가드 | 파일:라인 |
|---|---|---|---|
| POST | `/admin/groupware/messages` | `@RequirePermission(page="messenger.send", action=CREATE)` | `controller/GroupwareAdminController.java:197` |
| GET | `/admin/groupware/messages/inbox` | `@RequirePermission(page="messenger.send", action=VIEW)` | 같은 파일 `:208` (호출자 본인 고정, `userId` 쿼리는 구버전 호환 무시) |
| GET | `/internal/groupware/messages/unread-count` | internal token | `controller/GroupwareInternalController.java:62` |

- 🔴 **`markRead` 는 서비스에만 있고 노출 엔드포인트가 없다** (컨트롤러 전량 grep 결과 `markRead` 0건). 즉 현재 사용자가 쪽지를 읽음 처리할 경로가 없다 = 미열람 카운트가 영구 증가한다. → §2 비범위/§10 리스크.
- 게이트웨이: `services/api-gateway/src/main/resources/application.yml:674` `Path=/admin/groupware/**` 로 groupware-service 라우팅됨(추가 라우트 불필요).

### 1.3 스키마

`services/groupware-service/src/main/resources/db/migration/V1__init_groupware.sql:77`

```
CREATE TABLE messages ( id, sender_id, recipient_id, body VARCHAR(2000), status, sent_at, read_at, + BaseEntity 7 audit )
CREATE INDEX ix_messages_recipient_sent_active   ON messages (recipient_id, sent_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX ix_messages_recipient_status_active ON messages (recipient_id, status)       WHERE is_deleted = FALSE;
```
현재 최신 마이그: `V13__approval_lines_document_template_pin_immutable.sql` → 신규는 **V14 부터**.

### 1.4 사용자 검색 경로

| 계층 | 실측 |
|---|---|
| FE | `clients/desktop/src/renderer/api/groupwareApprovalApprover.ts` — `searchApprovers(q)` → `GET /admin/groupware/approvals/approver-search?q&limit=20`, 응답 `{userId, name, department}` |
| BE proxy | `GroupwareAdminController:91` — **`@RequireDepartment(Department.EXECUTIVE_OFFICE)` + `@RequirePermission("groupware.approvals", VIEW)`** |
| groupware→user | `client/UserClient.search(q, limit)` → `GET {user-service}/internal/users/search` (X-Internal-Token, limit 상한 50, fail-soft `List.of()`) |
| user-service | `web/InternalUserController.java:128` `@PreAuthorize("hasRole('MASTER')")` → `EmployeeRepository.searchInternalApprovers` (`repository/EmployeeRepository.java:62`) |

🔴 두 가지 실측 결함이 여기서 드러난다.
1. **approver-search 는 쪽지 수신자 picker 로 재사용 불가**. `@RequireDepartment(EXECUTIVE_OFFICE)`(`shared/security/.../DepartmentAspect.java` → `hr.isExecutiveOffice()`) 가 걸려 있는데, `messenger.send` 는 `V30__seed_sp_d6_2_page_codes.sql:12~18` 에서 **MASTER/MANAGER/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY/DEVELOPER 전원**에게 부여돼 있다. 임원실 아닌 SALES 사용자가 수신자를 검색하면 403 → 기능 전면 불능.
2. **검색이 퇴사자를 거르지 않는다**. `searchInternalApprovers` 는 `WHERE e.isDeleted = false` 만 본다. `Employee` 에 `termination_date`(`user-service/.../domain/Employee.java:91`) 가 있는데 **미필터** → 퇴사자가 수신자 후보로 노출된다.

### 1.5 칩 표준 컴포넌트 (슬4 산출물) — 실 API 실측

`clients/web/design-system/src/components/MultiSelectAutocomplete/MultiSelectAutocomplete.tsx` (배럴 `src/index.ts:82` 로 export, 소비처는 `@samhan/design-system`).

```ts
MultiSelectAutocompleteProps<TOption, TSelected> {
  selected: TSelected[]              // 단일 진실원
  onAdd(option: TOption): void       // delta
  onRemove(selected: TSelected): void// delta
  search(q: string): Promise<TOption[]>   // 선택 완료분은 내부에서 자동 제외
  getOptionKey / getSelectedKey      // opaque key — DOM 미렌더(UUID 안전)
  getInputLabel / renderOption / listboxLabel
  getChipProps?(s, i): {label, value, removeLabel?}   // 또는 renderChip?
  ariaLabel? inputTestId? placeholder? required? minChars?(=1)
  disabled? error? label? debounceMs?(=250) max?
}
```
- 실 소비처 2곳: `routes/GroupwareApprovalCreatePage.tsx`, `routes/ApprovalLineConfigPage.tsx`.
- **판정: 그대로 재사용 가능.** 수신자 = 엔티티(직원) 선택 → `MultiSelectAutocomplete<RecipientOption, RecipientOption>` 형태가 결재작성과 동형. `FreeTextChipInput` 은 임의 문자열용이라 **비대상**.
- **design-system 소스는 변경하지 않는다**(변경 시 `feedback_design_system_playwright_mock_suite` 에 따라 mock 스위트 전량이 필수가 되고 T1 과 정면 충돌).

### 1.6 FE 현황 (부재 확증)

- `clients/**` grep: `recipientId` 0건 · `/messages` 0건 · `messenger` 매치 파일 16개는 전부 **`messenger.admin`(단톡방 매핑) 또는 권한 카탈로그/Playwright pagecodes** 이며 발송 화면 아님.
- `routes/index.tsx:1538~1540` = `/admin/chat-rooms`(단톡방 매핑, `messenger.admin`). `/messenger` 라우트 없음.
- 알림 벨(`components/NotificationBellDropdown.tsx`)은 `MESSENGER` 채널 알림을 표시하며 deeplink `/messenger` 로 이동시킨다 → 착지 페이지 없음.

> ⚠️ `feedback_recon_grep_false_negative` 준수: 위 부재 판정은 grep 0매치만이 아니라 **라우터 파일 실독(`routes/index.tsx`)·API 디렉터리 실목록·mock.ts 실독**으로 교차 확인했다. 그럼에도 웹/모바일 클라이언트의 미탐 가능성은 완전 배제 못 하므로, 구현 착수 시 LUNA 가 `clients/{web,mobile,mobile-staff}` 를 1회 재확인할 것.

---

## 2. 범위 / 비범위

### 범위 (IN)
1. **BE 복수 수신 API 신설** — `POST /admin/groupware/messages/bulk` (원자적 N행 발행 + 수신자별 알림 fan-out).
2. **BE 수신자 검색 엔드포인트 신설** — `GET /admin/groupware/messages/recipient-search` (`messenger.send` VIEW 게이트, 부서 제약 없음).
3. **user-service 검색 활성 필터** — `/internal/users/search` 에 재직자 한정 옵션 + 응답에 재직여부 반영(퇴사자 후보 배제).
4. **FE 쪽지 화면 신설** — 라우트 `/messenger`. 좌: 수신함(읽기 전용 목록), 우/상단: 발송 폼(수신자 **칩 복수선택** + 본문 + 발송). 알림 deeplink 착지 해소.
5. 기존 단건 `POST /admin/groupware/messages` **호환 유지**(§4.5).
6. 문서 동기화(README·dev-report·overview.html·DECISIONS 해당분) + mock 배선 + Playwright mock 스위트 + 라이브QA.

### 비범위 (OUT — 별도 이슈/후속 슬라이스)
| 항목 | 사유 |
|---|---|
| **읽음 처리(markRead) 엔드포인트 신설** | 서비스 메서드는 있으나 노출 경로 부재 = **pre-existing 결함**. 이번 슬라이스가 만든 결함이 아니고, 붙이면 상태전이·권한·배지 동기화까지 범위가 번진다 → `feedback_backlog_burndown_issue_bar` 기준 **실질 결함이므로 이슈 등록**(PM 자율 등록·보고)하고 본 PR 에서는 처리하지 않는다. 수신함은 읽기 전용으로 만들어 UNREAD 배지 의미를 바꾸지 않는다. |
| 쪽지 삭제/보관/답장/스레드 | 이슈 범위 밖. `feedback_throughput_parallel_scope_freeze_batch` 범위 동결. |
| 실시간 수신(SSE/폴링 고도화) | 기존 알림 벨 경로로 충분. 신규 표면 금지. |
| 그룹(부서/권한그룹) 단위 수신자 | 칩 후보를 그룹으로 확장하면 권한·전개 시맨틱이 새 결정 → 개발책임자 선확인 필요. 이번 슬라이스는 **개인 수신자만**. |
| 모바일/웹 클라이언트 쪽지 화면 | desktop 만. |
| design-system 컴포넌트 변경 | 재사용만. 변경 시 T1 충돌 + mock 스위트 전량 요구. |

---

## 3. 기존 결정 교차검증 (memory / dev-reports 대조)

| # | 본 슬라이스 설계 결정 | 대조 대상(실측) | 판정 |
|---|---|---|---|
| 1 | 수신자 복수 입력 = 칩(캡슐) | `.claude/memory/feedback_chip_ui_multi_input.md` — "여러 개를 중복 추가하는 입력은 모두 캡슐(칩)". 2026-07-18 supersede = **hand-roll 금지·`MultiSelectAutocomplete` 표준 사용** | ✅ 일치. hand-roll 금지 준수 |
| 2 | 칩 표시 = 이름(+부서), UUID 미노출 | `feedback_uuid_no_user_visibility.md` · 슬4 dev-report "opaque DOM id 상속·업무 key/UUID 는 React key/dedup 전용" · #825 결정 ② "`partnerId`(UUID) 통일·**payload 전용**" | ✅ 일치. `getSelectedKey` 로만 UUID 사용, DOM 미렌더 |
| 3 | 쪽지 수신자에 칩 적용 + BE 복수 수신 API | #825 본문 개발책임자 결정 ⑤(2026-07-16) "✅ 칩 적용 + BE 복수 수신 API 신설 / 범위가 쪽지 도메인까지 확장됨을 인지하고 착수" | ✅ 일치(직접 근거) |
| 4 | 수신자는 복수 허용 필드로 분류 | #825 "단수 강제(칩 적용 금지)" 목록 = 전표/견적 거래처·창고·계정·기안자 등 **회계 귀속 키**. 쪽지 수신자는 미포함. "복수 허용·칩 적용 우선 후보" 에 *일정 참석자* 등 동류 존재 | ✅ 충돌 없음 |
| 5 | 칩 0개 = 미선택(발송 차단), '전체' 칩 미도입 | #825 결정 ① "칩 0개 = 미선택(저장 차단), '전체' 칩을 넣어야 전체 동작" — '전체' 칩은 **null 3-상태(전체마감/전체창고/전체필터)** 를 가진 필드가 대상. 쪽지 수신자에는 '전체 사원 발송' 시맨틱이 현재 없다(슬5 PR #864 는 회계·재고 필드 대상) | ✅ 일치. 칩 0개=발송 차단(400)만 채택, '전체' 칩은 **새 정책이므로 미도입**(도입 시 전사 발송 = 신규 업무규칙 → 개발책임자 확인 대상) |
| 6 | 용어 = 이슈는 "쪽지", 코드/화면 기존 표기는 "메신저" | `feedback_jeonpyo_not_slip`(전표/슬립) · `feedback_comment_not_collab_comment`(코멘트) 는 **본 도메인 무관**. 기존 코드·권한 라벨은 `MESSENGER_SEND("messenger.send","메신저 발송")`, 알림 채널 `MESSENGER` | ⚠️ 결정 필요 → **화면 라벨은 기존 "메신저" 유지**(권한 라벨·알림 채널과 1:1). "쪽지" 는 이슈/커밋 서술어로만 사용. 라벨 변경은 권한 카탈로그까지 번지므로 비범위 |
| 7 | Role 표기 | `feedback_role_naming_full` — MASTER/MANAGER 풀네임, 약어 금지 | ✅ 문서·코드 전량 풀네임 |
| 8 | 신규 마이그는 V14 이후만, 기존 V1~V13 불변 | `feedback_applied_migration_immutable` | ✅ §6 |
| 9 | BaseEntity 7 audit + soft delete | `project_build_conventions` · `Message extends BaseEntity` | ✅ 신규 컬럼도 규약 준수 |
| 10 | mock 값 형식 = BE parity | `feedback_mock_value_format_be_parity` | ✅ mock 수신자/응답 형식은 실 BE DTO 미러(§9) |
| 11 | 조기 PR OPEN(≠DRAFT), 한국어 커밋/PR | `feedback_pr_open_not_draft` · `feedback_korean_commits` | ✅ PM 수행 |

---

## 4. BE 복수 수신 API 설계

### 4.1 엔드포인트

```
POST /admin/groupware/messages/bulk
헤더: X-User-Id (게이트웨이 주입 · 송신자 확정), X-User-Role
가드: @RequirePermission(page = "messenger.send", action = PermissionAction.CREATE)

Request  MessageBulkSendRequest
  recipientIds : List<UUID>   @NotEmpty @Size(max = 50)   (요소 @NotNull)
  body         : String       @NotBlank @Size(max = 2000)

Response 201  ApiResponse<MessageBulkSendResponse>
  batchId       : UUID          // 이번 발송 묶음 식별자
  sentCount     : int           // 실제 생성 행 수(dedup 후)
  messages      : List<MessageResponse>
```

- **송신자는 본문에서 받지 않는다.** 기존 단건이 이미 `senderId` 를 무시하는 위조 방지 정책(`MessageService.send` Javadoc)을 채택했으므로 신규 DTO 에는 필드 자체를 두지 않는다(무시 필드는 다음 라운드 감사 대상이 된다).

### 4.2 원자성 — **전원 성공 또는 전원 실패 (all-or-nothing)**

**결정: 원자적.** 근거 3가지.
1. **개발책임자 결정 ⑤ 의 명시 근거가 "원자성·성능이 개선된다"** 이다. 부분 성공 API 는 결정문과 정면 배치.
2. 사용자 멘탈 모델: 한 번의 "발송" 클릭 = 한 통의 쪽지를 N명에게. 일부만 도착하고 화면은 성공을 표시하면 **사용자가 재발송해서 일부 수신자에게 중복 발송**된다(비원자 API 의 실제 피해 경로).
3. 기존 도메인 불변식(`self-send 금지`)이 이미 예외 기반이라, 단일 `@Transactional` 메서드 안에서 검증→저장하면 자연스럽게 all-or-nothing 이 된다.

**구현 불변식(수단은 지정하지 않음 — PM 은 불변식만 말한다):**
- 한 요청의 결과는 `messages` 행이 **정확히 N개 생성되거나 0개 생성**된다. 중간 상태는 관측 불가.
- 알림 발행은 **커밋 이후에만** 일어난다(롤백 시 알림 0건). 기존 `NotificationPublisherSupport.publishAfterCommit` 계약과 동일.

### 4.3 부분 실패 시맨틱 (= 전건 거부 + 사유 보고)

| 상황 | 응답 | 본문 |
|---|---|---|
| `recipientIds` 비어 있음 | 400 INVALID_INPUT | "수신자를 1명 이상 선택하십시오" |
| 상한 초과(>50) | 400 INVALID_INPUT | "수신자는 최대 50명까지 선택할 수 있습니다" |
| 존재하지 않는 수신자 1명 이상 | **404 NOT_FOUND · 0건 저장** | "수신자를 찾을 수 없습니다: {표시명 또는 순번}" — 🚫 **UUID 를 메시지에 넣지 않는다**(현행 단건은 `"수신자 미존재: " + UUID` 로 UUID 를 노출한다 → 신규 경로는 미노출, 단건은 §4.5 대로 동작 보존) |
| 송신자 본인이 수신자에 포함 | 400 INVALID_INPUT · 0건 저장 | "본인은 수신자로 지정할 수 없습니다" (**조용한 제거 금지** — 의도를 드러내는 슬5 null-semantics 정신과 일치) |
| 요청 내 중복 UUID | **정규화(dedup) 후 진행**, 400 아님 | 칩 UI 가 이미 중복을 차단하므로 실 사용자 도달 불가 경로. 방어적 dedup 이 안전하고 `sentCount` 로 실제 건수를 정직히 반환 |
| body 공백/2000 초과 | 400 | Bean Validation |

### 4.4 멱등성 — **비멱등(명시적으로 채택하지 않음)**

- **결정: 서버측 멱등키 미도입.** 근거: (a) 쪽지는 "같은 사람에게 같은 문장을 두 번 보내는 것" 이 **정당한 사용자 의도**일 수 있어 서버가 중복을 판단할 권한이 없다. (b) 멱등키 저장소(테이블/TTL)는 신규 표면이며 범위 동결 대상. (c) 원자성이 이미 "절반 발송" 이라는 실 피해를 제거한다.
- 대신 **중복 발송의 실 도달 경로는 FE 에서 차단**: mutation in-flight 동안 발송 버튼 `disabled`(react-query `isPending`), 성공 시 폼 초기화. 이 가드는 §7 에 RED-first 테스트 대상으로 등재한다.
- 🔴 리뷰 라운드에서 "멱등키 없음 = 결함" 주장이 나오면, **실 사용자 경로로 재현 가능한 피해가 있는지**(도달성 축)로 판정한다. 재현 불가 시 검증 품질로 분류·이월.

### 4.5 기존 단건 경로 호환 — **유지 · deprecate 표기만 · 삭제 금지**

- `POST /admin/groupware/messages` 는 **경로·요청·응답·상태코드 전부 불변**. 현행 IT (`GroupwareAdminControllerIT:544/557`) 가 그대로 통과해야 한다(회귀 0의 증거).
- 표시만 `@Operation(deprecated = true)` + Javadoc "복수 수신은 `/messages/bulk` 사용" 로 추가한다. HTTP 계약은 건드리지 않는다.
- 내부 구현은 단건이 bulk 로직을 재사용하도록 수렴시킬 수 있으나 **관측 가능한 동작은 동일해야 한다**. 특히 단건의 기존 예외 메시지/상태코드를 바꾸지 말 것(바꾸면 계약 변경 = 다음 라운드 감사 대상).
- 삭제/이관 시점은 미정 — 소비자 실측 결과 **현재 프로덕션 소비자 0(테스트만)** 이지만, 외부/모바일 미탐 가능성이 있으므로 제거는 별도 슬라이스.

### 4.6 수신자 수 상한 = **50명**

근거: `UserClient.search` 가 limit 상한 50(`Math.min(Math.max(limit,1),50)`)이고, 알림 fan-out 이 수신자당 1 publish 라 상한이 곧 커밋 후 발행 건수다. 50 은 실 사원 규모(수십 명)에 여유가 있고, `MultiSelectAutocomplete` 의 `max` prop 으로 FE 에서 동일 값을 강제해 **BE 400 이 사용자 눈에 뜨기 전에 UI 가 먼저 막는다**(BE 검증은 그대로 유지 = 이중 방어).

### 4.7 알림 fan-out

- 수신자별 1건 `NotificationPublishRequest(channel="MESSENGER", severity=INFO, title="새 메시지 — {송신자 표시명}", body=본문 80자 절삭, targetUserId=수신자, refId=messageId, deeplink="/messenger")`.
- 송신자 표시명은 **요청당 1회만 해석**한다(현행 단건은 매 발송 `resolveSenderDisplayName` 호출 → N배 RPC 가 되면 "성능 개선" 이라는 결정 ⑤ 근거가 무너진다).
- 수신자 존재 검증은 **`verifyBulk(List<UUID>)` 로 1회** (현행 단건은 `exists` 개별 호출). `UserClient` 에 이미 존재.

---

## 5. 경계 / 권한 / 계약 / 무결성

### 5.1 수신자 권한·존재 검증

| 위험 | 실측 | 대응 |
|---|---|---|
| 존재하지 않는 사용자 | `verifyBulk` 로 검증 | 1명이라도 미존재 → 404 · 0건 저장(§4.3) |
| **퇴사자** | `searchInternalApprovers` 가 `termination_date` 미필터(`EmployeeRepository.java:62`) | user-service 검색에 **재직자 한정 필터 추가**(§9). 발송 검증은 존재(`exists`) 기준 유지 — 재직 종료자에게 이미 발송된 이력을 깨지 않기 위해 **차단은 후보 노출 단계에서만** 수행하고, 발송 자체를 퇴사자에게 막을지는 새 업무규칙이므로 **미도입**(도입 시 개발책임자 확인) |
| **fail-OPEN 함정** | `UserClient` 는 `samhan.user-client.fail-mode:OPEN` 기본 → user-service 장애 시 `exists()` 가 true 로 통과 | 복수 발송은 이 위험이 N배. **동작을 바꾸지 않는다**(기존 전역 정책·바꾸면 전 서비스 파급) 대신 dev-report 에 명시 기록 + 라이브QA 는 user-service 정상 상태에서 수행 |
| 권한 없는 수신자 | `messenger.send` 는 사실상 전 역할 보유(V30) → "수신 권한" 개념이 현재 없음 | **수신 권한 검사 미도입**(신규 정책). 발송자 권한(`messenger.send` CREATE)만 게이트 |
| 자기 자신 | 도메인 불변식 존재 | 400(§4.3) |

### 5.2 `@RequirePermission` ↔ FE `canAccess` page-code 일치 (`feedback_fe_canaccess_pagecodes_be_match`)

| 표면 | BE | FE |
|---|---|---|
| 쪽지 라우트 진입/수신함 | `messenger.send` · VIEW | `<PermissionGuard pageCode="messenger.send" action="view">` + 사이드바 `dynamicCanAccess('messenger.send','view')` |
| 발송 | `messenger.send` · CREATE | `canAccess('messenger.send','create')` → 발송 버튼/폼 비활성 |
| 수신자 검색 | `messenger.send` · VIEW (신규 엔드포인트) | 동일 게이트 아래에서만 호출 |

- 🚫 **`groupware.approvals` / `EXECUTIVE_OFFICE` 재사용 금지** — §1.4 결함 1.
- `messenger.send` 는 이미 `auth-service` `PageCode.MESSENGER_SEND`(`PageCode.java:154`) 와 V30 매트릭스에 존재 → **신규 page-code 없음 = auth-service 마이그 불필요**.
- FE 가드를 새로 다는 것이지 제거하는 게 아니므로 `feedback_fe_guard_removal_contract_tests` 는 비해당. 다만 VIEW-only 사용자가 발송 API 를 직접 때렸을 때 403 이 나는지는 **실 HTTP 회귀 테스트**로 검증한다(`feedback_enforcement_real_http_test`).

### 5.3 API 계약 변경 영향

- 신규 엔드포인트 2개 추가 + 기존 3개 불변 → **breaking change 0**.
- `MessageResponse` 는 필드 추가 없이 재사용(응답 UUID 는 payload 전용, 화면 미표시).
- OpenAPI/springdoc: `@Operation` 한국어 요약 + `@ApiResponses` 201/400/403/404 명시(3-layer 문서화 규약).

---

## 6. 데이터 · 마이그레이션 영향

### 6.1 스키마 표현 결정 — **행-단위 유지(정규화 미채택)**

| 안 | 내용 | 판정 |
|---|---|---|
| **A(채택)** | 현행 `messages` 1행 = (수신자 1명) 유지. 복수 수신 = N행 원자 삽입 | ✅ 기존 인덱스(`recipient_id, sent_at`/`recipient_id, status`)·`markRead`·`unreadCount`·soft-delete 가 전부 그대로 동작. 엔티티 Javadoc 이 이미 이 모델을 명시. 마이그 리스크 최소 |
| B | `message` + `message_recipients` 정규화 | ❌ inbox/unreadCount 쿼리·인덱스·soft-delete·기존 IT 전면 재작성. 이슈가 요구한 것은 API 원자성이지 저장 모델 변경이 아님. 범위 동결 위반 |

### 6.2 신규 마이그레이션 — **V14 1개**

```
services/groupware-service/src/main/resources/db/migration/V14__add_messages_batch_id.sql
  ALTER TABLE messages ADD COLUMN batch_id UUID;              -- NULL 허용(기존 행 무해)
  CREATE INDEX ix_messages_batch_active ON messages (batch_id) WHERE is_deleted = FALSE;
```
- **필요 근거**: (a) 응답 `batchId` 로 FE 가 "N명에게 발송됨" 을 표현. (b) **원자성 불변식을 사후 관측 가능하게 만든다** — 뮤테이션 RED(§7)에서 "batch_id 별 행 수 == 요청 수신자 수" 를 단언할 수 있어야 원자성 테스트가 진짜 원자성을 검증한다(행 총계만 세면 다른 테스트와 섞여 false-green). (c) 감사 추적.
- **반론(기록)**: 순수 최소 범위로는 컬럼 없이도 기능은 된다. 그러나 (b) 때문에 검증 품질이 아니라 **게이트 대상 불변식의 관측 가능성** 문제라 채택한다. 단건 경로는 `batch_id = NULL` 로 남겨 기존 동작 불변.
- 🚫 V1~V13 은 **주석 한 글자도 수정 금지**(checksum). 로컬 재적용 시 out-of-order 주의.
- `feedback_migration_fresh_postgres_probe`: fresh Postgres 에 `psql -v ON_ERROR_STOP=1` 로 V1→V14 전량 적용 probe 를 구현 단계에서 실행할 것(Windows Testcontainers skip 이 실패를 가릴 수 있음).

### 6.3 user-service 마이그레이션

**불필요.** `termination_date` 컬럼은 이미 존재. 변경은 JPQL 조건 + DTO 필드뿐.

---

## 7. 테스트 전략 (RED-first)

> 🚨 규율: **결함/불변식을 재현하는 실패 테스트를 먼저 쓰고 RED 원문을 제출한 뒤** 구현한다. RED 를 만들지 못하면 미이해 신호이니 **고치지 말고 보고**. 테스트 추가·변경에는 **그것이 지킨다는 대상을 망가뜨린 뮤테이션 RED 원문**을 동반한다.

### 7.1 RED-first 대상 (구현 전에 반드시 RED 로 확인)

| # | 대상 불변식 | RED 를 만드는 방법 | 계층 |
|---|---|---|---|
| R1 | 미존재 수신자 1명 포함 시 **0건 저장** | 3명 중 1명 미존재 요청 → 404 이고 `messages` 행 0 | groupware IT (실 DB) |
| R2 | 성공 시 **정확히 N행**, 모두 같은 `batch_id`, 모두 UNREAD | 5명 요청 → batch_id 그룹 count==5 | IT |
| R3 | 롤백 시 **알림 0건** | 발행 실패 유도/미존재 수신자 → publisher 호출 0 | 서비스 단위 |
| R4 | 송신자 본인 포함 → 400 · 0건 (조용한 제거 금지) | sender 를 recipientIds 에 포함 | IT |
| R5 | 상한 51명 → 400 · 0건 | | IT |
| R6 | 송신자 표시명 해석 **요청당 1회** | `verify(userClient, times(1)).resolveDisplayName(...)` with N=5 | 단위 |
| R7 | 수신자 존재 검증이 **verifyBulk 1회** | `times(1)` | 단위 |
| R8 | **VIEW-only 사용자가 bulk POST → 403** | 실 HTTP(MockMvc + 권한 헤더), `@MockBean` 우회 금지 | IT |
| R9 | 수신자 검색이 **EXECUTIVE_OFFICE 아닌 역할(SALES)에서 200** | 부서 헤더 없이 호출 | IT |
| R10 | 검색 결과에 **퇴사자 미포함** | termination_date 과거인 직원 시드 → 후보 배제 | user-service IT |
| R11 | 기존 단건 경로 **회귀 0** | `GroupwareAdminControllerIT:544/557/inbox` 무수정 통과 | IT |
| R12 | 오류 메시지에 **UUID 미포함**(신규 경로) | 404 본문 정규식 UUID 매치 0 | IT |
| R13 | FE: 칩 0개면 발송 버튼 **비활성**, 클릭해도 POST 0 | vitest | FE |
| R14 | FE: 발송 in-flight 중 재클릭 → POST **1회만** | vitest | FE |
| R15 | FE: 칩 DOM 에 **UUID 문자열 미출현**, 이름/부서만 | vitest + Playwright | FE/QA |
| R16 | FE: 이미 선택된 수신자는 검색 후보에서 제외 | vitest(MSA 계약) | FE |

### 7.2 뮤테이션 RED 로 지킬 불변식 (테스트가 가짜가 아님을 증명)

| 뮤테이션 | 반드시 RED 가 되어야 하는 테스트 |
|---|---|
| bulk 저장 루프를 try/catch 로 감싸 실패 수신자를 skip(부분 성공화) | R1, R2 |
| `@Transactional` 제거 | R1, R3 |
| self-send 검사 삭제 | R4 |
| `@Size(max=50)` 삭제 | R5 |
| `@RequirePermission` action 을 CREATE→VIEW 로 완화 | R8 |
| recipient-search 에 `@RequireDepartment(EXECUTIVE_OFFICE)` 추가 | R9 |
| 재직 필터 조건 삭제 | R10 |
| 404 메시지에 UUID 를 다시 붙임 | R12 |
| 발송 버튼 disabled 조건 삭제 | R13, R14 |
| 칩 표시값을 `getSelectedKey` 결과로 교체 | R15 |

### 7.3 회귀 스위트

- groupware-service: 변경 모듈 **전체** test 후 push(`feedback_changed_module_full_test_before_push`), `--rerun-tasks --no-build-cache` 로 genuine 강제(캐시 false-green 차단).
- user-service: 동일.
- `ci.yml` `--tests` allowlist 에 신규 테스트 클래스가 포함되는지 확인(`feedback_ci_test_filter_false_green`).
- desktop: `npm run typecheck`(vitest≠tsc) + vitest + **Playwright mock 스위트**(§8.2).

---

## 8. 라이브QA 시나리오 (실서버 실제 실행 · 정적검사 대체 금지)

전제: Docker 실스택 `:8080`, **mock OFF**, 데스크톱 실 GUI, 계정 `dev_master` / `${QA_DEV_DEFAULT_PASSWORD}`. 매 리뷰 라운드마다 **단계별 GUI 스크린샷 다수** 캡처 → `docs/qa/825-s6-messenger-chip-real-qa/` 커밋 + **full SHA raw URL 인라인**(PR) + `SendUserFile`(사용자 채팅) **둘 다**.

| # | 사용자 경로 | 기대 |
|---|---|---|
| L1 | 로그인 → 사이드바에 "메신저" 진입점 노출 → `/messenger` 이동 | 화면 렌더(알림 deeplink dangling 해소) |
| L2 | 수신자 입력에 실 사원명 2글자 입력 | 후보 드롭다운, 방향키 이동, Enter 선택 → **칩 1개 생성(이름·부서 표시)** |
| L3 | 추가로 2명 더 선택 | 칩 3개, 이미 선택된 사원은 후보에서 제외 |
| L4 | 칩 1개 X 클릭 | 칩 2개, 포커스 입력으로 복귀 |
| L5 | 본문 입력 후 발송 | 201, "3명에게 발송" 류 피드백, 폼 초기화 |
| L6 | 수신자 계정으로 재로그인 | **수신함에 해당 쪽지 존재** + 알림 벨에 MESSENGER 알림 → 클릭 시 `/messenger` 착지 |
| L7 | 원자성 실증 — 존재하지 않는 수신자를 포함한 요청을 **실서버에 실제 전송**(개발자도구/curl) | 404 + 수신함 증가 0(전건 미저장). 응답 본문에 UUID 미노출 |
| L8 | 권한 격리 — `messenger.send` CREATE 없는 계정으로 로그인 | 발송 폼 비활성 + 직접 API 호출 시 403 |
| L9 | 수신자 검색 권한 — **임원실 아닌 역할(SALES 등)** 계정으로 L2 재수행 | 200(검색 동작). ← §1.4 결함 1 의 실증 |
| L10 | 화면 전체 DOM 에 UUID 문자열 미출현 확인 | 캡처 + DOM 검사 |

🚨 함정 대비: 라이브QA 는 **공유 실데이터에 write 를 남긴다**(쪽지 행). 전용 throwaway 계정 쌍(개발용 시드 계정)으로만 발송하고, 실 사용자 계정에 대량 발송 금지. 병렬 트랙과 **라이브 write 는 직렬화**.

### 8.2 Playwright mock 스위트

- 신규 디렉터리 `clients/desktop/playwright/ac-825-s6-messenger-chip/` (mock `:5173` hard gate) + 실서버용 `.../825-s6-messenger-real-qa/` (**`-real-qa` 접미사 필수** — 누락 시 CI mock 잡에서 미제외되어 ECONNREFUSED).
- 🚨 `feedback_verify_playwright_gate_before_adversarial`: mock 스펙은 **시드 id 기준**(지어낸 id 금지), mock-handled 엔드포인트는 `page.route` no-op. PM 은 적대검증 **전에** Playwright 게이트 통과를 직접 확인.
- 🚨 mock 스위트 실행은 `docs/qa/**` 와 `clients/desktop/playwright/**/screenshots/**` 의 **커밋된 스크린샷을 덮어쓴다**. 원복 시 `git checkout -- clients/desktop/playwright/` **디렉터리 통째 금지**(스펙 수정까지 삭제됨 — 실제 유실 이력). 의도 변경을 먼저 `git add` 후 경로 한정 원복.
- 🚨 `.gitignore` 의 `*.log` 가 `docs/qa` 증거를 제외한 전례(#889) → 스크린샷 커밋 후 `git status` 로 실제 추적 확인.

---

## 9. 파일 단위 구현 계획

### 9.1 BE — groupware-service (신설 5 / 수정 4)

| 파일 | 구분 | 역할 |
|---|---|---|
| `dto/MessageBulkSendRequest.java` | 신설 | `recipientIds`(@NotEmpty @Size(max=50)) + `body` |
| `dto/MessageBulkSendResponse.java` | 신설 | `batchId, sentCount, messages` |
| `dto/RecipientSearchResponse.java` | 신설 | `userId(payload 전용), name, department` |
| `service/MessageService.java` | 수정 | `sendBulk(...)` 추가(@Transactional·verifyBulk 1회·표시명 1회·afterCommit fan-out). 기존 `send` 동작 불변 |
| `domain/Message.java` | 수정 | `batchId` 필드 + 팩토리 오버로드. 기존 `send(...)` 시그니처 유지 |
| `controller/GroupwareAdminController.java` | 수정 | `POST /messages/bulk`, `GET /messages/recipient-search` 추가 · 기존 `/messages` 에 deprecated 표기 |
| `client/UserClient.java` | 수정 | 검색 호출에 재직자 필터 파라미터 전달(응답 파싱 확장) |
| `db/migration/V14__add_messages_batch_id.sql` | 신설 | §6.2 |
| `README.md` (groupware) | 수정 | 엔드포인트 표 갱신 |
| 테스트: `service/MessageServiceTest.java`(수정) · `it/GroupwareAdminControllerIT.java`(수정) · `it/MessageBulkSendIT.java`(신설) | | §7 |

### 9.2 BE — user-service (수정 3)

| 파일 | 역할 |
|---|---|
| `repository/EmployeeRepository.java` | `searchInternalApprovers` 에 재직자 조건 추가(또는 재직 필터 파라미터화). **기존 결재자 picker 동작 변경 여부는 리뷰 쟁점** → 기본값은 기존과 동일(전건), 신규 파라미터로만 필터 = 회귀 0 |
| `web/InternalUserController.java` | `/internal/users/search` 에 `activeOnly` 쿼리 파라미터(기본 false = 현행 유지) |
| `web/dto/InternalEmployeeSearchResponse.java` | 필요 시 재직여부 노출 |
| 테스트 IT | R10 |

### 9.3 FE — clients/desktop (신설 4 / 수정 4)

| 파일 | 구분 | 역할 |
|---|---|---|
| `src/renderer/api/messengerApi.ts` | 신설 | `searchRecipients(q)`, `sendBulkMessage({recipientIds, body})`, `fetchInbox()` + 타입 |
| `src/renderer/api/messengerApi.test.ts` | 신설 | 계약 테스트 |
| `src/renderer/routes/MessengerPage.tsx` | 신설 | 발송 폼(**`MultiSelectAutocomplete` 재사용**, `max={50}`) + 수신함 읽기 전용 목록 |
| `src/renderer/routes/MessengerPage.test.tsx` | 신설 | R13~R16 |
| `src/renderer/routes/index.tsx` | 수정 | `/messenger` 라우트 + `PermissionGuard pageCode="messenger.send"` |
| `src/renderer/components/AppLayout.tsx` | 수정 | 사이드바 진입점(그룹웨어 5대분류 내) |
| `src/renderer/api/mock.ts` | 수정 | 수신자 검색·bulk 발송·inbox mock 핸들러(**BE parity**) |
| `clients/desktop/README.md` | 수정 | 화면 문서 |

### 9.4 문서

`docs/dev-reports/2026-07-2X-825-s6-messenger-chip-bulk.md`(신설) · `docs/specs/825-s6-messenger-chip-spec.md`(신설) · `README.md` · `ROADMAP.md` · `DECISIONS.md` · `docs/samhan-public-overview.html` 동기화(별도 docs PR 금지 — 같은 PR 에 포함).

### 9.5 🚨 T1(#868) / T3(#824) 와 충돌 가능한 공유 파일

| 파일 | 충돌 상대 | 완화 |
|---|---|---|
| **`clients/desktop/src/renderer/api/mock.ts`** (18,000+줄) | **T1·T3 모두 高확률** | 신규 핸들러를 **파일 말미 전용 섹션에 append-only**로 추가하고 기존 블록 재배치·정렬 금지. 권한 배열(`:18237`, `:18418`)은 **손대지 않는다**(`messenger.send` 는 이미 존재) |
| `clients/desktop/src/renderer/routes/index.tsx` | T1·T3 (라우트 추가) | 라우트 배열 말미 근처 1블록만 삽입 |
| `clients/desktop/src/renderer/components/AppLayout.tsx` | T1(그룹웨어 메뉴) **高** | 그룹웨어 섹션에 1항목만 추가. 메뉴 구조/순서 변경 금지 |
| `services/groupware-service/.../controller/GroupwareAdminController.java` | **T1(#868 groupware 문서양식) 高** | 메신저 섹션(`// ===== 메신저 =====`) 내부에만 추가. 결재 관련 메서드 무수정 |
| `services/groupware-service/.../db/migration/V1x__*.sql` | **T1 과 버전 번호 경합 高** | 착수 시 `V14` 선점. T1 이 먼저 V14 를 쓰면 **V15 로 재번호**(적용 전이므로 rename 가능, 적용 후엔 불변) |
| `clients/web/design-system/**` | **T1 高** | **본 트랙은 design-system 을 수정하지 않는다**(재사용만) |
| `clients/desktop/src/renderer/api/permissionsApi.ts` | T1·T3 | **수정 불필요**(page-code 신규 없음) |
| `services/auth-service` 마이그 | — | **불필요** |

머지 순서 충돌 시 `feedback_stacked_pr_ci_false_green`: 먼저 머지된 PR 이후 나머지에 `git merge origin/main` → **재-CI green(exact SHA)** 확인 후 머지.

---

## 10. 리스크 · 함정 대조

| # | 리스크 | 근거 메모리 | 대응 |
|---|---|---|---|
| 1 | **범위 오인식** — "칩으로 교체" 로 착수했다가 FE 화면 부재를 뒤늦게 발견 | `feedback_recon_grep_false_negative` | §0 에서 선확정. 구현 착수 전 LUNA 가 web/mobile 재확인 |
| 2 | design-system 변경 유혹 | `feedback_design_system_playwright_mock_suite` | 재사용만. 변경 필요가 생기면 **범위 점증 → 개발책임자 확인 + 리뷰 재가동**(비용 선제시) |
| 3 | mock 값 형식이 BE 와 어긋나 리뷰가 필드만 보고 통과 | `feedback_mock_value_format_be_parity` | mock 응답을 실 DTO 필드·형식과 1:1. 형식 가드 테스트 |
| 4 | Playwright 스크린샷 원복이 스펙 수정을 삭제 | `feedback_screenshot_restore_scope_destroys_edits` | §8.2. 디렉터리 통째 checkout 금지 |
| 5 | gradle 캐시 false-green | `feedback_gradle_test_cache_false_green` | `--rerun-tasks --no-build-cache` |
| 6 | 병렬 트랙 gradle 트리·라이브 DB 경합 | `feedback_parallel_agent_gradle_shared_tree_contention` | 트랙별 worktree, 라이브 write 직렬화, 권위는 exact SHA CI |
| 7 | IT `@Transactional` 이 OSIV-off lazy-init 500 을 마스킹 / crafted payload 로 BE 검증 | `feedback_live_qa_penetrates_it_masking` | BE 검증도 **실 FE payload**로. 라이브QA 필수 |
| 8 | 알림 발행이 tx 내부면 롤백 시 과대계측 | `feedback_prometheus_rule_runtime_load_and_eager_counter` | `publishAfterCommit` 유지 · R3 로 고정 |
| 9 | 알림 dev 'SUCCESS' stub 트랩 | `feedback_notification_stub_success_qa_trap` | 알림 도달은 **알림센터 배지/드롭다운 GUI**로 확인, SMS 성공 문자열을 실전달 증거로 쓰지 않음 |
| 10 | 라이브QA 가 공유 실데이터 오염 | `feedback_qa_live_shared_data_readonly` | 전용 시드 계정 쌍만 사용. soft-delete replace-set 모델 이해 후에만 DB 손대기(원칙적으로 손대지 않음) |
| 11 | 마이그 Windows skip 이 실패 가림 | `feedback_migration_fresh_postgres_probe` | fresh PG `ON_ERROR_STOP=1` probe |
| 12 | MockMvc 한글 mojibake | `feedback_mockmvc_getcontentasstring_charset` | `getContentAsString(UTF_8)` 명시 |
| 13 | RestClient 계약 false-green | `feedback_restclient_contract_test_false_green` | `UserClient` 검증은 `MockRestServiceServer` 로 실 HTTP 계약 |
| 14 | **fix 가 다음 라운드 감사 대상을 만드는 비종료 루프** | `feedback_canonical_workflow` (도달성 축) | 리뷰어는 발견을 **도달가능 / 검증품질** 로 분류 의무. 마감 라운드는 "실 사용자 경로로 재현되는가" 단일 질문 |
| 15 | pre-existing `markRead` 엔드포인트 부재를 이번 PR 에 끌어들임 | `feedback_fix_in_current_pr_no_split` + 범위 동결 | **이슈 등록 후 보고**(PM 자율), 본 PR 미편입. 수신함을 읽기 전용으로 유지해 시맨틱 왜곡 회피 |

---

## 11. 수용 기준 (머지 게이트 = 도달성 축)

1. **실 사용자 경로로 재현 가능한 결함 0** (심각도 무관) — L1~L10 전 시나리오 실행 증거.
2. **CI green (exact SHA)** — groupware-service·user-service 전체 test, desktop typecheck+vitest, Playwright mock hard gate.
3. **라이브QA = 실서버 실제 실행** — 스크린샷 다수, `--list`/typecheck 로 대체 금지.
4. 부가: RED-first 원문·뮤테이션 RED 원문이 PR 에 게시되어 있을 것.

---

## 12. 개발책임자 확인이 필요할 수 있는 항목 (신규 업무규칙 후보)

1. **'전체 사원 발송' 칩 도입 여부** — 미도입으로 기획(§3 #5). 필요하면 신규 정책 = 선확인.
2. **퇴사자에게 발송 자체를 차단할지** — 현 기획은 후보 노출만 차단(§5.1).
3. **화면 라벨 "메신저" vs "쪽지"** — 권한 라벨/알림 채널과 일관성 때문에 "메신저" 유지로 기획(§3 #6).

(위 3건은 모두 **기획 기본값을 확정해 두었으므로 진행을 막지 않는다.** 개발책임자 정정이 오면 그때 PR 에 "📌 개발책임자 결정 기록" 코멘트로 누적한다.)
