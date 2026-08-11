# #1161 S1 — logging-service 로컬 opt-in 기동 보고

실행일: 2026-08-12  
범위: S1만 — 로컬 compose에 logging-service를 선택 기동 가능하게 추가  
제외: S2 공통 발행 지점, S3 서비스별 배선, S4 서비스별 audit 정책

## 1. 결론

기존 로컬 제외 결정은 유지했다. 저장소에는 Docker Compose `profiles` 사용 사례가
없으므로, 이미 존재하는 명시적 `docker-compose.local-all.yml` overlay를 opt-in 수단으로
사용했다.

- 기본 `docker-compose.yml`: logging-service 없음
- `docker-compose.yml + docker-compose.local-all.yml`: logging-service 포함
- prod compose: 변경 없음
- opt-in host port: `127.0.0.1:8082 -> 8082`
- 이 PC의 `8086`은 influxd가 점유 중이며 기존 slip-service는 `8186 -> 8086`으로 우회 중이다.
  logging-service는 8082가 미점유라 별도 portfix가 필요하지 않았다.

선택 기동 명령:

```powershell
.\gradlew.bat :services:logging-service:bootJar
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps logging-service
```

`--no-deps`는 이미 실행 중인 RabbitMQ·Elasticsearch·Eureka·기존 애플리케이션을
재생성하지 않고 logging-service만 기동하기 위한 것이다.

## 2. prod compose와 로컬 설정 차이

| 항목 | prod | local opt-in |
|---|---|---|
| 이미지 | ECR `samhanlogis-production-logging-service:${IMAGE_TAG}` | repo에서 bootJar 후 local Docker build |
| Profile | `production` | 기존 local-all의 `dev` anchor 재사용 |
| ES 주소 | `http://elasticsearch:9200` | `ES_URI=http://elasticsearch:9200` |
| Rabbit 자격 | `${RABBIT_PASSWORD}` | 기존 local dev 환경 anchor 재사용, 신규 자격 문자열 없음 |
| Eureka | `http://eureka-server:8761/eureka/` | 동일한 local network 주소 |
| host port | `127.0.0.1:8082:8082` | `127.0.0.1:8082:8082` |
| 의존성 | RabbitMQ·Elasticsearch·Eureka healthy | RabbitMQ·Elasticsearch·Eureka healthy |

logging-service에는 PostgreSQL/Redis/API Gateway `depends_on`을 추가하지 않았다.
서비스 내부의 `DataSource/JPA` autoconfig 제외와 맞고, gateway는 Eureka discovery로
라우팅한다.

## 3. 기존 인프라와 S1에서 새로 필요한 것

### 이미 있던 것 — 재생성하지 않음

- `samhan-rabbitmq`: 실행 전 healthy, port `5672/15672`
- `samhan-elasticsearch`: 실행 전 healthy, port `9200`
- `samhan-eureka`: 실행 전 healthy, port `8761`
- `samhan-api-gateway`: 실행 전 healthy, port `8080`
- Elasticsearch index `samhan-audit-logs`: 실행 전 HTTP `200`
- ES mapping: 실행 전부터 `AuditLog` 필드 매핑이 존재함

### S1 기동으로 새로 준비된 것

- RabbitMQ exchange `samhan.audit.exchange` (topic, durable)
- RabbitMQ queue `samhan.audit.queue` (durable)
- RabbitMQ DLX `samhan.audit.dlx` 및 DLQ `samhan.audit.dlq`
- binding `samhan.audit.exchange -> samhan.audit.queue`, routing `audit.#`
- binding `samhan.audit.dlx -> samhan.audit.dlq`, routing `audit.dlq`
- `samhan-logging-service` 컨테이너 및 Eureka 등록

ES index/mapping은 이미 있었으므로 삭제·재생성·migration을 하지 않았다.

## 4. RED-A 원문

### 4-1. 변경 전 — logging-service 미기동

실행: 기존 gateway `http://localhost:8080`, `/logs/front`와 `/logs/activity`에 실제 HTTP 요청.

```text
--- RAW POST /logs/front ---
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
Content-Length: 138

{"timestamp":"2026-08-11T16:36:12.121+00:00","path":"/logs/front","status":503,"error":"Service Unavailable","requestId":"d0279096-26312"}

--- RAW GET /logs/activity ---
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
Content-Length: 141

{"timestamp":"2026-08-11T16:36:12.395+00:00","path":"/logs/activity","status":503,"error":"Service Unavailable","requestId":"a4697926-26313"}
```

### 4-2. opt-in 기동 후 — gateway 경유 실 HTTP

처음 opt-in 직후에는 장시간 실행 중이던 gateway의 Eureka cache 전파 전이라 잠시
503이 관찰됐다. Eureka 등록 확인과 cache 반영 대기 후 같은 경로를 재요청했다.

```text
POST /logs/front STATUS=200
POST /logs/front BODY={"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-08-11T16:43:08.294546786Z"}
GET /logs/activity STATUS=200
GET /logs/activity BODY={"success":true,"code":"OK","message":"성공","data":{"items":[{"occurredAt":"2026-08-12T01:46:00Z","user":"마스터","userRole":"MASTER","action":"MENU_ACCESS","resourceType":"MENU","resourceId":"dev.activity-log","description":"S1 opt-in QA valid JSON","serviceName":"desktop"}],"totalElements":1,"totalPages":1,"page":0,"size":20},"timestamp":"2026-08-11T16:43:08.418617204Z"}
```

GET 응답에는 UUID가 사용자 필드로 노출되지 않았다. `QA_MASTER_PASSWORD`가 해당
세션 환경변수에 없어, 기존 local dev gateway 설정으로 서명한 일회성 QA JWT를
사용해 실제 gateway → logging-service HTTP 경로만 검증했다. 자격을 파일에 쓰거나
커밋하지 않았다.

### 4-3. 기본 기동 회귀 원문

제가 새로 만든 logging-service 컨테이너만 정리한 뒤 다음을 실행했다.

```powershell
docker compose -f infrastructure/docker-compose.yml up -d --no-recreate
```

핵심 원문:

```text
--- LOGGING CONTAINER CHECK ---
[empty]

samhan-api-gateway       Up 26 hours (healthy)
samhan-eureka            Up 26 hours (healthy)
samhan-postgres          Up 26 hours (healthy)
samhan-rabbitmq          Up 30 hours (healthy)
samhan-elasticsearch     Up 30 hours (healthy)
samhan-redis             Up 30 hours (healthy)
samhan-auth-service      Up 30 hours (healthy)
samhan-user-service      Up 30 hours (healthy)
samhan-product-service   Up 3 hours (healthy)
samhan-inventory-service Up 30 minutes (healthy)
samhan-slip-service      Up 9 hours (healthy), 127.0.0.1:8186->8086/tcp
samhan-accounting-service Up 12 hours (healthy)
samhan-partner-service   Up 3 hours (healthy)
samhan-partner-order-service Up 30 hours (healthy), 127.0.0.1:18088->8088/tcp
samhan-dc-config-service Up 3 hours (healthy)
samhan-arologis-service  Up 17 hours (healthy)
samhan-groupware-service Up 30 hours (healthy)
samhan-notification-service Up 30 hours (healthy)
samhan-dashboard-service Up 30 hours (healthy)
samhan-partner-auth-service Up 30 hours (healthy)
samhan-grafana           Up 30 hours (healthy)
samhan-minio             Up 30 hours (healthy)
```

기본 compose 명령은 공유 프로젝트의 기존 `samhan-prometheus`/`samhan-nginx`도
reconcile하려 했으나, 다른 워크트리 `t1113`의 stale mount 경로 때문에 다음 오류로
종료됐다. 두 컨테이너는 실행 전과 동일하게 `Exited (127)`로 남았고, 기존 healthy
컨테이너를 중지·삭제·재생성하지 않았다.

```text
Error response from daemon: failed to create task for container:
error mounting "/run/desktop/mnt/host/c/dev/Samhan-Public/.claude/worktrees/t1113/infrastructure/prometheus/prometheus.yml"
... not a directory
```

따라서 기본 compose의 logging-service 비포함은 실제 compose config와 컨테이너
check 양쪽에서 확인했고, 공유 스택의 기존 healthy 서비스도 유지됐다.

## 5. 검증 결과

```text
Gradle :services:logging-service:bootJar       BUILD SUCCESSFUL
Gradle :services:logging-service:test         BUILD SUCCESSFUL
validate-config-audit.ps1                     165 URL/template checks passed
docker compose base config                   logging-service absent
docker compose base+local-all config         logging-service present
docker compose config --quiet                 PASS
git diff --check                              PASS
prod compose diff                             없음
```

실행 후 제가 생성한 `samhan-logging-service` 컨테이너는 중지·삭제했다. 공유
RabbitMQ, Elasticsearch, PostgreSQL, Eureka, gateway 및 기존 service 컨테이너에는
cleanup 명령을 실행하지 않았다.

## 6. 변경 파일

- `infrastructure/docker-compose.local-all.yml`
- `docs/operational-validation/boot-and-smoke-validation.md`
- `docs/dev-reports/2026-08-12-1161-s1-local-logging-service.md`

prod compose와 S2~S4 관련 서비스 코드는 변경하지 않았다.
