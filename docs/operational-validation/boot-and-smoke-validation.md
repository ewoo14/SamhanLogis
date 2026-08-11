# 항목 6 — 로컬 모든 service 부팅 + 동작 검증

> **선행 산출물** — `infrastructure/scripts/start-local-full.ps1` (14 service 부팅, PR-D commit `d7a201b` 가 step 1/6 MinIO bucket 추가)
> **본 문서** — 부팅 후 모든 service 헬스 + 주요 endpoint smoke test 절차
> **자동화** — `tools/operational-validation/run-smoke-tests.ps1`

---

## 1. 부팅 절차

### 1-1. 기본 부팅 (인프라 + 14 service)

```powershell
.\infrastructure\scripts\start-local-full.ps1
```

step 0~6 자동 수행:
- 0) Pre-flight (java / docker / port 점유)
- 1) docker-compose up -d (postgres + redis + rabbitmq + ES + minio + monitoring)
- 1a) PostgreSQL `max_connections` ≥ 200 사전 검증 (W10-6)
- 2) `.env.dev-seed` 환경변수 일괄 로드
- 3) 14 service 의존순 sequential startup + health-gated (W10-5)
- 4) 종합 health 요약
- 5) 시드 데이터 row count psql 검증
- 6) 사용 가이드 출력

### 1-2. 추가 service (14 service 외)

start-local-full.ps1 에 포함되지 않은 service:
- dc-config-service (port 8089) — 항목 4 (DC CSV import) 사전 의존
- logging-service (port 8082) / partner-auth-service — 본 검증 단계에서는 선택

logging-service 선택 기동 (기본 `docker-compose.yml`에는 계속 포함되지 않음):

```powershell
./gradlew.bat :services:logging-service:bootJar
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps logging-service
```

위 명령은 이미 기동 중인 RabbitMQ·Elasticsearch·Eureka를 재생성하지 않고
logging-service만 올린다. local-all overlay를 명시하지 않은 기본 기동은 기존과
동일하게 logging-service를 생성하지 않는다. 이 PC에서는 influxd가 host 8086을
점유하므로 slip-service는 기존 local portfix로 host 8186을 사용하며, logging-service는
host 8082가 미점유여서 내부 포트와 같은 8082를 사용한다.

수동 기동 (필요 시):

```powershell
.\gradlew.bat :services:dc-config-service:bootRun --console=plain
```

---

## 2. smoke test 자동화

```powershell
.\tools\operational-validation\run-smoke-tests.ps1
```

스크립트 동작:
1. 14 service `/actuator/health` 200 검증
2. dc-config-service (port 8089) `/actuator/health` 200 검증 (선택)
3. kimmiseon 로그인 → JWT 발급
4. 주요 endpoint smoke test:
   - `GET /api/v1/users/me` (user-service via gateway)
   - `GET /api/v1/products?page=0&size=10` (product-service)
   - `GET /api/v1/inventory/balances?page=0&size=10` (inventory-service)
   - `GET /api/v1/slips?page=0&size=10` (slip-service)
   - `GET /api/v1/partners/admin?page=0&size=10` (partner-service)
   - `GET /api/v1/notifications?page=0&size=10` (notification-service)
   - `GET /api/v1/dashboard/kpi/today` (dashboard-service)
5. 종합 결과 표 + 합격/불합격 판정

---

## 3. 합격 기준

| 항목 | 기대 결과 | 합격 |
| ---- | --------- | ---- |
| 14 service `/actuator/health` | 모두 200 + `{"status":"UP"}` | ✅ |
| dc-config-service health (선택) | 200 + UP | ✅ (또는 SKIP 명시) |
| kimmiseon 로그인 | HTTP 200 + accessToken 발급 | ✅ |
| 7 endpoint smoke test | 모두 200 (시드 부재 시 200 + empty page 허용) | ✅ |
| Eureka registry | 모든 service 등록 | ✅ |

---

## 4. 트러블슈팅

| 증상 | 원인 | 해결 |
| ---- | ---- | ---- |
| 특정 service `/actuator/health` 503 | 의존 service down (Eureka / DB / Redis) | `.local-logs/<service>.log` tail |
| auth-service down → user-service cascade fail | OrgChartSeeder createAccount RPC fail (W10-5) | start-local-full.ps1 의 health-gated startup 의무 — 재기동 |
| `FATAL: too many clients already` (PG) | `max_connections=100` (default) | docker-compose.yml `postgres.command` 에 `-c max_connections=300` (이미 적용됨, W10-6) |
| 8086 port 충돌 | InfluxDB 점유 | slip-service `$env:SERVER_PORT=8186` 후 재기동 |
| Eureka registry 일부 누락 | service 가 Eureka 보다 먼저 시작 | start-local-full.ps1 의 tier 순서 의무 |
| Gradle build fail (한글 경로) | JDK 17 @argfile 인코딩 한계 | 영문 경로 (`C:\dev\SamhanLogis`) 권장 |

---

## 5. AWS 진입 (Phase 11) 영향

- production EC2 에서는 systemd unit 또는 docker-compose 로 14 service 부팅
- 본 항목 = **로컬에서 100% smoke green 확인 의무** — production 에서 회귀 발견 시 cutover 롤백 비용 큼
- Phase 11 cutover PR 의 health probe = 본 smoke test 의 endpoint 재활용 (CloudWatch / Lambda Health Check)

---

## 6. 검증 완료 시 update

`docs/operational-validation/README.md` 의 §2 진행 상황 chart 의 항목 6 을 ✅ + 검증 일자 + 14 service 모두 UP / 7 endpoint 모두 200 비고에 명시.
