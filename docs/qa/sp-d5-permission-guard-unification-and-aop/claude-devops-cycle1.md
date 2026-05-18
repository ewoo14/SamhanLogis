# SP-D5 DevOps 리뷰 — Claude cycle 1

슬라이스: PermissionGuard 단일화 + Counter.builder + AOP
작성일: 2026-05-19
작성자: DevOps agent (Claude cycle 1)

---

## 총평

5개 검증 항목 중 결함 2건 확인. FIX 판정.

---

## 검증 결과

### 1. shared/security/build.gradle 의존성

spring-aop, aspectjweaver, micrometer-core 모두 `api` scope 로 선언되어 있다.
Spring Boot BOM 관리 하에 버전을 명시하지 않으므로 소비자 service 와 버전 충돌 없음.
micrometer-core 는 각 service 의 micrometer-registry-prometheus 가 전이 의존으로 이미 포함하나, shared:security 의 공개 API 로 명시적으로 노출하는 것은 올바른 패턴이다.
spring-boot-starter-aop 가 testImplementation 에만 있고 production scope 에는 spring-aop + aspectjweaver 로 분리된 점도 정상이다.

**결과: 이상 없음**

### 2. Grafana 대시보드 JSON 검증

**결함 D-1 (Minor): datasource.uid 미선언 — Grafana provisioning 오류 위험**

`prometheus.yml` datasource 파일에 `uid` 필드가 없다.

```yaml
datasources:
  - name: Prometheus
    type: prometheus
    # uid 필드 없음
```

Grafana 8+ 에서는 `uid` 미선언 시 자동 생성 UUID 를 부여한다. 대시보드 JSON 이 `"uid": "PROMETHEUS_DS"` 로 하드코딩된 경우, 실제 provisioning 된 datasource 의 UID 와 불일치하면 패널이 "datasource not found" 오류를 표시한다.

기존 `arologis-slip-bridge.json` 도 동일한 `PROMETHEUS_DS` 를 사용하므로 현 환경에서 동작 중이라면 이미 우회 메커니즘이 있는 것이나, Grafana provisioning 에서 `uid: PROMETHEUS_DS` 를 datasource YAML 에 명시하지 않으면 불안정하다.

수정 필요 위치: `infrastructure/grafana/provisioning/datasources/prometheus.yml` 에 `uid: PROMETHEUS_DS` 추가.

**Panel 3 / Panel 4 PromQL — barchart 에서 `$__range` 사용 주의**

`topk(10, sum by (role) (increase(permission_guard_denied_total[$__range])))` 에서 `$__range` 는 Grafana 변수로, instant query (`"instant": true`) 에서는 정상 동작한다. 단, `$__range` 는 Grafana 8.3+ 에서 지원하며 현재 docker-compose 의 Grafana 11.3 기준 정상. 구조 자체는 문제 없음.

**gridPos 충돌 검토:** Panel 1 (y=0, h=8), Panel 2/3 (y=8, h=8), Panel 4/5 (y=16, h=8) — 겹침 없음. 정상.

**schemaVersion: 39** — Grafana 11 호환. 정상.

**결과: D-1 결함 1건 (Minor)**

### 3. ci.yml paths-ignore

push 와 pull_request 양쪽 `paths-ignore` 에 `infrastructure/grafana/**` 가 추가되어 있다.
arologis-ci.yml 은 `paths` 포함 목록 기반이므로 별도 수정 불필요.
workflow_dispatch 는 paths-ignore 미적용 — 명세대로.
다른 workflow (arologis-ci.yml) 에 대한 부작용 없음.

**결과: 이상 없음**

### 4. 17 service /actuator/prometheus 노출

prometheus.yml scrape_configs 직접 확인 결과: eureka-server, api-gateway, auth-service, logging-service, groupware-service, notification-service, dashboard-service, user-service, product-service, inventory-service, slip-service, accounting-service, partner-order-service, dc-config-service, partner-auth-service, partner-service, arologis-service — 17개 전부 등록됨.

devops-impact.md 의 표와 실제 prometheus.yml 간 불일치 없음.

**결함 D-2 (Minor): devops-impact.md 표에 서비스 수 오류**

devops-impact.md 섹션 2 표에는 17개 service 가 나열되어 있으나 실제 prometheus.yml 에는 eureka-server 포함 17개이다. 표 자체 행 수는 17행으로 맞다. 단, devops-impact.md 의 설명 "15 scrape target" 주석(prometheus.yml 라인 103)과 현재 실제 17개 사이의 불일치가 prometheus.yml 주석에 남아 있다. 문서 오류이며 운영 영향은 없다.

수정 필요 위치: `infrastructure/prometheus/prometheus.yml` 라인 103 주석 "15 scrape target" → "17 scrape target" 으로 갱신.

**결과: D-2 결함 1건 (Minor)**

### 5. devops-impact.md 5 섹션 완성도

1번(build.gradle), 2번(prometheus), 3번(grafana), 4번(CI), 5번(환경변수) + 6번(로컬 확인 절차) 구성. 5개 필수 섹션 모두 완성. 로컬 확인 절차 추가는 가산점.

**결과: 이상 없음**

---

## 결함 목록

| 번호 | 심각도 | 위치 | 내용 |
|---|---|---|---|
| D-1 | Minor | `infrastructure/grafana/provisioning/datasources/prometheus.yml` | `uid: PROMETHEUS_DS` 미선언 — Grafana 재기동 시 datasource UID 불일치 위험 |
| D-2 | Minor | `infrastructure/prometheus/prometheus.yml` 라인 103 주석 | "15 scrape target" 구식 주석 (실제 17개) |

---

## 판정

**FIX** — D-1 결함이 Grafana provisioning 안정성에 직접 영향을 주므로 수정 후 재검토 필요.
D-2 는 문서/주석 수정으로 운영 영향 없으나 함께 정리 권장.
