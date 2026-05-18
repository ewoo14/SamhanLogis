# SP-D5 DevOps 영향 보고서

슬라이스: PermissionGuard 단일화 + Counter.builder + AOP  
작성일: 2026-05-19  
작성자: DevOps agent

---

## 1. shared/security build.gradle 의존성 점검

### 현재 상태 (BE 팀 사전 반영)

`shared/security/build.gradle` 에는 SP-D5 에서 필요한 의존성이 이미 추가되어 있다.

| 의존성 | scope | 용도 |
|---|---|---|
| `io.micrometer:micrometer-core` | `api` | Counter.builder (permission_guard_denied_total) |
| `org.springframework:spring-aop` | `api` | PermissionAspect @Around 위빙 런타임 |
| `org.aspectj:aspectjweaver` | `api` | AspectJ 위빙 런타임 |
| `org.springframework.boot:spring-boot-starter-aop` | `testImplementation` | 테스트 컨텍스트 AOP 자동 설정 |
| `io.micrometer:micrometer-registry-prometheus` | `testImplementation` | 테스트 MeterRegistry |

### 충돌 점검

- `spring-aop` + `aspectjweaver` 는 Spring Boot BOM 관리 버전이므로 소비자 service 와 버전 충돌 없음.
- `micrometer-core` 는 기존 각 service 의 `micrometer-registry-prometheus` 가 이미 전이적으로 포함하므로 중복 선언이 아닌 명시적 공개 api 노출 목적의 선언이다. 소비자 service 에서 별도 추가 불필요.
- `spring-boot-starter-aop` 는 testImplementation 에만 있으므로 소비자 service 의 런타임에 영향 없음. 소비자 service 가 이미 `spring-boot-starter-web` 또는 `spring-boot-starter` 를 가지면 AOP auto-configuration 은 자동으로 활성된다.

### 결론

추가 수정 불필요. BE 팀이 올바르게 반영하였다.

---

## 2. Prometheus scrape 현황

### 전체 17 service actuator/prometheus 노출 현황

`management.endpoints.web.exposure.include` 에 `prometheus` 포함 여부를 점검하였다.

| service | 포트 | prometheus 노출 |
|---|---|---|
| api-gateway | 8080 | 포함 |
| auth-service | 8081 | 포함 |
| logging-service | 8082 | 포함 |
| user-service | 8083 | 포함 |
| product-service | 8084 | 포함 |
| inventory-service | 8085 | 포함 |
| slip-service | 8086 | 포함 |
| accounting-service | 8087 | 포함 |
| partner-order-service | 8088 | 포함 |
| dc-config-service | 8089 | 포함 |
| partner-auth-service | 8091 | 포함 |
| groupware-service | 8092 | 포함 |
| notification-service | 8093 | 포함 |
| dashboard-service | 8094 | 포함 |
| partner-service | 8095 | 포함 |
| arologis-service | 8097 | 포함 |
| eureka-server | 8761 | 포함 |

누락 service: 없음. 전 service prometheus 노출 확인.

### Prometheus scrape_configs 정합

`infrastructure/prometheus/prometheus.yml` 의 scrape_configs 에는 위 17개 service 가 모두 등록되어 있다. `permission_guard_denied_total` 은 각 service 의 `/actuator/prometheus` 에서 노출되므로 별도 scrape 설정 추가 불필요.

---

## 3. Grafana 대시보드 신규

### 파일

`infrastructure/grafana/provisioning/dashboards/permission-guard-denied.json`

### 패널 구성

| 패널 | 쿼리 | 타입 | 위치 |
|---|---|---|---|
| Panel 1 — 전체 deny rate (1m) | `sum(rate(permission_guard_denied_total[1m]))` | timeseries | row 0, w=24 |
| Panel 2 — service 별 deny rate (1m) | `sum by (service)(rate(...[1m]))` | timeseries | row 1, w=12 |
| Panel 3 — role 별 top 10 | `topk(10, sum by (role)(increase(...[$__range])))` | barchart | row 1, w=12 |
| Panel 4 — page 별 top 10 | `topk(10, sum by (page)(increase(...[$__range])))` | barchart (horizontal) | row 2, w=12 |
| Panel 5 — action x service rate (1m) | `sum by (action, service)(rate(...[1m]))` | timeseries | row 2, w=12 |

### datasource UID

`PROMETHEUS_DS` — 기존 `arologis-slip-bridge.json` 과 동일한 placeholder UID 사용.  
Grafana provisioning 시 datasource name `Prometheus` 로 resolve 된다 (`infrastructure/grafana/provisioning/datasources/prometheus.yml` 참조).

### tag

`permission`, `rbac`, `security`, `sp-d5`

### 갱신 주기

`refresh: 30s`, 기본 조회 범위 `now-1h ~ now`, timezone `Asia/Seoul`.

---

## 4. CI 영향

### 변경 내용

`.github/workflows/ci.yml` 의 `push` / `pull_request` 양쪽 `paths-ignore` 에 아래 항목 추가:

```
- 'infrastructure/grafana/**'
```

### 이유

Grafana 대시보드 JSON 은 BE 빌드+테스트와 무관하다. 대시보드 변경만으로 7-group build-and-test matrix (약 25분 wall-clock) 가 실행되는 것은 비효율이므로 paths-ignore 로 제외한다.

### 미적용 대상

- `arologis-ci.yml` 은 `paths` (포함 목록) 기반이므로 `infrastructure/grafana/**` 를 트리거 paths 에 추가하지 않으면 자동으로 제외된다. 별도 수정 불필요.
- `workflow_dispatch` (수동 트리거) 는 paths-ignore 무시 — 수동 전체 실행 시 정상 동작.

### Grafana JSON 검증 별도 job

현 단계에서는 별도 lint/validate job 을 추가하지 않는다. 이유:

1. Grafana provisioning 자체가 컨테이너 기동 시 JSON 파싱 후 실패 로그를 출력하므로 로컬 docker-compose 기동으로 즉시 확인 가능.
2. grafana-cli 또는 jq JSON 구문 검증 job 추가는 향후 infrastructure 검증 강화 슬라이스 (Phase 11 cutover 전)에서 검토.

---

## 5. 환경변수 영향

`PermissionGuardMetrics` 는 Micrometer `MeterRegistry` bean 을 주입받으며, 별도 환경변수를 사용하지 않는다. 따라서:

- `infrastructure/env-templates/` 수정 불필요
- `.env.dev-seed` 수정 불필요
- docker-compose 수정 불필요

---

## 6. 로컬 대시보드 확인 절차

```powershell
# 인프라 기동 (Grafana 포함)
.\infrastructure\scripts\start-local-full.ps1

# Grafana 접속
# http://localhost:3000
# admin / admin (초기값)
# SamhanLogis 폴더 → "SP-D5 Permission Guard Denied" 대시보드 확인
```

서비스가 기동된 상태에서 의도적으로 권한 없는 페이지에 접근하면  
`permission_guard_denied_total` 카운터가 증가하고 패널에 반영된다.
