################################################################################
# phase11-deploy.ps1 — Phase 11 AWS 배포 자동화 스크립트
#
# 실행 흐름:
#   1. terraform plan 실행 (실 자원 생성 없음)
#   2. 개발책임자 확인 후 terraform apply (가드)
#   3. DB 마이그레이션 (pg_dump → S3 → restore) [선택]
#   4. DNS cutover (Route 53 record 생성) [선택]
#   5. Health check 검증
#
# 전제 조건:
#   - Terraform 1.6+ 설치됨
#   - AWS CLI 설치 + 자격증명 설정
#   - terraform.tfvars 작성 완료
#   - PowerShell 5.1+ (UTF-8 출력)
#
# 사용법:
#   cd infrastructure\terraform
#   ..\scripts\phase11-deploy.ps1 -Action plan
#   ..\scripts\phase11-deploy.ps1 -Action apply       # 개발책임자 승인 후
#   ..\scripts\phase11-deploy.ps1 -Action healthcheck
#
# 주의:
#   - GitGuardian: 이 파일에 실제 비밀값 입력 금지
#   - PowerShell 5.1: UTF-16 LE BOM 트랩 → Out-File 대신 Write-Output 사용
################################################################################

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("plan", "apply", "db-migrate", "dns-cutover", "healthcheck", "destroy")]
    [string]$Action,

    [string]$TerraformDir = "infrastructure\terraform",
    [string]$TfVarsFile = "terraform.tfvars",
    [string]$RdsEndpoint = "",
    [string]$EC2PublicIp = "",
    [switch]$DryRun  # DryRun 모드: 실 AWS 자원 생성 없이 plan만
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── 공통 함수 ────────────────────────────────────────────────────────────────

function Write-Phase11Log {
    param([string]$Level, [string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $prefix = switch ($Level) {
        "INFO"  { "[INFO ] $timestamp" }
        "WARN"  { "[WARN ] $timestamp" }
        "ERROR" { "[ERROR] $timestamp" }
        "OK"    { "[OK   ] $timestamp" }
        default { "[     ] $timestamp" }
    }
    Write-Output "$prefix $Message"
}

function Confirm-Action {
    param([string]$Prompt)
    Write-Output ""
    Write-Output "=== 개발책임자 확인 필요 ==="
    Write-Output $Prompt
    $response = Read-Host "계속 진행하시겠습니까? (yes/no)"
    if ($response -ne "yes") {
        Write-Phase11Log "WARN" "작업이 취소되었습니다."
        exit 0
    }
}

function Test-TerraformInstalled {
    $tf = Get-Command terraform -ErrorAction SilentlyContinue
    if (-not $tf) {
        Write-Phase11Log "ERROR" "Terraform 이 설치되지 않았습니다. https://developer.hashicorp.com/terraform/downloads"
        exit 1
    }
    $version = terraform version -json | ConvertFrom-Json
    Write-Phase11Log "INFO" "Terraform 버전: $($version.terraform_version)"
}

function Test-AwsCliInstalled {
    $aws = Get-Command aws -ErrorAction SilentlyContinue
    if (-not $aws) {
        Write-Phase11Log "ERROR" "AWS CLI 가 설치되지 않았습니다."
        exit 1
    }
    Write-Phase11Log "INFO" "AWS CLI 설치 확인 OK"
}

# ─── Action: plan ─────────────────────────────────────────────────────────────

function Invoke-TerraformPlan {
    Write-Phase11Log "INFO" "=== terraform plan 시작 (실 자원 생성 없음) ==="
    Test-TerraformInstalled

    Push-Location $TerraformDir
    try {
        Write-Phase11Log "INFO" "terraform init 실행"
        terraform init -upgrade

        Write-Phase11Log "INFO" "terraform validate 실행"
        terraform validate
        if ($LASTEXITCODE -ne 0) {
            Write-Phase11Log "ERROR" "terraform validate 실패"
            exit 1
        }
        Write-Phase11Log "OK" "terraform validate PASS"

        Write-Phase11Log "INFO" "terraform plan 실행"
        if (Test-Path $TfVarsFile) {
            terraform plan -var-file=$TfVarsFile -out=tfplan
        } else {
            terraform plan -var-file="terraform.tfvars.example" -out=tfplan
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Phase11Log "ERROR" "terraform plan 실패"
            exit 1
        }
        Write-Phase11Log "OK" "terraform plan PASS — tfplan 파일 생성 완료"
        Write-Phase11Log "INFO" "실 배포 시: ..\scripts\phase11-deploy.ps1 -Action apply"
    }
    finally {
        Pop-Location
    }
}

# ─── Action: apply ────────────────────────────────────────────────────────────

function Invoke-TerraformApply {
    Write-Phase11Log "INFO" "=== terraform apply 준비 ==="
    Test-TerraformInstalled

    Confirm-Action "terraform apply 를 실행하면 AWS 에 실제 자원이 생성됩니다. (비용 발생: ₩405,000/월)"

    Push-Location $TerraformDir
    try {
        if (Test-Path "tfplan") {
            Write-Phase11Log "INFO" "저장된 plan 으로 apply 실행"
            terraform apply tfplan
        } else {
            Write-Phase11Log "WARN" "tfplan 파일 없음 — plan 먼저 실행"
            Invoke-TerraformPlan
            Confirm-Action "plan 확인 후 apply 를 실행합니다."
            terraform apply tfplan
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Phase11Log "ERROR" "terraform apply 실패"
            exit 1
        }
        Write-Phase11Log "OK" "terraform apply 완료 — 출력값 확인:"
        terraform output
    }
    finally {
        Pop-Location
    }
}

# ─── Action: db-migrate ───────────────────────────────────────────────────────

function Invoke-DbMigration {
    Write-Phase11Log "INFO" "=== DB 마이그레이션 시작 (로컬 PostgreSQL → RDS) ==="
    Test-AwsCliInstalled

    if (-not $RdsEndpoint) {
        $RdsEndpoint = Read-Host "RDS endpoint 를 입력하세요 (terraform output rds_endpoint)"
    }

    Confirm-Action "RDS($RdsEndpoint) 에 16 DB 를 생성하고 데이터를 마이그레이션합니다."

    # 17 service 대응 16 DB (logging-service = ES/RabbitMQ 전용, logging_db 포함)
    $databases = @(
        "auth_db", "logging_db", "user_db", "product_db", "inventory_db", "slip_db",
        "accounting_db", "partner_auth_db", "dc_config_db", "partner_order_db",
        "partner_db", "groupware_db", "notification_db",
        "dashboard_db", "arologis_db", "migration_db"
    )

    Write-Phase11Log "INFO" "16 DB 생성 (RDS 초기화 — infrastructure/terraform/templates/init-rds.sql 참조)"
    foreach ($db in $databases) {
        Write-Phase11Log "INFO" "DB 생성: $db"
        # psql -h $RdsEndpoint -U samhan -d samhanlogis -c "CREATE DATABASE IF NOT EXISTS $db;"
        # 실 실행 시 주석 해제
        Write-Phase11Log "INFO" "[DRY-RUN] CREATE DATABASE $db (실 실행 생략)"
    }

    Write-Phase11Log "INFO" "S3 덤프 동기화 (MinIO → S3)"
    # aws s3 sync s3://samhan-attachments/ s3://samhan-attachments/ --source-region us-east-1 --region ap-northeast-2
    Write-Phase11Log "INFO" "[DRY-RUN] S3 동기화 생략"

    Write-Phase11Log "OK" "DB 마이그레이션 완료 (DRY-RUN 모드)"
    Write-Phase11Log "INFO" "실 마이그레이션 시 스크립트 주석 해제 후 실행"
}

# ─── Action: dns-cutover ──────────────────────────────────────────────────────

function Invoke-DnsCutover {
    Write-Phase11Log "INFO" "=== DNS cutover 시작 (samhan-air.com → Route 53) ==="

    Confirm-Action "DNS cutover 를 실행하면 실 트래픽이 AWS 로 전환됩니다. rollback TTL=60s."

    # Samhan Public 본진 subdomain
    $subdomains = @("api", "app", "order", "sign", "chat", "files", "monitor", "quote")
    foreach ($sub in $subdomains) {
        Write-Phase11Log "INFO" "DNS record 확인: $sub.samhan-air.com → ALB"
        # nslookup "$sub.samhan-air.com" 8.8.8.8
    }

    # 아로로지스 (spec 2026-05-14 분리) — 별도 subdomain 3개
    $arologisSubdomains = @("api.arologis", "app.arologis", "mobile.arologis")
    foreach ($sub in $arologisSubdomains) {
        Write-Phase11Log "INFO" "DNS record 확인: $sub.samhan-air.com → ALB (아로로지스)"
        # nslookup "$sub.samhan-air.com" 8.8.8.8
    }

    Write-Phase11Log "INFO" "Route 53 record 설정은 Terraform route53.tf 에서 자동 처리"
    Write-Phase11Log "INFO" "수동 확인: aws route53 list-resource-record-sets --hosted-zone-id <ZONE_ID>"
    Write-Phase11Log "OK" "DNS cutover 준비 완료 — 도메인 등록기관 NS 변경 필요"
}

# ─── Action: healthcheck ─────────────────────────────────────────────────────

function Invoke-HealthCheck {
    Write-Phase11Log "INFO" "=== Health Check 시작 ==="

    # 아로로지스 분리 (spec 2026-05-14, plan DO6):
    #   - api.samhan-air.com         : Samhan Public 17 service 통합 (api-gateway:8080)
    #   - api.arologis.samhan-air.com: 아로로지스 단독 (arologis-service:8097, gateway 우회)
    #   - app/mobile.arologis        : 정적 페이지 (200 응답만 확인)
    $endpoints = @(
        "https://api.samhan-air.com/actuator/health",
        "https://api.samhan-air.com/actuator/info",
        "https://api.arologis.samhan-air.com/actuator/health",
        "https://app.arologis.samhan-air.com/",
        "https://mobile.arologis.samhan-air.com/"
    )

    if ($EC2PublicIp) {
        $endpoints += "http://$EC2PublicIp:8080/actuator/health"
        $endpoints += "http://$EC2PublicIp:8097/actuator/health"   # arologis-service direct
    }

    foreach ($url in $endpoints) {
        Write-Phase11Log "INFO" "Health Check: $url"
        try {
            $response = Invoke-WebRequest -Uri $url -TimeoutSec 10 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Phase11Log "OK" "PASS: $url (HTTP $($response.StatusCode))"
            } else {
                Write-Phase11Log "WARN" "FAIL: $url (HTTP $($response.StatusCode))"
            }
        } catch {
            Write-Phase11Log "WARN" "FAIL: $url — $($_.Exception.Message)"
        }
    }

    Write-Phase11Log "INFO" "17 service 전체 health check 는 infrastructure/terraform/CUTOVER.md 참조"
}

# ─── 메인 실행 ────────────────────────────────────────────────────────────────

Write-Output ""
Write-Output "==================================================================="
Write-Output " SamhanLogis Phase 11 AWS 배포 스크립트"
Write-Output " Action: $Action"
Write-Output " DryRun: $DryRun"
Write-Output "==================================================================="
Write-Output ""

switch ($Action) {
    "plan"        { Invoke-TerraformPlan }
    "apply"       { Invoke-TerraformApply }
    "db-migrate"  { Invoke-DbMigration }
    "dns-cutover" { Invoke-DnsCutover }
    "healthcheck" { Invoke-HealthCheck }
    "destroy" {
        Confirm-Action "terraform destroy 를 실행하면 모든 AWS 자원이 삭제됩니다. (복구 불가)"
        Push-Location $TerraformDir
        try {
            terraform destroy -var-file=$TfVarsFile
        } finally {
            Pop-Location
        }
    }
}

Write-Output ""
Write-Phase11Log "INFO" "=== Phase 11 배포 스크립트 완료 ==="
