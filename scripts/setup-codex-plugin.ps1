# =============================================================================
# Codex Plugin 셋업 스크립트 (Windows PowerShell)
# =============================================================================
# 목적:
#   1. Claude Code 에 codex plugin (openai/codex-plugin-cc) 설치 안내
#   2. ~/.codex/config.toml 의 [windows] sandbox 를 "unelevated" 로 자동 조정
#      (default "elevated" 는 Windows UAC 환경에서 CreateProcessWithLogonW failed: 5
#      sandbox spawn 실패 — plugin task 가 read-only 도 fail)
#   3. project trust + sandbox_mode = danger-full-access 설정 (기존 SamhanLogis 프로젝트
#      는 PowerShell + codex CLI 호출 시 trust 정책 이미 적용됨)
#
# 효과:
#   - 정식 plugin codex:rescue subagent 위임 가능 (PowerShell + --dangerously-bypass
#     영구 폐기, classifier 차단 우회 불필요, 한국어 prompt 깨짐 회피)
#
# 양 PC 첫 셋업 시 1회 실행 (idempotent — 이미 설정되어 있으면 skip)
# 사용 시점: docs/dev-environment-setup-multi-pc.md §7 참조
# =============================================================================

$ErrorActionPreference = 'Stop'

$CodexConfig = Join-Path $env:USERPROFILE '.codex\config.toml'

Write-Host "=== Codex Plugin 셋업 ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. 사전 점검 ---
$codexCli = Get-Command codex -ErrorAction SilentlyContinue
if (-not $codexCli) {
    Write-Host "[FAIL] codex CLI 미설치" -ForegroundColor Red
    Write-Host "  설치: npm install -g @openai/codex" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] codex CLI 설치 확인" -ForegroundColor Green

# --- 2. ~/.codex/config.toml 생성/조정 ---
if (-not (Test-Path $CodexConfig)) {
    New-Item -ItemType Directory -Path (Split-Path $CodexConfig -Parent) -Force | Out-Null
    @'
model = "gpt-5.5"
model_reasoning_effort = "medium"

[projects.'c:\dev\samhanlogis']
trust_level = "trusted"
approval_policy = "never"
sandbox_mode = "danger-full-access"

[windows]
sandbox = "unelevated"
'@ | Out-File -FilePath $CodexConfig -Encoding utf8 -NoNewline
    Write-Host "[OK] ~/.codex/config.toml 신규 생성" -ForegroundColor Green
} else {
    $content = Get-Content $CodexConfig -Raw
    $modified = $false

    # [windows] sandbox = "unelevated" 보장
    if ($content -match '(?ms)^\[windows\]\s*\r?\nsandbox\s*=\s*"elevated"') {
        $content = $content -replace '(?ms)^\[windows\]\s*\r?\nsandbox\s*=\s*"elevated"', "[windows]`r`nsandbox = `"unelevated`""
        $modified = $true
        Write-Host "[FIX] [windows] sandbox elevated -> unelevated" -ForegroundColor Yellow
    } elseif ($content -notmatch '(?ms)^\[windows\]') {
        $content = $content.TrimEnd() + "`r`n`r`n[windows]`r`nsandbox = `"unelevated`"`r`n"
        $modified = $true
        Write-Host "[ADD] [windows] sandbox = `"unelevated`" 추가" -ForegroundColor Yellow
    } else {
        Write-Host "[OK] [windows] sandbox 이미 설정" -ForegroundColor Green
    }

    # SamhanLogis project trust 보장
    if ($content -notmatch "(?ms)^\[projects\.'c:\\\\dev\\\\samhanlogis'\]") {
        $content = $content.TrimEnd() + "`r`n`r`n[projects.'c:\dev\samhanlogis']`r`ntrust_level = `"trusted`"`r`napproval_policy = `"never`"`r`nsandbox_mode = `"danger-full-access`"`r`n"
        $modified = $true
        Write-Host "[ADD] SamhanLogis project trust 추가" -ForegroundColor Yellow
    } else {
        Write-Host "[OK] SamhanLogis project trust 이미 설정" -ForegroundColor Green
    }

    if ($modified) {
        $content | Out-File -FilePath $CodexConfig -Encoding utf8 -NoNewline
        Write-Host "[OK] ~/.codex/config.toml 갱신 완료" -ForegroundColor Green
    }
}

# --- 3. Plugin marketplace + install 안내 ---
$pluginDir = Join-Path $env:USERPROFILE '.claude\plugins\cache\openai-codex'
if (Test-Path $pluginDir) {
    Write-Host "[OK] codex plugin 설치 확인 ($pluginDir)" -ForegroundColor Green
} else {
    Write-Host "[TODO] codex plugin 미설치 — Claude Code 세션에서 아래 2단계 실행:" -ForegroundColor Yellow
    Write-Host "  /plugin marketplace add openai/codex-plugin-cc" -ForegroundColor White
    Write-Host "  /plugin install codex@openai-codex" -ForegroundColor White
    Write-Host "  /reload-plugins" -ForegroundColor White
}

# --- 4. Codex 로그인 점검 ---
$loginCheck = & codex --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] codex --version 실패: $loginCheck" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "[NEXT] Codex ChatGPT 로그인 안 되어 있으면:" -ForegroundColor Cyan
Write-Host "  ! codex login    (Claude Code 세션에서 ! prefix 로 직접 실행)" -ForegroundColor White

Write-Host ""
Write-Host "=== 셋업 완료 ===" -ForegroundColor Cyan
Write-Host "검증: Claude Code 세션에서 /codex:setup 실행" -ForegroundColor Cyan
