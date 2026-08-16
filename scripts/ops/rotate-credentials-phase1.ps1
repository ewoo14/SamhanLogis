# 자격 회전 1단계 — 앱 시크릿 4개
# 대상: SAMHAN_GATEWAY_ATTESTATION · SAMHAN_INTERNAL_TOKEN
#       SAMHAN_JWT_SECRET · SAMHAN_AROLOGIS_JWT_SECRET
# 인프라(PostgreSQL/RabbitMQ/MinIO) 비밀번호는 건드리지 않는다 → 2단계
#
# 🚨 값은 절대 출력하지 않는다. SHA-256 앞 8자리만 찍는다.

$ErrorActionPreference = 'Stop'
$envPath = 'C:\dev\Samhan-Public\infrastructure\.env.local'
$backup  = "$env:TEMP\env-local-backup-$(Get-Random).bak"

$targets = @(
  'SAMHAN_GATEWAY_ATTESTATION',
  'SAMHAN_INTERNAL_TOKEN',
  'SAMHAN_JWT_SECRET',
  'SAMHAN_AROLOGIS_JWT_SECRET'
)

function Get-Sha8([string]$s) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $b = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($s))
  return ([BitConverter]::ToString($b) -replace '-','').Substring(0,8).ToLower()
}

function New-Secret([int]$bytes = 48) {
  $b = New-Object byte[] $bytes
  # 🚨 RandomNumberGenerator::Fill 은 .NET Core 2.1+ 전용 — PowerShell 5.1 에는 없다
  $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
  try { $rng.GetBytes($b) } finally { $rng.Dispose() }
  # URL-safe base64 (환경변수·YAML 안전)
  return [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_').TrimEnd('=')
}

# 1) 백업
Copy-Item -LiteralPath $envPath -Destination $backup -Force
"BACKUP=$backup"

# 2) 회전 전 해시
$lines = Get-Content -LiteralPath $envPath -Encoding UTF8
"---- BEFORE ----"
foreach ($t in $targets) {
  $line = $lines | Where-Object { $_ -like "$t=*" } | Select-Object -First 1
  if ($line) { "{0,-30} {1}" -f $t, (Get-Sha8 ($line -replace "^$t=", '')) }
  else { "{0,-30} (없음)" -f $t }
}

# 3) 교체
$new = @{}
foreach ($t in $targets) { $new[$t] = New-Secret 48 }

$out = foreach ($l in $lines) {
  $matched = $false
  foreach ($t in $targets) {
    if ($l -like "$t=*") { "$t=$($new[$t])"; $matched = $true; break }
  }
  if (-not $matched) { $l }
}
# 🚨 원본은 BOM 없음 + LF 단독이다. Set-Content -Encoding UTF8 은 BOM+CRLF 를 넣어
#    첫 키가 "﻿QA_DEV_DEFAULT_PASSWORD" 가 되고 compose :?required 가 mesh 를 깬다.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, (($out -join "`n") + "`n"), $utf8NoBom)

# 4) 회전 후 해시
"---- AFTER ----"
$after = Get-Content -LiteralPath $envPath -Encoding UTF8
foreach ($t in $targets) {
  $line = $after | Where-Object { $_ -like "$t=*" } | Select-Object -First 1
  "{0,-30} {1}" -f $t, (Get-Sha8 ($line -replace "^$t=", ''))
}

# 5) 인프라 키가 안 바뀌었는지 확인 (1단계에서는 건드리면 안 된다)
"---- 인프라 키 불변 확인 ----"
foreach ($t in @('DB_PASSWORD','POSTGRES_PASSWORD','RABBIT_PASSWORD','RABBITMQ_DEFAULT_PASS','MINIO_ROOT_PASSWORD','SAMHAN_S3_SECRET_KEY')) {
  $b = ($lines  | Where-Object { $_ -like "$t=*" } | Select-Object -First 1) -replace "^$t=", ''
  $a = ($after  | Where-Object { $_ -like "$t=*" } | Select-Object -First 1) -replace "^$t=", ''
  "{0,-26} {1} -> {2}  {3}" -f $t, (Get-Sha8 $b), (Get-Sha8 $a), $(if ($b -eq $a) { 'UNCHANGED' } else { '🚨 CHANGED' })
}
