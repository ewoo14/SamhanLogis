# Local stack service-port single source of truth.
# Keep service names, environment variables, and documented defaults here only.
$script:LocalStackPortDefinitions = [ordered]@{
    'eureka-server'         = @{ Environment = 'SAMHAN_EUREKA_PORT';        Default = 8761; ContainerName = 'samhan-eureka'; ContainerPort = 8761 }
    'api-gateway'           = @{ Environment = 'SAMHAN_API_GATEWAY_PORT';   Default = 8080; ContainerPort = 8080 }
    'auth-service'          = @{ Environment = 'SAMHAN_AUTH_PORT';          Default = 8081; ContainerPort = 8081 }
    'logging-service'       = @{ Environment = 'SAMHAN_LOGGING_PORT';       Default = 8082; ContainerPort = 8082 }
    'user-service'          = @{ Environment = 'SAMHAN_USER_PORT';          Default = 8083; ContainerPort = 8083 }
    'product-service'       = @{ Environment = 'SAMHAN_PRODUCT_PORT';       Default = 8084; ContainerPort = 8084 }
    'inventory-service'     = @{ Environment = 'SAMHAN_INVENTORY_PORT';     Default = 8085; ContainerPort = 8085 }
    'slip-service'          = @{ Environment = 'SAMHAN_SLIP_PORT';          Default = 8086; ContainerPort = 8086 }
    'accounting-service'    = @{ Environment = 'SAMHAN_ACCOUNTING_PORT';    Default = 8087; ContainerPort = 8087 }
    'partner-order-service' = @{ Environment = 'SAMHAN_PARTNER_ORDER_PORT'; Default = 8088; ContainerPort = 8088 }
    'dc-config-service'     = @{ Environment = 'SAMHAN_DC_CONFIG_PORT';     Default = 8089; ContainerPort = 8089 }
    'partner-auth-service'  = @{ Environment = 'SAMHAN_PARTNER_AUTH_PORT';  Default = 8091; ContainerPort = 8091 }
    'groupware-service'     = @{ Environment = 'SAMHAN_GROUPWARE_PORT';     Default = 8092; ContainerPort = 8092 }
    'notification-service'  = @{ Environment = 'SAMHAN_NOTIFICATION_PORT';  Default = 8093; ContainerPort = 8093 }
    'dashboard-service'     = @{ Environment = 'SAMHAN_DASHBOARD_PORT';     Default = 8094; ContainerPort = 8094 }
    'partner-service'       = @{ Environment = 'SAMHAN_PARTNER_PORT';       Default = 8095; ContainerPort = 8095 }
    'arologis-service'      = @{ Environment = 'SAMHAN_AROLOGIS_PORT';      Default = 8097; ContainerPort = 8097 }
}

function Get-RunningContainerPort {
    param([string]$Service, [int]$ContainerPort)

    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $dockerCommand) { return $null }
    $containerName = if ($script:LocalStackPortDefinitions[$Service].ContainerName) { $script:LocalStackPortDefinitions[$Service].ContainerName } else { "samhan-$Service" }

    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $dockerCommand.Source
    $processInfo.Arguments = 'port "' + $containerName + '" "' + $ContainerPort + '/tcp"'
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo
    try {
        if (-not $process.Start()) { return $null }
        if (-not $process.WaitForExit(2000)) {
            try { $process.Kill() } catch { }
            return $null
        }
        $published = $process.StandardOutput.ReadToEnd()
        $dockerExitCode = $process.ExitCode
    } finally {
        $process.Dispose()
    }
    if ($dockerExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($published)) {
        return $null
    }

    $match = [regex]::Match($published, ':(?<port>[0-9]+)\s*$')
    if ($match.Success) { return [int]$match.Groups['port'].Value }
    return $null
}

function Get-LocalStackPort {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Service)

    if (-not $script:LocalStackPortDefinitions.Contains($Service)) {
        throw "Unknown local-stack service '$Service'. Add it to scripts/lib/local-stack-port.ps1."
    }

    $definition = $script:LocalStackPortDefinitions[$Service]
    $override = [Environment]::GetEnvironmentVariable($definition.Environment)
    if (-not [string]::IsNullOrWhiteSpace($override)) {
        if ($override -notmatch '^[0-9]+$' -or [int]$override -lt 1 -or [int]$override -gt 65535) {
            throw "$($definition.Environment) must be a TCP port (1-65535), got '$override'."
        }
        return [int]$override
    }

    $runningPort = Get-RunningContainerPort -Service $Service -ContainerPort $definition.ContainerPort
    if ($null -ne $runningPort) {
        return $runningPort
    }
    Write-Warning "Docker publish port unavailable for '$Service'; using static default $($definition.Default)."
    return [int]$definition.Default
}

function Get-LocalStackPortDefinitions {
    return $script:LocalStackPortDefinitions
}
