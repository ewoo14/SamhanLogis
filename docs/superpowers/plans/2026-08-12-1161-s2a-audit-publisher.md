# #1161 S2a 감사 발행자 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공통 감사 wire 계약과 fail-soft publisher를 만들고 logging-service, dc-config-service, partner-auth-service, 개발자 로그 메뉴에 S2a pilot만 연결한다.

**Architecture:** `shared:audit-contract`는 Spring 비의존 v2 계약·routing·검증을 제공하고, `shared:audit-publisher`는 after-commit 후 bounded non-blocking lane에 이벤트를 넣어 Rabbit에 비동기 발행한다. logging-service는 v1/v2를 소비해 동일 event id를 Elasticsearch에 upsert하고, 사용자 도달 응답은 safe DTO로 변환한다. 두 pilot만 auto-configuration을 활성화한다.

**Tech Stack:** Java 17, Spring Boot, Spring AMQP, Micrometer, Spring Data Elasticsearch/JPA, JUnit 5, Testcontainers RabbitMQ, React/TypeScript/Vitest.

## Global Constraints

- S1.5 topology가 미완료이므로 기존 durable queue arguments와 운영 queue 선언을 변경하지 않는다.
- Rabbit 장애·queue full·serializer 오류가 업무 응답/commit을 실패시키지 않는다.
- UUID는 internal 필드에만 보존하고 user/resource/description/before/after 및 desktop 화면에는 fallback하지 않는다.
- 서비스별 audit/revision/history 저장소는 유지한다.
- 14개 전체 활성화 금지; dc-config-service와 partner-auth-service만 활성화한다.
- 각 측정 완료 후 dev-report에 실행 원문을 이어 붙인다.

### Task 1: RED 계약 테스트 및 기준 기록

**Files:**
- Create: `shared/audit-contract/src/test/java/.../AuditEventContractTest.java`
- Create: `shared/audit-publisher/src/test/java/.../AuditPublisherFailureSoftTest.java`
- Modify: `services/logging-service/src/test/java/.../AuditLogConsumerTest.java`
- Modify: `docs/dev-reports/2026-08-12-1161-s2a-audit-publisher.md`

- [ ] 발행자 0개, Rabbit 장애 업무 실패, UUID 응답 노출의 현재 RED를 각각 한 테스트로 작성한다.
- [ ] 각 테스트를 단독 실행해 예상 실패 원문을 보고서에 붙인다.

### Task 2: shared:audit-contract

**Files:**
- Create: `shared/audit-contract/build.gradle`
- Create: `shared/audit-contract/src/main/java/.../AuditEventV2.java`
- Create: `shared/audit-contract/src/main/java/.../AuditEnums.java`
- Create: `shared/audit-contract/src/main/java/.../AuditTopology.java`
- Create: `shared/audit-contract/src/main/java/.../AuditEventValidator.java`
- Modify: `settings.gradle`

- [ ] v1 입력과 v2 필수 필드, routing key/retention 일치를 테스트한다.
- [ ] UUID canonical/32hex/URN/zero-width 변형을 presentation 필드에서 placeholder 처리한다.

### Task 3: shared:audit-publisher

**Files:**
- Create: `shared/audit-publisher/build.gradle`
- Create: `shared/audit-publisher/src/main/java/.../AuditPublisher.java`
- Create: `shared/audit-publisher/src/main/java/.../AuditPublisherAutoConfiguration.java`
- Create: `shared/audit-publisher/src/main/java/.../AuditRequestOutcomeFilter.java`
- Create: `shared/audit-publisher/src/main/java/.../AuditContextContributor.java`
- Create: `shared/audit-publisher/src/main/java/.../AuditSanitizer.java`
- Create: `shared/audit-publisher/src/test/java/...`

- [ ] afterCommit callback과 transaction 없는 요청을 분리한다.
- [ ] A/B reserved lane과 C drop lane을 bounded `offer`로 구현한다.
- [ ] Rabbit publish/confirm/retry는 worker에서만 수행하고 모든 예외를 metric/log로 흡수한다.

### Task 4: logging-service consumer와 safe DTO

**Files:**
- Modify: `services/logging-service/build.gradle`
- Modify: `services/logging-service/src/main/java/.../messaging/AuditLogEvent.java`
- Modify: `services/logging-service/src/main/java/.../messaging/AuditLogConsumer.java`
- Modify: `services/logging-service/src/main/java/.../domain/AuditLog.java`
- Modify: `services/logging-service/src/main/java/.../web/AuditLogController.java`
- Modify: `services/logging-service/src/main/java/.../web/ActivityLogService.java`

- [ ] v1/v2 역직렬화와 idempotent save를 구현한다.
- [ ] `/logs/by-*`와 `/logs/search`도 raw domain 대신 redacted DTO를 반환한다.
- [ ] 실제 격리 Rabbit 왕복과 duplicate delivery 1건 보존을 검증한다.

### Task 5: 두 pilot

**Files:**
- Modify: `services/dc-config-service/build.gradle` 및 해당 mutation controller/service
- Modify: `services/partner-auth-service/build.gradle` 및 인증 성공/실패 경로
- Create/Modify: 각 서비스의 publisher wiring/contract tests

- [ ] 기존 응답과 local audit semantics를 유지한 채 중앙 publisher를 after-commit으로 연결한다.
- [ ] dc-config mutation 성공, partner-auth 비인증 성공/실패를 각각 검증한다.
- [ ] 나머지 12개 서비스에 dependency/enablement가 없음을 검사한다.

### Task 6: desktop 개발자 로그 메뉴

**Files:**
- Modify: `clients/desktop/src/renderer/api/activityLog.ts`
- Modify: `clients/desktop/src/renderer/routes/admin/ActivityLogPage.tsx`
- Modify: `clients/desktop/src/renderer/api/mock.ts`
- Create/Modify: 관련 Vitest/typecheck tests

- [ ] 두 pilot event의 서비스/action/resource business key를 표시한다.
- [ ] UUID 및 UUID 조각이 text/DOM/accessibility name에 없음을 테스트한다.

### Task 7: 전량 검증 및 보고

- [ ] shared 변경 모듈, logging-service, dc-config-service, partner-auth-service 전체 테스트를 실행한다.
- [ ] 격리 Testcontainers Rabbit 왕복 원문을 기록한다.
- [ ] desktop typecheck를 실행한다.
- [ ] 삭제된 추적 파일이 없는지 `git diff --name-status origin/main...HEAD | Select-String '^D'`에 준하는 비-git 파일 확인을 보고한다. 이 작업에서는 git 명령 금지이므로 파일 목록 비교로 대체하고 원문을 기록한다.
