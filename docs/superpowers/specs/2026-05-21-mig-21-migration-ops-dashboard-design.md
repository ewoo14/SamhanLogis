# MIG-21 마이그레이션 운영 대시보드 — Design Spec

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-21-migration-ops-dashboard`
> 입력: **PM 자율 연속 마지막 슬라이스** (D 멈춤 직전)

## 개요

MIG-20 머지 후 PM 자율 연속 진행 마지막 — **I 마이그레이션 운영 대시보드** (큰 슬라이스).

- baseline: MIG-1~20 머지
- 옵션 C 21단계 + Codex 전체 권한
- 머지 후 → **D 도달, PM 자율 연속 멈춤 + 사용자 결정 대기**

## 대시보드 구성

### 메트릭 (Micrometer / Prometheus)

| 메트릭 | 타입 | 라벨 | 의미 |
|---|---|---|---|
| `ecount_mig_transform_status_total` | Counter | slice, status (PENDING/TRANSFORMED/REJECTED) | 변환 결과 분포 |
| `ecount_mig_imported_total` | Counter | slice | 누적 imported |
| `ecount_mig_rejected_total` | Counter | slice, errorCode | 누적 rejected + errorCode |
| `ecount_daily_closing_diff_count` | Gauge | closing_kind, source_kind | 일별 mismatch 건수 |
| `ecount_aging_snapshot_net_receivable_total` | Gauge | — | aging net 매출채권 합계 |
| `ecount_aging_snapshot_net_payable_total` | Gauge | — | aging net 매입채무 합계 |
| `ecount_reimport_runs_total` | Counter | slice, status (SUCCESS/SKIP/FAIL) | 자동 재import 이력 |
| `ecount_reimport_files_scanned_total` | Counter | slice | 스캔된 파일 수 |

### Grafana 대시보드 JSON

`docs/observability/grafana-mig-ops-dashboard.json`:
- 패널 8개 (위 메트릭 1:1 매핑)
- 시계열 라인 차트 + heatmap + 표
- 알림 (transform REJECTED 비율 > 5% / DailyClosing diff > 100건 / reimport FAIL)

### dashboard-service 통합

기존 `services/dashboard-service` 의 KPI 메트릭에 마이그레이션 메트릭 추가:
- `/api/v1/dashboard/ecount-mig` endpoint
- React 화면 (MASTER/MANAGER 전용)

## 산출 예정 (25~40 file, 약 1~2K LOC)

| 영역 | 변경 |
|---|---|
| accounting-service | MeterRegistry 메트릭 7종 추가 (각 importer/transform service 에 inject) |
| dashboard-service | /api/v1/dashboard/ecount-mig endpoint + React 화면 |
| docs/observability/ | grafana-mig-ops-dashboard.json + README (Grafana 설정 가이드) |
| clients/desktop | MigOpsDashboardPage.tsx 신규 (admin 8 메뉴 추가) |
| auth-service V27 | PageCode ECOUNT_MIG_OPS_DASHBOARD 1종 + role_page_permissions |
| dev-report + DECISIONS | D-MIG-21-01~05 |

## 결정 (D-MIG-21-XX)

- D-MIG-21-01 Micrometer 메트릭 7종 + Prometheus export (기존 actuator)
- D-MIG-21-02 Grafana JSON 정의 (docs/observability/)
- D-MIG-21-03 dashboard-service endpoint 통합 (KPI 패턴 일관)
- D-MIG-21-04 clients/desktop MigOpsDashboardPage (admin 8 메뉴, MASTER/MANAGER 전용)
- D-MIG-21-05 V27 auth PageCode ECOUNT_MIG_OPS_DASHBOARD 1종
- D-MIG-21-06 옵션 C 21단계 + Codex 전체 권한
- D-MIG-21-07 PM 자율 연속 마지막 슬라이스 — 머지 후 D 도달, 사용자 결정 대기

🤖 PM Claude — 2026-05-21
