# Local stack service-port single source of truth.
# Keep service names, environment variables, and documented defaults here only.
$script:LocalStackPortDefinitions = [ordered]@{
    'eureka-server'         = @{ Environment = 'SAMHAN_EUREKA_PORT';        Default = 8761 }
    'api-gateway'           = @{ Environment = 'SAMHAN_API_GATEWAY_PORT';   Default = 8080 }
    'auth-service'          = @{ Environment = 'SAMHAN_AUTH_PORT';          Default = 8081 }
    'logging-service'       = @{ Environment = 'SAMHAN_LOGGING_PORT';       Default = 8082 }
    'user-service'          = @{ Environment = 'SAMHAN_USER_PORT';          Default = 8083 }
    'product-service'       = @{ Environment = 'SAMHAN_PRODUCT_PORT';       Default = 8084 }
    'inventory-service'     = @{ Environment = 'SAMHAN_INVENTORY_PORT';     Default = 8085 }
    'slip-service'          = @{ Environment = 'SAMHAN_SLIP_PORT';          Default = 8086 }
    'accounting-service'    = @{ Environment = 'SAMHAN_ACCOUNTING_PORT';    Default = 8087 }
    'partner-order-service' = @{ Environment = 'SAMHAN_PARTNER_ORDER_PORT'; Default = 8088 }
    'dc-config-service'     = @{ Environment = 'SAMHAN_DC_CONFIG_PORT';     Default = 8089 }
    'partner-auth-service'  = @{ Environment = 'SAMHAN_PARTNER_AUTH_PORT';  Default = 8091 }
    'groupware-service'     = @{ Environment = 'SAMHAN_GROUPWARE_PORT';     Default = 8092 }
    'notification-service'  = @{ Environment = 'SAMHAN_NOTIFICATION_PORT';  Default = 8093 }
    'dashboard-service'     = @{ Environment = 'SAMHAN_DASHBOARD_PORT';     Default = 8094 }
    'partner-service'       = @{ Environment = 'SAMHAN_PARTNER_PORT';       Default = 8095 }
    'arologis-service'      = @{ Environment = 'SAMHAN_AROLOGIS_PORT';      Default = 8097 }
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
    return [int]$definition.Default
}

function Get-LocalStackPortDefinitions {
    return $script:LocalStackPortDefinitions
}
