# SP-D4 배포 순서 — auth-service 우선 + 7 도메인 서비스 롤링

> 작성일: 2026-05-18
> 대상: SP-D4 통합 PR 머지 후 로컬(Docker Compose) 또는 Phase 11 AWS 환경 배포 시 준수 순서
> 원칙: auth-service (V10 Flyway) 먼저 → 7 도메인 서비스 순차 롤링

---

## §1 배포 원칙

SP-D4 는 **Flyway V10 migration(154 seed row) 이 auth-service 에 집중**되어 있으며, 7 도메인 서비스는 auth-service 의 `/auth/admin/permissions` API 를 런타임에 호출한다. 따라서:

1. **auth-service 먼저 배포** — V10 seed row 적용 완료 후 도메인 서비스 배포 시작.
2. **순차 롤링** — 서비스별 1분 smoke test 간격 확보.
3. **RoleGuard 보존** — PermissionGuard deny 시에도 RoleGuard 통과면 서비스 정상 응답. 배포 중 순간 403 최소화.

---

## §2 배포 전 사전 점검

```powershell
# V10 SQL 파일 존재 확인
if (Test-Path "services\auth-service\src\main\resources\db\migration\V10__sp_d4_remaining_domains_page_permissions.sql") {
    Write-Host "[OK] V10 파일 확인"
} else {
    Write-Host "[FAIL] V10 파일 없음 — 배포 중단"
    exit 1
}

# Docker Compose 스택 상태 확인
docker compose -f infrastructure/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}"
```

---

## §3 배포 순서 상세

### Step 1. auth-service 배포 (V10 Flyway 실행)

auth-service 는 기동 시 `spring.flyway.enabled=true` + `locations: classpath:db/migration` 설정으로 **자동으로 V10 migration 을 실행**한다.

```
[배포 명령 예시 — 로컬 Docker Compose]
docker compose -f infrastructure/docker-compose.yml up -d auth-service
```

배포 후 검증:

```powershell
# 1) auth-service health check
$authHealth = Invoke-RestMethod -Uri "http://localhost:8081/actuator/health" -Method GET
if ($authHealth.status -eq "UP") {
    Write-Host "[OK] auth-service UP"
} else {
    Write-Host "[FAIL] auth-service 상태 이상 — 배포 중단"
    exit 1
}

# 2) V10 seed row 154 확인
$env:PGPASSWORD = "samhan_dev_pw"
psql -h localhost -p 5432 -U samhan -d auth_db `
    -c "SELECT COUNT(*) FROM role_page_permissions WHERE created_by = 'sp-d4-v10' AND is_deleted = FALSE;"
# 기대: 154

# 3) 신규 PageCode API 응답 확인 (estimates.list 대표 검증)
$resp = Invoke-RestMethod `
    -Uri "http://localhost:8081/auth/admin/permissions/check?roleCode=MASTER&pageCode=estimates.list" `
    -Headers @{ "Authorization" = "Bearer $env:SAMHAN_ADMIN_TOKEN" } `
    -Method GET
Write-Host "canView=$($resp.canView) canEdit=$($resp.canEdit)"
# 기대: canView=true, canEdit=true
```

---

### Step 2. 7 도메인 서비스 순차 롤링

auth-service UP + V10 seed 154 row 확인 후 아래 순서대로 배포. 각 서비스 배포 후 **1분 대기 + health + smoke test** 실시.

#### 2-a. slip-service (estimate 관련)

```powershell
docker compose -f infrastructure/docker-compose.yml up -d slip-service
Start-Sleep -Seconds 60
$h = Invoke-RestMethod -Uri "http://localhost:8082/actuator/health"
if ($h.status -eq "UP") { Write-Host "[OK] slip-service" } else { Write-Host "[WARN] slip-service 이상" }
# smoke: 견적 목록 endpoint (MASTER 토큰)
# GET /api/slips/estimates?page=0&size=1
```

#### 2-b. partner-order-service (거래처주문 관련)

```powershell
docker compose -f infrastructure/docker-compose.yml up -d partner-order-service
Start-Sleep -Seconds 60
$h = Invoke-RestMethod -Uri "http://localhost:8091/actuator/health"
if ($h.status -eq "UP") { Write-Host "[OK] partner-order-service" } else { Write-Host "[WARN] partner-order-service 이상" }
# smoke: 거래처주문 목록 endpoint
# GET /api/partner-orders?page=0&size=1
```

#### 2-c. inventory-service (재고 관련)

```powershell
docker compose -f infrastructure/docker-compose.yml up -d inventory-service
Start-Sleep -Seconds 60
$h = Invoke-RestMethod -Uri "http://localhost:8086/actuator/health"
if ($h.status -eq "UP") { Write-Host "[OK] inventory-service" } else { Write-Host "[WARN] inventory-service 이상" }
# smoke: 창고 목록 endpoint
# GET /api/warehouses?page=0&size=1
```

#### 2-d. user-service (직원/계정 관련)

```powershell
docker compose -f infrastructure/docker-compose.yml up -d user-service
Start-Sleep -Seconds 60
$h = Invoke-RestMethod -Uri "http://localhost:8083/actuator/health"
if ($h.status -eq "UP") { Write-Host "[OK] user-service" } else { Write-Host "[WARN] user-service 이상" }
# smoke: 직원 목록 endpoint
# GET /api/admin/employees?page=0&size=1
```

#### 2-e. partner-service (거래처 관련)

```powershell
docker compose -f infrastructure/docker-compose.yml up -d partner-service
Start-Sleep -Seconds 60
$h = Invoke-RestMethod -Uri "http://localhost:8087/actuator/health"
if ($h.status -eq "UP") { Write-Host "[OK] partner-service" } else { Write-Host "[WARN] partner-service 이상" }
# smoke: 거래처 목록 endpoint
# GET /api/partners?page=0&size=1
```

#### 2-f. product-service (상품 관련)

```powershell
docker compose -f infrastructure/docker-compose.yml up -d product-service
Start-Sleep -Seconds 60
$h = Invoke-RestMethod -Uri "http://localhost:8084/actuator/health"
if ($h.status -eq "UP") { Write-Host "[OK] product-service" } else { Write-Host "[WARN] product-service 이상" }
# smoke: 상품 목록 endpoint
# GET /api/products?page=0&size=1
```

#### 2-g. arologis-service (아로로지스 배차/지역 관련)

```powershell
docker compose -f infrastructure/docker-compose.yml up -d arologis-service
Start-Sleep -Seconds 60
$h = Invoke-RestMethod -Uri "http://localhost:8100/actuator/health"
if ($h.status -eq "UP") { Write-Host "[OK] arologis-service" } else { Write-Host "[WARN] arologis-service 이상" }
# smoke: 아로로지스 배차 관리 endpoint
# GET /api/arologis/admin/dispatches?page=0&size=1
```

---

## §4 전체 롤링 완료 후 최종 검증

```powershell
# 모든 서비스 health 일괄 확인
$services = @(
    @{ name = "auth-service";         port = 8081 },
    @{ name = "slip-service";         port = 8082 },
    @{ name = "partner-order-service"; port = 8091 },
    @{ name = "inventory-service";    port = 8086 },
    @{ name = "user-service";         port = 8083 },
    @{ name = "partner-service";      port = 8087 },
    @{ name = "product-service";      port = 8084 },
    @{ name = "arologis-service";     port = 8100 }
)

foreach ($svc in $services) {
    $uri = "http://localhost:$($svc.port)/actuator/health"
    try {
        $resp = Invoke-RestMethod -Uri $uri -Method GET -TimeoutSec 10
        $status = $resp.status
    } catch {
        $status = "UNREACHABLE"
    }
    Write-Host "$($svc.name): $status"
}
```

기대 출력:
```
auth-service: UP
slip-service: UP
partner-order-service: UP
inventory-service: UP
user-service: UP
partner-service: UP
product-service: UP
arologis-service: UP
```

---

## §5 롤링 도중 장애 시 대응

| 장애 단계 | 증상 | 조치 |
|---|---|---|
| auth-service V10 migrate 실패 | 서비스 기동 중단, Flyway `FlywayException` | `sp-d4-v10-rollback.sql` 실행 후 재시도 |
| auth-service UP 후 도메인 서비스 403 급증 | permission_guard_denied_total spike | Grafana 알람 확인, `sp-d4-grafana-alarm-relax.md` 참조 |
| 특정 도메인 서비스 기동 실패 | health DOWN | 해당 서비스만 재시작, auth-service 는 유지 |
| 배포 중 사용자 403 | 점진 grant 부족 (합법 403) | RoleGuard 보존으로 자동 fallback, 48h 내 grant 분석 후 정상화 |

---

## §6 참조

- `docs/operational-validation/sp-d4-v10-dry-run.md` — V10 dry-run 상세 절차
- `docs/operational-validation/sp-d4-v10-rollback.sql` — 롤백 SQL
- `docs/operational-validation/sp-d4-grafana-alarm-relax.md` — 알람 임계 완화 가이드
- `docs/planning/2026-05-18_sp-d4-remaining-pages-permission-migration.md` §7
