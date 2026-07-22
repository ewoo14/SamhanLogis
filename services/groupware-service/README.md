# groupware-service

Phase 9 W2 — 결재선 + 메신저 + 일정 도메인.

- 포트: **8092**
- DB: PostgreSQL `groupware_db` (service-per-DB), Flyway 자동 마이그레이션
- 외부 의존: user-service (`UserClient` — 직원 정보 lookup)
- ServiceDiscoveryClient 두 번째 소비자 (W1 partner-service 첫 소비자)

## 도입 배경

Phase 9 W2 — `M-PHASE-9-readiness §3-2` 일관. 결재선 (전자결재 chain) + 메신저 (1:1) + 일정 (참여자 포함) 의 3 도메인을 단일 service 로 묶어 그룹웨어 영역의 단일 진입점을 형성한다. 전사 결재 / 사내 메신저 / 캘린더는 사용 흐름이 인접하므로 도메인을 함께 보유한다 (M-PHASE-9-readiness §6 의존성 매트릭스).

`UserClient` 는 user-service 의 `/internal/users/{userId}` Internal endpoint 를 호출하여 요청자 / 결재자 / 송수신자 / 일정 참여자가 실제 존재하는지 검증한다. 본 PR (W2 skeleton) 시점에는 lenient fail-open 정책 — Phase 11 cutover 시점에 fail-fast 로 강화.

## Domain (3 entity + 2 부속 entity + 3 enum)

| Entity | 비고 |
|---|---|
| `ApprovalLine` | 결재선 (요청자 + 제목 + 종합 status). chain 은 `ApprovalStep` 에 sequence ASC 보관 (`@OneToMany` + `@OrderBy`). 최종 승인 시 문서 레이아웃 `templateId + revision`을 각인 |
| `ApprovalStep` | chain 단일 단계 (approver / sequence / step status / decidedAt / reason). cascade ALL + orphanRemoval |
| `Message` | 메신저 1:1 (sender / recipient / body / status / sentAt / readAt) |
| `Schedule` | 일정 (owner / 시작-종료 / status / description). 참여자는 `ScheduleParticipant` 에 보관 |
| `ScheduleParticipant` | 일정 참여자 (1 schedule : N participant). cascade ALL |
| `DocumentTemplateRevision` | 문서 레이아웃 revision 이력. UPDATE/DELETE가 DB trigger로 차단되는 append-only 저장소 |

| Enum | 값 |
|---|---|
| `ApprovalStatus` | `PENDING` / `IN_PROGRESS` / `APPROVED` / `REJECTED` / `WITHDRAWN` |
| `ApprovalStepStatus` | `PENDING` / `APPROVED` / `REJECTED` (chain 단일 단계 상태) |
| `MessageStatus` | `UNREAD` / `READ` |
| `ScheduleStatus` | `DRAFT` / `CONFIRMED` / `CANCELLED` |

## REST endpoints

### Internal (X-Internal-Token 필수, `/internal/**` prefix 한정)

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| GET | `/internal/groupware/approvals/{approvalId}` | ROLE_MASTER (token) | 결재선 단건 lookup (요청자 / 제목 / 종합 상태) |
| GET | `/internal/groupware/messages/unread-count?userId={UUID}` | ROLE_MASTER (token) | 미열람 메신저 수 |

### Admin (X-User-* 헤더, gateway 경유)

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| POST | `/admin/groupware/approvals` | MASTER / MANAGER | 결재선 생성 + chain 등록 |
| PUT | `/admin/groupware/approvals/{id}/approve` | MASTER / MANAGER | 결재 승인 |
| PUT | `/admin/groupware/approvals/{id}/reject` | MASTER / MANAGER | 결재 반려 |
| POST | `/admin/groupware/messages` | 전체 ROLE | 메신저 발송 |
| POST | `/admin/groupware/messages/bulk` | `messenger.send` CREATE | 수신자 최대 50명 원자적 복수 발송(중복 제거·self 차단) |
| GET | `/admin/groupware/messages/recipient-search?q={q}&limit={n}` | `messenger.send` VIEW | 부서 제약 없는 재직자 수신자 검색 |
| GET | `/admin/groupware/messages/inbox?userId={UUID}` | 전체 ROLE | 수신함 |
| PUT | `/admin/groupware/messages/{id}/read` | `messenger.send` VIEW | 호출자 본인 수신 쪽지 읽음 처리(멱등) |
| POST | `/admin/groupware/schedules` | 전체 ROLE | 일정 등록 |
| GET | `/admin/groupware/schedules?ownerId={UUID}&from&to` | 전체 ROLE | 일정 조회 (소유자 + 기간) |
| PUT | `/admin/groupware/schedules/{id}` | 전체 ROLE | 일정 수정 |
| DELETE | `/admin/groupware/schedules/{id}` | MASTER / MANAGER | 일정 삭제 (soft) |
| GET | `/groupware/document-templates/{templateId}/revisions/{revision}` | 인증 사용자 | 승인 완료 문서 재인쇄용 각인 revision 조회 |

응답 = `ApiResponse<T>` 봉투 (success / code / message / data / timestamp). UUID 비공개 가드 — Internal 응답만 UUID 노출 (caller = 내부 형제 service).

복수 발송은 `messages` 1행을 수신자 1명으로 유지하며 같은 `batchId`를 각 행에 기록한다.
수신자 존재 확인이 전부 성공한 뒤 한 트랜잭션으로 저장하고, 한 명이라도 없으면 404와 함께
저장 0건으로 rollback한다. 알림은 commit 이후 수신자별 1건씩 발행한다. 기존 단건 endpoint는
경로·요청·응답·상태 코드를 유지하며 deprecated로만 표시한다.

## 환경변수

`infrastructure/env-templates/groupware-service.env` 참조.

| 변수 | 표준 / legacy fallback | 용도 |
|---|---|---|
| `SAMHAN_GROUPWARE_PORT` | 8092 | server.port |
| `SAMHAN_GROUPWARE_DB_HOST` / `PORT` / `NAME` / `USER` / `PASSWORD` | LEGACY_DB_* | DataSource (chained-default) |
| `SAMHAN_INTERNAL_TOKEN` | `INTERNAL_AUTH_TOKEN` | X-Internal-Token expected 값 |
| `SAMHAN_USER_SERVICE_URL` | (신규 표준만) | UserClient base URL |
| `SAMHAN_GROUPWARE_SERVICE_URL` | (신규 표준만) | 형제 service 가 본 service 호출 시 base URL |
| `SAMHAN_DISCOVERY_PROVIDER` | `eureka` default | Phase 11 cutover 시점 `aws-cloud-map` 으로 전환 |
| `EUREKA_URL` | (legacy) | service discovery |

`InternalTokenGuard` 가 부팅 시 prod 프로파일 + dev 기본값 조합을 거부.

## DS-3a 재인쇄 pin

- Flyway `V12__pin_document_template_revisions.sql`가 현재 `document_templates` 각 행을 revision 이력으로 backfill하고, `approval_lines.document_template_id/document_template_revision` nullable 참조를 추가한다.
- 과거 승인 문서는 소급 pin하지 않는다. 두 컬럼이 NULL이면 데스크톱 재인쇄는 현재 ACTIVE 양식을 사용하고 운영자 고지 문구를 표시한다.
- 최종 `APPROVED` 전이와 pin/이력 저장은 동일 transaction이다. 이력 조회는 soft-delete된 양식에서도 가능하며, 신규 권한 seed는 없다.

## 테스트

```bash
# 단위 (JDK 17 한글 path 환경에서도 PASS)
./gradlew :services:groupware-service:test --tests com.samhanair.logis.groupware.service.*

# IT (Docker 가용 환경, Linux runner 권장)
./gradlew :services:groupware-service:test --tests *IT
```

| 테스트 | 비고 |
|---|---|
| `ApprovalLineServiceTest` | 8 case — chain 흐름 / 종료 가드 / 본인 결재자 차단 / 회수 / chain 순서 |
| `MessageServiceTest` | 4 case — 발송 / self-send 거부 / 읽음 처리 / 비수신자 거부 |
| `ScheduleServiceTest` | 4 case — 등록 / 시간 검증 / 참여자 idempotent / cancel |
| `GroupwareInternalControllerIT` | 4 case — 토큰 누락 (403) / 불일치 (401) / 일치 (200) / 미존재 (404) |
| `GroupwareAdminControllerIT` | 결재 생성·승인·반려 / 메신저 발송 / 일정 등록·조회 / HTTP 승인→레이아웃 수정→고유 layout key 기준 재인쇄 pin 불변 |
| `DocumentTemplateIT` | 문서 양식 CRUD·활성화·동시성·JSONB round-trip·V10/V11 backfill·V12 append-only |

IT 베이스 = `AbstractPostgresIT` (Testcontainers PostgreSQL 16 + Docker 미가용 환경 skip). UserClient 는 IT 에서 `@MockBean` 격리 (memory feedback_it_mockbean_external_clients).

## Phase 11 cutover 영향

- `SAMHAN_DISCOVERY_PROVIDER=aws-cloud-map` 으로 토글 시 `shared:discovery-abstraction` 의 `AwsCloudMapServiceDiscoveryClient` 활성. 본 service 코드 변경 없음 (build.gradle / yml 한 줄 수준).
- DataSource 는 chained-default 패턴이므로 RDS 호환. AWS Secrets Manager 마이그레이션 시 `spring.config.import: aws-secretsmanager:samhan/<env>/...` 추가만 (코드 변경 없음).
- Flyway V1 = PostgreSQL standard SQL 만 사용 (RDS 미지원 extension 부재).
- `UserClient` 는 현재 fail-open (network 실패 시 통과). cutover 시점 fail-fast + 회로차단 (Resilience4j) 강화 필요.

## 관련 문서

- `docs/migration/phase9/M-PHASE-9-readiness.md` — Phase 9 진입 plan
- `docs/dev-reports/phase9-step-2-groupware-service.md` — 본 슬라이스 dev report
- `migration/decisions/DECISIONS.md` D-P9-06 / D-P9-07 / D-P9-08
