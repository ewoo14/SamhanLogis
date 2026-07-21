---
name: feedback_prometheus_rule_runtime_load_and_eager_counter
description: 🚨 관측/알림 배선 검증 3종 — ①Prometheus 룰은 promtool·마운트 통과해도 런타임 미로드일 수 있어 /api/v1/rules 확인이 유일한 증거(reload 없이 기동된 컨테이너) ②Micrometer counter 는 eager register 안 하면 시계열이 첫 이벤트 때 값1로 탄생해 increase() 가 0→1 을 못 잡아 첫/단발 실패 영구 미탐 ③prod CloudWatch 알람은 해당 서비스에 awslogs 드라이버가 있어야 원천 보장
metadata:
  type: feedback
---

**2026-07-20 #854 R5 실증.** 관측/알림 배선은 "코드 작성 + 문법 검증" 으로 완료 판정하면 **셋 다 조용히 죽어 있을 수 있다.** 세 갈래를 각각 런타임 증거로 확인해야 한다.

## ① Prometheus 룰 — 런타임 로드 확인이 유일한 증거
- `promtool check rules` SUCCESS + `rule_files` 글롭 정합 + docker-compose rules 디렉토리 마운트 확인 — **여기까지 전부 통과해도 룰이 로드되지 않은 상태가 정상적으로 존재한다.** 컨테이너가 룰 파일 추가 **이전에** 기동됐고 `--web.enable-lifecycle` 이 없으면 글롭 재평가가 일어나지 않는다.
- **유일한 증거** = `curl -s http://localhost:9090/api/v1/rules` 에 **그룹 이름이 실제로 나오는지** + 각 rule 의 **`health=ok`**(평가 성공까지 확인. 직후엔 `unknown` 이므로 첫 평가를 기다릴 것).
- 미로드 시 조치: `docker restart samhan-prometheus`(마운트가 이미 있으면 recreate 불요) 또는 SIGHUP.
- `infrastructure/README.md` 가 이 사고 유형("promtool passes, code review passes — alert simply does not exist at runtime", 13일간 `{"groups":[]}`)을 **이미 박제하고 확인을 의무화**하고 있었는데도 PM 검증이 그대로 빠졌다. 문서가 있다는 것과 절차를 밟는 것은 다르다.

## ② Micrometer counter — eager register 안 하면 첫/단발 실패가 영원히 미탐
- `Counter.builder(...).register(registry).increment()` 를 **이벤트 발생 시점에** 호출하면 시계열이 **값 1로 탄생**한다. `increase(metric[5m])` 는 시계열 **내부 delta** 만 계산하므로 **0→1 탄생 점프를 계상하지 않는다** → 5분 내 2건째부터만 발화. 서비스 재시작마다 반복.
- terminal failure·결제 실패 같은 **단발이 통례인 사건**은 이 구조에서 사실상 상시 미탐이 된다.
- **fix** = 생성자/`@PostConstruct` 에서 **태그 조합 전체를 값 0 으로 사전 register**. 이 저장소 전례: `PartnerProductPriceMemoryService`·`CompensationMetrics`(전 조합 eager). 실측 대조로 확인 가능 — 전례 메트릭은 `{...}=0` 시계열이 존재하고, lazy 등록 메트릭은 **쿼리 결과 0개**.
- 🚩 **IT 의 `registry.counter(...).count()` before/after 델타 단언은 이 결함을 구조적으로 못 잡는다** — in-JVM MeterRegistry 레벨이라 scrape 시계열 탄생 의미론과 무관. false-green.
- 또한 counter increment 를 `@Transactional` **안**에서 하면 `save()` flush 지연 때문에 **commit 실패 시 과대계측**(일어나지 않은 실패로 경보)이 된다 → `TransactionSynchronizationManager` afterCommit 로 이동(활성 tx 없을 때 즉시 증가 fallback).

## ③ prod CloudWatch 알람 — awslogs 드라이버 없으면 원천이 없다
- `aws_cloudwatch_log_metric_filter` + `metric_alarm` 을 전례와 **형상만** 동형으로 복제해도, 해당 서비스 컨테이너에 **`logging:`(awslogs) 블록이 없으면** 기본 json-file → CW Agent 의 wildcard tail 에만 의존한다. 이 저장소는 그 경로를 **"best-effort 수집 전용 · alarm 원천으로 쓰지 않는다"** 로 `user_data.sh`·`monitoring.tf` 주석에 못박아 두었다(slip-service 가 awslogs 를 받은 이유 = #809 R6-H5).
- ⟹ 신규 알람을 추가할 때는 **로그 수송 경로까지** 전례와 동형인지 확인하고, `CUTOVER.md` 에 양성 도달 검사(synthetic probe)를 함께 등재할 것.

## 공통 규율
로그 문자열 ↔ CloudWatch filter 리터럴은 **무음 파손 결합**이다(문구 리팩터 시 조용히 깨짐). 가드 테스트가 없다면 최소한 dev-report 에 결합을 명시하라. 관련: [[feedback_ci_test_filter_false_green]] · [[feedback_gradle_test_cache_false_green]] — "통과했다" 가 "실행/작동했다" 가 아닌 계열.
