param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
# 2026-07-28 재수렴 D-C: 무조건 호출 — -OutputDir 명시 시에도 물리 가드를 받는다(T-1).
$OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-3-3-slip-cleanup-history\screenshots') -RequestedDir $OutputDir

# Windows-only (System.Drawing GDI+). Do not add to Linux CI.
# Mock-only QA artifact. Labels use Pretendard when installed; Windows fallback is Malgun Gothic.
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

function New-Font {
    param([int]$Size, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular)
    try {
        return New-Object System.Drawing.Font("Pretendard", $Size, $Style)
    } catch {
        return New-Object System.Drawing.Font("Malgun Gothic", $Size, $Style)
    }
}

$fontTitle = New-Font 22 ([System.Drawing.FontStyle]::Bold)
$fontBody = New-Font 13
$fontSmall = New-Font 10
$brushText = [System.Drawing.Brushes]::Black
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushBlue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(37, 99, 235))
$brushGreen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))
$brushWarn = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(154, 52, 18))
$penBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 216, 226), 1)
$penBlue = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(147, 197, 253), 1)

function Draw-Card {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Title, [string[]]$Lines)
    $rect = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
    $Graphics.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    $Graphics.DrawString($Title, $fontBody, $brushBlue, $X + 16, $Y + 12)
    $yy = $Y + 44
    foreach ($line in $Lines) {
        $Graphics.DrawString($line, $fontSmall, $brushMuted, $X + 16, $yy)
        $yy += 24
    }
}

function Draw-Chip {
    param($Graphics, [int]$X, [int]$Y, [string]$Label, [string]$Tone)
    $bg = [System.Drawing.Color]::FromArgb(239, 246, 255)
    $fg = $brushBlue
    if ($Tone -eq "good") {
        $bg = [System.Drawing.Color]::FromArgb(209, 250, 229)
        $fg = $brushGreen
    }
    if ($Tone -eq "warn") {
        $bg = [System.Drawing.Color]::FromArgb(255, 237, 213)
        $fg = $brushWarn
    }
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 128, 28)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    $Graphics.DrawString($Label, $fontSmall, $fg, $X + 12, $Y + 7)
}

function New-Shot {
    param(
        [string]$FileName,
        [string]$Title,
        [string]$Subtitle,
        [string]$ModeLabel,
        [string[]]$Rows,
        [bool]$ShowDialog = $false
    )

    $bmp = New-Object System.Drawing.Bitmap(1280, 900)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    $g.DrawString($Title, $fontTitle, $brushText, 42, 34)
    $g.DrawString($Subtitle, $fontBody, $brushMuted, 44, 76)

    $tabRun = New-Object System.Drawing.Rectangle(44, 118, 160, 42)
    $tabList = New-Object System.Drawing.Rectangle(208, 118, 160, 42)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(239, 246, 255))), $tabRun)
    $g.DrawRectangle($penBlue, $tabRun)
    $g.DrawString("실행", $fontBody, $brushBlue, 98, 129)
    $g.FillRectangle([System.Drawing.Brushes]::White, $tabList)
    $g.DrawRectangle($penBorder, $tabList)
    $g.DrawString("저장내역", $fontBody, $brushText, 255, 129)

    Draw-Card $g 44 184 560 124 "자동 복원 배너" @("data-testid=slip-cleanup-history-restored-banner", "이전 결과 복원됨 · 2026. 05. 17.", "createdBy UUID 는 '사용자' 로 마스킹")
    Draw-Card $g 636 184 560 124 "명시 저장 동선" @("data-testid=slip-cleanup-history-save-button", "저장주제: 월말 마감 직전 점검", "AUTO_LATEST / MANUAL_NAMED")

    Draw-Chip $g 44 334 "총 128건" "info"
    Draw-Chip $g 188 334 "정상 116건" "good"
    Draw-Chip $g 332 334 "확인 12건" "warn"

    $table = New-Object System.Drawing.Rectangle(44, 392, 1152, 360)
    $g.FillRectangle([System.Drawing.Brushes]::White, $table)
    $g.DrawRectangle($penBorder, $table)
    $g.DrawString("전표정리 저장내역 목록 ($ModeLabel)", $fontBody, $brushText, 64, 412)
    $g.DrawLine($penBorder, 64, 452, 1176, 452)
    $g.DrawString("작성시각", $fontSmall, $brushMuted, 76, 470)
    $g.DrawString("작성자", $fontSmall, $brushMuted, 300, 470)
    $g.DrawString("저장주제", $fontSmall, $brushMuted, 456, 470)
    $g.DrawString("구분", $fontSmall, $brushMuted, 820, 470)
    $g.DrawString("전표 수", $fontSmall, $brushMuted, 1000, 470)

    $y = 508
    $i = 0
    foreach ($row in $Rows) {
        $g.DrawString("2026. 05. 17. 10:$('{0:D2}' -f ($i * 9))", $fontSmall, $brushText, 76, $y)
        $g.DrawString("사용자", $fontSmall, $brushText, 300, $y)
        $g.DrawString($row, $fontSmall, $brushText, 456, $y)
        $saveModeLabel = "자동"
        if ($i -eq 0) {
            $saveModeLabel = "명시"
        }
        $g.DrawString($saveModeLabel, $fontSmall, $brushText, 820, $y)
        $g.DrawString((($i + 3) * 12).ToString(), $fontSmall, $brushText, 1000, $y)
        $g.DrawString("row testid: slip-cleanup-history-row-$i", $fontSmall, $brushMuted, 76, $y + 24)
        $g.DrawLine($penBorder, 64, $y + 52, 1176, $y + 52)
        $y += 64
        $i += 1
    }

    if ($ShowDialog) {
        $dialog = New-Object System.Drawing.Rectangle(430, 244, 420, 210)
        $g.FillRectangle([System.Drawing.Brushes]::White, $dialog)
        $g.DrawRectangle($penBlue, $dialog)
        $g.DrawString("전표정리 결과 저장", $fontBody, $brushText, 458, 270)
        $g.DrawString("data-testid=slip-cleanup-history-topic-input", $fontSmall, $brushMuted, 458, 310)
        $g.DrawString("저장주제: 월말 마감 직전 점검", $fontSmall, $brushText, 458, 346)
        $g.DrawString("[취소]  [저장]", $fontSmall, $brushBlue, 458, 394)
    }

    $g.DrawString("UUID 비노출 · Notion runtime call 없음 · slip_cleanup_save_history JSONB 저장/복원", $fontSmall, $brushMuted, 44, 812)

    $path = Join-Path $OutputDir $FileName
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $path"
}

New-Shot "01-slip-cleanup-run-restored.png" "전표정리 저장내역 2-Tab" "실행 탭 · latest 자동 복원" "자동 복원" @("자동저장", "월말 마감 직전 점검")
New-Shot "02-slip-cleanup-history-list.png" "전표정리 저장내역 2-Tab" "저장내역 탭 · row click 복원" "저장내역" @("월말 마감 직전 점검", "자동저장")
New-Shot "03-slip-cleanup-save-dialog.png" "전표정리 명시 저장 Dialog" "MANUAL_NAMED topic required" "명시 저장" @("월말 마감 직전 점검", "자동저장") $true
New-Shot "04-slip-cleanup-auto-latest.png" "전표정리 AUTO_LATEST" "사용자+SLIP_CLEANUP active 1건" "자동 저장" @("자동저장", "최근 실행 결과")
New-Shot "05-slip-cleanup-restore-mask.png" "전표정리 복원 UX" "createdBy UUID 마스킹 · 내부 ID 비노출" "복원 배너" @("사용자 복원", "월말 점검")
New-Shot "06-slip-cleanup-contract.png" "전표정리 저장내역 계약" "POST/GET/detail/latest + 100KB guard" "API 계약" @("payload guard", "reverse range swap")

Write-Host "SP-08-3-3 QA mock screenshots generated in $OutputDir"
