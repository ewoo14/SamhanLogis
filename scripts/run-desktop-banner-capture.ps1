[CmdletBinding()]
param(
  [string]$ReleaseDate = '2026-08-15',
  [int]$FirstReleaseNumber = 9101,
  [int]$SecondReleaseNumber = 9102,
  [int]$FeedPort = 0,
  [int]$CaptureDebugPort = 0,
  [int]$TimeoutSeconds = 240
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$appDir = Join-Path $repo 'clients\desktop'
$runId = [guid]::NewGuid().ToString('N')
$work = Join-Path ([IO.Path]::GetTempPath()) "desktop-banner-$runId"
$feedRoot = Join-Path $work 'feed'
$installRoot = Join-Path $work 'installed'
$certPfx = Join-Path $work 'release.pfx'
$certCer = Join-Path $work 'release.cer'
$feedProcess = $null
function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Wait-Until([scriptblock]$Condition, [string]$Description) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do { if (& $Condition) { return }; Start-Sleep -Seconds 2 } while ((Get-Date) -lt $deadline)
  throw "timeout: $Description"
}
function Build([string]$Version, [string]$FeedUrl, [hashtable]$BaseEnv) {
  $env = @{} + $BaseEnv
  $env.SAMHAN_RELEASE_ARTIFACT_VERSION = $Version
  $env.VITE_APP_VERSION = "$($ReleaseDate.Replace('-', '/'))-$($Version.Split('-')[-1])"
  $old = @{}
  foreach ($key in $env.Keys) { $old[$key] = [Environment]::GetEnvironmentVariable($key, 'Process'); [Environment]::SetEnvironmentVariable($key, [string]$env[$key], 'Process') }
  try { & node (Join-Path $repo 'scripts/build-desktop-release.cjs'); Assert-True ($LASTEXITCODE -eq 0) "desktop build failed: $Version" }
  finally { foreach ($key in $old.Keys) { [Environment]::SetEnvironmentVariable($key, $old[$key], 'Process') } }
}
try {
  Assert-True ($FeedPort -gt 0) 'FeedPort must be resolved by the caller; literal ports are not accepted.'
  Assert-True ($CaptureDebugPort -gt 0) 'CaptureDebugPort must be resolved by the caller.'
  New-Item -ItemType Directory -Path $work,$feedRoot,$installRoot -Force | Out-Null
  $cert = @(Get-ChildItem 'Cert:\CurrentUser\Root' | Where-Object Subject -eq 'CN=Samhan Internal Release' |
    ForEach-Object { Get-ChildItem "Cert:\CurrentUser\My\$($_.Thumbprint)" -ErrorAction SilentlyContinue } |
    Where-Object HasPrivateKey | Select-Object -First 1)
  Assert-True ($cert.Count -eq 1) 'approved signing certificate is required.'
  $cert = $cert[0]; $password = ([guid]::NewGuid().ToString('N') + 'A!')
  Export-PfxCertificate -Cert $cert -FilePath $certPfx -Password (ConvertTo-SecureString $password -AsPlainText -Force) | Out-Null
  Export-Certificate -Cert $cert -FilePath $certCer -Type CERT | Out-Null
  $feedProduct = Join-Path $feedRoot 'desktop'; New-Item -ItemType Directory -Path $feedProduct -Force | Out-Null
  $base = @{ CSC_LINK=$certPfx; CSC_KEY_PASSWORD=$password; DESKTOP_UPDATE_URL="http://127.0.0.1:$FeedPort/desktop" }
  foreach ($number in @($FirstReleaseNumber,$SecondReleaseNumber)) { Build "$ReleaseDate-$number" $base.DESKTOP_UPDATE_URL $base }
  $secondDir = Join-Path $appDir "release\$ReleaseDate-$SecondReleaseNumber"
  Copy-Item (Join-Path $secondDir 'latest.yml') $feedProduct -Force
  Get-ChildItem $secondDir -Filter '*.exe' | Copy-Item -Destination $feedProduct -Force
  Get-ChildItem $secondDir -Filter '*.blockmap' | Copy-Item -Destination $feedProduct -Force
  $feedProcess = Start-Process python -ArgumentList @('-u','-m','http.server',[string]$FeedPort,'--bind','127.0.0.1') -WorkingDirectory $feedRoot -PassThru -WindowStyle Hidden
  Wait-Until { try { (Invoke-WebRequest "http://127.0.0.1:$FeedPort/desktop/latest.yml" -UseBasicParsing).StatusCode -eq 200 } catch { $false } } 'desktop feed HTTP'
  $firstDir = Join-Path $appDir "release\$ReleaseDate-$FirstReleaseNumber"
  $installer = Get-ChildItem $firstDir -Filter '*.exe' -File | Where-Object Name -notmatch '-portable\.exe$' | Select-Object -First 1
  Assert-True ($null -ne $installer) 'desktop installer not found.'
  $installDir = Join-Path $installRoot "$ReleaseDate-$FirstReleaseNumber"; New-Item $installDir -ItemType Directory -Force | Out-Null
  $install = Start-Process $installer.FullName -ArgumentList @('/S',"/D=$installDir") -Wait -PassThru
  Assert-True ($install.ExitCode -eq 0) "desktop installer failed: $($install.ExitCode)"
  $installedExe = Join-Path $installDir 'Samhan Public.exe'; Assert-True (Test-Path $installedExe) "installed app missing: $installedExe"
  $app = Start-Process $installedExe -ArgumentList @("--remote-debugging-port=$CaptureDebugPort") -PassThru
  & node (Join-Path $repo 'scripts/capture-electron-banner.cjs') 'clients/desktop' ([string]$CaptureDebugPort) '본체데스크톱'
  Assert-True ($LASTEXITCODE -eq 0) 'desktop banner capture failed.'
  Write-Host 'Desktop banner capture PASS'
} finally {
  if ($feedProcess -and -not $feedProcess.HasExited) { Stop-Process $feedProcess.Id -Force }
  Get-Process -Name 'Samhan Public' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  if (Test-Path $work) { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
  foreach ($releaseVersion in @("$ReleaseDate-$FirstReleaseNumber","$ReleaseDate-$SecondReleaseNumber")) { $releasePath=Join-Path $appDir "release\$releaseVersion"; if (Test-Path $releasePath) { Remove-Item $releasePath -Recurse -Force -ErrorAction SilentlyContinue } }
}
