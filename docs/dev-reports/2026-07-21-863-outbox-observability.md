# #863 outbox 관측 공백 및 주문 목록 발행상태 UX

작성일: 2026-07-21

## 결론

partner-order-service outbox의 알람 진실원을 이벤트 counter와 stdout/awslogs에서
현재 상태를 매 scrape마다 다시 말하는 gauge로 전환했다. `PENDING`/`PROCESSING` 깊이,
가장 오래된 미처리 행의 경과 시간, scheduler 마지막 tick 이후 경과 시간을 각각
Prometheus와 production CloudWatch custom metric으로 노출한다. 기존 terminal counter는
추세·원인 분석용 보조 지표로 남겼다.

주문 목록에는 발행실패 건수 배너와 발행실패/재시도 필터를 추가했다. 기본 주문 상태 필터
`DRAFT`는 유지했으며, 실패 배지는 모바일에서 숨겨지지 않는 `status` 컬럼으로 옮겼다.

## 1. 실코드 재확인

### 백엔드

- `SlipPublishOutboxResultWriter`의 `partner_order_slip_publish_terminal` counter와
  `reason` 태그 배선은 제거하지 않았다. 이는 이벤트 추세를 보는 보조 지표다.
- `OutboxObservabilityMetrics`가 세 gauge를 등록한다. `pending_depth`와
  `oldest_pending_age_seconds`는 gauge callback에서 repository native query를 호출하므로
  scrape마다 DB의 현재 상태를 재확인한다. 캐시 TTL은 두지 않았다.
- `SlipPublishOutboxScheduler.retryPending()`의 첫 동작이 tick 시각 기록이다. 후보 행이
  없어도 heartbeat가 갱신된다. `local` 프로파일은 scheduler가 비활성이라, 실제 scrape에서
  heartbeat가 계속 증가하는 정지 상태를 검증할 수 있다.
- V11 migration은 삭제되지 않은 `PENDING`/`PROCESSING` 행의
  `(status, first_attempted_at)`에 부분 인덱스를 추가한다.

### 프론트엔드

실제 컬럼 정의를 다시 확인한 결과 `linkedSlipNo` (`연결 전표`) 컬럼이
`mobilePriority: 'hidden'`이었다. 따라서 기존 발행상태 배지는 해당 셀 안에 두면 768px
이하에서 사라진다. 배지를 `status` 컬럼으로 이동해 모바일 카드의 주 상태 영역에서도
보이게 했다.

`failedCountQuery`는 발행실패 전체 건수를 별도로 조회한다. 0이면 배너를 렌더링하지 않고,
양수이면 클릭 시 `slipPublishStatus=FAILED` 필터를 적용한다. 목록에는 `전체/발행실패/재시도`
전용 필터를 추가했고, 발행상태 필터를 선택하면 상태 필터를 해제해 기본 `DRAFT`가 실패
행을 가리지 않도록 했다.

발행실패 배지의 전경색은 `var(--color-success-700, #047857)`로 지정했다. design-system
토큰의 실제 값은 `--color-success-700: #047857`이며, 배경 `--state-success-bg: #D1FAE5`와
대비는 약 4.84:1로 AA를 충족한다. 기존 `--state-success: #10B981`을 사용하면 약
2.24:1이므로 토큰화만으로 값이 보존된다고 보지 않았다. 모바일에서 사용되는
`#065F46`도 충분한 대비지만, 현재 design-system의 700 단계 토큰으로 통일했다.

mock의 partner-order 구간에서는 generic DELETE shadow를 제거하고, 실제 BE와 같이
`DRAFT`/`CONFIRMING`만 삭제 가능하도록 최소 범위에서 제약을 복원했다. 다른 mock 구간은
수정하지 않았다.

## 2. 알람 임계값 산출

기준값은 scheduler 주기 `P = 5분 = 300초`, max-retry-hours `R = 24시간 = 86,400초`다.

| 지표 | 계산 | 적용 |
|---|---:|---:|
| scheduler heartbeat | `2 × P = 2 × 300` | `> 600`이 300초 지속 |
| oldest pending age | `R - P = 86,400 - 300` | `> 86,100`이 300초 지속 |
| pending depth | 상태 존재 여부 | `> 0`이 `2 × P = 600초` 지속 |

heartbeat는 정상 tick 한 번을 일시적으로 놓치는 단일 주기를 허용하되 두 주기째부터
정지를 알린다. oldest age는 24시간 종결 상한을 기다린 뒤 알리는 대신 다음 tick에서
종결/재시도할 수 있는 5분 여유를 제외해 조기 감지한다. pending depth에는 처리량이나
업무량 요구가 제공되지 않았으므로 임의의 라운드 수를 만들지 않고, 두 주기 동안 상태가
존재하는지만 알린다. batch-size 10은 실행 용량 설명이지 알람 임계값이 아니다.

Prometheus rule과 Terraform CloudWatch alarm 모두 위 계산을 사용하며, CloudWatch alarm은
metric 누락을 breaching으로 취급한다. 로그는 원인 조사와 보조 증거에만 사용한다.

## 3. 게이지 쿼리 비용 및 실행계획

두 query는 각각 단일 aggregate다.

```sql
SELECT COUNT(*)
FROM slip_publish_outbox
WHERE is_deleted = FALSE AND status IN ('PENDING', 'PROCESSING');

SELECT COALESCE(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(first_attempted_at))), 0)
FROM slip_publish_outbox
WHERE is_deleted = FALSE AND status IN ('PENDING', 'PROCESSING');
```

V11의 부분 인덱스는 위 두 조건을 만족하는 행만 대상으로 `(status, first_attempted_at)`를
인덱싱한다. 적용 후 PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` 원문과 실제 elapsed time을
아래에 기록한다.

현재 공유 dev PostgreSQL의 `partner_order_db`는 이 워크트리의 V11 migration을 아직
적용하지 않은 상태였다. 따라서 아래는 migration 전 baseline이며, 기존
`ix_slip_publish_outbox_status_next`만 존재했다. 테이블은 현재 0행이라 대규모 데이터의
p95를 대표하지 않는다는 한계도 함께 기록한다.

```text
\d+ slip_publish_outbox
  ix_slip_publish_outbox_status_next btree (status, next_attempt_at) WHERE is_deleted = false

pending_depth:
  Seq Scan on slip_publish_outbox; Buffers: shared hit=1
  Planning Time: 3.328 ms; Execution Time: 0.111 ms

oldest_pending_age_seconds:
  Seq Scan on slip_publish_outbox; Buffers: shared hit=1
  Planning Time: 2.411 ms; Execution Time: 0.070 ms
```

현재 관측 데이터에서 두 query의 실행시간은 0.111ms/0.070ms로 매우 작지만, 0행
baseline이므로 V11 적용 후 운영 규모에서 다시 측정한다. 설계상 scrape 간격 이상인
TTL은 사용하지 않았다. 비용이 허용 범위를 넘으면 다음 대안으로 역제안한다: scheduler
tick마다 동일 값을 갱신하고 scrape는 메모리 gauge를 읽는다. 다만 이 대안은 scheduler가
멈추면 depth/oldest 값도 stale해지므로 heartbeat와 함께 사용해야 하며, 현재 구현은
상태 진실원을 매 scrape에 다시 조회하는 쪽이다.

## 4. 런타임 검증 범위

로컬에서는 `/actuator/prometheus` 실제 HTTP 응답으로 세 gauge를 확인하고, `local`
프로파일의 scheduler 비활성 상태에서 heartbeat가 증가하는 것을 확인한다. Prometheus
rule은 별도 검증 컨테이너의 `/api/v1/rules`에서 그룹 존재와 `health=ok`를 확인한다.

```text
scrape endpoint (실제 HTTP 응답):
  outbox_oldest_pending_age_seconds{application="partner-order-service"} 0.0
  outbox_pending_depth{application="partner-order-service"} 0.0
  outbox_scheduler_heartbeat_seconds{application="partner-order-service"} 25.48

scheduler stopped (local 프로파일은 outbox scheduler 비활성):
  2026-07-21T13:37:39+09:00 ...heartbeat_seconds... 42.81
  2026-07-21T13:46:49+09:00 ...heartbeat_seconds... 593.221
  2026-07-21T13:47:20+09:00 ...heartbeat_seconds... 623.474
  2026-07-21T13:48:29+09:00 ...heartbeat_seconds... 692.927
  알람 조건 600초 초과를 실제 scrape로 확인했다.

/api/v1/rules (별도 Prometheus 컨테이너, 20초 후 runtime 조회):
  group=partner-order-outbox file=/etc/prometheus/rules/partner-order-outbox.yml
  PartnerOrderOutboxPendingBacklog health=ok duration=600
  PartnerOrderOutboxOldestPendingTooOld health=ok duration=300
  PartnerOrderOutboxSchedulerStalled health=ok duration=60
```

production CloudWatch와 실제 EC2 배포는 이 워크트리에서 검증할 수 없다. CUTOVER에
CloudWatch metric 존재, scheduler 중지 시 heartbeat 양성 도달, 복구 후 정상화까지의
검사를 등록했다. 배포 전에는 코드 존재나 Terraform mount만으로 통과시키지 않는다.

## 5. UI 검증 및 산출물

390px 실서버 QA 캡처는 shared gateway의 DB에 #854 실패 주문 seed 및
`slipPublishStatus` 응답 필드가 없어 배지 locator가 생성되지 않아 확보하지 못했다.
실패 원문은 `test-results/854-outbox-terminal-guard--*/error-context.md`에 남았으며,
가짜 seed를 만들지 않았다. 전량 Playwright 실행은 커밋된 `docs/qa/**`와
`clients/desktop/playwright/**/screenshots/**`를 덮어쓰므로 실행 전 백업하고 완료 후
두 경로를 원복한다. `test-results`와 `playwright-report`는 제거한다.

```text
390px 캡처: 미확보 — real QA 대상 seed 부재로 정직하게 실패 처리
Playwright 전량: Running 590 tests using 1 worker; 590 passed (18.2m)
unexpected=0: 590 passed, failed=0, skipped=0
원복 후 git status: `docs/qa/**` 및 `clients/desktop/playwright/**/screenshots/**` 변경 없음;
구현·문서 파일만 status에 남음
```

## 6. 남은 우려

- 실제 production CloudWatch 양성 도달과 alarm 상태 전이는 배포 없이는 확정할 수 없다.
- scrape마다 두 aggregate query가 실행되므로, V11 배포 후 실제 데이터 규모에서 실행계획과
  p95 비용을 확인해야 한다.
- outbox producer가 현재 dormant라는 기존 문서 상태가 있으므로, pending depth 0이
  정상인지 producer 재배선 결정과 함께 해석해야 한다. 이는 관측 게이지의 의미를 바꾸지
  않는다.

## 2026-07-21 재연결 세션 확인

이 세션에서 워크트리 변경과 검증 산출물을 재확인했다. 커밋·push·branch 조작은 하지
않았다. 이전 Playwright 실행이 만든 screenshots 변경은 좁은 screenshots 경로와
`docs/qa/**`만 원복했고, `clients/desktop/playwright/` 전체를 checkout하지 않았다.

재연결 세션 재확인 결과:

```text
./gradlew :services:partner-order-service:test
  BUILD SUCCESSFUL in 16s
  15 actionable tasks: 15 up-to-date

clients/desktop: npm run typecheck
  exit 0

clients/desktop: 관련 vitest
  Test Files 2 passed; Tests 117 passed

Playwright 전량 재실행
  Running 590 tests using 1 worker
  590 passed (18.2m)
  screenshots 변경 146개는 개별 path checkout으로 원복
  untracked screenshot 1개 제거; docs/qa와 playwright screenshot status 변경 없음
```
