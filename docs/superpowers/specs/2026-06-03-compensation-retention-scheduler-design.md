# 보상 실패 retention 스케줄러 — 설계

> ⓑ 후속(D-SER-23 descope 분). `serial_compensation_failures` 무한 누적 방지 — 해소(resolved=true) + 보존기간 경과 행 자동 정리. slip-service 단독.

## 배경

#355(복구 API)가 운영자 수동 정합(resolved=true)을 제공했으나, resolved 행이 영구 누적. D-SER-23 에서 "자동 스케줄러 descope, 운영 가이드 문서화"로 미뤘던 것을 구현.

## 설계

- `CompensationRetentionScheduler`(@Component, `@ConditionalOnProperty(samhan.compensation.retention.enabled=true, matchIfMissing=false)` — 기본 비활성, 명시 활성).
- `@Scheduled(cron = ${samhan.compensation.retention.cron})` — 기본 매일 새벽(예: `0 30 3 * * *`).
- 동작: `resolved = true AND created_at < (now - retentionDays)` 행을 **soft-delete**(BaseEntity is_deleted=true, deleted_at/deleted_by 기입). append-only 감사이나 정합 완료 + 보존기간 경과분만 정리(미해소·기간내 유지). `@SQLRestriction("is_deleted=false")` 로 이후 조회 자동 제외.
- 도메인 메서드 위임(직접 set 금지) — `SerialCompensationFailure` 에 soft-delete 도메인 메서드 또는 BaseEntity 기존 soft-delete 메커니즘 사용. 대량은 service 에서 후보 조회 후 도메인 메서드 호출(또는 @Modifying bulk — 단 BaseEntity audit 일관 위해 도메인 경유 권장).
- `application.yml`: `samhan.compensation.retention.{enabled:false, cron:"0 30 3 * * *", retention-days:90}`.

## 검증

- 단위: 스케줄러가 service.purge(cutoff) 호출(고정 Clock). service: resolved+경과 → soft-delete, resolved+기간내 → 유지, 미해소+경과 → 유지.
- IT(실 Testcontainers, skipped=0): 3 케이스 seed → purge → is_deleted 상태 단언(JdbcTemplate 실 DB).
- 6월 date-bomb 회피: Clock 주입 또는 cutoff 파라미터 명시(now() 직접 분기 금지).

## 자기검토

- @ConditionalOnProperty 기본 비활성(운영 명시 활성). resolved=false 절대 정리 안 함(미해소 보존). 보존기간내 resolved 보존. soft-delete(복구 가능, 영구삭제 아님). DECISIONS D-SER-25.
