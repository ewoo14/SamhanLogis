# MIG-21 마이그레이션 운영 대시보드

> 날짜: 2026-05-21
> 브랜치: `spec/2026-05-21-mig-21-migration-ops-dashboard`
> 범위: Micrometer 지표 + dashboard-service endpoint + desktop admin 화면 + Grafana JSON

## 변경 요약

| 영역 | 변경 |
|---|---|
| accounting-service | `MigOpsMetricsRecorder` 추가, 재import 실행 결과를 Micrometer counter/gauge로 기록 |
| dashboard-service | `/dashboard/ecount-mig` controller 추가, gateway 기준 `/api/v1/dashboard/ecount-mig`로 노출 |
| clients/desktop | 회계 관리자 `운영 대시보드` 메뉴와 6카드 `MigOpsDashboardPage` 추가, React Query 5분 polling |
| auth-service | `ECOUNT_MIG_OPS_DASHBOARD` PageCode와 V27 seed 추가 |
| observability | Grafana JSON 8패널 + 알림 기준 + import README 추가 |

## 결정

| 결정 | 내용 |
|---|---|
| D-MIG-21-01 | Micrometer counter는 base name으로 등록하고 Prometheus exporter의 `_total` suffix를 actuator 노출명으로 사용한다. |
| D-MIG-21-02 | dashboard-service는 accounting-service `/actuator/prometheus` text를 조회해 운영 DTO로 파싱한다. |
| D-MIG-21-03 | desktop 화면은 dashboard-service API만 호출하고 accounting-service actuator를 직접 호출하지 않는다. |
| D-MIG-21-04 | 회계 관리자 메뉴에 `운영 대시보드`를 추가하고 동적 RBAC `ecount.mig.ops-dashboard` view 권한으로 가드한다. |
| D-MIG-21-05 | 권한 seed는 MASTER/MANAGER view+edit, ACCOUNTANT view-only로 둔다. |
| D-MIG-21-06 | Grafana JSON은 metric 1:1 패널 8개와 rejected/diff/reimport fail 알림 기준을 문서화한다. |
| D-MIG-21-07 | PM 자율 연속 마지막 슬라이스로 기록하고, 완료 후 D 단계에서 사용자 결정 대기 상태로 멈춘다. |

## 검증

- RED:
  - `MigOpsMetricsRecorderTest`, `EcountMigOpsDashboardServiceTest`, `PageCodeTest` 추가 후 신규 class/enum 미존재 컴파일 실패 확인.
- GREEN:
  - `./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.MigOpsMetricsRecorderTest :services:dashboard-service:test --tests com.samhanair.logis.dashboard.service.EcountMigOpsDashboardServiceTest :services:auth-service:test --tests com.samhanair.logis.auth.domain.PageCodeTest --no-daemon` PASS.
  - `npm.cmd run typecheck` PASS.
- 최종 통합:
  - `./gradlew :services:accounting-service:test :services:dashboard-service:test :services:auth-service:test :shared:common:test --no-daemon` PASS.
  - `npm.cmd run typecheck` PASS.
  - `npm.cmd run lint` PASS. 기존 warning 2건(`api/mock.ts`, `PurchaseSlipPrintPage.tsx`) 유지.
  - `npm.cmd run build` PASS. 기존 Pretendard runtime font resolve warning 유지.

## 운영 메모

- Prometheus에 노출되는 counter sample 이름은 `ecount_mig_imported_total`처럼 `_total` suffix가 붙는다.
- `/actuator/prometheus`는 `X-Internal-Token`으로 보호한다. dashboard-service는 scrape 시 같은 token을 첨부한다.
- dashboard-service가 accounting-service actuator 조회에 실패하면 빈 지표로 fail-soft 하며 `dashboard_accounting_scrape_failures_total`을 증가시킨다.

## Cycle 1c 보완

| 항목 | 처리 |
|---|---|
| HIGH | Aging materialized view refresh 직후 net receivable/payable gauge 기록, MIG-11 DailyClosing diff gauge 기록, MIG-2~11 accounting importer/transform 결과 counter 기록, accounting Prometheus actuator 내부 토큰 가드 적용 |
| medium | `/dashboard/ecount-mig` ACCOUNTANT view 허용, Grafana rejected ratio/reimport FAIL alert 표현식 보강, desktop API numeric type 정합, Prometheus parser/recorder/security guard 테스트 추가 |
| low | `/admin/dashboard/ecount-mig` 중복 controller 제거, dashboard accounting scrape failure counter + error log 추가 |

### Cycle 1c 검증

- `./gradlew :services:accounting-service:test :services:dashboard-service:test --no-daemon` PASS.
- `./gradlew :services:accounting-service:test :services:dashboard-service:test :services:auth-service:test :shared:common:test --no-daemon` PASS.
- `npm.cmd run typecheck` PASS.
- `npm.cmd run build` PASS. 기존 Pretendard runtime font resolve warning 유지.
