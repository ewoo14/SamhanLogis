# 자격 회전 2단계 — 인프라 공유 비밀번호
#
# 대상 1개 값 (6개 키가 공유)
#   DB_PASSWORD = POSTGRES_PASSWORD = RABBIT_PASSWORD
#   = RABBITMQ_DEFAULT_PASS = MINIO_ROOT_PASSWORD = SAMHAN_S3_SECRET_KEY
#
# 🚨 사용자명(DB_USER · MINIO_ROOT_USER · RABBIT_USER · SAMHAN_S3_ACCESS_KEY)은
#    회전하지 않는다 — 비밀이 아니고, 바꾸려면 새 role/사용자 생성이 필요해 위험이 크다
# 🚨 값은 절대 출력하지 않는다. SHA-256 앞 8자리만.

$ErrorActionPreference = 'Stop'
$envPath = 'C:\dev\Samhan-Public\infrastructure\.env.local'
$backup  = "$env:TEMP\env-local-phase2-backup-$(Get-Random).bak"

function Get-Sha8([string]$s) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $b = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($s))
  return ([BitConverter]::ToString($b) -replace '-','').Substring(0,8).ToLower()
}
function Get-EnvVal([string[]]$lines, [string]$k) {
  $l = $lines | Where-Object { $_ -like "$k=*" } | Select-Object -First 1
  if ($l) { return ($l -replace "^$k=", '') } else { return $null }
}

$lines = Get-Content -LiteralPath $envPath -Encoding UTF8
$oldPw = Get-EnvVal $lines 'POSTGRES_PASSWORD'
$dbUser = Get-EnvVal $lines 'POSTGRES_USER'
$rabbitUser = Get-EnvVal $lines 'RABBITMQ_DEFAULT_USER'

if (-not $oldPw) { throw 'POSTGRES_PASSWORD 없음 — 중단' }
"OLD_SHARED_PW_SHA8=$(Get-Sha8 $oldPw)"

# 새 비밀번호 — 영숫자만 (URL/커넥션 문자열/YAML 안전)
# Get-Random 은 암호학적 난수가 아니다 — RandomNumberGenerator 로 뽑는다
$chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
$rb = New-Object byte[] 40
# 🚨 RandomNumberGenerator::Fill 은 .NET Core 2.1+ 전용 — PowerShell 5.1 에는 없다
$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
try { $rng.GetBytes($rb) } finally { $rng.Dispose() }
$sb = New-Object System.Text.StringBuilder
foreach ($x in $rb) { [void]$sb.Append($chars[$x % $chars.Length]) }
$newPw = $sb.ToString()
"NEW_SHARED_PW_SHA8=$(Get-Sha8 $newPw)"

Copy-Item -LiteralPath $envPath -Destination $backup -Force
"BACKUP=$backup"

# ── 1) PostgreSQL ────────────────────────────────────────────────
"---- PostgreSQL ALTER USER ----"
$alter = "ALTER USER `"$dbUser`" WITH PASSWORD '$newPw';"
docker exec -e PGPASSWORD=$oldPw samhan-postgres psql -U $dbUser -d postgres -v ON_ERROR_STOP=1 -c $alter
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL ALTER USER 실패 — 중단 (아직 .env.local 미변경)' }
docker exec -e PGPASSWORD=$newPw samhan-postgres psql -U $dbUser -d postgres -t -c "SELECT 'PG_NEWPW_OK';"
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 새 비밀번호 검증 실패 — 중단' }

# ── 2) RabbitMQ ──────────────────────────────────────────────────
"---- RabbitMQ change_password ----"
docker exec samhan-rabbitmq rabbitmqctl change_password $rabbitUser $newPw
if ($LASTEXITCODE -ne 0) { throw 'RabbitMQ change_password 실패 — 중단 (PG 는 이미 변경됨, 롤백 필요)' }
docker exec samhan-rabbitmq rabbitmqctl authenticate_user $rabbitUser $newPw
if ($LASTEXITCODE -ne 0) { throw 'RabbitMQ 새 비밀번호 검증 실패 — 중단' }

# ── 3) .env.local 갱신 (6개 키 동시) ─────────────────────────────
"---- .env.local 갱신 ----"
$pwKeys = @('DB_PASSWORD','POSTGRES_PASSWORD','RABBIT_PASSWORD','RABBITMQ_DEFAULT_PASS','MINIO_ROOT_PASSWORD','SAMHAN_S3_SECRET_KEY')
$out = foreach ($l in $lines) {
  $m = $false
  foreach ($k in $pwKeys) { if ($l -like "$k=*") { "$k=$newPw"; $m = $true; break } }
  if (-not $m) { $l }
}
# 🚨 원본은 BOM 없음 + LF 단독 — phase1 과 동일 이유로 직접 쓴다
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, (($out -join "`n") + "`n"), $utf8NoBom)
$after = Get-Content -LiteralPath $envPath -Encoding UTF8
foreach ($k in $pwKeys) { "{0,-26} {1}" -f $k, (Get-Sha8 (Get-EnvVal $after $k)) }

# ── 4) MinIO 재생성 (root 자격이 env 기반) ───────────────────────
# 데이터 볼륨은 유지된다. compose 로 재생성한다.
"---- MinIO 재생성 필요 ----"
"docker compose ... up -d --force-recreate minio  (PM 이 별도 수행)"

"---- 다음 ----"
"1) MinIO 재생성"
"2) 앱 서비스 전체 재배포"
"3) 헬스 확인"
