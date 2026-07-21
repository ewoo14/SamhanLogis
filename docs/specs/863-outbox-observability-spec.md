# #863 — outbox 관측 공백 + 주문 목록 발행상태 UX (OPUS 기획)

> 출처: #854 R6(CODEX SOL 5.6) 적대검증 발견 → 2026-07-20 개발책임자 **범위 동결 결정**으로 이월.
> 선행: #854 (PR #862) ✅ 머지 완료 — outbox self-invocation `@Transactional` 우회 fix.

---

## 0. 문제의 공통 구조 — "조용한 실패"

#854 가 outbox 재시도의 **영속**을 고쳤지만, 그 outbox 가 **멈췄을 때 아무도 모르는** 문제는 남았습니다. R6 이 지목한 세 관측 결함은 표면이 다르지만 뿌리가 같습니다:

| 결함 | 왜 조용한가 |
|---|---|
| depth·oldest PENDING age·heartbeat 게이지 부재 | 스케줄러가 정지하면 **terminal 전이 자체가 없어** counter·로그·알람이 전부 침묵. PENDING 이 무기한 쌓여도 알람 OK |
| startup scrape race | counter eager 등록은 시계열을 0 으로 노출하지만 **Prometheus 가 그 0 을 먼저 scrape 했다는 보장이 아니다.** 첫 scrape 전 단발 terminal 이 나면 첫 수집값이 이미 1 이라 `increase()` 가 놓침 |
| awslogs `non-blocking` 4MiB 버퍼 유실 | 장애 폭주 중 버퍼가 차면 단발 `Outbox FAILED_PERMANENT` 로그가 **조용히 폐기**되고 `treat_missing_data=notBreaching` 이라 알람은 계속 OK |

⟹ 셋 다 **"이벤트가 발생했다"는 신호(counter·로그)에 알람을 걸었기 때문**입니다. 이벤트 신호는 한 번 놓치면 영영 복구되지 않습니다.

---

## 1. 기획 결정

### D-863-01 · 알람의 진실원을 **이벤트(counter/로그) → 상태(gauge)** 로 전환 ★핵심

**상태 게이지는 매 scrape 마다 진실을 다시 말합니다.** 한 번 놓쳐도 다음 scrape 에서 복구되므로 startup race·로그 유실에 **구조적으로 면역**입니다.

신설할 게이지 3종(pull 시점에 DB 조회로 산출):
1. `outbox_pending_depth` — PENDING + PROCESSING 행 수
2. `outbox_oldest_pending_age_seconds` — 가장 오래된 미처리 행의 경과 초
3. `outbox_scheduler_heartbeat_seconds` — 마지막 스케줄러 tick 이후 경과 초

**알람은 이 게이지들에 건다.** 기존 counter 는 **보조 지표로 유지**(제거하지 않음 — 추이 분석용).

⚠️ 게이지 산출이 매 scrape 마다 DB 를 때리므로 **쿼리 비용을 실측**하고, 필요하면 캐시 TTL 을 두되 **TTL 이 scrape 간격보다 길면 안 됩니다**(그러면 다시 놓칩니다).

### D-863-02 · alarm 원천에서 **stdout 단일 경로 배제**

prod CloudWatch 알람이 유실 가능한 stdout 로그에만 의존하지 않도록, D-863-01 의 게이지 기반 경로를 **1차 원천**으로 둡니다. 로그 기반 알람은 보조로만 유지하고, README 에 "**저장소(로그)를 alarm 원천으로 삼지 말 것**"을 명시합니다.

> 이미 [[feedback_prometheus_rule_runtime_load_and_eager_counter]] 에 박제된 규칙입니다. 본 슬라이스가 그 규칙을 실제 배선으로 이행합니다.

### D-863-03 · 목록 기본 필터는 **바꾸지 않는다.** 대신 실패를 끌어올린다

기본 필터를 `DRAFT` 에서 바꾸면 기존 사용자의 작업 흐름이 통째로 바뀝니다. 대신:
- 목록 상단에 **발행실패 카운터 배너**(0건이면 미표시). 클릭 시 실패 필터 적용.
- **발행실패/재시도 전용 필터** 추가.

⟹ 운영자가 상세를 하나씩 열어보지 않아도 실패를 발견할 수 있고, 기본 동작은 보존됩니다.

### D-863-04 · 발행상태 배지를 **모바일에서 사라지지 않는 자리**로

현재 배지가 `연결 전표` 셀 안에 있는데 그 컬럼이 `mobilePriority: 'hidden'` 이라 **768px 이하에서 통째로 사라집니다.** 배지를 모바일에서도 보이는 컬럼/영역으로 옮기거나 전용 컬럼을 부여합니다.
⚠️ 실제 컬럼 정의·`mobilePriority` 값은 구현이 **직접 확인**할 것(본 spec 의 서술은 R6 리뷰 인용이며 추정 포함).

### D-863-05 · "완료" 배지 대비 AA 충족
현재 **2.24:1**(`#10B981` on `#D1FAE5`) → `--color-success-700 #047857`(4.84:1) 채택. 모바일이 이미 쓰는 `#065F46`(6.78:1) 과의 통일도 검토.
⚠️ [[feedback_css_var_token_not_fallback]] — `var(--token, #fallback)` 은 토큰이 정의돼 있으면 **토큰값**이 렌더됩니다. "토큰화했으니 값 불변"이라 단정하지 말고 **대비를 재계산**하세요.

### D-863-06 · mock generic `DELETE` shadow 해소
desktop mock 의 generic DELETE 핸들러가 404/422 분기를 가려, mock 에서는 **확정·발행실패 주문도 204 로 삭제**됩니다(실 BE 는 DRAFT/CONFIRMING 만 허용). mock 을 실 BE 제약과 일치시킵니다([[feedback_inprocess_mock_principles]]).

---

## 2. 산출물

- **BE**(partner-order-service): 게이지 3종 등록 + 산출 쿼리 + 스케줄러 heartbeat 기록
- **인프라**: `infrastructure/prometheus/rules/partner-order-outbox.yml` 규칙 추가·정정 · CloudWatch 알람(terraform) 원천 전환 · `infrastructure/README.md` 에 "로그를 alarm 원천으로 삼지 말 것" 명시 · CUTOVER 체크 항목 갱신
- **FE**(clients/desktop): 실패 카운터 배너 · 발행실패/재시도 필터 · 배지 위치·대비 · mock DELETE 제약 반영
- **테스트**: 게이지 산출 IT · FE vitest · Playwright(실패 필터·모바일 배지 가시성)

---

## 3. 불변식 / anti-false-green

1. 🚨 **게이지 알람이 "스케줄러 정지"를 실제로 잡는가** — 스케줄러를 멈춘 상태를 만들고 `outbox_scheduler_heartbeat_seconds` 가 증가해 알람 조건에 도달하는지 **실측**하세요. 코드 존재만으로 PASS 금지.
2. 🚨 **Prometheus 규칙이 런타임에 실제 로드됐는지** — promtool 통과·마운트 확인만으로는 부족합니다. **`/api/v1/rules` 에 그룹이 존재하고 `health=ok`** 인 것이 유일한 증거이며, 미로드면 컨테이너를 restart 해야 합니다([[feedback_prometheus_rule_runtime_load_and_eager_counter]]).
3. **게이지는 in-JVM registry 델타 단언으로 검증하지 말 것** — 그건 구조적 false-green 입니다. **실제 scrape 엔드포인트 응답**을 확인하세요.
4. **모바일 배지 가시성**은 390px 실측 캡처로 증명하세요(정적 코드 확인 금지).
5. Playwright mock 게이트 전량 green + 스크린샷 부수효과 **2경로 원복**.

---

## 4. 기존 결정 교차검증 ([[feedback_spec_cross_check_prior_decisions]])

| 기존 결정 | 정합 |
|---|---|
| 관측/알림 배선 3종 검증 규칙(룰 런타임 로드·counter eager·awslogs 원천) | ✓ 본 슬라이스가 그 규칙의 **실제 이행**입니다 |
| 범위 동결 — 새 표면은 이슈+다음 슬라이스 | ✓ 본 슬라이스가 바로 그 "다음 슬라이스" |
| mock 3원칙·BE parity | ✓ D-863-06 |
| 전표/코멘트 용어·UUID 미노출·권한 풀네임 | ✓ 신규 문자열에 적용 |

---

## 5. 위험

- **게이지 산출 쿼리가 매 scrape 마다 DB 를 때립니다.** 인덱스·비용을 실측하고, 필요 시 캐시 TTL(단, scrape 간격 미만)을 두세요.
- CloudWatch 알람 원천 전환은 **prod 영향**이라 CUTOVER 문서에 반영하고 양성 도달 검사를 등재하세요.
- 배지 위치 변경은 목록 레이아웃 회귀 위험 — Playwright 전량이 권위입니다.

## 6. 범위 밖

- outbox 재처리 UI(수동 재시도 버튼) — 새 표면이므로 별도 슬라이스
- 알람 채널(Slack/SMS) 확장
- #831 lookup sweep — 결함 계열은 인접하나 별도 이슈(트랙2 `DailyClosingService` 와 파일 충돌 위험도 있어 트랙2 머지 후 착수)
