# 보상 실패 retention 스케줄러 — 실 Docker QA 증빙

> PR #359 / branch `feat/compensation-retention-scheduler` / 2026-06-03
> slip-service 재배포(--no-cache, retention 새 코드) + 실 기동 로그. no-fake-data.

## 1. slip-service 재배포 + 기본 비활성 기동 (실 로그)

```
samhan-slip-service  Up (healthy)
Started SlipServiceApplication in 10.801 seconds
```

`docker logs samhan-slip-service | grep CompensationRetentionScheduler` → **0건**(미등록).

→ `samhan.compensation.retention.enabled` 기본 false → `@ConditionalOnProperty(matchIfMissing=false)` 로 `CompensationRetentionScheduler` 빈 **미등록**(불필요 스케줄 부하 없음). 정상 기동.

## 2. retention 동작 검증 (CI 실 Testcontainers IT)

스케줄러 기본 비활성이라 실 운영 환경에선 발화 안 함(운영 활성화 시 동작). retention 정리 로직은 **CI 실 Testcontainers IT** `CompensationRetentionServiceIT.purge_softDeletesOnlyResolvedFailuresOlderThanCutoffInDatabase` 가 실 PostgreSQL 로 3분기 검증(JdbcTemplate raw SQL `@SQLRestriction` 우회 단언):

- `oldResolved`(resolved=true, cutoff 이전) → soft-delete(is_deleted=true, deleted_by="system-retention", deleted_at not null). purged=1.
- `recentResolved`(resolved=true, cutoff 이후) → 유지(is_deleted=false).
- 🚨 `oldUnresolved`(resolved=false, cutoff 이전) → **유지**(미해소 절대 미정리, 데이터 손실 방지).

단위(2) + Scheduler @ConditionalOnProperty toggle(3) + IT(1) skip0/fail0/err0.

## 3. application.yml 설정 (실 반영)

```yaml
samhan.compensation.retention:
  enabled: ${SAMHAN_COMPENSATION_RETENTION_ENABLED:false}   # 기본 비활성
  cron:    ${SAMHAN_COMPENSATION_RETENTION_CRON:0 30 3 * * *}
  retention-days: ${SAMHAN_COMPENSATION_RETENTION_DAYS:90}
```

`@Scheduled(zone="Asia/Seoul")` + `TimeConfig Clock(Asia/Seoul)` — UTC 컨테이너에서도 한국시간 새벽 발화·cutoff 일관(Codex P1 해소).

## 4. 종합 / 후속

| 항목 | 결과 |
|---|---|
| slip 재배포 healthy + 스케줄러 미등록(기본 비활성) | ✅ |
| retention 3분기(미해소 보존 포함) | ✅ CI 실 Testcontainers IT |
| @Scheduled/Clock zone Asia/Seoul 일관 | ✅ |
| no-fake-data | ✅ 실 기동 로그/IT |

**후속(DevOps)**:
- **P1-2 soft-delete 물리 purge**: retention 은 is_deleted=true soft-delete 만 — 행이 물리 잔존(테이블 bloat). 2단계 purge(soft 후 grace 경과 hard-delete) 또는 주기 VACUUM 운영 전략 필요. soft-delete 는 D-SER-25 복구창 의도.
- **P2 Phase 11 활성화 절차**: 운영 활성화 = `SAMHAN_COMPENSATION_RETENTION_ENABLED=true` env 설정(cron/days 기본값으로 운영 가능). 컷오버 체크리스트 등재 권장.
