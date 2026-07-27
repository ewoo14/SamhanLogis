param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
# 2026-07-28 재수렴 D-C: 무조건 호출 — -OutputDir 명시 시에도 물리 가드를 받는다(T-1).
$OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-3-2-arologis-history\screenshots') -RequestedDir $OutputDir

# mock-only — Malgun Gothic + raw hex; 실 화면은 Pretendard + CSS var 사용 (SP-08-3-2 진입 시 실 컴포넌트 캡처로 교체)
# Windows-only (System.Drawing GDI+). Do not add to CI; Linux runner will fail.
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$fontTitle = New-Object System.Drawing.Font("Malgun Gothic", 22, [System.Drawing.FontStyle]::Bold)
$fontBody = New-Object System.Drawing.Font("Malgun Gothic", 13, [System.Drawing.FontStyle]::Regular)
$fontSmall = New-Object System.Drawing.Font("Malgun Gothic", 10, [System.Drawing.FontStyle]::Regular)
$brushText = [System.Drawing.Brushes]::Black
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushBlue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(37, 99, 235))
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

function New-Shot {
    param(
        [string]$FileName,
        [string]$Title,
        [string]$Subtitle,
        [string]$Prefix,
        [string]$ModeLabel,
        [string[]]$Rows
    )

    $bmp = New-Object System.Drawing.Bitmap(1280, 760)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    $g.DrawString($Title, $fontTitle, $brushText, 42, 34)
    $g.DrawString($Subtitle, $fontBody, $brushMuted, 44, 76)

    $tabRun = New-Object System.Drawing.Rectangle(44, 120, 160, 42)
    $tabList = New-Object System.Drawing.Rectangle(208, 120, 160, 42)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(239, 246, 255))), $tabRun)
    $g.DrawRectangle($penBlue, $tabRun)
    $g.DrawString("실행", $fontBody, $brushBlue, 98, 131)
    $g.FillRectangle([System.Drawing.Brushes]::White, $tabList)
    $g.DrawRectangle($penBorder, $tabList)
    $g.DrawString("저장내역", $fontBody, $brushText, 255, 131)

    Draw-Card $g 44 186 560 116 "자동 복원 배너" @("data-testid=$Prefix-restored-banner", "이전 결과 복원됨 · $ModeLabel")
    Draw-Card $g 636 186 560 116 "명시 저장 Dialog" @("data-testid=$Prefix-topic-input", "저장주제: 오전 마감 점검", "버튼: 취소 / 저장")

    $table = New-Object System.Drawing.Rectangle(44, 332, 1152, 330)
    $g.FillRectangle([System.Drawing.Brushes]::White, $table)
    $g.DrawRectangle($penBorder, $table)
    $g.DrawString("저장내역 목록 ($ModeLabel)", $fontBody, $brushText, 64, 352)
    $g.DrawLine($penBorder, 64, 392, 1176, 392)
    $g.DrawString("작성시각", $fontSmall, $brushMuted, 76, 410)
    $g.DrawString("작성자", $fontSmall, $brushMuted, 300, 410)
    $g.DrawString("저장주제", $fontSmall, $brushMuted, 456, 410)
    $g.DrawString("구분", $fontSmall, $brushMuted, 820, 410)
    $g.DrawString("행 수", $fontSmall, $brushMuted, 1000, 410)

    $y = 448
    $i = 0
    foreach ($row in $Rows) {
        $g.DrawString("2026. 05. 17. 10:$('{0:D2}' -f ($i * 7))", $fontSmall, $brushText, 76, $y)
        $g.DrawString("사용자", $fontSmall, $brushText, 300, $y)
        $g.DrawString($row, $fontSmall, $brushText, 456, $y)
        $saveModeLabel = "자동"
        if ($i -eq 0) {
            $saveModeLabel = "명시"
        }
        $g.DrawString($saveModeLabel, $fontSmall, $brushText, 820, $y)
        $g.DrawString((($i + 2) * 3).ToString(), $fontSmall, $brushText, 1000, $y)
        $g.DrawString("row testid: $Prefix-row-$i", $fontSmall, $brushMuted, 76, $y + 24)
        $g.DrawLine($penBorder, 64, $y + 52, 1176, $y + 52)
        $y += 64
        $i += 1
    }

    $g.DrawString("UUID 비노출 · Notion runtime call 없음 · JSONB 저장/복원", $fontSmall, $brushMuted, 44, 700)

    $path = Join-Path $OutputDir $FileName
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $path"
}

New-Shot "01-pre-classify-run.png" "가배차 권역 분류 저장내역" "PRE_CLASSIFY · 실행 탭 자동 복원" "pre-classify-history" "권역 분류" @("오전 권역 분류", "자동저장")
New-Shot "02-pre-classify-history.png" "가배차 권역 분류 저장내역" "PRE_CLASSIFY · 저장내역 목록" "pre-classify-history" "권역 저장내역" @("월말 권역 점검", "자동저장")
New-Shot "03-regional-history.png" "지방가배차 저장내역" "REGIONAL · programType 격리" "regional-history" "시도 분류" @("부산/경남 분류", "자동저장")
New-Shot "04-unassigned-history.png" "미배차 리스트 저장내역" "UNASSIGNED · 미배차 결과 복원" "unassigned-history" "미배차" @("오전 미배차 점검", "자동저장")
New-Shot "05-reconcile-history.png" "운송사 실배차 비교 저장내역" "RECONCILE · 불일치 결과 복원" "dispatch-reconcile-history" "운송사 비교" @("CJ대한통운 비교", "자동저장")
New-Shot "06-history-dialog.png" "아로로지스 공통 저장 다이얼로그" "4 화면 공통 저장 다이얼로그 / 저장내역 탭" "dispatch-reconcile-history" "공통 컴포넌트" @("명시 저장", "자동저장")

Write-Host "SP-08-3-2 QA mock screenshots generated in $OutputDir"
