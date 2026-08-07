param(
    [string]$GatewayUrl = "http://localhost:8080",
    [string]$AuthBaseUrl = "http://localhost:8080/api/auth",
    [string]$AccountingBaseUrl = "http://localhost:8087",
    [switch]$SkipReimport
)

$ErrorActionPreference = "Stop"
$seedScriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    Join-Path (Get-Location) 'scripts'
} else {
    $PSScriptRoot
}
. (Resolve-Path -LiteralPath (Join-Path $seedScriptRoot 'lib\local-stack-port.ps1'))

$gatewayPort = Resolve-LocalStackPort -EnvironmentValue $env:SAMHAN_API_GATEWAY_PORT -DefaultPort 8080
$authPort = Resolve-LocalStackPort -EnvironmentValue $env:SAMHAN_AUTH_PORT -DefaultPort 8081
$accountingPort = Resolve-LocalStackPort -EnvironmentValue $env:SAMHAN_ACCOUNTING_PORT -DefaultPort 8087
if ($GatewayUrl -eq "http://localhost:8080") { $GatewayUrl = "http://localhost:$gatewayPort" }
if ($AuthBaseUrl -eq "http://localhost:8080/api/auth") { $AuthBaseUrl = "$GatewayUrl/api/auth" }
if ($AccountingBaseUrl -eq "http://localhost:8087") { $AccountingBaseUrl = "http://localhost:$accountingPort" }
$authServiceBaseUrl = "http://localhost:$authPort"

# PowerShell 5.1 (cp949) 환경에서 한글 console 출력 보존 — [feedback_powershell_utf8_writes]
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Invoke-Json {
    param(
        [string]$Method,
        [string]$Uri,
        [object]$Body = $null,
        [hashtable]$Headers = @{}
    )
    $args = @{
        Method = $Method
        Uri = $Uri
        Headers = $Headers
        UseBasicParsing = $true
        TimeoutSec = 60
    }
    if ($null -ne $Body) {
        $args.ContentType = "application/json"
        $args.Body = ($Body | ConvertTo-Json -Depth 8)
    }
    Invoke-RestMethod @args
}

function Get-JwtClaims {
    param([Parameter(Mandatory = $true)][string]$Token)
    $parts = $Token -split '\.'
    if ($parts.Length -lt 2) { throw "JWT 형식 오류" }
    $payload = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($payload.Length % 4) {
        2 { $payload += '==' }
        3 { $payload += '=' }
    }
    $bytes = [Convert]::FromBase64String($payload)
    return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}

function Wait-Http {
    param([string]$Name, [string]$Url)
    $deadline = (Get-Date).AddSeconds(180)
    do {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
            Write-Host "[seed] OK $Name"
            return
        } catch {
            Start-Sleep -Seconds 3
        }
    } while ((Get-Date) -lt $deadline)
    throw "[seed] TIMEOUT $Name $Url"
}

Wait-Http "gateway" "$GatewayUrl/actuator/health"
Wait-Http "auth-service" "$authServiceBaseUrl/actuator/health"
Wait-Http "accounting-service" "$AccountingBaseUrl/actuator/health"

# 자격은 환경변수로 주입 (평문 커밋 금지 — GitGuardian). 미설정 시 V5 시드 DEV 값.
$seedLoginId = if ($env:SEED_LOGIN_ID) { $env:SEED_LOGIN_ID } else { "dev_master" }
$seedLoginPw = if ($env:SEED_LOGIN_PW) { $env:SEED_LOGIN_PW } else { "" }
$masterLogin = Invoke-Json -Method "POST" -Uri "$AuthBaseUrl/login" -Body @{
    loginId = $seedLoginId
    password = $seedLoginPw
}
$token = $masterLogin.data.token
$claims = Get-JwtClaims -Token $token
$masterUserId = $claims.sub
$headers = @{
    Authorization = "Bearer $token"
    "X-User-Id" = $masterUserId
    "X-User-Groups" = [string]$claims.groups
    "X-Is-System-Master" = [string]($claims.isSystemMaster -eq $true)
}
if (-not [string]::IsNullOrWhiteSpace([string]$claims.departmentName)) {
    $headers["X-User-Department"] = [Uri]::EscapeDataString([string]$claims.departmentName)
}

$users = @(
    @{ loginId = "master@samhan.test"; password = 'Pa$$w0rd!'; displayName = "로컬 마스터"; role = "MASTER" },
    @{ loginId = "manager@samhan.test"; password = 'Pa$$w0rd!'; displayName = "로컬 관리자"; role = "MANAGER" },
    @{ loginId = "accountant@samhan.test"; password = 'Pa$$w0rd!'; displayName = "로컬 회계"; role = "ACCOUNTANT" },
    @{ loginId = "staff@samhan.test"; password = 'Pa$$w0rd!'; displayName = "로컬 현장직"; role = "STAFF" },
    @{ loginId = "driver@samhan.test"; password = 'Pa$$w0rd!'; displayName = "로컬 기사"; role = "DRIVER" }
)

foreach ($user in $users) {
    try {
        $body = @{
            loginId = $user.loginId
            password = $user.password
            displayName = $user.displayName
            role = $user.role
        }
        Invoke-Json -Method "POST" -Uri "$authServiceBaseUrl/auth/register" -Headers $headers -Body $body | Out-Null
        Write-Host "[seed] created $($user.loginId) ROLE_$($user.role)"
    } catch {
        $message = $_.Exception.Message
        if ($message -match "409|CONFLICT|이미") {
            Write-Host "[seed] exists  $($user.loginId)"
        } else {
            throw
        }
    }
}

$serviceHealth = @(
    @{ Name = 'auth-service'; DefaultPort = 8081; Env = 'SAMHAN_AUTH_PORT' },
    @{ Name = 'user-service'; DefaultPort = 8083; Env = 'SAMHAN_USER_PORT' },
    @{ Name = 'product-service'; DefaultPort = 8084; Env = 'SAMHAN_PRODUCT_PORT' },
    @{ Name = 'inventory-service'; DefaultPort = 8085; Env = 'SAMHAN_INVENTORY_PORT' },
    @{ Name = 'slip-service'; DefaultPort = 8086; Env = 'SAMHAN_SLIP_PORT' },
    @{ Name = 'accounting-service'; DefaultPort = 8087; Env = 'SAMHAN_ACCOUNTING_PORT' },
    @{ Name = 'partner-order-service'; DefaultPort = 8088; Env = 'SAMHAN_PARTNER_ORDER_PORT' },
    @{ Name = 'partner-auth-service'; DefaultPort = 8091; Env = 'SAMHAN_PARTNER_AUTH_PORT' },
    @{ Name = 'dc-config-service'; DefaultPort = 8089; Env = 'SAMHAN_DC_CONFIG_PORT' },
    @{ Name = 'groupware-service'; DefaultPort = 8092; Env = 'SAMHAN_GROUPWARE_PORT' },
    @{ Name = 'notification-service'; DefaultPort = 8093; Env = 'SAMHAN_NOTIFICATION_PORT' },
    @{ Name = 'dashboard-service'; DefaultPort = 8094; Env = 'SAMHAN_DASHBOARD_PORT' },
    @{ Name = 'partner-service'; DefaultPort = 8095; Env = 'SAMHAN_PARTNER_PORT' },
    @{ Name = 'arologis-service'; DefaultPort = 8097; Env = 'SAMHAN_AROLOGIS_PORT' }
)
foreach ($service in $serviceHealth) {
    $port = Resolve-LocalStackPort -EnvironmentValue ([Environment]::GetEnvironmentVariable($service.Env)) -DefaultPort $service.DefaultPort
    $url = "http://localhost:$port/actuator/health"
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 | Out-Null
}
Write-Host "[seed] 14 service actuator health OK — Flyway startup completed"

$loginVerifyFailures = @()
foreach ($user in $users) {
    try {
        $verifyLogin = Invoke-Json -Method "POST" -Uri "$AuthBaseUrl/login" -Body @{
            loginId = $user.loginId
            password = $user.password
        }
        if ($verifyLogin.data.token) {
            Write-Host "[seed] verified login OK: $($user.loginId) (role=$($user.role))"
        } else {
            throw "응답 token 누락"
        }
    } catch {
        $loginVerifyFailures += "$($user.loginId): $($_.Exception.Message)"
        Write-Warning "[seed] login verify FAILED for $($user.loginId) — $($_.Exception.Message)"
    }
}

# MIG-23 사이클 1e fix (Codex Correctness/Maintainability/Test MAJOR) — hard fail
# 로그인 검증 실패 1건이라도 있으면 seed 전체 비-0 exit. soft-fail (Write-Warning 만 후 complete) 차단.
if ($loginVerifyFailures.Count -gt 0) {
    Write-Error "[seed] login verify FAILED ($($loginVerifyFailures.Count)건): $($loginVerifyFailures -join '; ')"
    exit 1
}

if (-not $SkipReimport) {
    foreach ($slice in 1..11) {
        $name = "mig-$slice"
        try {
            $result = Invoke-Json -Method "POST" -Uri "$AccountingBaseUrl/admin/ecount/reimport/$name" -Headers $headers
            Write-Host "[seed] $name reimport processed=$($result.filesProcessed) skipped=$($result.filesSkipped) rejected=$($result.totalRejected)"
        } catch {
            Write-Warning "[seed] $name reimport failed: $($_.Exception.Message)"
        }
    }
}

Write-Host ""
Write-Host "Local credential seed complete"
Write-Host "  master@samhan.test     / Pa`$`$w0rd! / ROLE_MASTER"
Write-Host "  manager@samhan.test    / Pa`$`$w0rd! / ROLE_MANAGER"
Write-Host "  accountant@samhan.test / Pa`$`$w0rd! / ROLE_ACCOUNTANT"
Write-Host "  staff@samhan.test      / Pa`$`$w0rd! / ROLE_STAFF"
Write-Host "  driver@samhan.test     / Pa`$`$w0rd! / ROLE_DRIVER"
