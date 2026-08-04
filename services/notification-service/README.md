# notification-service (Phase 9 W3)

> 푸시 / 이메일 / SMS 통합 라우터 — `notification_db`, port `8093`.

## 1. 도입 배경

기존 Phase 5 시점에 SMS (Aligo) 발송이 `slip-service.delivery.sms` 패키지에 포함되어 있었다. 도메인 단위 분리 + 메신저 / push / email 통합 채널 라우팅을 위해 Phase 9 W3 에서 별도 service 로 분리 + 흡수.

- W1 partner-service (8095) / W2 groupware-service (8092) 에 이은 **3 번째 신규 service**.
- ServiceDiscoveryClient **세 번째 소비자** (W1 partner / W2 groupware → W3 notification).
- Phase 11 cutover 시점에 SES (이메일) / FCM (push) / Aligo (SMS) 운영 secrets 주입 → 본격 외부 호출 활성.

## 2. Domain (2 entity + 3 enum)

### 2-1. Entity

| Entity | 설명 | 핵심 필드 |
|---|---|---|
| `NotificationRequest` | 발송 요청 1건 | recipientType / recipientId / channel / templateCode / payload (JSONB) / status |
| `NotificationLog` | 발송 이력 (1 request : N attempt) | request_id FK / channel / attempt_no / gateway_status / gateway_response / sent_at |

BaseEntity 7 audit (`created_at` / `created_by` / `modified_at` / `modified_by` / `deleted_at` / `deleted_by` / `is_deleted`) + `@SQLRestriction("is_deleted = false")` 의무.

### 2-2. Enum

| Enum | 값 |
|---|---|
| `NotificationChannel` | PUSH / EMAIL / SMS |
| `NotificationStatus` | PENDING / SENT / FAILED / RETRYING |
| `RecipientType` | USER / PARTNER / EXTERNAL_PHONE |

## 3. REST API

### Internal API (X-Internal-Token + ROLE_MASTER, `/internal/**` prefix 한정)

| Method | Path | 설명 |
|---|---|---|
| POST | `/internal/notifications/send` | backend service-to-service 발송 요청 (groupware / partner-order / slip 등이 호출) |
| GET | `/internal/notifications/{requestId}/status` | 발송 상태 조회 |

### Admin API (JWT/Header + ROLE_MANAGER 이상)

| Method | Path | 설명 |
|---|---|---|
| POST | `/admin/notifications/send` | admin 직접 발송 (대량 안내) |
| GET | `/admin/notifications` | 발송 이력 페이지 (channel / status filter) |
| GET | `/admin/notifications/{id}` | 단건 조회 |
| POST | `/admin/notifications/{id}/retry` | 실패 발송 재시도 |

### SP-08-3-4 배차문자 history API (2026-05-17 구현)

legacy GAS `배차안내문자`의 미리보기/명시 저장/발송 감사 흐름을 `dispatch_sms_save_history`로 보존한다. Flyway `V4__add_dispatch_sms_save_history.sql`이 테이블과 `AUTO_LATEST` partial unique index를 생성한다.

| 기존 endpoint | history endpoint | programType | saveMode |
|---|---|---|---|
| `POST /admin/notifications/dispatch-batch/preview` | `POST/GET /admin/notifications/dispatch-sms/history` + detail/latest | `DISPATCH_SMS` | `AUTO_LATEST`, `MANUAL_NAMED` |
| 자동 SMS 발송 endpoint | A안에서 제거됨 | — | — |

`AUTO_LATEST`는 사용자+프로그램별 active 1건만 유지하며 retry 3회 + `REQUIRES_NEW` transaction으로 unique race를 흡수한다. `MANUAL_NAMED`는 사용자가 이름을 붙여 append 저장한다. 모든 detail 조회는 `findByIdAndCreatedBy` 사용자 격리를 거치고, 운영자 정리도 hard delete가 아니라 Soft Delete only를 따른다. Aligo 주소록/일반 알림 API의 실 API 활성화는 각 별도 범위다.

### SP-D7 알림 센터 권한 전환 (2026-05-27)

`GET /notifications/my`, `GET /notifications/history`, `POST /notifications/{id}/acknowledge`는
`notifications.center` VIEW 동적 권한으로 전환했다. auth-service V38 seed가 `PARTNER`를 제외한 내부 role에만
VIEW grant를 insert해 기존 내부 인증 사용자 동작을 보존한다.

## 4. Adapter (3 channel — strategy pattern)

`NotificationGateway` 공통 인터페이스 + channel 별 어댑터:

| Channel | Adapter (운영) | Adapter (test) | 비고 |
|---|---|---|---|
| PUSH | `FcmPushAdapter` (Firebase) | `MockPushAdapter` | credentials placeholder 인 경우 stub-success |
| EMAIL | `SesEmailAdapter` (Phase 11 활성) | `MockEmailAdapter` | placeholder — Phase 11 cutover 시 SDK 통합 |
| SMS | `AligoSmsAdapter` (apis.aligo.in/send/ form-urlencoded) | `MockSmsAdapter` | Phase 5 `AligoSmsGateway` 흡수 |

`NotificationGatewayConfig` 가 Spring 발견 bean 을 EnumMap 으로 라우팅. service 레이어에서 `gatewayMap.get(channel)` 1회 lookup.

## 5. UserClient + bulk verify (BE backlog #4 채택)

W3 통합 PR 시점에 PR #92 BE Reviewer 의 후속 backlog #4 (UserClient fan-out 비용) 채택:

- `UserClient.verifyBulk(List<UUID>)` — 한 번의 RPC 로 N user 검증
- user-service 측 `POST /internal/users/verify-bulk` endpoint 신규
- groupware-service `ApprovalLineService.create` 도 bulk 1회 호출로 전환 (직렬 N+1 → 1 RPC)
- Caffeine cache (TTL 60초, max 10000) — 짧은 시간 반복 lookup 시 RPC 회피

## 6. 환경변수 (chained-default 표준)

`SAMHAN_NOTIFICATION_*` 표준, `LEGACY_*` legacy fallback 보유 (Phase 8 2차 환경변수 표준 일관).

| 변수 | 기본값 | 비고 |
|---|---|---|
| `SAMHAN_NOTIFICATION_PORT` | 8093 | |
| `SAMHAN_NOTIFICATION_DB_*` | localhost:5432/notification_db | |
| `SAMHAN_INTERNAL_TOKEN` | dev-internal-token-change-me | prod 부팅 거부 가드 |
| `SAMHAN_USER_SERVICE_URL` | http://localhost:8083 | UserClient base |
| `SAMHAN_DISCOVERY_PROVIDER` | eureka | aws-cloud-map (Phase 10) |
| `SAMHAN_ALIGO_*` | placeholder | api-url / key / userid / sender |
| `SAMHAN_FCM_*` | placeholder | project-id / credentials-path |
| `SAMHAN_USER_CACHE_TTL` | 60 | Caffeine TTL (초) |
| `SAMHAN_USER_CACHE_MAX` | 10000 | Caffeine max entries |
| `SAMHAN_NOTIFICATION_RETRY_MAX_ATTEMPTS` | 5 | post-W5 (Q-W3-1) — retry 최대 횟수, 초과 시 DEAD_LETTER 영구 FAILED |
| `SAMHAN_USER_CLIENT_FAIL_MODE` | OPEN | post-W5 (Q-W3-3) — UserClient fail-mode (OPEN fail-soft / STRICT fail-fast) |

전체는 `infrastructure/env-templates/notification-service.env` 참조.

## 7. 테스트

| Test | 종류 | 케이스 |
|---|---|---|
| `NotificationGatewayTest` | 단위 | 3 (PUSH / EMAIL / SMS mock adapter) |
| `NotificationServiceTest` | 단위 | 7 (send / failure / retry / 404 / 409 + post-W5 maxAttempts DEAD_LETTER) |
| `UserClientBulkVerifyTest` | 단위 | 3 (null/empty / cache hit / lookup cache 적재) |
| `NotificationGatewayMetricsTest` | 단위 | 2 (post-W5 — channel × result counter increment) |
| `NotificationInternalControllerIT` | IT | 4 (인증 — 401 / 403 / 200 / 404) |
| `NotificationAdminControllerIT` | IT | 6 (send / list / single / retry / 404 + post-W5 payload over 4000 byte 400) |

총 15 단위 PASS + 10 IT (Docker 미가용 환경 skip, CI Linux PASS).

## 8. post-W5 backlog cleanup 산출 (D-P9-21)

Phase 10 위임 backlog 중 즉시 처리 가능 4건 본 service 채택 (사용자 가드 일관 적용):

### 8-1. retry max-attempts (Q-W3-1)
- `samhan.notification.retry.max-attempts` (env `SAMHAN_NOTIFICATION_RETRY_MAX_ATTEMPTS`, default 5) 토글 추가
- `NotificationService.retry()` — `attemptCount >= maxRetryAttempts` 시 영구 FAILED + log `FAILURE_MAX_ATTEMPTS_EXCEEDED` (DEAD_LETTER 의미)
- 게이트웨이 호출 skip + `retryable=false` 고정

### 8-2. JSONB payload @Size(max=4000) (Q-W3-2)
- `NotificationSendRequest.payload` 에 `@Size(max=4000)` (Postgres TOAST 임계 회피)
- 4001 byte 이상 payload 입력 시 `400 INVALID_INPUT` 반환

### 8-3. NotificationGatewayMetrics (DevOps)
- `NotificationGatewayMetrics` 신규 — 3 channel × 2 result = 6 Micrometer counter 사전 등록
- metric: `notification_gateway_send_total{channel,result}` — actuator/prometheus endpoint 노출
- `NotificationService.invokeGateway()` 시점에 success / failure counter increment (gateway 예외 / 어댑터 미등록 / 결과 success/failure 모두 분기)

### 8-4. UserClient fail-mode (Q-W3-3, shared:user-client-abstraction 영역)
- `UserVerifierProperties.FailMode` enum (OPEN / STRICT) — `failFast` 부울 토글의 의미 명시 alias
- 환경변수 `SAMHAN_USER_CLIENT_FAIL_MODE=OPEN` 표준 (Phase 11 cutover 시점 STRICT 전환 약속, D-P9-11 보강)

## 9. Phase 11 cutover 진입 사항

- FCM Admin SDK 통합 (모바일 staff app + push 활성)
- AWS SES SDK 통합 (이메일 발송 활성, S3 첨부 옵션)
- Aligo → 운영 secrets 주입 (현재 placeholder → stub-success)
- `samhan.discovery.provider=aws-cloud-map` 토글 + Phase 8 wrapper 활성
- UserClient `SAMHAN_USER_CLIENT_FAIL_MODE=STRICT` 전환 (post-W5 cleanup 도입 alias 활용)
- Resilience4j 통합 시점에 `partner_client_fail_total` 등 추가 Micrometer counter 도입 (Phase 10 W2 위임)
