[CmdletBinding()]
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$knownPorts = @('8080','8081','8082','8083','8084','8085','8086','8087','8088','8089','8091','8092','8093','8094','8095','8097','8761')

# Non-runtime artwork/deployment text is intentionally exempted. Each entry must
# retain a reason; runtime local-stack scripts are never exempted.
$exceptions = @{
    'scripts\lib\local-stack-port.ps1' = 'resolver mapping is the single port-literal authority'
    'scripts\check-local-stack-port-literals.ps1' = 'guard contains its own known-port detection patterns'
    'infrastructure\scripts\phase11-deploy.ps1' = 'deployment/SSM documentation is not local-stack routing'
    'infrastructure\scripts\validate-config-audit.ps1' = 'audit rule documentation, not a runtime port consumer'
    'scripts\generate-arologis-qa-screenshots.ps1' = 'static QA artwork contains illustrative service labels, not runtime routing'
}

function Get-TrackedPowerShellScripts {
    param([string]$RepositoryRoot)
    $paths = @(git -C $RepositoryRoot ls-files -- '*.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed while discovering tracked PowerShell scripts.' }
    return $paths | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

function Find-PortLiterals {
    param([string]$Text)
    $portPattern = ($knownPorts -join '|')
    $pattern = '(?i)(?:localhost|127\.0\.0\.1|api-gateway|port\s*[:=]|defaultport|server\.port|base_url|url\s*=|\-port\s+)\s*[^\r\n]{0,80}\b(?:' + $portPattern + ')\b'
    return [regex]::Matches($Text, $pattern, [Text.RegularExpressions.RegexOptions]::Multiline)
}

$findings = @()
foreach ($relativePath in Get-TrackedPowerShellScripts -RepositoryRoot $Root) {
    $normalized = $relativePath.Replace('/', '\')
    if ($exceptions.ContainsKey($normalized)) { continue }
    $path = Join-Path $Root $normalized
    $lines = [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $path), [Text.Encoding]::Default)
    for ($index = 0; $index -lt $lines.Length; $index++) {
        $line = $lines[$index]
        if ((Find-PortLiterals -Text $line).Count -gt 0) {
            $findings += "${relativePath}:$($index + 1): $line"
        }
    }
}

if ($findings.Count -gt 0) {
    Write-Error ("Tracked PowerShell scripts contain local-stack port literals outside the resolver:`n" + ($findings -join "`n"))
    exit 1
}
Write-Host 'Local-stack port literal guard passed: all tracked .ps1 consumers use the resolver.' -ForegroundColor Green
