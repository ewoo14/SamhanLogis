# Slice: 보상 실패 retention 스케줄러 (D-SER-25)

> PR #359 / branch `feat/compensation-retention-scheduler` / 2026-06-03 / slip-service 단독.
> ⓑ 후속(D-SER-23 descope 분 구현). #355 복구 API 의 resolved 행 영구 누적 → 보존기간 경과분 자동 정리.

## 1. 구현

- `CompensationRetentionScheduler`(@Component, `@Scheduled(cron, zone="Asia/Seoul")`, `@ConditionalOnProperty(samhan.compensation.retention.enabled, matchIfMissing=false)` — **기본 비활성**). Clock 주입.
- `CompensationRetentionService.purge(cutoff, actor)`: `findByResolvedTrueAndCreatedAtBefore(cutoff)` → `softDelete`(BaseEntity is_deleted, 복구 가능). 🚨 **미해소(resolved=false)·보존기간내 행 절대 미정리**.
- `SerialCompensationFailure.softDelete(actor)` + repo 쿼리. `application.yml retention.{enabled:false, cron:"0 30 3 * * *", retention-days:90}` env override.
- `TimeConfig.clock()` → `Clock.system(Asia/Seoul)` (cron zone 일치, occurredAt/cutoff 한국시간 일관 — Codex P1).
- `build.gradle` test `maxHeapSize=2g`(슈트 증가 포크 JVM OOM 방지, 빌드 인프라).

## 2. 검증

- 단위 2 + Scheduler 3(@ConditionalOnProperty toggle) + IT 1(실 Testcontainers, JdbcTemplate 3분기 실DB 단언). **skip0/fail0/err0**. 무회귀: 보상감사(#351)·복구(#355) 테스트 전부 green.
- Docker 실 QA(`docs/qa/slice-compensation-retention/real-qa-evidence.md`): slip 재배포 healthy + 스케줄러 기본 비활성 미등록 확인.

## 3. 리뷰

- **5-agent**: BE APPROVE / QA P0·P1 0(P2 IT cleanup·주석 fix) / DevOps P1-1(zone) fix·P1-2(물리purge) 후속·P2(Phase11 문서).
- **Codex cross-check**: ①②④⑤ APPROVE, ③ P1(Clock zone) fix.

## 4. 후속

- **soft-delete 물리 purge(P1-2)**: retention soft-delete 행(is_deleted=true) 물리 잔존 → 테이블 bloat. **2단계 purge(soft 후 grace 경과 hard-delete) 또는 주기 VACUUM 운영 전략**. soft-delete 는 D-SER-25 복구창 의도(즉각 hard-delete 회피).
- **Phase 11 활성화(P2)**: 운영 정리 활성화 = `SAMHAN_COMPENSATION_RETENTION_ENABLED=true`(cron/days 기본값 운영 가능). 컷오버 체크리스트 등재.
