# MIG-23 Local 6 Client Direct Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-command local verification stack so the development lead can directly open all Samhan Public and Arologis clients against a local backend.

**Architecture:** Keep the base infra compose file as the infra source of truth and add a local-all overlay for Eureka, gateway, and the 14 Spring services. The launcher builds bootJar artifacts, starts Docker Compose, waits for health checks, and opens all client dev servers with explicit local API environment variables.

**Tech Stack:** Docker Compose, Spring Boot bootJar runtime images, PowerShell/Bash launchers, npm/Expo/Electron/Vite local dev servers.

---

### Task 1: Compose Overlay

**Files:**
- Create: `infrastructure/docker/spring-service.Dockerfile`
- Create: `infrastructure/docker-compose.local-all.yml`

- [x] Add a generic Spring Boot runtime Dockerfile that copies a host-built jar and runs it with Temurin JRE.
- [x] Add `docker-compose.local-all.yml` with Eureka, api-gateway, and 14 service containers.
- [x] Mount `docs/migration/ecount-data/raw` read-only and `logs/local-stack` writable into service containers.
- [x] Expose infra and service ports needed for direct local testing.

### Task 2: Client Local Scripts

**Files:**
- Create: `scripts/run-client-local-dev.cjs`
- Modify: `clients/*/package.json`
- Modify: `clients/web/*/package.json`

- [x] Add a small Node runner that injects local API URLs per client.
- [x] Add `local-dev` scripts for desktop, mobile, mobile-staff, web estimate, web order, design-system, arologis-desktop, and arologis-mobile.
- [x] Pin local web ports to 5174, 5175, and 5176 to avoid desktop renderer conflict.

### Task 3: Launchers

**Files:**
- Create: `scripts/launch-local-stack.ps1`
- Create: `scripts/launch-local-stack.sh`

- [x] Build all service bootJar artifacts unless skipped.
- [x] Run `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build`.
- [x] Health-check postgres, Eureka, gateway, auth, and dashboard.
- [x] Start all client dev servers in parallel and print direct URLs.

### Task 4: Seed Script

**Files:**
- Create: `scripts/seed-local-stack.ps1`

- [x] Login with existing `dev_master` Flyway seed and register five local test credentials.
- [x] Verify 14 service actuator health endpoints after Flyway startup.
- [x] Trigger MIG-1 through MIG-11 reimport endpoints with idempotent source hash behavior.
- [x] Document `ROLE_STAFF` and `ROLE_DRIVER` as local requested-role labels mapped to current backend roles (`SALES`, `DISPATCH`) until the backend role enum is expanded.

### Task 5: Documentation

**Files:**
- Create: `docs/local-stack/README.md`
- Create: `docs/dev-reports/mig-23-local-6-client-direct-test.md`
- Modify: `migration/decisions/DECISIONS.md`
- Modify: `docs/handoff/CURRENT-WORK.md`
- Modify: `docs/samhan-public-overview.html`

- [x] Add the one-command start guide, URL/port matrix, credential table, and troubleshooting.
- [x] Record D-MIG-23-01 through D-MIG-23-07.
- [x] Add five direct verification scenarios across the client set.
- [x] Update handoff and overview status for Phase 10.6 MIG-23.

### Task 6: Verification

**Commands:**
- `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml config --quiet`
- Client typecheck/build commands where local dependencies are present.

- [ ] Run compose YAML syntax verification.
- [ ] Run practical client checks and record any environment blockers.
- [ ] Commit and push the branch.
