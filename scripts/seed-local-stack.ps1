param(
    [string]$GatewayUrl = "http://localhost:8080",
    [string]$AuthBaseUrl = "http://localhost:8080/api/auth",
    [string]$AccountingBaseUrl = "http://localhost:8087",
    [switch]$SkipReimport
)

$ErrorActionPreference = "Stop"

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
Wait-Http "auth-service" "http://localhost:8081/actuator/health"
Wait-Http "accounting-service" "$AccountingBaseUrl/actuator/health"

$masterLogin = Invoke-Json -Method "POST" -Uri "$AuthBaseUrl/login" -Body @{
    loginId = "dev_master"
    password = "dev_p05_pass!"
}
$token = $masterLogin.data.token
$masterUserId = $masterLogin.data.userId
$headers = @{
    Authorization = "Bearer $token"
    "X-User-Id" = $masterUserId
    "X-User-Role" = "MASTER"
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
        Invoke-Json -Method "POST" -Uri "$AuthBaseUrl/register" -Headers $headers -Body $body | Out-Null
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
    "http://localhost:8081/actuator/health",
    "http://localhost:8083/actuator/health",
    "http://localhost:8084/actuator/health",
    "http://localhost:8085/actuator/health",
    "http://localhost:8086/actuator/health",
    "http://localhost:8087/actuator/health",
    "http://localhost:8088/actuator/health",
    "http://localhost:8089/actuator/health",
    "http://localhost:8091/actuator/health",
    "http://localhost:8092/actuator/health",
    "http://localhost:8093/actuator/health",
    "http://localhost:8094/actuator/health",
    "http://localhost:8095/actuator/health",
    "http://localhost:8097/actuator/health"
)
foreach ($url in $serviceHealth) {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 | Out-Null
}
Write-Host "[seed] 14 service actuator health OK — Flyway startup completed"

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
        Write-Warning "[seed] login verify FAILED for $($user.loginId) — $($_.Exception.Message)"
    }
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
