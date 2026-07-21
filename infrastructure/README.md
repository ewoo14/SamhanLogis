# SamhanLogis - Local Infrastructure Stack

Local Docker Compose stack for the SamhanLogis MSA platform. Phase 1 brings up
the **data services** (PostgreSQL, Redis, RabbitMQ, Elasticsearch, MinIO) and
the **monitoring stack** (Prometheus, Grafana, Nginx reverse-proxy stub) on a
single bridge network `samhan-net`.

> All credentials in this directory are **DEV-ONLY**. Never reuse them in
> staging or production environments.

## Lifecycle

| Action | Command |
| ------ | ------- |
| Start  | `docker compose -f infrastructure/docker-compose.yml up -d` |
| Stop   | `docker compose -f infrastructure/docker-compose.yml down` |
| Wipe (remove volumes) | `docker compose -f infrastructure/docker-compose.yml down -v` |
| Logs   | `docker compose -f infrastructure/docker-compose.yml logs -f <service>` |
| Status | `docker compose -f infrastructure/docker-compose.yml ps` |

## Connection Reference (DEV-ONLY)

### Data services

| Service | Host:Port | User | Password | Notes |
| ------- | --------- | ---- | -------- | ----- |
| PostgreSQL    | `localhost:5432`  | `samhan` | `samhan_dev_pw` | 10 service DBs auto-created (see `postgres/init/`) |
| Redis         | `localhost:6379`  | -        | -               | No auth in dev |
| RabbitMQ AMQP | `localhost:5672`  | `samhan` | `samhan_dev_pw` | |
| RabbitMQ UI   | http://localhost:15672 | `samhan` | `samhan_dev_pw` | Management plugin |
| Elasticsearch | http://localhost:9200 | -    | -               | Security disabled (single-node) |
| MinIO API     | http://localhost:9000 | `samhan` | `samhan_dev_pw` | S3-compatible |
| MinIO Console | http://localhost:9001 | `samhan` | `samhan_dev_pw` | |

### Monitoring stack

| Service | Host:Port | User | Password | Notes |
| ------- | --------- | ---- | -------- | ----- |
| Prometheus | http://localhost:9090   | -       | -                 | Scrapes Spring Boot Actuator on samhan-net |
| Grafana    | http://localhost:3100   | `admin` | `samhan_dev_pw`   | Container port 3000 mapped to host 3100 |
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
