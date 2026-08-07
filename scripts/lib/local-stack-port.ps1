function Resolve-LocalStackPort {
    param(
        [string]$EnvironmentValue,
        [int]$DefaultPort
    )
    if ($EnvironmentValue -match '^\d+$') { return [int]$EnvironmentValue }
    return $DefaultPort
}
