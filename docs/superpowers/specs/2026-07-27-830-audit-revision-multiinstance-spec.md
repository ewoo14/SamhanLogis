# #830 감사 revision 채번 멀티인스턴스 안전화 (AccountingAuditLogService)

## 목표 / U-gate

Phase 11 다중 인스턴스 전환 대비, accounting audit log 의 revision 채번이 **여러 서비스 인스턴스에서 동시에 같은 entity 를 기록해도 (entity_id, revision_no) 유일성**을 보장하게 한다.

> **U-gate(실데이터 시나리오)**: 같은 entity 에 대해 2개 인스턴스(또는 2 스레드)가 동시에 audit 을 기록해도 revision_no 중복이 0이며, FE 타임라인이 두 변경을 서로 다른 revision 으로 정확히 보인다.

## 진단 (확증)

`AccountingAuditLogService.nextRevisionNo()` (`:120-131`) 가 **JVM-local `Map<UUID, AtomicInteger> revisionCounters`** (`:49`) 로 채번한다 — cache miss 시 DB `max(revision_no)` lookup, hit 시 `incrementAndGet`. 채번이 JVM 로컬이므로 **다중 인스턴스에서 두 인스턴스가 같은 revision_no 를 부여**할 수 있다. DB 에 `(entity_id, revision_no)` **UNIQUE 제약이 없어**(PM 정찰 2026-07-24 실측) 중복이 저장돼도 안 걸린다. 현 단일 인스턴스 배포에서는 발생 조건이 없어 도달 불가 — 이 슬라이스는 Phase 11 전 proactive fix.

## 불변식 (무엇이 참이어야 — 구현 수단은 구현자가 선택)

1. **어떤 두 활성 audit 행도 같은 `(entity_id, revision_no)` 를 갖지 않는다** — 다중 인스턴스 동시 기록 포함.
2. 같은 mutation 의 **다중 필드 변경은 여전히 같은 revision_no 를 공유**한다(현행 batch 대칭 유지).
3. **회귀 울타리(계속 동작)**: ① 단일 인스턴스 revision_no 순차성(entity 별 1,2,3…) 불변 ② SSE broadcast·FE 타임라인 표시 불변 ③ 기존 41행 audit 데이터 무영향 ④ audit 기록 실패가 본 mutation 트랜잭션을 깨지 않는 현행 격리(있다면) 유지.

## 수단 후보 (제안 — 구현자 반박 가능)

DB 권위 채번 중 택1: ① per-entity advisory lock + DB max+1 ② DB sequence ③ `(entity_id, revision_no)` UNIQUE 제약(Flyway V, partial `WHERE is_deleted=false`) + INSERT 충돌 시 재조회·재시도. **③의 UNIQUE 제약은 어느 수단을 쓰든 안전망으로 반드시 추가**(중복이 조용히 저장되지 않게).

## 수용 기준

- `(entity_id, revision_no)` 활성 UNIQUE 제약(Flyway 신규 V) 존재.
- **동시성 테스트**: 같은 entity 에 N 스레드가 동시에 audit 기록 → revision_no 전부 유일(중복 0), 부여된 집합이 연속(1..N).
- accounting-service 전체 테스트 green. JVM-local cache 잔재가 다중 인스턴스 안전성을 해치지 않음(cache 유지 시 DB 권위와 정합).
