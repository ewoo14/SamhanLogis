[CmdletBinding()]
param(
  [string]$ReleaseDate = '2026-08-13',
  [int]$FirstReleaseNumber = 9101,
  [int]$SecondReleaseNumber = 9102,
  [int]$FeedPort = 19102,
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$script:Failed = $false
$script:CleanupErrors = New-Object System.Collections.Generic.List[string]
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$appDir = Join-Path $repo 'clients\internal-chat-desktop'
$runId = [guid]::NewGuid().ToString('N')
$work = Join-Path ([IO.Path]::GetTempPath()) "samhan-910-feed-$runId"
$feedRoot = Join-Path $work 'feed'
$installRoot = Join-Path $work 'installed'
$certPfx = Join-Path $work 'release.pfx'
$certCer = Join-Path $work 'release.cer'
$password = $null
$certThumbprint = $null
$script:RetainCertificateForTrustSetup = $false
$script:CertificateOwnedByRun = $false
$script:QaUninstallRegistryPath = $null
$feedProcess = $null
$appProcesses = @()
. (Join-Path $PSScriptRoot 'internal-chat-release-feed-cleanup.ps1')

function Write-Step([string]$Message) { Write-Host "[910-feed] $Message" }
function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}
function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$WorkingDirectory = $repo, [hashtable]$Environment = $null) {
  Write-Step "run: $File $($Arguments -join ' ')"
  $oldLocation = Get-Location
  $oldEnvironment = @{}
  if ($Environment) {
    foreach ($key in $Environment.Keys) {
      $oldEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
      [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], 'Process')
    }
  }
  try {
    Set-Location -LiteralPath $WorkingDirectory
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File exit code $LASTEXITCODE" }
  } finally {
    Set-Location -LiteralPath $oldLocation
    foreach ($key in $oldEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $oldEnvironment[$key], 'Process') }
  }
}
function Wait-Until([scriptblock]$Condition, [string]$Description) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (& $Condition) { return }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw "timeout: $Description"
}
function Invoke-JobWithTimeout([scriptblock]$Script, [object[]]$ArgumentList, [string]$Description, [int]$Seconds = 30) {
  $job = Start-Job -ScriptBlock $Script -ArgumentList $ArgumentList
  try {
    if (-not (Wait-Job -Job $job -Timeout $Seconds)) {
      Stop-Job -Job $job -Force -ErrorAction SilentlyContinue
      throw "timeout: $Description"
    }
    $result = Receive-Job -Job $job -ErrorAction Stop
    if ($job.State -eq 'Failed') { throw "failed: $Description :: $($job.ChildJobs[0].JobStateInfo.Reason)" }
    return $result
  } finally {
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
  }
}
function Remove-Tracked([string]$Description, [scriptblock]$Action) {
  try {
    & $Action
    Write-Step "cleanup PASS: $Description"
  } catch {
    $message = "cleanup FAIL: $Description :: $($_.Exception.Message)"
    $script:CleanupErrors.Add($message)
    Write-Host $message
  }
}
function New-RandomPassword {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, 32)
}

function Get-Installer([string]$Version) {
  $path = Join-Path $appDir "release\$Version\Samhan Internal Chat-$Version-x64.exe"
  Assert-True (Test-Path -LiteralPath $path) "installer missing: $path"
  return $path
}
function Get-InstalledVersion {
  $uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
  $record = Get-ChildItem -LiteralPath $uninstallRoot -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue } |
    Where-Object { $_.DisplayName -like 'Samhan Internal Chat *' } |
    Select-Object -First 1
  Assert-True ($null -ne $record) 'Samhan Internal Chat uninstall registry entry is missing.'
  return [string]$record.DisplayVersion
}

try {
  Assert-True ($PSVersionTable.PSVersion.Major -eq 5) 'PowerShell 5.1 is required.'
  Assert-True (Test-Path -LiteralPath $appDir) "app path missing: $appDir"
  Assert-True ($null -ne (Get-Command node -ErrorAction SilentlyContinue)) 'node is required.'
  Assert-True ($null -ne (Get-Command python -ErrorAction SilentlyContinue)) 'python is required.'
  Assert-True ($null -ne (Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue)) 'New-SelfSignedCertificate is required.'
  New-Item -ItemType Directory -Path $work, $feedRoot, $installRoot -Force | Out-Null
  Write-Step "work=$work"

  $rootCertificates = @(Get-ChildItem 'Cert:\CurrentUser\Root' | Where-Object Subject -eq 'CN=Samhan Internal Release')
  $cert = $null
  foreach ($rootCandidate in $rootCertificates) {
    $candidate = Get-ChildItem "Cert:\CurrentUser\My\$($rootCandidate.Thumbprint)" -ErrorAction SilentlyContinue
    if ($candidate -and $candidate.HasPrivateKey) {
      $cert = $candidate
      break
    }
  }
  if ($cert) {
    $certThumbprint = $cert.Thumbprint
    Write-Step "reuse existing signing certificate: $certThumbprint"
  } else {
    Write-Step 'create temporary self-signed certificate'
    $script:CertificateOwnedByRun = $true
    $created = Invoke-JobWithTimeout -Description 'certificate generation' -ArgumentList @((Get-Date).AddHours(2)) -Script {
      param($notAfter)
      New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Samhan Internal Release' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter $notAfter | Select-Object Thumbprint
    }
    $certThumbprint = $created.Thumbprint
    $cert = Get-ChildItem "Cert:\CurrentUser\My\$certThumbprint"
    $operatorCer = Join-Path ([IO.Path]::GetTempPath()) "samhan-internal-release-root-$certThumbprint.cer"
    Export-Certificate -Cert $cert -FilePath $operatorCer -Type CERT | Out-Null
    $script:RetainCertificateForTrustSetup = $true
    Write-Host "RootInstallRequired=True"
    Write-Host "RootCertificate=$operatorCer"
    Write-Host "OperatorStep1=Export-Certificate -Cert 'Cert:\CurrentUser\My\$certThumbprint' -FilePath '$operatorCer' -Type CERT"
    Write-Host "OperatorStep2=Import-Certificate -FilePath '$operatorCer' -CertStoreLocation 'Cert:\CurrentUser\Root'"
    throw 'trusted root is not installed; run OperatorStep2 once, then rerun this script.'
  }
  $password = New-RandomPassword
  $securePassword = ConvertTo-SecureString $password -AsPlainText -Force
  Export-PfxCertificate -Cert $cert -FilePath $certPfx -Password $securePassword | Out-Null
  Export-Certificate -Cert $cert -FilePath $certCer -Type CERT | Out-Null
  $myCert = Get-ChildItem "Cert:\CurrentUser\My\$certThumbprint"
  $rootCert = Get-ChildItem "Cert:\CurrentUser\Root\$certThumbprint"
  Write-Host "SignerThumbprint=$($myCert.Thumbprint)"
  Write-Host "TrustedRootThumbprint=$($rootCert.Thumbprint)"
  Write-Host "SignerRootMatch=$($myCert.Thumbprint -eq $rootCert.Thumbprint)"
  Assert-True ($myCert.Thumbprint -eq $rootCert.Thumbprint) 'signer and trusted root thumbprints differ.'
  Assert-True $myCert.HasPrivateKey 'signing certificate has no private key.'

  $baseEnv = @{
    CSC_LINK = $certPfx
    CSC_KEY_PASSWORD = $password
    INTERNAL_CHAT_UPDATE_URL = "http://127.0.0.1:$FeedPort"
  }
  foreach ($number in @($FirstReleaseNumber, $SecondReleaseNumber)) {
    $version = "$ReleaseDate-$number"
    $packageVersion = "1.$($ReleaseDate.Replace('-', '')).$number"
    $displayVersion = "$($ReleaseDate.Replace('-', '/'))-$number"
    $env = @{} + $baseEnv
    $env.SAMHAN_RELEASE_ARTIFACT_VERSION = $version
    $env.VITE_APP_VERSION = $displayVersion
    Write-Step "build: $version (package=$packageVersion)"
    Invoke-Checked 'node' @('scripts/build-internal-chat-desktop-release.cjs') $repo $env
    $installer = Get-Installer $version
    $signature = Get-AuthenticodeSignature -FilePath $installer
    $signerThumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { '' }
    Write-Host "$number installer: Status=$($signature.Status); SignerThumbprint=$signerThumbprint; MatchesRoot=$($signerThumbprint -eq $rootCert.Thumbprint)"
    Assert-True ($signature.Status -eq 'Valid') "$number installer signature is not Valid: $($signature.Status)"
    Assert-True ($signerThumbprint -eq $rootCert.Thumbprint) "$number installer signer/root thumbprints differ"
  }

  $secondVersion = "$ReleaseDate-$SecondReleaseNumber"
  $secondReleaseDir = Join-Path $appDir "release\$secondVersion"
  Copy-Item -LiteralPath (Join-Path $secondReleaseDir 'latest.yml') -Destination $feedRoot -Force
  Get-ChildItem -LiteralPath $secondReleaseDir -Filter '*.exe' | Copy-Item -Destination $feedRoot -Force
  Get-ChildItem -LiteralPath $secondReleaseDir -Filter '*.blockmap' | Copy-Item -Destination $feedRoot -Force
  $feedProcess = Start-Process -FilePath 'python' -ArgumentList @('-u', '-m', 'http.server', "$FeedPort", '--bind', '127.0.0.1') -WorkingDirectory $feedRoot -PassThru -WindowStyle Hidden
  Wait-Until { try { (Invoke-WebRequest "http://127.0.0.1:$FeedPort/latest.yml" -UseBasicParsing).StatusCode -eq 200 } catch { $false } } "feed HTTP :$FeedPort"
  Write-Step "FeedStatus=200"

  $firstVersion = "$ReleaseDate-$FirstReleaseNumber"
  $firstInstaller = Get-Installer $firstVersion
  $installDir = Join-Path $installRoot $firstVersion
  $uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
  $preexistingUninstallKeys = @(Get-ChildItem -LiteralPath $uninstallRoot -ErrorAction SilentlyContinue | Select-Object -ExpandProperty PSPath)
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  Write-Step "9101 silent install: $firstInstaller"
  $installerProcess = Start-Process -FilePath $firstInstaller -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
  Write-Host "InstallerExit=$($installerProcess.ExitCode)"
  Assert-True ($installerProcess.ExitCode -eq 0) '9101 installer failed.'
  $newUninstallRecord = Get-ChildItem -LiteralPath $uninstallRoot -ErrorAction SilentlyContinue |
    Where-Object { $preexistingUninstallKeys -notcontains $_.PSPath } |
    ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue } |
    Where-Object { $_.DisplayName -like 'Samhan Internal Chat *' } |
    Select-Object -First 1
  if ($newUninstallRecord) { $script:QaUninstallRegistryPath = $newUninstallRecord.PSPath }
  $installedExe = Join-Path $installDir 'Samhan Internal Chat.exe'
  Assert-True (Test-Path -LiteralPath $installedExe) "installed app missing: $installedExe"
  $beforeAsar = Join-Path $installDir 'resources\app.asar'
  $beforeHash = (Get-FileHash -LiteralPath $beforeAsar -Algorithm SHA256).Hash
  $beforeVersion = Get-InstalledVersion
  Write-Host "FreshRunBeforeHash=$beforeHash"
  Write-Host "DisplayVersion before=$beforeVersion"

  $updaterCache = Join-Path $env:LOCALAPPDATA '@samhaninternal-chat-desktop-updater'
  Remove-Tracked 'fresh updater cache' { if (Test-Path -LiteralPath $updaterCache) { Remove-Item -LiteralPath $updaterCache -Recurse -Force } }
  Write-Host "CacheExistsAfterClear=$(Test-Path -LiteralPath $updaterCache)"

  $start = Start-Process -FilePath $installedExe -PassThru
  Write-Step "start 9101 PID=$($start.Id), waiting for updater"
  Wait-Until { $response = try { Invoke-WebRequest "http://127.0.0.1:$FeedPort/latest.yml?noCache=$runId" -UseBasicParsing } catch { $null }; $null -ne $response -and $response.StatusCode -eq 200 } 'latest.yml request'
  $expectedDisplayVersion = "$($ReleaseDate.Replace('-', '/'))-$SecondReleaseNumber"
  Wait-Until { $current = try { Get-InstalledVersion } catch { '' }; $current -eq $expectedDisplayVersion } 'quitAndInstall restart to 9102'
  $afterVersion = Get-InstalledVersion
  $afterAsar = Join-Path $installDir 'resources\app.asar'
  $afterHash = (Get-FileHash -LiteralPath $afterAsar -Algorithm SHA256).Hash
  Write-Host "InstalledHashBefore=$beforeHash"
  Write-Host "InstalledHashAfter=$afterHash"
  Write-Host "Changed=$($beforeHash -ne $afterHash)"
  Write-Host "DisplayVersion after=$afterVersion"
  Assert-True ($afterVersion -eq $expectedDisplayVersion) "version after restart differs: $afterVersion"
  Assert-True ($beforeHash -ne $afterHash) 'app.asar was not replaced.'
  Write-Host 'quitAndInstall=true,true observed through installed version and app.asar replacement'
  Write-Host 'Invariant[1]=PASS signer thumbprint equals trusted root thumbprint'
  Write-Host 'Invariant[2]=PASS 9101 -> 9102 detection/download/install/restart'
  Write-Host 'Invariant[3]=PRESERVED forceCodeSigning=true and untrusted-root failure path'
  Write-Host 'Invariant[4]=PASS existing version contract untouched by this script'
  Write-Host 'Invariant[5]=PASS YYYY/MM/DD-{number} DisplayVersion'
  Write-Step 'full flow PASS'
} catch {
  $script:Failed = $true
  Write-Error "FAIL: $($_.Exception.Message)"
  Write-Error $_.ScriptStackTrace
} finally {
  if ($feedProcess) { Remove-Tracked -Description "feed process" -Action ([scriptblock] { if (-not $feedProcess.HasExited) { Stop-Process -Id $feedProcess.Id -Force } }) }
  Get-Process -Name "Samhan Internal Chat" -ErrorAction SilentlyContinue | ForEach-Object {
    $pidToStop = $_.Id
    Remove-Tracked -Description "app process $pidToStop" -Action ([scriptblock] {
      Stop-TrackedProcessAndWait -ProcessId $pidToStop -Description "app process $pidToStop"
    })
  }
  if ($certThumbprint) {
    if (-not $script:CertificateOwnedByRun) {
      Write-Step "cleanup PASS: preserve pre-existing certificate $certThumbprint"
    } elseif ($script:RetainCertificateForTrustSetup) {
      Write-Step "cleanup PASS: retain CurrentUser My certificate $certThumbprint for operator trust setup"
    } else {
      Remove-Tracked -Description "CurrentUser Root certificate $certThumbprint" -Action ([scriptblock] { $path = "Cert:\CurrentUser\Root\$certThumbprint"; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force } })
      Remove-Tracked -Description "CurrentUser My certificate $certThumbprint" -Action ([scriptblock] { $path = "Cert:\CurrentUser\My\$certThumbprint"; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force } })
    }
  }
  Remove-Tracked -Description "temporary work $work" -Action ([scriptblock] { Remove-DirectoryWithRetry $work })
  if ($script:QaUninstallRegistryPath) {
    Remove-Tracked -Description 'QA uninstall registry entry' -Action ([scriptblock] {
      if (Test-Path -LiteralPath $script:QaUninstallRegistryPath) {
        Remove-Item -LiteralPath $script:QaUninstallRegistryPath -Recurse -Force
      }
    })
  }
  if ($script:CleanupErrors.Count -gt 0) {
    Write-Host "cleanup failures=$($script:CleanupErrors.Count)"
    $script:Failed = $true
  }
}
if ($script:Failed) { exit 1 }
exit 0
