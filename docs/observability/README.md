# Observability

## MIG-21 Grafana dashboard

1. accounting-service actuator Prometheus endpoint가 내부 토큰으로 보호되어 있는지 확인한다.
   - `GET http://<accounting-service>/actuator/prometheus`
   - header: `X-Internal-Token: <SAMHAN_INTERNAL_TOKEN>`
   - `management.endpoints.web.exposure.include=health,info,prometheus`
2. Prometheus scrape target에 accounting-service를 추가한다.
   - job 예시: `accounting-service`
   - metrics path: `/actuator/prometheus`
   - scrape header 또는 reverse proxy에서 `X-Internal-Token`을 주입한다.
3. Grafana에서 Prometheus data source를 추가한다.
   - URL 예시: `http://prometheus:9090`
   - access: Server
4. Grafana Dashboards → Import에서 `docs/observability/grafana-mig-ops-dashboard.json`을 업로드한다.
5. 알림 정책은 다음 기준으로 연결한다.
   - rejected 비율 > 5%
   - DailyClosing diff count > 100
   - reimport run status `FAIL` 발생

dashboard-service의 desktop 화면은 `/api/v1/dashboard/ecount-mig`를 통해 같은 Prometheus text를 읽어 운영자용 6개 카드로 요약한다.
accounting-service scrape 실패는 dashboard-service `dashboard_accounting_scrape_failures_total` counter와 error log로 남는다.
