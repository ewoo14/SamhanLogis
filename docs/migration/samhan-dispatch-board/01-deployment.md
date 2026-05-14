# 01 — 배포 가이드 (Phase A — Samhan Public 배차 메뉴 + 아로로지스 발송)

> 작성: 2026-05-14 — DevOps Team
> 근거: [spec §3 / §6 / §8](../../superpowers/specs/2026-05-14-samhan-dispatch-board-design.md), [plan DO1](../../superpowers/plans/2026-05-14-samhan-dispatch-board.md)
> 대상: Samhan Public (`slip-service`) ↔ 아로로지스 (`arologis-service`) 신규 service-to-service 통신.

---

## 1. 개요

Phase A 슬라이스는 두 service 간 신규 HTTP REST 호출 2건을 추가합니다.

| # | 방향 | endpoint | 변수 (호출자 측) |
|---|---|---|---|
| 1 | slip → arologis | `POST /internal/arologis/dispatches` | `SAMHAN_AROLOGIS_DISPATCH_URL` |
| 2 | arologis → slip | `POST /internal/slip/dispatch-tasks/{id}/confirm` 또는 `/unavailable` | `SAMHAN_SLIP_DISPATCH_TASK_URL` |

추가로 Phase A only: arologis 측 Mock matcher 실패 확률 토글 `SAMHAN_AROLOGIS_MOCK_FAIL_RATE` (0.0=항상 성공, 1.0=항상 실패).

호출 보안 = 기존 표준 `X-Internal-Token: ${SAMHAN_INTERNAL_TOKEN}` 헤더 재사용 (신규 토큰 없음).

---

## 2. 환경변수 의무 (양 service 공통)

### 2.1 slip-service 측 (`infrastructure/env-templates/slip-service.env`)

```bash
SAMHAN_INTERNAL_TOKEN=<공유, 기존>
SAMHAN_AROLOGIS_DISPATCH_URL=http://arologis-service:8097   # 아로로지스 발송 URL
```

### 2.2 arologis-service 측 (`infrastructure/env-templates/arologis-service.env`)

```bash
SAMHAN_INTERNAL_TOKEN=<공유, 기존>
SAMHAN_SLIP_DISPATCH_TASK_URL=http://slip-service:8086     # 슬립 배차 회신 URL
SAMHAN_AROLOGIS_MOCK_FAIL_RATE=0.0                          # 0.0=항상 성공 / 1.0=항상 실패
```

> **포트 주의**:
> - `slip-service` 실 port = **8086** (application.yml `${SERVER_PORT:${SAMHAN_SLIP_PORT:8086}}`).
> - `arologis-service` 실 port = **8097** (application.yml `${SAMHAN_AROLOGIS_PORT:8097}`).
> - plan 본문의 `8084` 는 plan 작성 단계 오기 — 실제 코드/yaml 값 8086 을 따른다.

### 2.3 cafe24 / EC2 운영 (`/opt/samhan/.env`, `/opt/arologis/.env`)

운영 환경에서는 컨테이너 host-name 그대로 사용 (같은 `samhan-net` docker network 내부 DNS).

```bash
# /opt/samhan/.env (slip-service 컨테이너)
SAMHAN_AROLOGIS_DISPATCH_URL=http://arologis-service:8097

# /opt/arologis/.env (arologis-service 컨테이너)
SAMHAN_SLIP_DISPATCH_TASK_URL=http://slip-service:8086
SAMHAN_AROLOGIS_MOCK_FAIL_RATE=0.0
```

> **로컬 개발 (bootRun)**: `http://arologis-service:8097` 대신 `http://localhost:8097` / `http://localhost:8086` 으로 override (Docker DNS 미사용).

---

## 3. docker-compose 갱신

### 3.1 `infrastructure/docker/docker-compose.arologis.yml`

`arologis-service.environment` block 에 신규 2 변수 추가됨:

```yaml
services:
  arologis-service:
    environment:
      # ... (기존 SAMHAN_AROLOGIS_DB_* / EUREKA_* / SAMHAN_INTERNAL_TOKEN)
      SAMHAN_SLIP_DISPATCH_TASK_URL: ${SAMHAN_SLIP_DISPATCH_TASK_URL:-http://slip-service:8086}
      SAMHAN_AROLOGIS_MOCK_FAIL_RATE: ${SAMHAN_AROLOGIS_MOCK_FAIL_RATE:-0.0}
```

기본값 (Docker compose `${VAR:-default}` 패턴) 으로 `/opt/arologis/.env` 누락 시도 default 동작 (DEV 가정).

### 3.2 slip-service 의 docker-compose

slip-service 는 현재 `infrastructure/docker-compose.yml` 의 application service block 으로 정의되어 있지 않습니다 (인프라 컨테이너 = postgres / redis / rabbitmq / es / minio / prometheus / grafana / nginx 만). slip-service 는 다음 둘 중 하나로 실행:

1. **로컬**: `./gradlew :services:slip-service:bootRun` (PowerShell `infrastructure/scripts/start-local-full.ps1` 자동 포함).
2. **EC2 운영 (Phase 11)**: 별도 systemd 유닛 또는 도커 컨테이너 (인프라 별도 PR).

→ 본 슬라이스에서 slip-service 의 docker-compose 정의 자체는 변경 없음. 환경변수는 위 §2.1 의 `slip-service.env` 템플릿이 진실 원본.

### 3.3 network

양 service 같은 `samhan-net` (external) bridge network — docker DNS 로 `arologis-service` / `slip-service` host-name 직접 해결 (Eureka 미경유). Network 변경 0.

---

## 4. Eureka 등록 확인 (선택)

양 service 가 같은 Eureka 에 등록되어 있지만, Phase A 통신은 **환경변수 URL 우선** (FeignClient 가 아닌 RestClient). Eureka 는 단지 dashboard 가시성 + Phase 11 D-AX-08 discovery 분리 결정 의존성.

```bash
# Eureka dashboard
curl -fsS http://eureka-server:8761/eureka/apps | grep -E 'SLIP-SERVICE|AROLOGIS-SERVICE'

# 또는 로컬
curl -fsS http://localhost:8761/eureka/apps | grep -E 'SLIP-SERVICE|AROLOGIS-SERVICE'
```

기대: 양 service 각각 `<application name="SLIP-SERVICE">` + `<application name="AROLOGIS-SERVICE">` 1건 이상.

---

## 5. 양 service health check (배포 직후)

### 5.1 자체 actuator health

```bash
# slip-service
curl -fsS http://localhost:8086/actuator/health
# 기대: {"status":"UP", ... }

# arologis-service
curl -fsS http://localhost:8097/actuator/health
# 기대: {"status":"UP", ... }
```

### 5.2 docker compose health

```bash
docker compose -f infrastructure/docker/docker-compose.arologis.yml ps
# arologis-service 의 STATUS 컬럼이 "Up X minutes (healthy)" 인지 확인.
```

---

## 6. Service-to-service 통신 검증 (smoke)

### 6.1 slip → arologis (발송 경로)

samhan-net 내부에서 arologis 의 발송 endpoint 가 slip-service container 시점에 해석되는지:

```bash
# slip-service container 내부에서 실행
docker compose -f infrastructure/docker-compose.yml exec slip-service \
  curl -fsS -X POST http://arologis-service:8097/actuator/health
# 기대: HTTP 200 {"status":"UP", ...}

# 또는 같은 host EC2 에서 (network 외부)
curl -fsS http://localhost:8097/actuator/health   # arologis port 직접
```

> 실 endpoint `/internal/arologis/dispatches` 는 `X-Internal-Token` + `ROLE_MASTER` 가드 → smoke 검증은 actuator 로 충분.

### 6.2 arologis → slip (회신 경로)

```bash
docker compose -f infrastructure/docker/docker-compose.arologis.yml exec arologis-service \
  curl -fsS http://slip-service:8086/actuator/health
# 기대: HTTP 200
```

### 6.3 e2e dispatch flow (Mock matcher = 항상 성공)

QA 시나리오 5 (spec §7.4 5번) 동일:

1. 배차담당자 로그인 → `/dispatch-board` → 미배차 슬립 drag
2. [배차 완료] 클릭 → 확인 dialog
3. slip-service 로그: `POST /internal/arologis/dispatches → 200`
4. arologis-service 로그: `MockDriverMatcher → matched=true`
5. arologis-service 로그: `POST /internal/slip/dispatch-tasks/{id}/confirm → 200`
6. slip-service 로그: `DispatchTask.status = DISPATCHED`
7. DB 검증:
   ```bash
   docker exec -it samhan-postgres psql -U samhan -d slip_db \
     -c "SELECT task_code, status FROM dispatch_task ORDER BY created_at DESC LIMIT 1;"
   # 기대: status = DISPATCHED
   ```

### 6.4 Mock matcher 실패 시뮬레이션 (QA 시나리오 6)

```bash
# arologis-service .env 한시 수정
SAMHAN_AROLOGIS_MOCK_FAIL_RATE=1.0

# arologis 컨테이너 재시작
docker compose -f infrastructure/docker/docker-compose.arologis.yml restart arologis-service

# 배차 완료 시도 → 회신 = /unavailable → DispatchTask.status = FAILED, Slip.dispatchStatus = UNDISPATCHED 복귀
# 검증 후 원복:
SAMHAN_AROLOGIS_MOCK_FAIL_RATE=0.0
docker compose -f infrastructure/docker/docker-compose.arologis.yml restart arologis-service
```

---

## 7. 롤백 (DevOps 범위)

본 슬라이스 DevOps 산출만 회수 (BE/FE 회수는 spec §7.5 참고):

```bash
# 1. arologis-service env 회수 (2 변수)
#    /opt/arologis/.env 에서 다음 2줄 제거:
#      SAMHAN_SLIP_DISPATCH_TASK_URL=...
#      SAMHAN_AROLOGIS_MOCK_FAIL_RATE=...
# 2. arologis docker-compose 회수 (git revert 또는 environment block 수동 제거)
git revert <commit-hash>
# 3. arologis 컨테이너 재시작
docker compose -f infrastructure/docker/docker-compose.arologis.yml up -d --force-recreate arologis-service
# 4. slip-service env 회수 (1 변수, SAMHAN_AROLOGIS_DISPATCH_URL 제거)
# 5. slip-service 재시작 (bootRun 또는 systemd)
```

회수 시간: ~5분 (양 service 환경변수 제거 + 재시작).

---

## 8. CI workflow 변경 0

Phase A 슬라이스는 기존 path filter 그대로 트리거:

- `services/slip-service/**` 변경 → `.github/workflows/ci.yml` (slip-service group) 자동 트리거.
- `services/arologis-service/**` 변경 → `.github/workflows/arologis-ci.yml` 자동 트리거.

추가 path 등록 필요 없음. infrastructure/env-templates/`*.env` + docker-compose.yml 변경은 `paths-ignore` 매칭 X → ci.yml 일반 빌드 트리거.

---

## 9. Phase 11 (AWS) 영향

- ALB / Route 53 / RDS 변경 0 — 본 슬라이스는 컨테이너 내부 service-to-service 만.
- ACM 변경 0 — 외부 노출 endpoint 추가 없음.
- AWS Secrets Manager: `SAMHAN_INTERNAL_TOKEN` 만 기존 secret 재사용. 신규 secret 0.
- 비용 영향: 0원 (월 ₩405K 유지).

---

## 10. 체크리스트 (배포 직전 의무)

- [ ] `infrastructure/.env.example` 갱신 확인 (3 변수)
- [ ] `infrastructure/env-templates/slip-service.env` 갱신 확인 (1 변수)
- [ ] `infrastructure/env-templates/arologis-service.env` 갱신 확인 (2 변수)
- [ ] `infrastructure/docker/docker-compose.arologis.yml` 갱신 확인 (2 변수 environment block 추가)
- [ ] `/opt/samhan/.env` + `/opt/arologis/.env` 운영 환경변수 설정 (cafe24 / EC2)
- [ ] 양 service health UP 확인 (§5)
- [ ] e2e dispatch flow smoke (§6.3) 1건 PASS
- [ ] (선택) Mock 실패 시뮬레이션 (§6.4) 1건 검증 후 원복
- [ ] Eureka dashboard 양 service 등록 확인 (§4)

---

## 11. 부록 — 신규 변수 요약

| 변수 | 측 | 기본값 | 운영값 |
|---|---|---|---|
| `SAMHAN_AROLOGIS_DISPATCH_URL` | slip-service | (env 의무) | `http://arologis-service:8097` |
| `SAMHAN_SLIP_DISPATCH_TASK_URL` | arologis-service | `http://slip-service:8086` (compose default) | 동일 |
| `SAMHAN_AROLOGIS_MOCK_FAIL_RATE` | arologis-service | `0.0` (compose default) | `0.0` (Phase A only — Phase B 시점 `SAMHAN_AROLOGIS_MATCHER_PROVIDER=insung-quick` 활성화로 무시) |
| `SAMHAN_INTERNAL_TOKEN` | 양 service | (기존, 변경 없음) | 기존 운영값 |
