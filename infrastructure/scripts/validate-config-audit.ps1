param(
    [switch]$Detailed
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")

$ComposeFiles = @(
    "infrastructure/docker-compose.local-all.yml",
    "infrastructure/docker-compose.prod.yml",
    "infrastructure/docker/docker-compose.arologis.yml"
)

$AligoApiUrlDefault = "https://apis.aligo.in/send/"

function Get-ServiceNameFromVar {
    param([string]$Name)
    $token = $Name -replace "^SAMHAN_", "" -replace "_SERVICE_URL$", ""
    return (($token.ToLowerInvariant() -replace "_", "-") + "-service")
}

function Read-ComposePorts {
    $ports = @{}
    foreach ($relative in $ComposeFiles) {
        $path = Join-Path $Root $relative
        if (-not (Test-Path $path)) {
            continue
        }
        $current = $null
        # 정식 서비스 블록만 인식 — 최상위 `services:` 진입 전(x-service-depends/x-app-depends 등
        # YAML 앵커 내부의 postgres/redis/eureka-server 같은 2-space 키) 및 진입 후 다른 최상위 키
        # (volumes:/networks: 등)로 빠져나간 구간은 서비스 블록으로 오인식하지 않는다 (#745 라운드1).
        $inServices = $false
        foreach ($line in Get-Content $path -Encoding UTF8) {
            if ($line -match "^services:\s*$") {
                $inServices = $true
                $current = $null
                continue
            }
            if ($line -match "^[A-Za-z][A-Za-z0-9_-]*:\s*$") {
                $inServices = $false
                $current = $null
                continue
            }
            if (-not $inServices) {
                continue
            }
            if ($line -match "^\s{2}([a-z0-9-]+):\s*$") {
                $current = $Matches[1]
                continue
            }
            if ($null -eq $current) {
                continue
            }
            if ($line -match "SERVER_PORT:\s*`"?(\d+)`"?") {
                if (-not $ports.ContainsKey($current)) {
                    $ports[$current] = [System.Collections.Generic.SortedSet[int]]::new()
                }
                [void]$ports[$current].Add([int]$Matches[1])
                continue
            }
            if ($line -match "^\s*-\s*`"?(?:127\.0\.0\.1:)?\d+:(\d+)`"?") {
                if (-not $ports.ContainsKey($current)) {
                    $ports[$current] = [System.Collections.Generic.SortedSet[int]]::new()
                }
                [void]$ports[$current].Add([int]$Matches[1])
            }
        }
    }
    return $ports
}

function Get-UrlRecords {
    $files = @()
    $files += Get-ChildItem (Join-Path $Root "infrastructure/env-templates") -Filter "*.env" -File
    # 경로 구분자 크로스플랫폼 가드 — CI(ubuntu-latest pwsh) 는 `/` 를 쓰므로 `\` 전용 패턴이면
    # 파일이 0건 매칭되어 조용히 커버리지가 사라진다(로컬 Windows 는 우연히 통과하는 false-green
    # 함정). `[\\/]` 로 두 구분자 모두 인식 (#745 라운드1 CI 연결 검증 중 발견).
    $files += Get-ChildItem (Join-Path $Root "services") -Recurse -Filter "application.yml" -File |
        Where-Object { $_.FullName -match "[\\/]src[\\/]main[\\/]resources[\\/]application\.yml$" }

    foreach ($file in $files) {
        $relativePath = Resolve-Path -Relative $file.FullName
        $lineNo = 0
        foreach ($line in Get-Content $file.FullName -Encoding UTF8) {
            $lineNo++
            # 중첩표기 `${SAMHAN_X:http://${HOST:svc}:PORT}` (partner-order application.yml 등) 도
            # 매칭하도록 `}` 를 제외 문자군에서 뺐다 — 그리디 `.*` 는 역추적으로 항상 줄의 마지막
            # `:포트` 를 찾아내므로 중첩 유무와 무관하게 실제 포트를 정확히 추출한다 (#745 라운드1).
            if ($line -match "(?<var>SAMHAN_[A-Z0-9_]+_SERVICE_URL).*?http://[^`"'\s]+:(?<port>\d+)") {
                [pscustomobject]@{
                    File = $relativePath
                    Line = $lineNo
                    Variable = $Matches["var"]
                    Service = Get-ServiceNameFromVar $Matches["var"]
                    ConfiguredPort = [int]$Matches["port"]
                }
            }
        }
    }

    # (c) .java @Value URL 리터럴 fallback 스캔 — arologis SlipClient/SlipServiceClient 8084 오배정·
    # SlipDispatchTaskClient 무포트(#745 라운드1) 재발을 향후 자동 검출하기 위한 커버리지 확장.
    # samhan.<svc>-service.url property key 는 이미 kebab-case 실 서비스명이라 별도 변환 불필요.
    $javaPattern = "@Value\(`"\$\{samhan\.(?<svc>[a-z0-9-]+-service)\.url:.*?http://[^`"'\s]+:(?<port>\d+)"
    $javaFiles = Get-ChildItem (Join-Path $Root "services") -Recurse -Filter "*.java" -File |
        Where-Object { $_.FullName -match "[\\/]src[\\/]main[\\/]java[\\/]" }
    if ($javaFiles.Count -gt 0) {
        foreach ($m in ($javaFiles | Select-String -Pattern $javaPattern -Encoding UTF8)) {
            $svc = $m.Matches[0].Groups["svc"].Value
            [pscustomobject]@{
                File = Resolve-Path -Relative $m.Path
                Line = $m.LineNumber
                Variable = "samhan.$svc.url"
                Service = $svc
                ConfiguredPort = [int]$m.Matches[0].Groups["port"].Value
            }
        }
    }

    # (d) compose 파일 자체 `environment:` 블록 리터럴 스캔 — local-all/prod/arologis 3종
    # (#745 재수렴). env-template/application.yml/.java 는 "선언 템플릿" 일 뿐, 실제 컨테이너에
    # 주입되는 다운스트림 URL 의 실질 진실원은 compose 파일의 `SAMHAN_*_SERVICE_URL: http://host:PORT`
    # 리터럴(~70줄, 서비스마다 반복 선언)이다 — 지금까지 이 리터럴 자체는 미스캔이라 arologis.yml
    # 회귀(SLIP 8086→8084 오타 등)를 놓치는 사각지대였다. 위 (a) 스캔과 동일 정규식 재사용 — YAML
    # `${VAR:-http://host:PORT}` 중첩표기도 동일한 역추적 원리로 마지막 `:포트` 를 정확히 찾는다.
    foreach ($relative in $ComposeFiles) {
        $path = Join-Path $Root $relative
        if (-not (Test-Path $path)) {
            continue
        }
        $relativePath = Resolve-Path -Relative $path
        $lineNo = 0
        foreach ($line in Get-Content $path -Encoding UTF8) {
            $lineNo++
            if ($line -match "^\s*#") {
                # 주석 줄(설명용 언급)은 실배선이 아니므로 제외.
                continue
            }
            if ($line -match "(?<var>SAMHAN_[A-Z0-9_]+_SERVICE_URL):.*?http://[^`"'\s]+:(?<port>\d+)") {
                [pscustomobject]@{
                    File = $relativePath
                    Line = $lineNo
                    Variable = $Matches["var"]
                    Service = Get-ServiceNameFromVar $Matches["var"]
                    ConfiguredPort = [int]$Matches["port"]
                }
            }
        }
    }
}

function Test-ComposeServiceHasLine {
    param(
        [string]$Path,
        [string]$ServiceName,
        [string]$Pattern
    )
    $current = $null
    # Read-ComposePorts 와 동일한 정식 서비스 블록 가드 (x-app-depends 앵커 내부 rabbitmq/
    # elasticsearch/eureka-server 2-space 키 오인식 방지, #745 라운드1).
    $inServices = $false
    foreach ($line in Get-Content $Path -Encoding UTF8) {
        if ($line -match "^services:\s*$") {
            $inServices = $true
            $current = $null
            continue
        }
        if ($line -match "^[A-Za-z][A-Za-z0-9_-]*:\s*$") {
            $inServices = $false
            $current = $null
            continue
        }
        if (-not $inServices) {
            continue
        }
        if ($line -match "^\s{2}([a-z0-9-]+):\s*$") {
            $current = $Matches[1]
            continue
        }
        if ($current -eq $ServiceName -and $line -match $Pattern) {
            return $true
        }
    }
    return $false
}

$composePorts = Read-ComposePorts
$rows = foreach ($record in Get-UrlRecords) {
    $actual = $composePorts[$record.Service]
    $expected = if ($null -eq $actual -or $actual.Count -eq 0) { $null } else { ($actual | Select-Object -Unique) -join "," }
    $status = if ($null -eq $actual -or $actual.Count -eq 0) {
        "NO_COMPOSE_PORT"
    } elseif ($actual.Count -ne 1) {
        "AMBIGUOUS_COMPOSE_PORT"
    } elseif ($actual.Contains($record.ConfiguredPort)) {
        "OK"
    } else {
        "MISMATCH"
    }
    [pscustomobject]@{
        Status = $status
        Variable = $record.Variable
        Service = $record.Service
        ConfiguredPort = $record.ConfiguredPort
        ComposePort = $expected
        File = $record.File
        Line = $record.Line
    }
}

$aligoApiUrlChecks = @(
    @{
        Path = "infrastructure/env-templates/notification-service.env"
        Pattern = "^SAMHAN_ALIGO_API_URL=(.*)$"
        ValueGroup = 1
        ExpectedShape = "explicit default"
    },
    @{
        Path = "infrastructure/docker-compose.prod.yml"
        Pattern = "^\s*SAMHAN_ALIGO_API_URL:\s*\$\{SAMHAN_ALIGO_API_URL:-(.*)\}\s*$"
        ValueGroup = 1
        ExpectedShape = "compose default"
    },
    @{
        Path = "infrastructure/terraform/templates/user_data.sh"
        Pattern = "^SAMHAN_ALIGO_API_URL=(.*)$"
        ValueGroup = 1
        ExpectedShape = "terraform env default"
    }
)

foreach ($check in $aligoApiUrlChecks) {
    $aligoPath = Join-Path $Root $check.Path
    $aligoLine = Select-String -Path $aligoPath -Pattern $check.Pattern -Encoding UTF8
    if ($null -eq $aligoLine) {
        throw "SAMHAN_ALIGO_API_URL is missing from $($check.Path)"
    }
    $configured = $aligoLine.Matches[0].Groups[$check.ValueGroup].Value
    $isExpected = $configured -eq $AligoApiUrlDefault
    $rows += [pscustomobject]@{
        Status = if ($isExpected) { "OK" } else { "MISMATCH" }
        Variable = "SAMHAN_ALIGO_API_URL"
        Service = "notification-service"
        ConfiguredPort = $configured
        ComposePort = "$($check.ExpectedShape): $AligoApiUrlDefault"
        File = ".\$($check.Path -replace '/', '\')"
        Line = $aligoLine.LineNumber
    }
}

foreach ($serviceName in @("notification-service", "groupware-service")) {
    $appPath = Join-Path $Root "services/$serviceName/src/main/resources/application.yml"
    $envPath = Join-Path $Root "infrastructure/env-templates/$serviceName.env"
    $prodPath = Join-Path $Root "infrastructure/docker-compose.prod.yml"

    if (-not (Select-String -Path $appPath -Pattern "fail-mode:\s*\$\{SAMHAN_USER_CLIENT_FAIL_MODE:OPEN\}" -Encoding UTF8 -Quiet)) {
        $rows += [pscustomobject]@{
            Status = "MISMATCH"
            Variable = "SAMHAN_USER_CLIENT_FAIL_MODE"
            Service = $serviceName
            ConfiguredPort = ""
            ComposePort = "application.yml binding required"
            File = Resolve-Path -Relative $appPath
            Line = ""
        }
    } else {
        $rows += [pscustomobject]@{
            Status = "OK"
            Variable = "SAMHAN_USER_CLIENT_FAIL_MODE"
            Service = $serviceName
            ConfiguredPort = ""
            ComposePort = "application.yml binding"
            File = Resolve-Path -Relative $appPath
            Line = ""
        }
    }
    if (-not (Select-String -Path $envPath -Pattern "^SAMHAN_USER_CLIENT_FAIL_MODE=OPEN$" -Encoding UTF8 -Quiet)) {
        $rows += [pscustomobject]@{
            Status = "MISMATCH"
            Variable = "SAMHAN_USER_CLIENT_FAIL_MODE"
            Service = $serviceName
            ConfiguredPort = ""
            ComposePort = "env-template OPEN default required"
            File = Resolve-Path -Relative $envPath
            Line = ""
        }
    } else {
        $rows += [pscustomobject]@{
            Status = "OK"
            Variable = "SAMHAN_USER_CLIENT_FAIL_MODE"
            Service = $serviceName
            ConfiguredPort = ""
            ComposePort = "env-template OPEN default"
            File = Resolve-Path -Relative $envPath
            Line = ""
        }
    }
    if (-not (Test-ComposeServiceHasLine $prodPath $serviceName "SAMHAN_USER_CLIENT_FAIL_MODE:\s*STRICT")) {
        $rows += [pscustomobject]@{
            Status = "MISMATCH"
            Variable = "SAMHAN_USER_CLIENT_FAIL_MODE"
            Service = $serviceName
            ConfiguredPort = ""
            ComposePort = "prod STRICT required"
            File = Resolve-Path -Relative $prodPath
            Line = ""
        }
    } else {
        $rows += [pscustomobject]@{
            Status = "OK"
            Variable = "SAMHAN_USER_CLIENT_FAIL_MODE"
            Service = $serviceName
            ConfiguredPort = ""
            ComposePort = "prod STRICT"
            File = Resolve-Path -Relative $prodPath
            Line = ""
        }
    }
}

if ($Detailed) {
    $rows | Sort-Object Status, Variable, File, Line | Format-Table -AutoSize
} else {
    $rows | Where-Object { $_.Status -ne "OK" } | Sort-Object Status, Variable, File, Line | Format-Table -AutoSize
}

$failures = @($rows | Where-Object { $_.Status -ne "OK" })
if ($failures.Count -gt 0) {
    throw "config-audit validation failed: $($failures.Count) issue(s)"
}

Write-Host "config-audit validation passed: $($rows.Count) URL/template checks"
