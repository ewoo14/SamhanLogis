# 보상 실패 retention 스케줄러 — 구현 계획

> spec: docs/superpowers/specs/2026-06-03-compensation-retention-scheduler-design.md. slip-service 단독.

**대원칙:** 도메인 메서드(직접 set 금지)/BaseEntity soft-delete/IT skipped=0/Clock 또는 cutoff 주입(date-bomb 회피)/@ConditionalOnProperty 기본 비활성.

## Task 1: 도메인/저장소
- SerialCompensationFailure soft-delete 도메인 메서드(또는 BaseEntity 기존 메커니즘 활용) — is_deleted=true + deleted_at/by.
- Repository: resolved=true AND createdAt < cutoff 후보 조회(findByResolvedTrueAndCreatedAtBefore 등) + (대량이면 @Modifying soft-delete 고려, 단 audit 일관).

## Task 2: 서비스 + 스케줄러
- CompensationRetentionService.purge(LocalDateTime cutoff): 후보 조회 → 도메인 soft-delete → 건수 반환(로그).
- CompensationRetentionScheduler(@Component, @ConditionalOnProperty samhan.compensation.retention.enabled): @Scheduled(cron=${...}) → purge(now-retentionDays). Clock 주입.
- application.yml: samhan.compensation.retention.{enabled:false, cron, retention-days:90}.

## Task 3: 테스트
- 단위: purge 3분기(resolved+경과 soft-delete / resolved+기간내 유지 / 미해소+경과 유지), 고정 cutoff. 스케줄러 toggle.
- IT(실 Testcontainers): seed 3케이스 → purge → JdbcTemplate is_deleted 단언. skipped=0.

## 검증
:services:slip-service:test green(skip0). Docker 실QA(스케줄러 비활성 기본 기동 확인 + 수동 purge 또는 IT 갈음).
