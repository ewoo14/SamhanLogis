# #894 내부 채팅 기획 명세

- 작성일: 2026-08-12
- 대상: Issue #894 / PR #1125
- 범위: 기획(spec)만 수행. 구현·마이그레이션·공유 스택 쓰기는 이 문서의 범위가 아니다.
- 기준선: `feat/894-internal-chat`을 `origin/main`에 rebase한 뒤 현재 소스에서 다시 측정했다.

## 0. 기준선과 변경 불가 결론

허용된 기준선 갱신 명령과 출력은 다음과 같다.

```text
> git rebase origin/main
Rebasing (1/2)
Rebasing (2/2)
Successfully rebased and updated refs/heads/feat/894-internal-chat.
```

S1 정찰(`docs/dev-reports/2026-08-10-1125-s1-recon.md`)과 현재 코드·이슈·기존 결정을 대조한 결과, 다음 두 결론은 그대로 유효하다.

1. **별도 채팅 도메인을 신설하지 않는다.** 내부 채팅은 `groupware-service`의 기존 `messages`와 `/messenger`를 방(room) 모델로 진화시킨다. `notification-service`의 `partner_chat_room_mappings`는 거래처와 외부 단톡방 이름을 연결하는 관리 기능일 뿐 내부 채팅방이 아니므로 전용하지 않는다.
2. **실시간은 제3안이다.** Yjs co-edit provider를 채팅 저장 모델로 전용하지도 않고, WebSocket/RabbitMQ 기반 실시간 계층을 새로 만들지도 않는다. 공통 `RealtimeBroker`와 데스크톱 `createRealtimeClient`를 재사용하되, `groupware-service`에 방 단위 채팅 SSE endpoint와 채팅 event schema를 추가한다.

## 1. 3축 대조

### 1.1 이슈·PR 정본

실행 명령과 출력 원문:

```text
> gh pr view 1125 --json number,state,title,body,baseRefName,headRefName
{"baseRefName":"main","body":"연관 Issue: #894\n\n## 트랙 개설 — 착수 전 확인\n\n오래된 이슈부터 트랙으로 올립니다(2026-07-22 등록).\n\n### 정찰이 실측할 것\n1. 기존 메신저·알림 표면과 **겹치는 부분** — `#866` 메신저 칩 작업이 있었습니다. 새로 만들 것과 이미 있는 것을 가르십시오\n2. 실시간 계약 — 이 저장소는 SSE·협업 권위(`#1110`)를 이미 씁니다. 채팅이 그 위에 얹히는지 별개인지\n3. 권한 축 — 채팅방 참여자 결정 규칙. 🚨 `#895` 에서 *\"작성자는 대상자에 자동 포함\"* 이 확정된 전례가 있습니다\n4. 실 데이터 — 사용자·그룹 수, 알림 발송 경로\n\n### 🚨 업무 판단이 필요할 것\n채팅방 생성 권한 · 이력 보존 기간 · 삭제 정책 · 알림 연동 범위 — **추측하지 말고 질문으로** 올립니다.","headRefName":"feat/894-internal-chat","number":1125,"state":"OPEN","title":"[FEAT] #894 내부 채팅 — 채팅방 신설·편집 및 대화 (트랙 개설)"}
```

Issue #894의 본문과 개발책임자 코멘트에서 확정된 경계는 다음과 같다.

- 1:1 쪽지와 채팅을 통합한다. 기존 수신자당 1행 쪽지는 방 모델로 승격하며 1:1 방은 채팅방의 한 종류다.
- 방 생성·이름 변경·참여자 편집과 방 단위 대화가 기본 요구다. 사진·동영상·일반 파일 전송, 참여자별 읽은 사람과 읽은 시각, PC/모바일 리액션, 메시지 참조, `@` 멘션과 방 목록 `@` 미읽음 표시는 후속 완성 범위다.
- 채팅은 전표·주문에 종속되는 기능이 아니라 독립 방이다. 다만 사람 발신 알림은 그 사람과의 1:1 방에, 시스템 발신 알림은 ‘삼한이’ 방에 표시하고 업무 deeplink를 메시지 액션으로 보존한다.
- 어느 업무 화면에서든 우측 하단 삼한이 런처로 방 목록을 열고, 방 선택 시 독립 채팅 라우트/별도 창을 연다. 모바일은 전체 화면 독립 라우트를 사용한다.

### 1.2 코드 실측 — 이미 있는 협업 표면

현재 소스에는 co-edit가 실제로 존재한다. 서버의 `GET .../coedit` 표면을 직접 센 결과 **7개**다.

```text
> rg -n --glob '*Controller.java' "@GetMapping.*coedit" services
services/accounting-service/src/main\java\com\samhanair\logis\accounting\web\collab\JournalCollabController.java:190:    @GetMapping("/coedit")
services/accounting-service/src/main\java\com\samhanair\logis\accounting\web\collab\CashReceiptCollabController.java:54:    @GetMapping("/coedit")
services/groupware-service/src/main\java\com\samhanair\logis\groupware\controller\GroupwareApprovalCollabController.java:197:    @GetMapping("/coedit")
services/partner-order-service/src/main\java\com\samhanair\logis\partnerorder\web\collab\PartnerOrderCollabController.java:197:    @GetMapping("/coedit")
services/slip-service/src/main\java\com\samhanair\logis\slip\web\collab\SlipCollabController.java:247:    @GetMapping("/coedit")
services/slip-service/src/main\java\com\samhanair\logis\slip\web\dispatch\DispatchCollabCommentController.java:204:    @GetMapping("/collab/coedit")
services/slip-service/src/main\java\com\samhanair\logis\slip\estimate\web\collab\EstimateCollabController.java:194:    @GetMapping("/{estimateId}/collab/coedit")
```

즉 현재 협업 대상은 전표, 견적, 배차, 거래처 주문, 분개, 현금영수증, 그룹웨어 결재의 7종이다. 이 중 전표·견적·배차·거래처 주문·분개·그룹웨어 결재 6종은 코멘트와 제안(edit suggestion) 모델도 갖고, 현금영수증은 co-edit만 제공한다. 별도의 레거시 전표 코멘트(`/slips/{slipId}/comments`)도 남아 있다. 화면 용어는 코드와 기존 UI가 쓰는 **‘코멘트’**를 정본으로 하며 ‘협업 코멘트’라는 새 사용자 용어를 만들지 않는다.

## 2. 제품 경계 — 무엇이 채팅인가

채팅은 **독립된 1:1 또는 다중 참여자 방에서 시간순 메시지를 주고받는 사용자 화면**이다.

- **1:1:** 두 재직자의 안정적인 1:1 방. 기존 쪽지 발송/수신함은 이 방의 메시지 이력으로 승계한다.
- **다중:** 방 이름과 참여자 집합을 가지며 생성 후 이름·참여자를 편집할 수 있는 그룹 방.
- **독립성:** 방은 전표·주문·결재 UUID에 종속되지 않는다. 전표·주문 등 업무 대상을 공유할 때에는 deeplink/업무 참조 액션을 메시지에 붙인다.
- **채팅이 아닌 것:** 업무 객체 내부의 코멘트·제안·presence·Yjs co-edit, 그룹웨어 결재 자체, 알림 센터, 거래처↔외부 단톡방 매핑은 각각 기존 기능으로 유지한다. 이름이나 실시간성만 비슷하다고 채팅으로 합치지 않는다.
- **대화의 최소 단위:** 영속 메시지 1건과 참여자별 읽음 상태다. co-edit update/awareness처럼 일시적인 문서 동기화 payload는 메시지가 아니다.

## 3. 현황 실측과 재사용 경계

| 기능 | 현재 실측 | 채팅 설계 판정 | 코드 좌표 |
|---|---:|---|---|
| 전표 코멘트 | 레거시 전표 코멘트 모델 1종 + collab 코멘트 모델 6종 | 기존 업무 객체 안의 ‘코멘트’로 유지. 채팅 메시지로 마이그레이션하지 않음 | `slip/comment/domain/SlipComment.java`, 각 서비스 `*CollabComment.java` |
| 제안 | collab suggestion 모델 6종 | 채팅방 편집과 다른 “업무 문서 수정 제안”으로 유지 | `shared/collab-core/CollabSuggestion*`, 각 서비스 `*CollabSuggestion.java` |
| co-edit | 서버 GET 표면 7종 | broker/client와 SSE 운용 패턴만 재사용. Y.Doc/update/awareness는 채팅 본체로 재사용하지 않음 | `shared/collab-core/coedit`, 각 `*CollabController`, `createCoeditProvider.ts` |
| 메신저 | REST 5개(단건, bulk, 수신자검색, 수신함, 읽음) | `groupware-service` 안에서 room 기반 채팅으로 승계 | `GroupwareAdminController.java:194-278`, `Message.java:20-100` |
| 알림 | 사용자 조회·이력·확인 REST 3개 | 알림 생산/조회 진실원은 유지. 채팅 표시 projection과 읽음 동기화는 후속 슬라이스 | `NotificationCenterController.java:30-56`, `NotificationPublisher.java` |
| 그룹웨어 결재 | 결재 기본 REST 6개 + 결재 collab SSE/co-edit/코멘트/제안/presence | 결재 기능은 유지. 동일 서비스의 인가·첨부·SSE 구현 패턴 재사용 | `GroupwareAdminController.java:78-158`, `GroupwareApprovalCollabController.java:61-269` |

현재 메신저가 방이 아니라는 코드 원문은 다음과 같다.

```text
> Get-Content Message.java (20~59행 실측 발췌)
20: * 메신저 단건 (1:1). 송신자 → 수신자 본문 + 읽음 여부.
21: *
22: * <p>발송 시점 status=UNREAD. 수신자가 열람 호출 시 READ + readAt 적재.
23: * 그룹/단체 메신저는 본 entity 다중 row 발행으로 표현 (수신자 1명 = row 1건).
24: */
25:@Entity
26:@Getter
27:@Table(name = "messages")
28:@NoArgsConstructor(access = AccessLevel.PROTECTED)
29:@SQLRestriction("is_deleted = false")
30:public class Message extends BaseEntity {
38:    @Column(name = "sender_id", nullable = false, updatable = false)
39:    private UUID senderId;
41:    @Column(name = "recipient_id", nullable = false, updatable = false)
42:    private UUID recipientId;
44:    /** 복수 수신 발송 묶음 식별자. 기존 단건 발송은 null이다. */
45:    @Column(name = "batch_id", updatable = false)
46:    private UUID batchId;
48:    @Column(name = "body", nullable = false, length = 2000)
49:    private String body;
58:    @Column(name = "read_at")
59:    private LocalDateTime readAt;
```

현재 메신저의 `MESSENGER` 알림은 메시지 ID를 `sourceRefId`로 저장하고 `/messenger`로 연결한다(`MessageService.java:129-150`). 이 연결은 방 메시지/방 코드로 승계하되 기존 사용자에게 UUID를 보여주는 링크를 만들지 않는다.

### 3.1 얹을 서비스와 좌표

채팅의 소유 서비스는 **`services/groupware-service`**다.

- 도메인/영속: 기존 `domain/Message.java`, `repository/MessageRepository.java`, `service/MessageService.java`를 room 기반으로 진화시키고 같은 서비스에 room/participant/read 모델을 둔다.
- HTTP: 기존 `/admin/groupware/messages*` 호환 계약을 유지하면서 신규 `/admin/groupware/chat/rooms*`를 둔다. 별도 `chat-service`, 별도 database, notification-service 내부 채팅방 모델은 만들지 않는다.
- 실시간: `groupware-service`의 기존 `GroupwareApprovalCollabController`가 사용하는 `RealtimeBroker` 주입/인가/SSE 패턴을 따른다.
- 첨부: 같은 서비스의 `GroupwareApprovalAttachmentController`/MinIO storage adapter를 구현 패턴으로 재사용하되, 결재 첨부 bucket/key와 채팅 첨부 소유권은 분리한다.
- 알림: `notification-service`는 채팅 본체가 아니라 기존 notification center/publisher 역할을 유지한다.

## 4. 실시간 제3안

### 4.1 정의

제3안은 **기존 범용 SSE broker/client를 재사용하고 채팅 도메인 event만 추가**하는 방식이다.

```text
메시지/참여자 transaction commit
  → groupware-service ChatRealtimePublisher
  → RealtimeBroker.publish(roomId, "chat:...", payload)
  → GET /admin/groupware/chat/rooms/{roomCode}/stream (SSE)
  → createRealtimeClient 기반 ChatRealtimeClient
  → 방 목록/대화 query를 event identity 기준으로 한 번 재검증
```

SSE payload는 메시지 본문·첨부 원문을 권위 snapshot으로 싣지 않는다. `eventId`, 내부 room 식별자(전송 내부용), event type, 변경된 message의 내부 식별자, 발생 시각 정도만 전달하고 클라이언트가 REST를 재조회한다. 이는 #1110에서 확정된 “서버 권위 커밋 하나 ↔ 고유 사건 하나 ↔ 논리적 refresh 한 번” 규칙과 맞는다. 저장 rollback 뒤 event를 발행하지 않고, 중복 SSE 수신은 `eventId`로 멱등 소비한다.

### 4.2 기존 인프라 좌표와 제외선

실행 명령과 출력 원문:

```text
> rg -n 'interface RealtimeBroker|subscribe\(|publish\(|publishLocal\(' shared/realtime-abstraction/src/main/java/com/samhanair/logis/shared/realtime/broker/RealtimeBroker.java
23:public interface RealtimeBroker {
33:    SseEmitter subscribe(UUID entityId);
42:    void publish(UUID entityId, String eventName, Object payload);
54:    void publishLocal(UUID entityId, String eventName, Object payload);

> rg -n 'TEXT_EVENT_STREAM|subscribe\(' services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareApprovalCollabController.java
230:    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
234:        return broker.subscribe(approvalId);

> rg -n 'createRealtimeClient|/collab/stream|coedit:update|coedit:awareness' clients/desktop/src/renderer/realtime/createCoeditProvider.ts
9:import { createRealtimeClient } from './createRealtimeClient'
10:import type { RealtimeEvent } from './createRealtimeClient'
146:  const endpointPath = `${normalizeCoeditBasePath(basePath)}/collab/stream`
147:  return createRealtimeClient({
323:    if (event.event === 'coedit:update' && isCoeditPayload(event.data, 'update')) {
327:    if (event.event === 'coedit:awareness' && isCoeditPayload(event.data, 'awareness')) {
613:    if (event.event === 'coedit:update' && isCoeditPayload(event.data, 'update')) {
617:    if (event.event === 'coedit:awareness' && isCoeditPayload(event.data, 'awareness')) {
```

- **SSE:** `RealtimeBroker`와 `createRealtimeClient`를 그대로 재사용한다.
- **co-edit provider:** `createCoeditProvider`가 내부적으로 쓰는 SSE 연결 패턴은 재사용하지만 Yjs Doc, update POST, awareness POST, 5초 snapshot merge는 재사용하지 않는다. 채팅은 append-only 영속 이력과 참여자별 읽음이 필요하기 때문이다.
- **다중 노드:** 현재 공통층의 선택적 `RedisRealtimeBroker`(`samhan.realtime.broker=redis`) hook을 사용한다.
- **RabbitMQ:** 인프라 컨테이너는 존재하지만 애플리케이션 의존/consumer 실측은 `logging-service`뿐이다. 채팅 SSE의 기존 broker가 아니므로 이번 설계에서 사용하지 않는다.

```text
> rg -n 'spring-boot-starter-amqp|RabbitTemplate|@RabbitListener|spring.rabbitmq' services shared --glob 'build.gradle' --glob '*.java' --glob '*.yml' --glob '*.yaml'
services\logging-service\src\test\java\com\samhanair\logis\log\it\LoggingServiceContextLoadIT.java:23: * {@code @RabbitListener} 처리 BPP ({@code RabbitListenerAnnotationBeanPostProcessor}) 가
services\logging-service\src\test\java\com\samhanair\logis\log\it\LoggingServiceContextLoadIT.java:56:     * <p>{@code spring-boot-starter-amqp} 가 classpath 에 있으면 {@code @RabbitListener} 처리 BPP 가
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\AuditLogConsumer.java:30:    @RabbitListener(queues = "samhan.audit.queue")
services\logging-service\build.gradle:31:    implementation 'org.springframework.boot:spring-boot-starter-amqp'
```

### 4.3 채팅 event 최소 계약

- `chat:message-created`: 새 메시지 커밋. 참여자 방 목록과 열린 대화를 재조회한다.
- `chat:message-updated`: soft-delete 표시, 리액션/메시지 참조 등 메시지 표현 변경.
- `chat:room-updated`: 방 이름·참여자·보관 상태 변경.
- `chat:read-updated`: 참여자별 읽은 시각 변경.
- 연결 직후 `connected`, 30초 heartbeat, 60초 무응답 감지와 5초→60초 backoff는 기존 broker/client 계약을 승계한다.

## 5. 식별자와 사용자 화면 계약

내부 FK와 broker key에는 UUID를 계속 사용할 수 있지만 **화면 텍스트, 오류, URL, 복사값, 다운로드 파일명에 UUID를 노출하지 않는다.**

- 방: 내부 `room_id UUID`와 별도로 불변·유일한 사용자 노출 `room_code`를 둔다. 형식은 `CHAT-YYYYMMDD-NNNNNN`; 독립 라우트는 `/chat/{roomCode}`다. 방 목록에는 1:1이면 상대 이름, 다중이면 방 이름을 기본 표시하고 `room_code`는 상세 정보/지원 문의 때만 보조 표시한다.
- 참여자: `employeeCode + 이름 + 부서명`으로 표시한다. 동명이인은 부서명과 사번으로 구분한다. API의 `userId`는 선택/인가용 내부 값일 뿐 렌더링하지 않는다.
- 메시지: 일반 화면에는 작성자 이름과 시각만 보인다. 향후 사용자에게 메시지 링크/신고 번호가 필요할 때에는 UUID가 아닌 별도 `message_code`를 사용한다.
- 시스템 발신자: 화면 이름은 **‘삼한이’**, 종류는 시스템 배지로 구분한다. 실제 account UUID를 표시하지 않는다.
- 오류: “방을 찾을 수 없습니다”, “참여자 2번을 찾을 수 없습니다”처럼 업무 표현을 쓰며 UUID를 보간하지 않는다.

## 6. 용어와 화면 문구

- 업무 객체의 기존 기능은 **‘코멘트’**다. ‘협업 코멘트’라는 새 명칭을 쓰지 않는다.
- 채팅 표면은 **‘채팅’**, **‘채팅방’**, **‘대화’**, **‘참여자’**, **‘새 대화’**, **‘읽음’**, **‘읽은 사람’**을 쓴다.
- 1:1 쪽지의 화면 명칭은 점진적으로 ‘채팅’/‘새 대화’로 승계하고, API 호환 설명에서만 ‘기존 메신저/쪽지’를 쓴다.
- 외부 단톡방 매핑 화면은 기존 명칭을 유지하되 내부 채팅방 관리 화면과 메뉴·권한·설명을 섞지 않는다.

실측상 사용자 문구는 이미 ‘코멘트’를 쓴다.

```text
clients/desktop/src/renderer/components/collab/EstimateCollaborationPanel.tsx:272:          <section aria-label="코멘트" style={{ width: '100%' }}>
clients/desktop/src/renderer/components/collab/EstimateCollaborationPanel.tsx:273:            <h5 style={{ margin: '0 0 10px', fontSize: 14 }}>코멘트</h5>
clients/desktop/src/renderer/components/collab/GroupwareApprovalCollaborationPanel.tsx:383:          <section aria-label="코멘트" style={{ width: '100%' }}>
clients/desktop/src/renderer/components/collab/GroupwareApprovalCollaborationPanel.tsx:384:            <h5 style={{ margin: '0 0 10px', fontSize: 14 }}>코멘트</h5>
clients/desktop/src/renderer/routes/dispatch-board\components\DispatchCommentThread.tsx:86:      aria-label="코멘트"
clients/desktop/src/renderer/routes/dispatch-board\components\DispatchCommentThread.tsx:93:        코멘트
```

## 7. 참여자와 권한

### 7.1 작성자 자동 포함

이 저장소의 “작성자는 대상자에 자동 포함” 규칙을 채팅방에도 **적용한다**.

- 생성자는 `created_by`만 가진 채 별도 조건절로 방을 보는 것이 아니라 실제 `chat_room_participants` 행으로 자동 편입한다.
- 생성자 참여자 행은 방이 존재하는 동안 제거할 수 없다. 그룹방 생성자가 나가려면 먼저 소유권을 다른 참여자에게 이전해야 한다. 소유권 이전은 그룹방 편집 슬라이스에서 함께 제공한다.
- 생성자라는 사실과 메시지 전송/방 편집 권한은 별도 축이다. 권한이 회수되면 참여자이더라도 전송·편집은 차단될 수 있다.
- 1:1 방에는 생성자와 상대방 두 참여자 행을 원자적으로 넣는다. 자기 자신과의 1:1 방은 만들지 않는다.
- 기존 메시지 마이그레이션으로 생성되는 1:1 방은 기존 메시지의 최초 송신자를 생성자로 기록하되 양쪽 모두 실제 참여자로 넣는다.

CLOSED 이슈 대조 원문:

```text
> gh issue view 866 --json number,state,title; gh issue view 895 --json number,state,title; gh issue view 1110 --json number,state,title
{"number":866,"state":"CLOSED","title":"[FEAT] #825 슬6 — 쪽지 수신자 칩 복수선택 + BE 복수 수신 API"}
{"number":895,"state":"CLOSED","title":"[FEAT] 대시보드 일정관리 기능 — 일정 등록·조회·공유"}
{"number":1110,"state":"CLOSED","title":"[FIX] 주문서 revision·협업 권위 — 복원이 세션 간 수렴하지 않고 무효화에 중복·누락 (#1082 에서 분리)"}
```

Issue #895 완료 코멘트는 “작성자는 당연히 일정에 포함 — 자동 권한”을 **대상자 집합**에 반영했다고 명시한다. 현재 코드도 생성 시 `schedule.addParticipant(ownerId)`, 수정·단건 추가 시 owner 참여 복구, owner 제거 차단, V17 기존 데이터 backfill을 갖는다.

```text
> rg -n 'owner|Owner|participant|Participant|작성자|참여자|INSERT INTO schedule_participants' ScheduleService.java Schedule.java V17__add_schedule_owner_as_participant.sql
ScheduleService.java:40:            schedule.addParticipant(ownerId);
ScheduleService.java:90:        schedule.addParticipant(schedule.getOwnerId());
ScheduleService.java:123:        schedule.addParticipant(schedule.getOwnerId());
Schedule.java:140:    public void removeParticipant(UUID participantId, String deletedBy) {
Schedule.java:141:        if (ownerId.equals(participantId)) {
V17__add_schedule_owner_as_participant.sql:4:INSERT INTO schedule_participants (
```

### 7.2 pageCode와 객체 수준 인가

- 기존 `messenger.send`를 내부 채팅 기본 pageCode로 승계한다. `VIEW`는 본인이 참여자인 방/메시지 조회와 SSE 구독, `CREATE`는 새 대화·메시지 전송에 사용한다. 방 이름·참여자 변경에는 `UPDATE`를 사용한다.
- `messenger.admin`은 외부 단톡방 매핑 관리 권한이므로 내부 채팅방 운영 권한으로 재사용하지 않는다.
- pageCode를 통과해도 모든 room/message/attachment API는 호출자가 활성 참여자인지 객체 수준에서 검사한다. URL이나 내부 ID를 알아도 비참여자는 403이다.
- 그룹방 이름·참여자·소유권 변경은 현재 소유자만 가능하다. 일반 참여자는 대화와 자기 읽음 상태만 변경한다.
- 비활성/퇴사 사용자는 신규 초대하지 않는다. 이미 참여 중인 사용자의 과거 작성 메시지는 보존하고 표시명 snapshot 또는 사용자 조회 fallback으로 식별한다.

## 8. 권위 모델과 마이그레이션 계약

### 8.1 최소 영속 모델

새 모델은 별도 도메인이 아니라 기존 groupware 메시지 모델의 room 확장이다. 모든 entity는 `BaseEntity`와 soft-delete 규약을 따른다.

- `chat_rooms`: 내부 UUID, `room_code`, `DIRECT | GROUP | SYSTEM`, 그룹방 이름, 소유자/생성자, 상태.
- `chat_room_participants`: room, user UUID, 표시용 가입 시점, 역할(`OWNER | MEMBER`), 참여/나간 시점. `(room_id, user_id)` 유일.
- `messages`: 기존 행을 보존하며 `room_id`, 방별 증가 `sequence`, sender type(`USER | SYSTEM`), 선택적 참조 메시지를 더한다. 텍스트 2,000자 호환을 첫 슬라이스에서 유지한다.
- `chat_message_reads`: `(message_id, participant_user_id, read_at)`; 한 번 기록된 `read_at`은 뒤의 메시지를 읽어도 바꾸지 않는다. 이 테이블이 메시지별 “읽은 사람 + 확인 시각”의 진실원이다.
- 후속 모델: attachment, reaction, mention은 각각 별도 entity/index로 둔다. 메시지 body JSON이나 Y.Doc에 감추지 않는다.

1:1 방은 정렬된 두 내부 user UUID로 만든 `direct_pair_key`에 유일 제약을 둬 같은 두 사람 사이에 방이 중복 생성되지 않게 한다. 이 키와 UUID는 사용자에게 노출하지 않는다.

### 8.2 기존 `messages` 승격

- 기존 송·수신자 unordered pair마다 DIRECT 방 하나를 만든다.
- 기존 메시지는 `sent_at`, 동률이면 기존 ID의 안정 순으로 방 sequence를 부여해 전부 같은 방으로 옮긴다.
- 송신자는 발송 시점에 읽은 것으로, 수신자는 기존 `READ/read_at`일 때만 읽은 것으로 `chat_message_reads`를 만든다. 기존 UNREAD는 읽음 행을 만들지 않는다.
- 기존 `batch_id` 복수 발송은 **수신자별 N개의 1:1 방**으로 전개한다. 하나의 그룹방으로 만들면 서로를 선택하지 않은 수신자들이 노출되고, 기존 “각 수신자당 독립 메시지” 의미가 바뀌기 때문이다. `batch_id`는 추적/회귀 대조용 legacy 값으로 보존한다.
- 기존 `/admin/groupware/messages`, `/messages/bulk`, `/messages/inbox`, `/messages/{id}/read`는 첫 슬라이스 동안 호환 adapter로 유지하되 room 모델만 쓰게 한다. 새 쓰기와 레거시 쓰기가 서로 다른 진실원을 갖지 않는다.
- 마이그레이션은 재실행 안전성, 기존 행 수 보존, orphan 0, DIRECT 중복 0, 읽음 시각 보존을 통합 테스트로 증명해야 한다. 이번 라운드에는 실제 migration을 작성하지 않는다.

### 8.3 시스템 발신자

‘삼한이’는 가짜 직원/account row가 아니라 `sender_type=SYSTEM`인 가상 actor로 표현한다. 따라서 재직자 검색·권한 그룹·사번 체계를 오염시키지 않는다. SYSTEM 방/메시지는 서버의 내부 publisher만 만들 수 있고 일반 사용자가 삼한이 명의로 보낼 수 없다.

## 9. API와 동작 계약

경로의 사용자 노출 식별자는 `roomCode`다. 내부 UUID를 path에 넣지 않는다.

- `POST /admin/groupware/chat/rooms/direct`: 상대 user ID를 받아 기존 DIRECT 방을 반환하거나 원자 생성한다.
- `POST /admin/groupware/chat/rooms`: 이름과 참여자를 받아 GROUP 방을 만든다. 생성자는 요청 목록과 무관하게 자동 포함한다.
- `GET /admin/groupware/chat/rooms`: 참여 중인 방 목록. 마지막 메시지 요약, 미읽음 수, 미읽은 멘션 여부를 반환한다.
- `GET /admin/groupware/chat/rooms/{roomCode}`: 방 정보와 참여자 표시 정보.
- `PATCH /admin/groupware/chat/rooms/{roomCode}`: 이름 변경.
- `PUT /admin/groupware/chat/rooms/{roomCode}/participants`: 참여자 전체 교체 또는 명시적 add/remove 계약. 생성자/owner 제거는 409.
- `POST /admin/groupware/chat/rooms/{roomCode}/owner-transfer`: owner를 기존 활성 참여자에게 이전.
- `GET /admin/groupware/chat/rooms/{roomCode}/messages?beforeSequence=`: cursor 기반 과거 대화 조회.
- `POST /admin/groupware/chat/rooms/{roomCode}/messages`: 텍스트 메시지 원자 저장. commit 뒤 SSE 발행.
- `PUT /admin/groupware/chat/rooms/{roomCode}/read`: 마지막으로 화면에 실제 노출된 sequence까지 읽음 행을 멱등 생성한다.
- `GET /admin/groupware/chat/rooms/{roomCode}/stream`: 참여자 전용 SSE.

모든 목록 응답은 `displayName`, `employeeCode`, `departmentName`, `roomCode` 등 렌더링에 필요한 비즈니스 식별자를 포함한다. 클라이언트가 UUID를 그대로 출력하는 fallback은 금지한다.

## 10. 대안 비교

### A. 기존 groupware 메시지를 room으로 확장 + 공통 SSE 재사용 — 채택

이슈의 “1:1 쪽지와 채팅 통합”, 별도 도메인 금지, 현재 서비스 소유권, 제3안과 모두 맞는다. 마이그레이션과 호환 adapter가 필요하지만 최종 진실원이 하나다.

### B. 기존 `messages`를 유지하고 room projection을 옆에 둠 — 기각

초기 변경은 작아 보이나 읽음·삭제·알림이 row와 room 두 곳에서 갈라진다. 기존 쪽지와 채팅을 별개 표면으로 병존시키지 않는 결정에도 어긋난다.

### C. Yjs co-edit 또는 RabbitMQ/WebSocket 기반 새 채팅 계층 — 기각

Yjs는 문서 동시편집 relay이지 순서형 영속 메시지/읽음/첨부 모델이 아니다. RabbitMQ는 현재 logging-service 전용이고 브라우저 전달 계약이 아니다. 새 WebSocket 계층까지 더하면 이미 검증된 SSE/Redis 운용 경계를 중복한다.

## 11. 방 수명주기와 삭제

- DIRECT 방은 두 사람의 단일 대화 이력이다. 사용자는 자기 목록에서 보관/숨김할 수 있지만 공유 방과 메시지를 삭제하지 않는다. 새 메시지가 오면 보관 상태를 해제한다.
- GROUP 방 owner는 방 이름·참여자·owner를 관리하고 방을 보관할 수 있다. owner가 나가려면 먼저 owner를 이전한다.
- 참여자 나가기는 해당 참여자 행을 soft-delete/left 처리한다. 과거 메시지의 작성자 표시와 감사 이력은 유지한다. 재초대 시 과거 이력 접근 범위는 보안상 민감하므로 그룹방 슬라이스에서 “재입장 후 전체 이력”으로 고정해 테스트한다.
- 사용자 메시지 삭제 기능은 즉시 hard-delete하지 않는다. 후속 슬라이스에서 본문을 soft-delete하고 다른 참여자에게 ‘삭제된 메시지’로 표시한다.
- 자동 보존 만료와 DB hard-delete는 두지 않는다. 첨부 오브젝트의 장기 보존/물리 삭제 기간은 첨부 슬라이스 착수 전 개발책임자 결정이 필요하며, 결정 전에는 자동 purge를 구현하지 않는다.

## 12. 첨부·읽음·리액션·멘션의 완성 계약

### 12.1 첨부

- 사진, 동영상, 일반 파일을 메시지에 첨부할 수 있다. 종류별 크기 상한·확장자 allowlist는 첨부 슬라이스의 명시 설정값으로 둔다.
- 오브젝트 키/영구 URL을 응답하지 않는다. 다운로드/미리보기 요청마다 방 참여자 인가를 먼저 하고 짧은 수명의 URL을 발급하거나 backend가 stream한다.
- 실행파일과 이중 확장자 등 위험 유형은 거부한다. MIME과 확장자를 함께 검사한다.
- DB metadata와 object 저장 성공이 어긋나지 않도록 임시 업로드→메시지 commit→활성화 또는 실패 보상 순서를 갖는다.

### 12.2 읽음

- 메시지가 viewport에 실제 노출된 마지막 sequence까지 읽음 처리한다. 방을 열었다는 이유만으로 아직 렌더되지 않은 과거 메시지까지 읽음 처리하지 않는다.
- 메시지 hover/상세에서 읽은 사람의 `이름 · 부서 · 확인 시각`을 표시한다. UUID는 표시하지 않는다.
- 참여자 목록이 긴 경우 “N명 읽음”을 먼저 보이고 펼침에서 전체 명단/시각을 제공한다.

### 12.3 리액션·메시지 참조·멘션

- 리액션은 PC와 모바일 공통 데이터 모델/API를 쓴다. 화면 상호작용만 플랫폼에 맞게 다르게 한다.
- `@` 멘션은 현재 방의 활성 참여자만 대상으로 자동완성한다. 별도 mention row를 저장해 방 목록의 미읽음 `@` 표시를 본문 검색 없이 계산한다.
- Issue #894의 “특정 메시지 태그”는 아직 **인용/답장인지 북마크인지 결정되지 않았다.** 본 spec은 데이터 모델 확장을 막지 않도록 `referenced_message_id`를 예약하지만, 사용자 기능은 해당 슬라이스 발주 전에 개발책임자가 의미를 확정해야 한다. 추측 구현하지 않는다.

## 13. 알림 통합 경계

- 사람 발신 알림은 그 사람과 사용자의 DIRECT 방에 업무 참조 메시지로 표시한다.
- 시스템 발신 알림은 가상 actor ‘삼한이’의 SYSTEM 방에 표시한다. 대량 알림이 사람 대화를 밀어내지 않도록 사람 방과 시스템 방을 시각적으로 구분한다.
- `notification_center`는 기존 생산자와 이력/deeplink의 진실원으로 유지하고, 채팅 메시지는 표시 projection과 link를 갖는다. 같은 사건을 두 시스템에 독립 생성해 읽음이 갈라지게 하지 않는다.
- 채팅에서 연결된 알림 메시지를 읽으면 notification acknowledge를 멱등 반영한다. 알림 벨에서 먼저 확인한 경우에도 채팅 projection의 미읽음이 남지 않게 단일 연계 계약을 둔다.
- 첫 통합 대상은 현재 직접 연결된 `MESSENGER`다. APPROVAL, SAFETY_STOCK, ECOUNT_IMPORT 및 향후 채널을 삼한이 방에 넣는 범위, 기존 알림 벨의 최종 대체/병존은 알림 슬라이스 착수 전 개발책임자 결정으로 고정한다.

## 14. 실패와 복구 계약

- REST 저장 성공이 권위다. SSE가 끊겨도 저장 결과는 롤백하지 않으며 재연결 후 방 목록/열린 대화를 재조회한다.
- 메시지 중복 전송은 클라이언트 `requestId`와 서버 유일 제약으로 멱등 처리한다. timeout 뒤 재시도가 같은 메시지를 두 번 만들지 않는다.
- 400: 빈 본문, 2,000자 초과, 참여자 0명/50명 초과, 자기 자신 DIRECT 등 입력 오류.
- 403: 비참여자의 방/메시지/SSE/첨부 접근, 일반 사용자의 SYSTEM 발신.
- 404: 존재하지 않거나 soft-delete된 `roomCode`/메시지. 내부 UUID를 오류에 넣지 않는다.
- 409: owner 제거·이전 없는 owner 나가기, 이미 처리된 충돌 편집, DIRECT pair 경쟁 생성.
- 참여자 변경과 메시지 전송은 각각 단일 transaction이다. commit 뒤에만 SSE를 발행한다.
- mock mode에서 handler가 없는 신규 REST/SSE는 실제 endpoint로 빠져나가면 안 된다. 각 슬라이스는 REST mock과 native fetch SSE intercept/주입 가능한 subscribe mock을 함께 추가한다.

## 15. 슬라이스 분할

각 슬라이스는 한 PR에서 코드·테스트·문서·해당 화면 QA를 함께 끝낸다. 선행 슬라이스가 머지되기 전 후속 슬라이스를 같은 파일에 병렬 구현하지 않는다.

### S2 — 첫 슬라이스: room 기반 1:1 텍스트 채팅 세로 완결

**첫 발주 범위는 다음 한 문단으로 고정한다.** `groupware-service` 안에 DIRECT room·실제 참여자·메시지별 읽음 모델을 추가하고 기존 `messages`를 송·수신자 pair별 1:1 방으로 무손실 승격한다. 기존 `batch_id`는 N개의 DIRECT 방으로 전개하며 기존 5개 메신저 API는 새 room 모델을 쓰는 호환 adapter로 유지한다. 신규 방 목록·대화 조회·텍스트 전송·읽음·방 SSE API와 `createRealtimeClient` 기반 클라이언트를 만들고, 기존 데스크톱 `/messenger`를 1:1 방 목록+대화 화면으로 진화시켜 실제 사용자 경로를 완결한다. 생성자는 실제 참여자 행에 자동 포함하고 UUID 비노출, `messenger.send` 권한/객체 인가, 격리 DB migration IT, SSE 중복/재연결, mock fail-closed, 한국어 QA까지 포함한다. **GROUP 방 CRUD, 삼한이 전역 런처, 모바일, 첨부, 리액션, 메시지 참조, 멘션, 알림 projection은 S2에 넣지 않는다.**

### S3 — 다중 채팅방 생성·편집

GROUP 방 생성, 이름 변경, 참여자 add/remove, owner 이전, 나가기/보관을 추가한다. 생성자 실제 참여자 자동 포함·제거 불가, 최대 50명, 재입장 이력, 비참여자 403을 완결한다. 기존 bulk 발송 UI를 “새 대화” 흐름으로 바꾸되 과거 bulk 데이터 의미는 바꾸지 않는다.

### S4 — 삼한이 런처와 독립 채팅 창

데스크톱 전역 우측 하단 삼한이 런처, 위로 펼쳐지는 방 목록, `/chat/{roomCode}` 독립 라우트와 Electron 별도 창 연결을 제공한다. 모바일은 같은 런처 모델과 전체화면 독립 라우트를 제공한다. 인쇄 제외, 포커스/ESC/스크린리더, 미읽음 배지, 화면 이동 후 상태 보존을 검증한다.

### S5 — 사진·동영상·파일 첨부

groupware-service의 기존 MinIO adapter/인가 패턴을 바탕으로 채팅 전용 attachment metadata, object key, 참여자 접근가드, 임시 업로드 보상, 이미지/동영상 미리보기와 원본 다운로드를 구현한다. 종류별 용량·확장자·보존 기간은 발주 전에 개발책임자 결정을 받는다.

### S6 — 정밀 읽음·리액션·메시지 참조·`@` 멘션

읽은 사람+확인 시각 UI, PC/모바일 공통 리액션, 방 참여자 한정 멘션과 `@` 미읽음 색인을 제공한다. “특정 메시지 태그”의 의미를 발주 전에 확정하고 인용/답장 또는 북마크 중 결정된 하나만 구현한다.

### S7 — 알림의 채팅 표시 통합

우선 MESSENGER의 기존 source/deeplink/acknowledge를 방 메시지와 단일 연계하고, 사람 발신은 DIRECT 방, 시스템 발신은 삼한이 SYSTEM 방에 표시한다. APPROVAL 등 나머지 채널과 알림 벨 대체/병존은 개발책임자가 확정한 범위만 포함한다.

## 16. 검증과 수용 기준

### 공통 자동 검증

- groupware-service 단위/통합 전량과 신규 Testcontainers PostgreSQL/Flyway IT.
- 기존 메시지 행 수·본문·시각 보존, orphan 0, DIRECT 중복 0, 읽음 시각 보존, bulk N개 DIRECT 승격 검증.
- 참여자 아닌 사용자 REST/SSE/첨부 403, owner/생성자 참여자 행 존재와 제거 409.
- transaction rollback 시 SSE 0, commit 시 고유 event 1, 중복 event 소비 결과 1, 재연결 후 REST 재수렴.
- 데스크톱 typecheck/unit/integration/Playwright와 해당 모바일 슬라이스 테스트.
- 신규 API/mock handler 전수 대응과 native fetch가 공유/실 endpoint로 나가지 않는 fail-closed trap 테스트.
- 화면·오류·URL·접근성 이름·다운로드명에서 UUID 패턴 0건.
- 사용자 문구 ‘코멘트’/‘채팅’ 계약과 ‘협업 코멘트’ 신규 노출 0건.

### S2 수용 시나리오

1. 기존 읽음/미읽음 쪽지가 pair별 방에서 원래 순서와 상태로 보인다.
2. A가 B와 새 대화를 시작하면 기존 방이 있으면 재사용하고, 없으면 두 참여자 행을 가진 방 하나만 생긴다.
3. A가 전송한 메시지를 B가 SSE로 받고, B가 실제 노출한 메시지까지만 읽음 처리되며 재접속 후 동일하다.
4. C가 방 코드나 내부 요청 값을 알아도 A-B 대화/stream을 조회하지 못한다.
5. 방 목록과 대화에는 이름·부서·사번·`roomCode`만 필요에 따라 보이고 UUID는 보이지 않는다.
6. 기존 `/messenger` deeplink와 메신저 권한 사용자는 회귀 없이 새 1:1 방 화면에 도달한다.

## 17. 기존 결정 문서 대조 결과

- `docs/dev-reports/2026-08-07-1110-s1-authority-event-matrix.md`: Y.Doc은 편집 중 공유 초안이고 server update는 in-memory relay다. 채팅 영속 이력으로 쓰지 않는다.
- `docs/dev-reports/2026-08-07-1110-s3-authority-event-contract.md`: 권위 commit은 고유 사건으로 알리고 snapshot을 싣지 않으며 소비자가 REST 재조회한다. 채팅 SSE도 같은 계약을 따른다.
- `docs/dev-reports/2026-08-10-1125-s1-recon.md`: 별도 채팅 도메인 신설 금지, 실시간 제3안, groupware 메시지 승계, mock hard gate를 그대로 유지한다.
- `docs/dev-reports/track-open-894.md`: #866, #1110, #895를 선행 대조하라는 트랙 발주를 반영했다.

현재 코드가 정찰의 핵심 전제와 달라진 정황은 발견하지 못했다. 따라서 전제 오류에 따른 중단 조건은 발생하지 않았다.

## 18. 이번 spec이 확정하지 않는 업무 결정

다음 항목은 해당 후속 슬라이스 발주 전 개발책임자가 선택해야 하며 S2를 막지 않는다.

1. 첨부 종류별 용량/확장자/보존 기간과 soft-delete 뒤 object 물리 purge 시점.
2. “특정 메시지 태그”가 인용/답장인지 북마크인지.
3. APPROVAL/SAFETY_STOCK/ECOUNT_IMPORT 등 어떤 알림 채널까지 삼한이 방으로 보낼지, 알림 벨을 최종 대체할지 병존할지.
4. 데스크톱 독립 라우트를 항상 Electron 별도 BrowserWindow로 열지, 환경별로 같은 창 라우트를 허용할지. S4 전에 확정한다.

## 19. 라운드 산출물과 안전 확인

- 제품 코드·DB migration·설정·테스트는 수정하지 않았다.
- 공유 Docker 스택과 로그인 화면은 사용하지 않았다.
- 이번 라운드의 의도된 파일 변경은 본 spec 1개뿐이다.
- 삭제된 추적 파일은 없다. git 명령을 쓰지 않고 `.git`이 가리키는 index v2를 read-only로 해석해 stage 0의 19,360개 경로가 모두 존재하는지 검사했다.

```text
index_version=2
index_entries=19360
stage0_entries=19360
missing_tracked_files=0
missing_skip_worktree_files=0
```

## 20. spec 자기검토

- placeholder: 미완성 표식 0건. 후속 업무 결정 4건은 해당 슬라이스의 명시적 승인 gate로 분리했다.
- 일관성: 서비스 소유권은 전 구간 `groupware-service`, 실시간은 전 구간 SSE 제3안, 사용자 경로는 전 구간 `roomCode`로 일치한다.
- 범위: 첫 PR은 1:1 텍스트 채팅 세로 완결로 제한했고 GROUP/런처/모바일/첨부/고급 상호작용/알림을 후속 PR로 분리했다.
- 모호성: 기존 bulk는 N개 DIRECT, 생성자는 실제 참여자, RabbitMQ 미사용, co-edit provider 비전용, 시스템 actor는 가상 actor로 명시했다.
