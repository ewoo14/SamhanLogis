# #1161 S0 중앙 감사 로그 부하 실측

## 측정 범위와 기준

- 측정일: 2026-08-10 (KST).
- 대상: 현재 worktree의 로컬 Docker Compose 스택. 운영 트래픽·운영 DB의 수치가 아니다.
- 측정 구간: Prometheus 요청 수는 조회 시각 직전 1시간, 최근 요청률은 직전 5분. 런타임 자원은 명시한 단일 시각의 snapshot이다.
- 측정 시각: Prometheus 16:35:30~16:41:47, RabbitMQ/Elasticsearch/Docker 16:40:39~16:40:54.
- 방법: Prometheus HTTP API GET, Docker inspect/stats/df GET·조회 명령, RabbitMQ diagnostics/list 명령, Elasticsearch read-only HTTP API, 저장소 grep·소스 카운트.
- 수행하지 않은 것: 설정 변경, 서비스 재시작·재빌드, 메시지 발행·실패 주입, 운영 DB 쓰기.
- S1 검증 POST로 만들어진 `samhan-audit-logs`의 로컬 문서 2건은 현재 인덱스 문서 수에 포함된다.

## ① 현재 실제 트래픽

### api-gateway 로그와 메트릭

`docker logs --since 1h samhan-api-gateway`를 조회했다. 총 12줄이었고 HTTP access-log 형식의 요청별 기록은 없었다. 따라서 로그만으로 요청 수를 산출할 수 없다.

Prometheus에는 `api-gateway` target과 `http_server_requests_seconds_count`가 있다. Prometheus scrape interval은 15초이다(`infrastructure/prometheus/prometheus.yml:7-9,27-30`).

| PromQL | 구간 | 실측값 | 해석 |
|---|---:|---:|---|
| `up{job=~"api-gateway\|logging-service"}` | 16:35:30 | 두 target 모두 `1` | scrape 정상 |
| `sum(increase(http_server_requests_seconds_count{job="api-gateway"}[1h]))` | 직전 1시간 | `484.0394` | gateway HTTP 전체 counter 증가량 |
| `sum(increase(http_server_requests_seconds_count{job="api-gateway",uri!~"/actuator/health\|/actuator/prometheus"}[1h]))` | 직전 1시간 | `4.0169` | 모니터링 endpoint 제외한 gateway HTTP counter 증가량 |
| `sum(increase(http_server_requests_seconds_count{job="api-gateway",status!="200",uri!~"/actuator/health\|/actuator/prometheus"}[1h]))` | 직전 1시간 | `2.0085` | 위 비-액추에이터 요청 중 200 이외 |
| `sum(rate(http_server_requests_seconds_count{job="api-gateway",uri!~"/actuator/health\|/actuator/prometheus"}[5m]))` | 직전 5분 | `0` | 조회 시각 직전 5분 비-액추에이터 요청 없음 |
| `sum(increase(spring_cloud_gateway_requests_seconds_count{job="api-gateway"}[1h]))` | 직전 1시간 | 약 `2.0085` | Spring Cloud Gateway route metric 존재. status별로 OK 약 1.0042, UNAUTHORIZED 약 1.0042; URI별 의미 있는 분해는 되지 않음 |

`http_server_requests_seconds_count`의 1시간 전체 증가량 대부분은 scrape가 만든 것이다. 같은 구간 `/actuator/health` 약 `239.01`, `/actuator/prometheus` 약 `240.01`이 관측됐다. 비-액추에이터 `4.0169`에는 S1 검증 요청과 인증 실패 요청이 포함되어 있으며 업무 사용자 트래픽으로 분리할 수 없다.

결론적으로 **현재 로컬 gateway에서 메트릭으로 요청 수를 뽑을 수는 있으나, 운영 트래픽 수치는 아니다.** 운영 기간별 수치, 사용자별 수치, 업무 API별 정확한 수치는 측정 불가다. gateway의 다수 business route가 `uri=UNKNOWN`으로 집계되기 때문이다.

### 대리 지표

현재 로컬 DB read-only 조회 결과:

- `auth_db.accounts`: 전체 12, `is_deleted=false AND enabled=true` 11.
- `user_db.employees`: 전체 100, `is_deleted=false` 99.
- `user_db.employees`: `is_deleted=false AND account_id IS NOT NULL` 8.

이는 PM이 전달한 다른 실측 기준인 `auth 32 · 직원 24`와 일치하지 않는다. 현재 로컬 seed/데이터 기준의 값이므로 사용자 수 대리 지표로 합산하지 않았다.

## ② 변경 동작 대비 조회 동작

### 소스 annotation 전수

대상은 `services/*/src/main/java`이며 test source는 제외했다. `@GetMapping`과 `@PostMapping/@PutMapping/@PatchMapping/@DeleteMapping` 문자열을 파일별로 세고, `@RequestMapping(method=...)` 형태는 별도로 검색했다(추가 hit 없음).

| 서비스 | GET | POST | PUT | PATCH | DELETE | 변경 합계 |
|---|---:|---:|---:|---:|---:|---:|
| accounting-service | 96 | 73 | 7 | 9 | 8 | 97 |
| arologis-service | 30 | 38 | 11 | 1 | 2 | 52 |
| auth-service | 22 | 19 | 10 | 5 | 6 | 40 |
| dashboard-service | 9 | 6 | 3 | 0 | 3 | 12 |
| dc-config-service | 9 | 2 | 1 | 1 | 0 | 4 |
| groupware-service | 24 | 17 | 6 | 0 | 5 | 28 |
| inventory-service | 34 | 40 | 1 | 1 | 2 | 44 |
| logging-service | 4 | 0 | 0 | 0 | 0 | 0 |
| notification-service | 10 | 11 | 0 | 0 | 2 | 13 |
| partner-auth-service | 5 | 4 | 0 | 3 | 0 | 7 |
| partner-order-service | 21 | 21 | 1 | 1 | 2 | 25 |
| partner-service | 29 | 17 | 2 | 1 | 6 | 26 |
| product-service | 35 | 26 | 5 | 11 | 7 | 49 |
| slip-service | 89 | 98 | 9 | 9 | 19 | 135 |
| user-service | 14 | 18 | 0 | 5 | 1 | 24 |
| **합계** | **431** | **390** | **56** | **47** | **63** | **556** |

annotation 기준 비율은 **GET 431 : 변경 556**, 즉 전체 987개 중 GET 43.7%, 변경 annotation 56.3%다. GET 1건당 변경 annotation은 약 1.29건이다.

기존 `docs/dev-reports/2026-08-10-audit-logging-operation-matrix.md`의 **의미론적 변경 동작 580개**는 위 annotation 전수와 집계 기준이 다르다. 따라서 `431:556`을 `GET:580`으로 단순 대체하지 않았다. 580은 상태 변경 여부·비-HTTP 동작·군별 분류가 반영된 기존 조사 분모다.

### 보존된 실제 네트워크 trace

저장소의 Playwright request trace를 JSON으로 읽고 gateway/API URL만 필터링해 method별로 세었다. 이 trace들은 화면 최초 진입 1회가 아니라 실제 QA 상호작용 시나리오 전체다.

| trace | 관측 API 요청 | GET | 변경 요청 | 측정 범위 |
|---|---:|---:|---:|---|
| `docs/qa/874-r86-real-qa/network-ab.json` | 12 | 11 | POST 1 | 전표 작성 A/B 시나리오 A: 상품·단가·DC 조회와 `POST /slips` |
| `docs/qa/874-r86-real-qa/network-b.json` | 10 | 8 | POST 2 | 전표 작성 B: 상품·단가·DC 조회, `POST /slips/price-memory/bulk`, `POST /slips` |
| `docs/qa/2026-08-09-1095-r5/desktop-browser-network.json` | 16 | 15 | POST 1 | desktop 상호작용 trace; Vite proxy `:5296` 포함 |

`docs/qa/2026-08-09-1095-r5/estimate-browser-network.json`은 renderer의 `/rpc/*` 8건만 있어 gateway API 화면 호출 수로 세지 않았다.

**측정 불가:** 저장된 산출물에서 “대표 화면 하나를 최초로 열었을 때”의 네트워크 구간만 분리된 trace는 확인하지 못했다. 따라서 위 수치는 화면 open당 고정 GET 수가 아니라 실제 보존된 상호작용 trace의 관측치다. 새 브라우저 세션을 열거나 서비스에 부하를 발생시키는 측정은 이번 임무의 read-only 범위를 벗어나 수행하지 않았다.

## ③ 현재 인프라 한계와 사용량

### RabbitMQ

측정 시각 2026-08-10 16:40:39~16:40:54 KST.

| 항목 | 실측 |
|---|---|
| RabbitMQ | 3.13.7, uptime 약 28,700초, maintenance=false |
| audit queue | `messages_ready=0`, `messages_unacknowledged=0`, consumer 1, queue memory 22,120 bytes |
| DLQ | `messages_ready=0`, `messages_unacknowledged=0`, consumer 0, queue memory 21,992 bytes |
| consumer | active=true, `ack_required=true`, `prefetch_count=250` |
| 메모리 | total 0.0449GB 사용, high watermark `0.4`, 계산 threshold 3.3148GB |
| 디스크 | free 986.5142GB, low disk watermark 0.05GB |
| connection/queue | connection 1, queue 2 |
| alarm | local/clusterwide 모두 없음 |

queue arguments에는 `x-dead-letter-exchange`와 `x-dead-letter-routing-key`만 있다. `x-max-length`, `x-max-length-bytes`, `x-message-ttl`은 조회되지 않았다.

### Elasticsearch

측정 시각 2026-08-10 16:40:39 KST.

| 항목 | 실측 |
|---|---|
| cluster | 1 node, `yellow`, active primary 1, active shard 1, unassigned shard 1 |
| `samhan-audit-logs` | `docs.count=2`, store `21.4kb`, primary 1, replica 1 |
| heap | `heap_max=536,870,912` bytes(512MB), `heap_used=133,726,768` bytes(약 127.5MB) |
| refresh | `index.refresh_interval=1s` |
| lifecycle setting | `index.lifecycle.name` 비어 있음, `index.lifecycle.rollover_alias` 비어 있음 |
| data disk | total 약 1007GB, available 약 919GB, use 4% |

replica 1개가 단일 node에서 `UNASSIGNED`라 cluster health가 yellow다. 이는 현재 관측값이며 설정은 변경하지 않았다.

### logging-service와 Docker

| 항목 | 실측 |
|---|---|
| logging-service memory limit | 1GiB |
| memory reservation | 512MiB |
| logging-service stats(16:40:39) | 307.3MiB / 1GiB, 30.01% |
| RabbitMQ stats snapshot | 62.52MiB / 7.718GiB |
| Elasticsearch stats snapshot | 612.4MiB / 7.718GiB |
| consumer concurrency | 명시적 `concurrency`/container factory 설정 없음; 현재 Rabbit consumer 1개 관측 |
| Docker local volumes | 총 54개, 2.758GB 사용, 2.259GB reclaimable (`docker system df`) |
| ES data mount | 919GB available, 4% used |
| host C: | 62.9GB free |
| host D: | 91.6GB free |

`docker stats` CPU는 순간 snapshot이며 부하 한계치가 아니다. 16:40:39 snapshot에서 RabbitMQ 24.51%, Elasticsearch 0.71%, logging-service 0.26%였다.

소스에는 listener별 `spring.rabbitmq.listener.simple.*`, `concurrency`, `prefetch` 설정이 없다. 현재 prefetch 250은 RabbitMQ consumer runtime 관측값이다. 최대 처리량·ES bulk 처리량·지속 가능한 초당 이벤트 수는 부하 생성 없이 측정 불가다.

## ④ 보존 정책

### Elasticsearch

`GET /_ilm/policy`는 Elasticsearch 기본 ILM 정책들을 반환했지만, `samhan-audit-logs`의 `in_use_by.indices`는 비어 있었다. 해당 index 설정도 `index.lifecycle.name=""`, `rollover_alias=""`이고, `GET /_cat/aliases`에는 alias가 없으며 `GET /_data_stream`은 `data_streams=[]`였다.

따라서 클러스터에 기본 ILM 정책은 존재하지만 **`samhan-audit-logs`에는 ILM·롤오버·삭제 수명이 연결되어 있지 않다.** `AuditLog.java`의 “ILM / aliases에 의존, monthly rolling later” Javadoc은 런타임 적용 상태를 의미하지 않는다.

### logging-service

`services/logging-service/src/main/java` 및 `application.yml`에서 보존 기간 property, ES delete-by-query, purge scheduler, rollover 작업은 발견되지 않았다. logging-service는 고정 index `samhan-audit-logs`에 저장한다.

### 서비스별 감사 테이블

로컬 PostgreSQL의 `information_schema.tables`를 read-only 조회했다. `audit/history/revision` 이름을 가진 테이블은 다음과 같았다.

- accounting: `accounting_audit_logs`
- arologis: `arologis_audit_logs`, `arologis_role_change_history`, `dispatch_save_history`
- dc-config: `dc_config_audit_logs`
- groupware: `groupware_audit_logs`, `document_template_revisions`
- inventory: `inventory_audit_logs`, `inventory_audit_lines`, `inventory_audits`, `inventory_audit_number_sequences`, `dps_save_history`
- notification: `notification_audit_logs`, `dispatch_sms_save_history`
- partner: `partner_audit_logs`, `partner_credit_history`, `partner_revisions`
- partner-order: `partner_order_audit_logs`, `partner_order_history`, `partner_order_revisions`
- product: `product_audit_logs`, `price_history`
- slip: `slip_audit_logs`, `estimate_revisions`, `slip_line_correction_audits`, `slip_publish_audit`, `slip_revisions`, `slip_signature_audit`, `slip_cleanup_save_history`
- user: `employee_signature_audit`, `role_change_history`, `user_audit_logs`
- auth, dashboard, partner-auth, logging_db: 이름 기준 감사/history/revision 테이블 없음

전 서비스 소스에서 일반 감사 테이블에 대한 retention/cleanup/purge 구현은 확인되지 않았다. 예외적으로 slip-service의 `CompensationRetentionScheduler`는 보상 실패 행만 대상으로 하는 별도 정책이다(`services/slip-service/src/main/java/.../CompensationRetentionScheduler.java:22-47`). 중앙 audit 테이블이나 logging-service index의 보존 정책은 아니다.

## ⑤ 실패 시 동작

### 현재 발행 상태

`services`에서 logging-service를 제외하고 `samhan.audit.exchange`, `AuditLogEvent`, `RabbitTemplate`, `convertAndSend`, audit publisher를 grep했으며 hit는 0건이었다. 따라서 현재 실제 publisher는 없고, 발행 실패율은 측정 불가다.

### consumer 실패 경로

- `RabbitConfig`는 durable exchange/queue/DLX/DLQ와 queue의 dead-letter exchange/routing key만 선언한다(`RabbitConfig.java:29-68`).
- `AuditLogConsumer.consume`는 `repository.save(entry)`를 동기 호출한다(`AuditLogConsumer.java:30-50`).
- `RuntimeException`을 catch해 error log를 남긴 뒤 다시 throw한다(`AuditLogConsumer.java:53-55`).
- 저장 실패 시 DLQ로 보낸다는 주석과 DLX 선언은 있으나, listener `default-requeue-rejected` 정책을 application 설정에서 명시한 부분은 없다. 실제 ES 오류를 주입하지 않았으므로 “실패 1건이 DLQ에 도착하는가”는 측정 불가다.
- DLQ에는 현재 consumer 0개이고, `samhan.audit.dlq`를 소비하거나 운영자에게 알리는 별도 코드·Prometheus rule은 grep에서 발견되지 않았다.

### consumer 중단·ES 지연

- consumer가 중단되었을 때의 실제 backlog 증가량은 서비스 중단을 수반하므로 이번 read-only 임무에서는 측정하지 않았다. 현재 queue의 durable 설정과 현재 `max-length/TTL` 부재만 확인했다.
- ES 저장은 listener 처리 스레드 안의 동기 `repository.save`다. ES 응답이 느려지는 fault injection은 수행하지 않았으므로 실제 block 시간·재전달 횟수·처리량 저하는 측정 불가다. 코드상 저장 호출이 반환될 때까지 해당 consumer 처리가 진행되지 않는다.
- 최근 1시간 logging-service 로그에서 `failed to persist audit log event`는 관측되지 않았다. 관측된 WARN은 S1 HTTP JSON probe의 malformed body 1건이며 Rabbit/ES consumer 실패가 아니다.

## 측정 불가 항목 요약

1. 운영 환경의 실제 사용자 트래픽·기간별 업무 API 요청 수: 현재 연결된 대상은 local Prometheus뿐이고 gateway route label도 일부 `UNKNOWN`.
2. 화면 최초 open 1회당 GET 수: 보존 trace가 상호작용 시나리오 단위라 최초 open 경계가 없음.
3. 지속 가능한 RabbitMQ 초당 이벤트 처리량과 logging-service/ES의 포화점: 부하 발생 금지로 측정하지 않음.
4. ES 장애·느린 응답 시 consumer block/requeue/DLQ 도착 결과: 실패 주입 금지로 측정하지 않음.
5. consumer 중단 시 backlog 증가율과 큐가 disk로 paging되는 시점: 서비스 중단 금지로 측정하지 않음.

이 보고서는 수치·측정 방법·관측 결과만 기록하며 부하 설계나 완화안은 포함하지 않는다.
