param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
if (-not $OutputDir) { $OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-3-4-dispatch-sms-history\screenshots') }

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
$brushWarn = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 158, 11))
$brushDanger = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$penBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 216, 226), 1)
$penBlue = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(147, 197, 253), 1)
$penWarn = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(233, 165, 61), 1)

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
        $bg = [System.Drawing.Color]::FromArgb(254, 243, 199)
        $fg = $brushWarn
    }
    if ($Tone -eq "danger") {
        $bg = [System.Drawing.Color]::FromArgb(254, 226, 226)
        $fg = $brushDanger
    }
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 148, 28)
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
        [bool]$ShowDialog = $false,
        [bool]$ShowSend = $false,
        [bool]$ShowAudit = $false
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

    Draw-Card $g 44 184 560 124 "미리보기 자동 저장" @("자동 저장 최신 복원", "작성자는 '사용자' 로 표시", "내부 식별자는 화면에 표시하지 않음")
    Draw-Card $g 636 184 560 124 "발송 감사 저장" @("발송 후 사용자 조작 없이 자동 저장", "저장 모드 = 발송 감사", "최신 미리보기 조회 대상 제외")

    Draw-Chip $g 44 334 "출고전표 3건" "info"
    Draw-Chip $g 208 334 "발송 가능 2건" "good"
    Draw-Chip $g 372 334 "발송금지 1건" "warn"
    Draw-Chip $g 536 334 "미매핑 1건" "danger"

    $table = New-Object System.Drawing.Rectangle(44, 392, 1152, 360)
    $g.FillRectangle([System.Drawing.Brushes]::White, $table)
    $g.DrawRectangle($penBorder, $table)
    $g.DrawString("배차문자 저장내역 목록 ($ModeLabel)", $fontBody, $brushText, 64, 412)
    $g.DrawLine($penBorder, 64, 452, 1176, 452)
    $g.DrawString("작성시각", $fontSmall, $brushMuted, 76, 470)
    $g.DrawString("작성자", $fontSmall, $brushMuted, 300, 470)
    $g.DrawString("저장주제", $fontSmall, $brushMuted, 456, 470)
    $g.DrawString("구분", $fontSmall, $brushMuted, 820, 470)
    $g.DrawString("건수", $fontSmall, $brushMuted, 1000, 470)

    $y = 508
    $i = 0
    foreach ($row in $Rows) {
        $g.DrawString("2026. 05. 17. 10:$('{0:D2}' -f ($i * 8))", $fontSmall, $brushText, 76, $y)
        $g.DrawString("사용자", $fontSmall, $brushText, 300, $y)
        $g.DrawString($row, $fontSmall, $brushText, 456, $y)
        $saveModeLabel = "명시"
        if ($row -match "감사") { $saveModeLabel = "발송 감사" }
        if ($row -match "자동") { $saveModeLabel = "자동" }
        $g.DrawString($saveModeLabel, $fontSmall, $brushText, 820, $y)
        $g.DrawString((($i + 1) * 2).ToString(), $fontSmall, $brushText, 1000, $y)
        $g.DrawString("목록 순번: $($i + 1)", $fontSmall, $brushMuted, 76, $y + 24)
        $g.DrawLine($penBorder, 64, $y + 52, 1176, $y + 52)
        $y += 64
        $i += 1
    }

    if ($ShowDialog) {
        $dialog = New-Object System.Drawing.Rectangle(430, 244, 440, 220)
        $g.FillRectangle([System.Drawing.Brushes]::White, $dialog)
        $g.DrawRectangle($penBlue, $dialog)
        $g.DrawString("배차문자 미리보기 저장", $fontBody, $brushText, 458, 270)
        $g.DrawString("저장주제 입력", $fontSmall, $brushMuted, 458, 310)
        $g.DrawString("저장 중 닫기 방지", $fontSmall, $brushText, 458, 346)
        $g.DrawString("[취소]  [저장]", $fontSmall, $brushBlue, 458, 398)
    }

    if ($ShowSend) {
        $sendRect = New-Object System.Drawing.Rectangle(842, 322, 210, 42)
        $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(233, 165, 61))), $sendRect)
        $g.DrawRectangle($penWarn, $sendRect)
        $g.DrawString("SMS 발송 (2건)", $fontBody, [System.Drawing.Brushes]::White, 876, 332)
        $g.DrawString("이중 확인 창", $fontSmall, $brushWarn, 842, 370)
    }

    if ($ShowAudit) {
        Draw-Card $g 780 614 360 100 "발송 결과" @("성공 2 / 실패 0 / 제외 1", "발송 감사 이력 추가 전용")
    }

    $g.DrawString("내부 식별자 비노출 · 외부 문서 도구 호출 없음 · 미리보기/발송 감사 저장", $fontSmall, $brushMuted, 44, 812)

    $path = Join-Path $OutputDir $FileName
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $path"
}

New-Shot "01-dispatch-sms-run-restored.png" "배차문자 저장내역 2-Tab" "실행 탭 · 자동 저장 최신 미리보기 복원" "자동 복원" @("자동저장", "오전 발송 전 점검")
New-Shot "02-dispatch-sms-preview-auto.png" "배차문자 미리보기 자동 저장" "미리보기 결과 자동 저장" "미리보기" @("자동저장", "오전 발송 전 점검")
New-Shot "03-dispatch-sms-manual-save-dialog.png" "배차문자 명시 저장 창" "명시 저장 주제 필수" "명시 저장" @("오전 발송 전 점검", "자동저장") $true
New-Shot "04-dispatch-sms-send-confirm.png" "배차문자 SMS 발송" "주의색 버튼 + 이중 확인" "발송" @("오전 발송 전 점검", "자동저장") $false $true
New-Shot "05-dispatch-sms-send-audit.png" "배차문자 발송 감사" "발송 후 자동 추가 · 최신 미리보기 제외" "발송 감사" @("발송 감사 2026-05-17", "자동저장") $false $true $true
New-Shot "06-dispatch-sms-history-filter.png" "배차문자 저장내역 탭" "저장 모드 선택 기본값: 명시 저장만" "명시 저장만" @("오전 발송 전 점검", "추가 수동 저장", "자동저장")
New-Shot "07-dispatch-sms-restore-mask.png" "배차문자 복원 UX" "작성자 마스킹 · 내부 ID 비노출" "복원" @("사용자 복원", "발송 감사 확인")

Write-Host "SP-08-3-4 QA mock screenshots generated in $OutputDir"
