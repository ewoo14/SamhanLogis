# SamhanLogis - Local Infrastructure Stack

Local Docker Compose stack for the SamhanLogis MSA platform. Phase 1 brings up
the **data services** (PostgreSQL, Redis, RabbitMQ, Elasticsearch, MinIO) and
the **monitoring stack** (Prometheus, Grafana, Nginx reverse-proxy stub) on a
single bridge network `samhan-net`.

> Credentials are loaded from `infrastructure/.env` (gitignored). Never reuse
> local values in staging or production environments.

`infrastructure/.env`가 없으면 `..\scripts\launch-local-stack.ps1 -SkipClients`가
placeholder를 로컬 랜덤값으로 교체하거나 기존 컨테이너 환경에서 조용히 복구합니다.
일부 키만 있는 `.env`는 시작하지 않고 누락 키를 안내합니다.

## Lifecycle

| Action | Command |
| ------ | ------- |
| Start  | `..\scripts\launch-local-stack.ps1 -SkipClients` |
| Stop   | `docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml down` |
| Wipe (remove volumes) | `docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml down -v` |
| Logs   | `docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml logs -f <service>` |
| Status | `docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml ps` |

## Connection Reference (DEV-ONLY)

### Data services

| Service | Host:Port | User | Password | Notes |
| ------- | --------- | ---- | -------- | ----- |
| PostgreSQL    | `localhost:5432`  | `samhan` | `infrastructure/.env` | 10 service DBs auto-created (see `postgres/init/`) |
| Redis         | `localhost:6379`  | -        | -               | No auth in dev |
| RabbitMQ AMQP | `localhost:5672`  | `samhan` | `infrastructure/.env` | |
| RabbitMQ UI   | http://localhost:15672 | `samhan` | `infrastructure/.env` | Management plugin |
| Elasticsearch | http://localhost:9200 | -    | -               | Security disabled (single-node) |
| MinIO API     | http://localhost:9000 | `samhan` | `infrastructure/.env` | S3-compatible |
| MinIO Console | http://localhost:9001 | `samhan` | `infrastructure/.env` | |

### Monitoring stack

| Service | Host:Port | User | Password | Notes |
| ------- | --------- | ---- | -------- | ----- |
| Prometheus | http://localhost:9090   | -       | -                 | Scrapes Spring Boot Actuator on samhan-net |
| Grafana    | http://localhost:3100   | `admin` | `infrastructure/.env`   | Container port 3000 mapped to host 3100 |
| Nginx HTTP | http://localhost:80     | -       | -                 | Stub reverse proxy (see below) |
| Nginx TLS  | `localhost:443`         | -       | -                 | Reserved; HTTP only in dev |

## Auto-provisioned PostgreSQL databases

Created on first container start (owned by `samhan`):

`auth_db`, `user_db`, `product_db`, `inventory_db`, `slip_db`,
`accounting_db`, `partner_db`, `groupware_db`, `dashboard_db`, `migration_db`.

Extensions `uuid-ossp` and `pgcrypto` are enabled in each DB
(see `postgres/init/02-extensions.sql`).

## Monitoring notes

- **Prometheus** scrapes `/actuator/prometheus` on `eureka-server:8761`,
  `api-gateway:8080`, `auth-service:8081`, `logging-service:8082` over the
  `samhan-net` bridge. Until those Phase-1 services are launched onto the
  network, Prometheus will report them as `down` — expected behaviour.
- **Grafana** auto-provisions Prometheus as the default datasource and loads
  any dashboard JSON dropped into
  `grafana/provisioning/dashboards/`. None are bundled yet — service teams
  add their dashboards as services come online.

### Alerting rules

알람의 1차 원천은 애플리케이션 상태 게이지(Prometheus pull 또는 운영 Micrometer
CloudWatch custom metric)이다. **로그(stdout/awslogs)를 alarm 원천으로 삼지 말 것.** 로그는 원인
조사와 보조 증거에만 사용한다. 로그 버퍼 유실·startup scrape race를 상태 게이지 알람으로
우회하지 않고, 매 scrape마다 DB 상태와 scheduler heartbeat를 다시 읽는다.

> **예외 — 상태 게이지가 구조적으로 못 잡는 순간 전이는 로그/카운터 기반 보조 알람을 유지한다**
> (#863 R1 BLOCKING-2). partner-order outbox 의 FAILED(영구실패)처럼 *터미널 상태로 전이하는
> 순간 관측 대상 집합에서 이탈하는* 사건은 상태 게이지(PENDING/PROCESSING 집계)로는 원천적으로
> 볼 수 없다 — 다음 scrape 시점엔 이미 사라진 뒤다. 이런 경우 로그 기반 metric filter(또는
> eager-등록 counter)를 **보조**로 유지한다(`infrastructure/terraform/monitoring.tf` 의
> `aws_cloudwatch_log_metric_filter.partner_order_outbox_failed_permanent` +
> `infrastructure/prometheus/rules/partner-order-outbox.yml` 의
> `PartnerOrderSlipPublishTerminalFailure`). "로그를 alarm 원천으로 삼지 말 것"은 로그를 **1차**
> 원천으로 쓰지 말라는 뜻이며, 게이지가 커버 못 하는 순간전이의 보조 백스톱까지 금지하지 않는다.

Alert rules live in `prometheus/rules/*.yml` and are picked up by the
`rule_files: [/etc/prometheus/rules/*.yml]` glob in `prometheus/prometheus.yml`.

> 🔴 **Trap — a rules mount added later does NOT reach an existing container.**
>
> `./prometheus/rules:/etc/prometheus/rules:ro` is a **directory bind, applied at container
> *create* time**. `prometheus.yml` is a bind-mounted *file*, so editing it and running
> `docker restart` works — but **adding the `rules` mount to `docker-compose.yml` does nothing
> for a container that already exists.**
>
> Worse: **Prometheus does not error when the `rule_files` glob matches zero files.** There is
> no signal in the logs, the healthcheck, or startup. The rule file sits in git, `promtool`
> passes, code review passes — and the alert simply **does not exist at runtime**.
>
> This actually happened: a container created `2026-07-02` never saw the rules mount added on
> `2026-07-15`, so `GET /api/v1/rules` returned `{"groups":[]}` for 13 days and **seven review
> rounds missed it** (#809 R8-DEVOPS-1).

**When you add or first introduce a rule file, recreate the container — `restart` is not enough:**

```bash
docker compose -p infrastructure --project-directory <repo>/infrastructure \
  -f docker-compose.yml -f docker-compose.local-all.yml \
  up -d --force-recreate --no-deps prometheus
```

**Always verify the rule is actually loaded — never assume:**

```powershell
.\scripts\verify-prometheus-rules.ps1     # exit 0 = every rule in git is live at runtime
```

The script diffs the rule files in git against the runtime `/api/v1/rules` list, checks each
rule's `health`, and runs `promtool`. It applies to **every** rule file added from now on, not
just the one that exposed the trap. Run it in each live-QA round — this class of defect is
invisible to static review by construction.

Manual equivalent:

```bash
curl -s http://localhost:9090/api/v1/rules   # {"groups":[]} == the alert does not exist
```

⚠️ A loaded rule is still not a firing rule — its selector must match a real scrape job. Check
that the metric exists with the expected `job` label:
`curl -s 'http://localhost:9090/api/v1/query?query=<metric_name>'`.

## Nginx reverse proxy

The Nginx container is **a stub today**. It serves only:

- `GET /healthz` -> `200 ok` (used by the container healthcheck)
- everything else -> `404`

Per-subdomain server blocks for `samhan-air.com` (plan §4 — `app.`, `api.`,
`auth.`, `admin.`, etc.) will be dropped into `nginx/conf.d/*.conf` and TLS
certificates wired in at deployment time. Dev runs HTTP only.

## File layout

```
infrastructure/
  docker-compose.yml
  .env.example
  README.md
  postgres/
    init/
      01-create-databases.sql
      02-extensions.sql
  prometheus/
    prometheus.yml
    rules/                       # alert rules (see "Alerting rules" above)
      slip-price-memory.yml
      partner-order-outbox.yml
  grafana/
    provisioning/
      datasources/prometheus.yml
      dashboards/dashboards.yml
  nginx/
    nginx.conf
    conf.d/.gitkeep
  scripts/
    verify-prometheus-rules.ps1  # asserts every rule in git is loaded at runtime
```
