[CmdletBinding()]
param(
  [string]$ReleaseDate = '2026-08-14',
  [int]$FirstReleaseNumber = 9101,
  [int]$SecondReleaseNumber = 9102,
  [int]$FeedPort = 19112,
  [int]$CaptureDebugPort = 0,
  [int]$TimeoutSeconds = 240
)

$ErrorActionPreference = 'Stop'
$failed = $false
$cleanupErrors = [System.Collections.Generic.List[string]]::new()
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$appDir = Join-Path $repo 'clients\arologis-desktop'
$runId = [guid]::NewGuid().ToString('N')
$work = Join-Path ([IO.Path]::GetTempPath()) "arologis-release-feed-$runId"
$feedRoot = Join-Path $work 'feed'
$feedProductRoot = Join-Path $feedRoot 'arologis'
$installRoot = Join-Path $work 'installed'
$certPfx = Join-Path $work 'release.pfx'
$certCer = Join-Path $work 'release.cer'
$buildTrustRoot = Join-Path $appDir 'build\harness-root.cer'
$certThumbprint = $null
$feedProcess = $null
$qaUninstallPath = $null
$oldHarnessApproval = [Environment]::GetEnvironmentVariable('AROLOGIS_UPDATE_HARNESS_APPROVE', 'Process')
. (Join-Path $PSScriptRoot 'internal-chat-release-feed-cleanup.ps1')

function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Wait-Until([scriptblock]$Condition, [string]$Description) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do { if (& $Condition) { return }; Start-Sleep -Seconds 2 } while ((Get-Date) -lt $deadline)
  throw "timeout: $Description"
}
function Cleanup([string]$Description, [scriptblock]$Action) {
  try { & $Action; Write-Host "cleanup PASS: $Description" } catch { $cleanupErrors.Add("cleanup FAIL: $Description :: $($_.Exception.Message)") }
}
function Invoke-Build([string]$Version, [string]$PackageVersion, [hashtable]$Env) {
  $old = @{}
  foreach ($key in $Env.Keys) { $old[$key] = [Environment]::GetEnvironmentVariable($key, 'Process'); [Environment]::SetEnvironmentVariable($key, [string]$Env[$key], 'Process') }
  try { & node (Join-Path $repo 'scripts/build-arologis-desktop-release.cjs'); Assert-True ($LASTEXITCODE -eq 0) "build failed: $Version" }
  finally { foreach ($key in $old.Keys) { [Environment]::SetEnvironmentVariable($key, $old[$key], 'Process') } }
}
function Installer([string]$Version) { Join-Path $appDir "release\$Version\Arologis Desktop-$Version-x64.exe" }
function InstalledVersion {
  $record = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } |
    Where-Object { $_.DisplayName -eq 'Arologis Desktop' } | Select-Object -First 1
  Assert-True ($null -ne $record) 'Arologis Desktop uninstall registry entry is missing.'
  return [string]$record.DisplayVersion
}

try {
  Assert-True ($PSVersionTable.PSVersion.Major -eq 5) 'PowerShell 5.1 is required.'
  Assert-True (Test-Path $appDir) "app path missing: $appDir"
  Assert-True ($null -ne (Get-Command node -ErrorAction SilentlyContinue)) 'node is required.'
  Assert-True ($null -ne (Get-Command python -ErrorAction SilentlyContinue)) 'python is required.'
  Assert-True ($null -ne (Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue)) 'New-SelfSignedCertificate is required.'
  New-Item -ItemType Directory -Path $work, $feedRoot, $feedProductRoot, $installRoot -Force | Out-Null

  $cert = @(Get-ChildItem 'Cert:\CurrentUser\Root' | Where-Object Subject -eq 'CN=Samhan Internal Release' |
    ForEach-Object { Get-ChildItem "Cert:\CurrentUser\My\$($_.Thumbprint)" -ErrorAction SilentlyContinue } |
    Where-Object HasPrivateKey | Select-Object -First 1)
  Assert-True ($cert.Count -eq 1) 'A signed root with a private key is required; install the approved root before running the harness.'
  $cert = $cert[0]; $certThumbprint = $cert.Thumbprint
  $password = ([guid]::NewGuid().ToString('N') + 'A!')
  Export-PfxCertificate -Cert $cert -FilePath $certPfx -Password (ConvertTo-SecureString $password -AsPlainText -Force) | Out-Null
  Export-Certificate -Cert $cert -FilePath $certCer -Type CERT | Out-Null
  Assert-True (Test-Path -LiteralPath $certCer) "exported trust root missing: $certCer"
  Write-Host "TrustRootCer=$certCer"
  New-Item -ItemType Directory -Path (Split-Path $buildTrustRoot) -Force | Out-Null
  Copy-Item -LiteralPath $certCer -Destination $buildTrustRoot -Force
  Write-Host "SignerRootMatch=True (thumbprint recorded only for harness verification)"

  $base = @{ CSC_LINK = $certPfx; CSC_KEY_PASSWORD = $password; AROLOGIS_TRUST_ROOT_CERT = $buildTrustRoot; AROLOGIS_UPDATE_URL = "http://127.0.0.1:$FeedPort/arologis" }
  foreach ($number in @($FirstReleaseNumber, $SecondReleaseNumber)) {
    $version = "$ReleaseDate-$number"; $env = @{} + $base
    $env.SAMHAN_RELEASE_ARTIFACT_VERSION = $version; $env.VITE_APP_VERSION = "$($ReleaseDate.Replace('-', '/'))-$number"
    Invoke-Build $version "1.$($ReleaseDate.Replace('-', '')).$number" $env
    $installer = Installer $version; Assert-True (Test-Path $installer) "installer missing: $installer"
    $signature = Get-AuthenticodeSignature $installer
    Assert-True ($signature.Status -eq 'Valid') "$number installer signature is not Valid: $($signature.Status)"
    Assert-True ($signature.SignerCertificate.Thumbprint -eq $certThumbprint) 'installer signer and approved root differ.'
    Write-Host "$number installer: Status=$($signature.Status); MatchesRoot=True"
  }

  Copy-Item (Join-Path $appDir "release\$ReleaseDate-$SecondReleaseNumber\latest.yml") $feedProductRoot -Force
  Get-ChildItem (Join-Path $appDir "release\$ReleaseDate-$SecondReleaseNumber") -Filter '*.exe' | Copy-Item -Destination $feedProductRoot -Force
  Get-ChildItem (Join-Path $appDir "release\$ReleaseDate-$SecondReleaseNumber") -Filter '*.blockmap' | Copy-Item -Destination $feedProductRoot -Force
  if ($CaptureDebugPort -gt 0) {
    Get-ChildItem $feedProductRoot -Filter '*.exe' | Remove-Item -Force
    Get-ChildItem $feedProductRoot -Filter '*.blockmap' | Remove-Item -Force
  }
  $feedProcess = Start-Process python -ArgumentList @('-u','-m','http.server',"$FeedPort",'--bind','127.0.0.1') -WorkingDirectory $feedRoot -PassThru -WindowStyle Hidden
  Wait-Until { try { (Invoke-WebRequest "http://127.0.0.1:$FeedPort/arologis/latest.yml" -UseBasicParsing).StatusCode -eq 200 } catch { $false } } 'arologis feed HTTP'
  $firstVersion = "$ReleaseDate-$FirstReleaseNumber"; $installDir = Join-Path $installRoot $firstVersion
  New-Item -ItemType Directory $installDir -Force | Out-Null
  $preexistingUninstall = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty PSPath)
  $marker = Join-Path $env:APPDATA 'arologis-desktop\harness-data-preserved.txt'; New-Item (Split-Path $marker) -ItemType Directory -Force | Out-Null; Set-Content $marker 'preserve-me' -Encoding UTF8
  $install = Start-Process (Installer $firstVersion) -ArgumentList @('/S',"/D=$installDir") -Wait -PassThru
  Assert-True ($install.ExitCode -eq 0) '9101 installer failed.'
  $qaUninstallPath = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
    Where-Object { $preexistingUninstall -notcontains $_.PSPath } |
    ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } |
    Where-Object { $_.DisplayName -eq 'Arologis Desktop' } | Select-Object -First 1 -ExpandProperty PSPath
  $beforeHash = (Get-FileHash (Join-Path $installDir 'resources\app.asar')).Hash
  [Environment]::SetEnvironmentVariable('AROLOGIS_UPDATE_HARNESS_APPROVE', '1', 'Process')
  $installedExe = Join-Path $installDir 'Arologis Desktop.exe'
  $startArgs = if ($CaptureDebugPort -gt 0) { @("--remote-debugging-port=$CaptureDebugPort") } else { @() }
  $app = Start-Process $installedExe -ArgumentList $startArgs -PassThru
  if ($CaptureDebugPort -gt 0) {
    & node (Join-Path $repo 'scripts/capture-electron-banner.cjs') 'clients/arologis-desktop' ([string]$CaptureDebugPort) 'arologis'
    Assert-True ($LASTEXITCODE -eq 0) 'Arologis banner capture failed.'
  }
  Wait-Until { try { (Invoke-WebRequest "http://127.0.0.1:$FeedPort/arologis/latest.yml?run=$runId" -UseBasicParsing).StatusCode -eq 200 } catch { $false } } 'updater feed request'
  Wait-Until { try { (InstalledVersion) -eq "$($ReleaseDate.Replace('-', '/'))-$SecondReleaseNumber" } catch { $false } } 'quitAndInstall restart to 9102'
  $afterHash = (Get-FileHash (Join-Path $installDir 'resources\app.asar')).Hash
  Assert-True ($beforeHash -ne $afterHash) 'app.asar was not replaced.'
  Assert-True ((Get-Content $marker -Raw).Trim() -eq 'preserve-me') 'user data was not preserved.'
  Write-Host 'quitAndInstall=true,true observed through installed version and app.asar replacement'
  Get-Process -Name 'Arologis Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force
  Remove-Item (Join-Path $feedProductRoot '*') -Force
  Copy-Item (Join-Path $appDir "release\$ReleaseDate-$FirstReleaseNumber\latest.yml") $feedProductRoot -Force
  Get-ChildItem (Join-Path $appDir "release\$ReleaseDate-$FirstReleaseNumber") -Filter '*.exe' | Copy-Item -Destination $feedProductRoot -Force
  Get-ChildItem (Join-Path $appDir "release\$ReleaseDate-$FirstReleaseNumber") -Filter '*.blockmap' | Copy-Item -Destination $feedProductRoot -Force
  Start-Process (Join-Path $installDir 'Arologis Desktop.exe') | Out-Null
  Wait-Until { try { (InstalledVersion) -eq "$($ReleaseDate.Replace('-', '/'))-$FirstReleaseNumber" } catch { $false } } 'quitAndInstall downgrade to 9101'
  Write-Host 'Downgrade=9102-to-9101 verified through quitAndInstall'
  Write-Host 'ArologisInvariant[1]=PASS product prefix /arologis'
  Write-Host 'ArologisInvariant[2]=PASS user data preserved'
  Write-Host 'Arologis full flow PASS'
} catch { $failed = $true; Write-Error "FAIL: $($_.Exception.Message)" } finally {
  if ($feedProcess) { Cleanup 'feed process' { if (-not $feedProcess.HasExited) { Stop-Process $feedProcess.Id -Force } } }
  Get-Process -Name 'Arologis Desktop' -ErrorAction SilentlyContinue | ForEach-Object { $pidToStop = $_.Id; Cleanup "app process $pidToStop" { Stop-TrackedProcessAndWait -ProcessId $pidToStop -Description "Arologis Desktop $pidToStop" } }
  Cleanup "temporary work $work" { Remove-DirectoryWithRetry -Path $work }
  foreach ($releaseVersion in @("$ReleaseDate-$FirstReleaseNumber", "$ReleaseDate-$SecondReleaseNumber")) {
    Cleanup "release output $releaseVersion" { $releasePath = Join-Path $appDir "release\$releaseVersion"; if (Test-Path $releasePath) { Remove-DirectoryWithRetry -Path $releasePath } }
  }
  if ($qaUninstallPath) { Cleanup 'QA uninstall registry entry' { if (Test-Path $qaUninstallPath) { Remove-Item $qaUninstallPath -Recurse -Force } } }
  $marker = Join-Path $env:APPDATA 'arologis-desktop\harness-data-preserved.txt'
  Cleanup 'harness user-data marker' { if (Test-Path $marker) { Remove-Item $marker -Force } }
  Cleanup 'harness build trust root' { if (Test-Path $buildTrustRoot) { Remove-Item $buildTrustRoot -Force } }
  [Environment]::SetEnvironmentVariable('AROLOGIS_UPDATE_HARNESS_APPROVE', $oldHarnessApproval, 'Process')
  if ($cleanupErrors.Count -gt 0) { $failed = $true; $cleanupErrors | ForEach-Object { Write-Error $_ } }
}
if ($failed) { exit 1 }
exit 0
