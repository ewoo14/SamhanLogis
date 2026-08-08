function Resolve-QaCredential {
    param(
        [Parameter(Mandatory = $true)][string] $Key,
        [string[]] $CompatibilityAliases = @()
    )

    $processValue = [Environment]::GetEnvironmentVariable($Key, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($processValue)) { return $processValue.Trim() }

    $envFilePath = Join-Path $PSScriptRoot '..\..\infrastructure\.env.local'
    if (Test-Path -LiteralPath $envFilePath) {
        foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $envFilePath))) {
            if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $matches[1] -eq $Key) {
                $value = $matches[2].Trim()
                if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
                if (-not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
            }
        }
    }

    foreach ($alias in $CompatibilityAliases) {
        $aliasValue = [Environment]::GetEnvironmentVariable($alias, 'Process')
        if (-not [string]::IsNullOrWhiteSpace($aliasValue)) { return $aliasValue.Trim() }
    }
    throw "QA 자격이 없습니다: $envFilePath 에 $Key 를 입력하거나 표준 환경변수를 설정하십시오."
}
