# Slice: 보상 실패 P2 백로그 (D-SER-28 + 운영 관측성)

> PR #419 / 2026-06-07 / slip-service 중심.
> retention·alert·retry 본체 이후 운영 정리와 관측성, Phase 11 활성화 준비를 묶은 P2 백로그.

## 1. D1~D3 요약

- **D1 — 물리 purge**: retention 이 soft-delete 한 `serial_compensation_failures` 행 중 `deleted_at < cutoff` 만 hard-delete. 활성·미해소 행은 `is_deleted=true` 조건으로 불가침.
- **D2 — 운영 관측성**: `compensation_failure_recorded_total`, `compensation_alert_send_total`, `compensation_retry_total`, `compensation_retention_purged_total` 사전 등록으로 Prometheus에서 0값도 노출.
- **D3 — Phase 11 준비**: retention/purge/alert/retry 모두 기본 비활성으로 유지하고 env-template 체크리스트에서 운영 활성화 키를 명시.

## 2. Cycle 1b 반영

- `deleteSoftDeletedBefore` native DELETE 후보 서브쿼리에 `ORDER BY deleted_at LIMIT ... FOR UPDATE SKIP LOCKED` 를 추가했다. 다중 slip-service 인스턴스가 같은 purge 배치를 동시에 선점하지 않고, 오래 soft-delete 된 행부터 단일 배치로 삭제한다.
- `CompensationAuditWriter` 의 `failure_recorded` metric 계측은 감사 행 `REQUIRES_NEW` 커밋 후 `afterCommit` 으로 이동했다. 트랜잭션 동기화가 없는 호출은 기존 alert 패턴처럼 즉시 계측한다.
- `CompensationPurgeServiceIT` 는 후보 3건·batchSize 2에서 1회 호출 2건 삭제와 1건 잔존을 단언한다. 동시 실행 IT는 비대상이며, `SKIP LOCKED` 선점 구조와 `CompensationPurgeScheduler` 기본 비활성(`samhan.compensation.purge.enabled=false`)으로 운영 중복 발화 위험을 제어한다.
- V33 인덱스는 일반 `CREATE INDEX` 방식이다. 보상 실패 감사 테이블 행수 미미 전제로 운영 잠금 영향은 무시 가능하며, 대용량화 시 `CONCURRENTLY`를 재고한다.

## 3. 검증 메모

- Docker QA 산출: `docs/qa/compensation-p2-backlog/cycle1-docker-qa.txt`.
- Gradle 상세 검증은 PM 대행 범위. 본 cycle 1b에서는 테스트 코드 계약과 운영 문서/템플릿을 보강했다.
