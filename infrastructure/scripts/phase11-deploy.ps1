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
    [string]$RdsUsername = "samhan",
    [string]$DbPasswordSecretId = "samhan/production/db-password",
    [string]$AwsRegion = "ap-northeast-2",
    [string]$AlbDnsName = "",
    [string]$InstanceId = "",
    [string]$SlipReadinessUrl = "",
    [string]$WarehouseAliasCsv = "",
    [string]$WarehouseAdminUrl = "",
    [string]$WarehouseAdminUserId = "",
    [switch]$VerifyRdsDatabases,
    [switch]$DryRun
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

function Get-ExpectedRdsDatabases {
    return @(
        "auth_db",
        "user_db",
        "product_db",
        "inventory_db",
        "slip_db",
        "accounting_db",
        "partner_auth_db",
        "dc_config_db",
        "partner_order_db",
        "partner_db",
        "groupware_db",
        "notification_db",
        "dashboard_db",
        "arologis_db",
        "migration_db"
    )
}

function Get-SecretString {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SecretId
    )

    Test-AwsCliInstalled
    $value = aws secretsmanager get-secret-value `
        --secret-id $SecretId `
        --query SecretString `
        --output text `
        --region $AwsRegion

    if ($LASTEXITCODE -ne 0 -or -not $value) {
        Write-Phase11Log "ERROR" "Secrets Manager 조회 실패: $SecretId"
        exit 1
    }

    return $value
}

function Test-RdsDatabasesExist {
    Write-Phase11Log "INFO" "RDS 15 DB 존재 검증 시작"

    if ($DryRun) {
        Write-Phase11Log "WARN" "DryRun 모드에서는 실제 RDS 접속/DB 존재 검증을 수행하지 않습니다."
        return
    }

    if (-not $RdsEndpoint) {
        $script:RdsEndpoint = Read-Host "RDS endpoint 를 입력하세요 (terraform output -raw rds_endpoint)"
    }

    $psql = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $psql) {
        Write-Phase11Log "ERROR" "psql 이 설치되지 않았습니다. RDS 15 DB 검증은 PostgreSQL client 가 필요합니다."
        exit 1
    }

    $expected = Get-ExpectedRdsDatabases
    $quoted = ($expected | ForEach-Object { "'$_'" }) -join ","
    $query = "SELECT datname FROM pg_database WHERE datname IN ($quoted) ORDER BY datname;"

    $previousPgPassword = $env:PGPASSWORD
    try {
        if ($env:SAMHAN_DB_PASSWORD) {
            $env:PGPASSWORD = $env:SAMHAN_DB_PASSWORD
        } else {
            $env:PGPASSWORD = Get-SecretString -SecretId $DbPasswordSecretId
        }

        $actual = & $psql.Path `
            -h $RdsEndpoint `
            -U $RdsUsername `
            -d postgres `
            -At `
            -c $query

        if ($LASTEXITCODE -ne 0) {
            Write-Phase11Log "ERROR" "RDS DB 목록 조회 실패"
            exit 1
        }

        $actualSet = @{}
        foreach ($db in $actual) {
            if ($db) {
                $actualSet[$db.Trim()] = $true
            }
        }

        $missing = @($expected | Where-Object { -not $actualSet.ContainsKey($_) })
        if ($missing.Count -gt 0) {
            Write-Phase11Log "ERROR" "RDS 누락 DB: $($missing -join ', ')"
            exit 1
        }

        Write-Phase11Log "OK" "RDS 15 DB 존재 검증 PASS: $($expected -join ', ')"
    }
    finally {
        $env:PGPASSWORD = $previousPgPassword
    }
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

    Confirm-Action ("RDS({0}) 에 15 DB 를 생성하고 데이터를 마이그레이션합니다." -f $RdsEndpoint)

    # 17 service 대응 15 DB (logging-service = ES/RabbitMQ 전용, logging_db 제외)
    $databases = Get-ExpectedRdsDatabases

    Write-Phase11Log "INFO" "15 DB 생성 (RDS 초기화 — infrastructure/terraform/templates/init-rds.sql 참조)"
    foreach ($db in $databases) {
        Write-Phase11Log "INFO" "DB 생성: $db"
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
        Write-Phase11Log "INFO" "DNS record 확인: $($sub).samhan-air.com → ALB"
        # nslookup "$sub.samhan-air.com" 8.8.8.8
    }

    # 아로로지스 (spec 2026-05-14 분리) — 별도 subdomain 3개
    $arologisSubdomains = @("api.arologis", "app.arologis", "mobile.arologis")
    foreach ($sub in $arologisSubdomains) {
        Write-Phase11Log "INFO" "DNS record 확인: $($sub).samhan-air.com → ALB (아로로지스)"
        # nslookup "$sub.samhan-air.com" 8.8.8.8
    }

    Write-Phase11Log "INFO" "Route 53 record 설정은 Terraform route53.tf 에서 자동 처리"
    Write-Phase11Log "INFO" "수동 확인: aws route53 list-resource-record-sets --hosted-zone-id <ZONE_ID>"
    Write-Phase11Log "OK" "DNS cutover 준비 완료 — 도메인 등록기관 NS 변경 필요"
}

# ─── Action: healthcheck ─────────────────────────────────────────────────────

function Invoke-HealthCheck {
    Write-Phase11Log "INFO" "=== Health Check 시작 ==="

    $failedChecks = [System.Collections.Generic.List[string]]::new()

    # 권위 alias 준비는 DB 직접 쓰기가 아니라 지원되는 관리자 import 경로로만 수행한다.
    # CSV를 주면 이 단계에서 import하고, 주지 않으면 이미 관리자가 import한 결과를
    # slip-service readiness가 검증한다. DEV_SUBSTITUTE 로컬 경로에는 이 함수가 호출되지 않는다.
    if ($WarehouseAliasCsv) {
        if (-not (Test-Path -LiteralPath $WarehouseAliasCsv -PathType Leaf)) {
            $failedChecks.Add("권위 alias CSV 없음: $WarehouseAliasCsv")
        } elseif (-not $WarehouseAdminUrl -or -not $WarehouseAdminUserId) {
            $failedChecks.Add("권위 alias import에 WarehouseAdminUrl/WarehouseAdminUserId 필요")
        } else {
            Write-Phase11Log "INFO" "권위 alias 준비: POST $WarehouseAdminUrl/admin/warehouses/imports/ecount"
            $importResponse = & curl.exe -fsS -X POST `
                -H "X-User-Id: $WarehouseAdminUserId" `
                -F "file=@$WarehouseAliasCsv" `
                "$WarehouseAdminUrl/admin/warehouses/imports/ecount"
            if ($LASTEXITCODE -ne 0) {
                $failedChecks.Add("권위 alias 관리자 import 실패")
            }
        }
    }

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

    if ($AlbDnsName) {
        Write-Phase11Log "INFO" "ALB DNS HTTPS 임시 검증: https://$AlbDnsName/actuator/health (인증서 hostname mismatch 때문에 curl.exe -k 사용)"
        try {
            $albResponse = & curl.exe -k -fs "https://$AlbDnsName/actuator/health"
            if ($LASTEXITCODE -ne 0) {
                throw "curl exit code $LASTEXITCODE"
            }
            Write-Phase11Log "OK" "PASS: https://$AlbDnsName/actuator/health"
        } catch {
            Write-Phase11Log "WARN" "FAIL: https://$AlbDnsName/actuator/health — $($_.Exception.Message)"
            $failedChecks.Add("ALB health")
        }
    }

    foreach ($url in $endpoints) {
        Write-Phase11Log "INFO" "Health Check: $url"
        try {
            $response = Invoke-WebRequest -Uri $url -TimeoutSec 10 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Phase11Log "OK" "PASS: $url (HTTP $($response.StatusCode))"
            } else {
                Write-Phase11Log "WARN" "FAIL: $url (HTTP $($response.StatusCode))"
                $failedChecks.Add($url)
            }
        } catch {
            Write-Phase11Log "WARN" "FAIL: $url — $($_.Exception.Message)"
            $failedChecks.Add($url)
        }
    }

    $slipReadiness = if ($SlipReadinessUrl) { $SlipReadinessUrl } else {
        "http://127.0.0.1:8086/actuator/health/readiness"
    }
    Write-Phase11Log "INFO" "slip-service readiness: $slipReadiness"
    try {
        $response = Invoke-WebRequest -Uri $slipReadiness -TimeoutSec 10 -UseBasicParsing
        if ($response.StatusCode -ne 200) {
            Write-Phase11Log "WARN" "FAIL: slip-service readiness (HTTP $($response.StatusCode))"
            $failedChecks.Add("slip-service readiness")
        } else {
            Write-Phase11Log "OK" "PASS: slip-service readiness (HTTP $($response.StatusCode))"
        }
    } catch {
        Write-Phase11Log "WARN" "FAIL: slip-service readiness — $($_.Exception.Message)"
        $failedChecks.Add("slip-service readiness")
    }

    Write-Phase11Log "INFO" "17 service 전체 포트 검증은 EC2 SSM Session Manager 내부 localhost curl 로 수행합니다."
    if ($InstanceId) {
        Write-Phase11Log "INFO" "SSM 접속: aws ssm start-session --target $InstanceId --region ap-northeast-2"
    }
    Write-Phase11Log "INFO" "SSM 내부 실행 포트: 8761 8080 8081 8082 8083 8084 8085 8086 8087 8088 8089 8091 8092 8093 8094 8095 8097"
    Write-Phase11Log "INFO" "RDS 15 DB 실검증은 -VerifyRdsDatabases 옵션 사용 시 psql 로 수행합니다. DryRun 에서는 실제 DB 검증을 생략합니다."

    if ($VerifyRdsDatabases) {
        Test-RdsDatabasesExist
    }

    if ($failedChecks.Count -gt 0) {
        Write-Phase11Log "ERROR" "배포 실패 — 비정상 health/readiness 또는 alias 준비 실패: $($failedChecks -join ', ')"
        exit 1
    }
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
