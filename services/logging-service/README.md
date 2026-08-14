# logging-service

Central audit log sink for SamhanLogis MSA (Phase 1, project plan §3.7).

- **Port**: `8082`
- **Depends on**: Elasticsearch, RabbitMQ (Eureka for discovery)

## RabbitMQ topology

| Kind     | Name                     | Notes                              |
| -------- | ------------------------ | ---------------------------------- |
| Exchange | `samhan.audit.exchange`  | topic, durable                     |
| Queue    | `samhan.audit.queue`     | bound with pattern `audit.#`       |
| DLX      | `samhan.audit.dlx`       | topic                              |
| DLQ      | `samhan.audit.dlq`       | catches failed messages            |

Producers publish `AuditLogEvent` JSON with routing key `audit.<topic>`
(e.g. `audit.slip`, `audit.account.login`).

## Elasticsearch

- Index: `samhan-audit-logs` (fixed name; monthly rolling is left to ES
  ILM / aliases — see Javadoc on `AuditLog` for the SpEL trade-off note).

## Environment variables

| Var              | Default                       |
| ---------------- | ----------------------------- |
| `ES_URI`         | `http://localhost:9200`       |
| `RABBIT_HOST`    | `localhost`                   |
| `RABBIT_PORT`    | `5672`                        |
| `RABBIT_USER`    | 필수 환경변수                 |
| `RABBIT_PASSWORD`| 필수 환경변수                |
| `EUREKA_URL`     | `http://localhost:8761/eureka/` |

## REST endpoints

Authorization is enforced upstream at the API gateway (role MASTER or
MANAGER). This service trusts the gateway and does not re-check.

- `GET /logs/by-service/{serviceName}?page=&size=` — paged search by service
- `GET /logs/by-user/{userId}?page=&size=` — paged search by user
- `GET /logs/search?action=&fromInstant=&toInstant=&page=&size=` — search by action and time window

All endpoints return `ApiResponse<Page<AuditLog>>`.

## Profiles

- (default) — connects to real Elasticsearch / RabbitMQ / Eureka.
- `local` — disables ES + RabbitMQ + Eureka autoconfig so the app can
  boot for code editing without those services running. Integration
  tests still need the real services (or testcontainers).

## Build & run

```bash
./gradlew :services:logging-service:bootJar
docker build -t samhan/logging-service:0.1.0 services/logging-service
```
