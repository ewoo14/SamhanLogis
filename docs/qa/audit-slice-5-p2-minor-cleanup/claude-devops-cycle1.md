# DevOps Cycle 1 리뷰 — Audit Slice 5 P2 Minor Cleanup

작성일: 2026-05-19
리뷰어: DevOps Agent (Claude)
검증 범위: DevOps 3건 (prometheus.yml / arologis-service.env / notification-gateway.json)

---

## 1. prometheus.yml — scrape target 18개 확인

**파일**: `infrastructure/prometheus/prometheus.yml`

**검증 방법**: `job_name` 키 카운트 + YAML 파싱 (python yaml.safe_load)

**결과**: PASS

- YAML 파싱 성공 (구문 오류 없음)
- `scrape_configs` 내 job 총 18개 확인:
  `prometheus` (자체) + `eureka-server` / `api-gateway` / `auth-service` / `logging-service` / `groupware-service` / `notification-service` / `dashboard-service` / `user-service` / `product-service` / `inventory-service` / `slip-service` / `accounting-service` / `partner-order-service` / `dc-config-service` / `partner-auth-service` / `partner-service` / `arologis-service`
- line 103 주석 "18 scrape target (prometheus 자체 포함)" 기재 내용과 실제 job 수 일치
- `arologis-service` job은 line 104 신규 추가, target `arologis-service:8097` / `metrics_path: /actuator/prometheus` 표준 패턴 일관

**판정**: 이상 없음

---

## 2. arologis-service.env — GPS_PRIORITY 중복 정리

**파일**: `infrastructure/env-templates/arologis-service.env`

**검증 방법**: `GPS_PRIORITY` 및 `GPS_STALE_THRESHOLD` 키워드 전체 파일 검색

**결과**: PASS

- `SAMHAN_AROLOGIS_GPS_PRIORITY` 실제 변수 선언: line 83 **단 1회** (`insung-lbs,app-gps,manual`)
- `SAMHAN_AROLOGIS_GPS_STALE_THRESHOLD_MS` 실제 변수 선언: line 84 **단 1회** (`60000`)
- line 91~93: 구 "Phase 10 W10-1 GPS 하이브리드 priority" 섹션은 주석 `[P2 중복 정리]` 안내문만 남기고 실제 변수 선언 제거됨 — 중복 없음
- SP-10-2 인성데이타 vendor 섹션(line 66~84)이 단일 선언 위치로 통합된 구조 정합

**판정**: 이상 없음

---

## 3. notification-gateway.json — Grafana 대시보드 4 panel

**파일**: `infrastructure/grafana/provisioning/dashboards/notification-gateway.json`

### 3-1. schemaVersion / uid

- `schemaVersion: 39` — permission-guard-denied.json 기준값(39)과 일치 (PASS)
- `uid: "notification-gateway-send"` — 대시보드 내 고유값, 타 대시보드와 충돌 없음 (PASS)

### 3-2. PROMETHEUS_DS uid 일관성

- 모든 datasource 블록: `"type": "prometheus"` + `"uid": "PROMETHEUS_DS"` — 4 panel 및 타겟 전체 일관 (PASS)

### 3-3. PromQL 정확성

| Panel | PromQL | 평가 |
|---|---|---|
| Panel 1 채널별 rate | `sum by (channel) (rate(notification_gateway_send_total[1m]))` | `{channel}` 레이블 분리 정확. rate 1m 적절 |
| Panel 2 성공률 | `sum by (channel) (increase(...{result="success"}[$__range])) / sum by (channel) (increase(...[$__range]))` | `$__range` 사용으로 대시보드 시간 범위 연동. 분모 0 시 `NaN` 발생 가능하나 Grafana 기본 처리 허용 범위 |
| Panel 3 실패 top 5 | `topk(5, sum by (channel) (increase(...{result="failure"}[$__range])))` | `result="failure"` label selector 정확. metric 명칭 `notification_gateway_send_total` 일관 |
| Panel 4 success/failure 시계열 | `sum by (result) (rate(notification_gateway_send_total[1m]))` | `{result}` 레이블로 success/failure 분기. 시계열 비교 목적 부합 |

모든 PromQL이 지정 metric `notification_gateway_send_total{channel, result}` 를 정확히 참조함 (PASS)

### 3-4. gridPos 충돌 검사

| Panel id | h | w | x | y |
|---|---|---|---|---|
| 1 | 8 | 24 | 0 | 0 |
| 2 | 8 | 12 | 0 | 8 |
| 3 | 8 | 12 | 12 | 8 |
| 4 | 8 | 24 | 0 | 16 |

- row y=0: panel 1 전폭(w=24) 단독 — 충돌 없음
- row y=8: panel 2 (x=0~11) + panel 3 (x=12~23) — 합계 w=24, 충돌 없음
- row y=16: panel 4 전폭(w=24) 단독 — 충돌 없음
- 전체 gridPos 겹침 없음 (PASS)

### 3-5. permission-guard-denied.json 패턴 일관

- annotations 구조, `"liveNow": false`, `"graphTooltip": 0`, `"fiscalYearStartMonth": 0`, `"id": null`, `"refresh": "30s"`, `"timezone": "Asia/Seoul"` — 모두 기준 파일과 일치 (PASS)

**판정**: 이상 없음

---

## 종합 판정

| 항목 | 판정 |
|---|---|
| prometheus.yml — 18 scrape target | PASS |
| arologis-service.env — GPS_PRIORITY 단일 선언 | PASS |
| notification-gateway.json — 4 panel 구조/PromQL/gridPos | PASS |

결함 없음. Cycle 2 진입 불필요.
