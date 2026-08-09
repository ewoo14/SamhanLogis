param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
# 2026-07-28 재수렴 D-C: 무조건 호출 — -OutputDir 명시 시에도 물리 가드를 받는다(T-1).
$OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-5-1-purchase-slip-list-detail\screenshots') -RequestedDir $OutputDir

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

function U {
    param([string]$Text)
    return [regex]::Replace($Text, "\\u([0-9A-Fa-f]{4})", {
        param($m)
        [char][Convert]::ToInt32($m.Groups[1].Value, 16)
    })
}

function New-Font {
    param([int]$Size, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular)
    try { return New-Object System.Drawing.Font("Pretendard", $Size, $Style) }
    catch { return New-Object System.Drawing.Font("Malgun Gothic", $Size, $Style) }
}

$fontTitle = New-Font 24 ([System.Drawing.FontStyle]::Bold)
$fontHead = New-Font 15 ([System.Drawing.FontStyle]::Bold)
$fontBody = New-Font 12
$fontSmall = New-Font 10
$brushText = [System.Drawing.Brushes]::Black
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushBlue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))
$brushGreen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))
$brushRed = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$penBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 216, 226), 1)
$penSoft = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(229, 231, 235), 1)

function Text {
    param($Graphics, [string]$Value, $Font, $Brush, [int]$X, [int]$Y)
    $Graphics.DrawString((U $Value), $Font, $Brush, $X, $Y)
}

function Badge {
    param($Graphics, [int]$X, [int]$Y, [string]$Value, [string]$Tone)
    $bg = [System.Drawing.Color]::FromArgb(219, 234, 254)
    $fg = $brushBlue
    if ($Tone -eq "good") { $bg = [System.Drawing.Color]::FromArgb(209, 250, 229); $fg = $brushGreen }
    if ($Tone -eq "danger") { $bg = [System.Drawing.Color]::FromArgb(254, 226, 226); $fg = $brushRed }
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 136, 30)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontSmall $fg ($X + 14) ($Y + 8)
}

function SecondaryButton {
    param($Graphics, [int]$X, [int]$Y, [string]$Value)
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 92, 34)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 250, 252))), $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontSmall $brushText ($X + 22) ($Y + 9)
}

function InputBox {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [string]$Label, [string]$Value)
    Text $Graphics $Label $fontSmall $brushMuted $X $Y
    $rect = New-Object System.Drawing.Rectangle($X, ($Y + 22), $W, 38)
    $Graphics.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontBody $brushText ($X + 12) ($Y + 32)
}

function Canvas {
    param([string]$FileName, [string]$Title, [string]$Subtitle)
    $bmp = New-Object System.Drawing.Bitmap(1280, 900)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    Text $g $Title $fontTitle $brushText 44 34
    Text $g $Subtitle $fontBody $brushMuted 46 76
    return @($bmp, $g, (Join-Path $OutputDir $FileName))
}

function Save {
    param($Bitmap, $Graphics, [string]$Path)
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Graphics.Dispose()
    $Bitmap.Dispose()
    Write-Host "generated $Path"
}

function Shot1 {
    $c = Canvas "01-purchase-list.png" "\uAD6C\uB9E4\uAD00\uB9AC" "\uC785\uACE0 \uC804\uD45C \uBAA9\uB85D"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    InputBox $g 46 124 170 "\uC2DC\uC791\uC77C" "2026-05-01"
    InputBox $g 232 124 170 "\uC885\uB8CC\uC77C" "2026-05-17"
    InputBox $g 418 124 230 "\uAC70\uB798\uCC98\uBA85" "\uC804\uCCB4"
    InputBox $g 664 124 230 "\uAD6C\uB9E4\uBC88\uD638" "2026/05/17-1"
    Badge $g 930 146 "50/page" "info"

    $rect = New-Object System.Drawing.Rectangle(46, 230, 1188, 420)
    $g.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $g.DrawRectangle($penBorder, $rect)
    $headers = @("\uAD6C\uB9E4\uBC88\uD638", "\uAC70\uB798\uCC98", "\uAE08\uC561", "\uC218\uB7C9", "\uC785\uACE0\uCC3D\uACE0", "\uC0C1\uD0DC", "\uAC80\uC218")
    $xs = @(70, 244, 430, 560, 680, 860, 1010)
    for ($i = 0; $i -lt $headers.Length; $i++) { Text $g $headers[$i] $fontSmall $brushMuted $xs[$i] 254 }
    $rows = @(
        @("2026/05/17-1", "\uC0BC\uD55C\uACF5\uC870", "360,000\uC6D0", "3", "\uBCF8\uC0AC\uCC3D\uACE0", "\uC800\uC7A5", "\uAC80\uC218"),
        @("2026/05/16-2", "\uC11C\uC6B8\uB0C9\uC5F4", "120,000\uC6D0", "1", "\uBCF8\uC0AC\uCC3D\uACE0", "\uD655\uC778", "\uAC80\uC218"),
        @("2026/05/15-1", "\uB3D9\uBD80\uC124\uBE44", "240,000\uC6D0", "2", "2\uCC3D\uACE0", "\uC784\uC2DC\uC800\uC7A5", "-")
    )
    $y = 306
    foreach ($row in $rows) {
        for ($i = 0; $i -lt $row.Length; $i++) { Text $g $row[$i] $fontBody $brushText $xs[$i] $y }
        $g.DrawLine($penSoft, 64, $y + 42, 1216, $y + 42)
        $y += 66
    }
    Text $g "\uB0B4\uBD80 UUID\uB294 \uD45C\uC2DC\uD558\uC9C0 \uC54A\uACE0 \uAD6C\uB9E4\uBC88\uD638(slipNo)\uB9CC \uB178\uCD9C" $fontSmall $brushMuted 46 810
    Save $bmp $g $path
}

function Shot2 {
    $c = Canvas "02-purchase-detail.png" "\uB9E4\uC785 \uC0C1\uC138" "\uAD6C\uB9E4\uBC88\uD638 2026/05/17-1 \uC0C1\uC138"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    $panel = New-Object System.Drawing.Rectangle(160, 150, 960, 610)
    $g.FillRectangle([System.Drawing.Brushes]::White, $panel)
    $g.DrawRectangle($penBorder, $panel)
    Text $g "\uAD6C\uB9E4\uBC88\uD638 2026/05/17-1" $fontHead $brushText 200 190
    Badge $g 910 190 "\uAC80\uC218 \uAC00\uB2A5" "good"
    Text $g "\uAC70\uB798\uCC98" $fontSmall $brushMuted 200 252
    Text $g "\uC0BC\uD55C\uACF5\uC870" $fontBody $brushText 200 278
    Text $g "\uC785\uACE0\uCC3D\uACE0" $fontSmall $brushMuted 420 252
    Text $g "\uBCF8\uC0AC\uCC3D\uACE0" $fontBody $brushText 420 278
    Text $g "\uAC80\uC218 \uC0C1\uD0DC" $fontSmall $brushMuted 640 252
    Text $g "\uAC80\uC218 \uAC00\uB2A5" $fontBody $brushText 640 278
    $g.DrawLine($penSoft, 200, 346, 1080, 346)
    Text $g "\uD488\uBAA9\uBA85" $fontSmall $brushMuted 220 382
    Text $g "\uBAA8\uB378" $fontSmall $brushMuted 460 382
    Text $g "\uC218\uB7C9" $fontSmall $brushMuted 680 382
    Text $g "\uB2E8\uAC00" $fontSmall $brushMuted 780 382
    Text $g "\uC18C\uACC4" $fontSmall $brushMuted 920 382
    Text $g "\uC2E4\uC678\uAE30" $fontBody $brushText 220 424
    Text $g "PUR-001" $fontBody $brushText 460 424
    Text $g "3" $fontBody $brushText 680 424
    Text $g "120,000\uC6D0" $fontBody $brushText 780 424
    Text $g "360,000\uC6D0" $fontBody $brushText 920 424
    Text $g "\uD569\uACC4 360,000\uC6D0" $fontHead $brushBlue 840 650
    Save $bmp $g $path
}

function Shot3 {
    $c = Canvas "03-inspection-cta.png" "SP-03 \uAC80\uC218 CTA" ""
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    Text $g "\uAD6C\uB9E4\uBC88\uD638 2026/05/17-1" $fontHead $brushText 92 156
    Badge $g 332 154 "\uC800\uC7A5" "info"
    Badge $g 470 154 "\uAC80\uC218" "good"
    $dialog = New-Object System.Drawing.Rectangle(310, 250, 660, 420)
    $g.FillRectangle([System.Drawing.Brushes]::White, $dialog)
    $g.DrawRectangle($penBorder, $dialog)
    Text $g "\uC785\uACE0 \uAC80\uC218" $fontHead $brushText 350 290
    Text $g "\uAD6C\uB9E4\uBC88\uD638 2026/05/17-1" $fontBody $brushMuted 350 326
    Text $g "\uAC80\uC218\uC218\uB7C9" $fontSmall $brushMuted 370 392
    Text $g "3" $fontBody $brushText 370 420
    Text $g "\uBD88\uB7C9\uC218\uB7C9" $fontSmall $brushMuted 540 392
    Text $g "0" $fontBody $brushText 540 420
    Text $g "\uC800\uC7A5 \uD6C4 \uAD6C\uB9E4\uAD00\uB9AC \uBAA9\uB85D refetch" $fontBody $brushBlue 350 570
    Save $bmp $g $path
}

function Shot4 {
    $c = Canvas "04-inventory-guard.png" "\uAD8C\uD55C \uAC00\uB4DC" ""
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    $card = New-Object System.Drawing.Rectangle(250, 220, 780, 360)
    $g.FillRectangle([System.Drawing.Brushes]::White, $card)
    $g.DrawRectangle($penBorder, $card)
    Badge $g 300 270 "403" "danger"
    Text $g "\uB9E4\uC785 \uC804\uD45C \uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" $fontHead $brushText 300 326
    Text $g "\uD5C8\uC6A9 \uC5ED\uD560: WAREHOUSE / MANAGER / MASTER" $fontBody $brushMuted 300 376
    Text $g "INVENTORY\uB294 SP-03 \uAC80\uC218 CTA \uC815\uCC45\uACFC \uB3D9\uC77C\uD558\uAC8C \uC81C\uC678\uD569\uB2C8\uB2E4." $fontBody $brushMuted 300 416
    Save $bmp $g $path
}

function Shot5 {
    $c = Canvas "05-confirmed-inspection-cta.png" "SP-03 \uAC80\uC218 CTA" "\uD655\uC815 \uC0C1\uD0DC \uD589\uC758 \uAC80\uC218 CTA"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    $rect = New-Object System.Drawing.Rectangle(46, 170, 1188, 360)
    $g.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $g.DrawRectangle($penBorder, $rect)
    $headers = @("\uAD6C\uB9E4\uBC88\uD638", "\uAC70\uB798\uCC98", "\uAE08\uC561", "\uC218\uB7C9", "\uC785\uACE0\uCC3D\uACE0", "\uC0C1\uD0DC", "\uAC80\uC218")
    $xs = @(70, 244, 430, 560, 680, 860, 1010)
    for ($i = 0; $i -lt $headers.Length; $i++) { Text $g $headers[$i] $fontSmall $brushMuted $xs[$i] 204 }
    $rows = @(
        @("2026/05/17-1", "\uC0BC\uD55C\uACF5\uC870", "360,000\uC6D0", "3", "\uBCF8\uC0AC\uCC3D\uACE0", "\uC800\uC7A5", "\uAC80\uC218"),
        @("2026/05/16-2", "\uC11C\uC6B8\uB0C9\uC5F4", "120,000\uC6D0", "1", "\uBCF8\uC0AC\uCC3D\uACE0", "\uD655\uC815", "\uAC80\uC218")
    )
    $y = 260
    foreach ($row in $rows) {
        for ($i = 0; $i -lt ($row.Length - 1); $i++) { Text $g $row[$i] $fontBody $brushText $xs[$i] $y }
        SecondaryButton $g 996 ($y - 7) $row[6]
        $g.DrawLine($penSoft, 64, $y + 42, 1216, $y + 42)
        $y += 66
    }
    Text $g "SAVED / CONFIRMED \uB450 \uC0C1\uD0DC \uBAA8\uB450 DS Button secondary CTA\uB85C \uB3D9\uC77C\uD558\uAC8C \uB80C\uB354\uB429\uB2C8\uB2E4." $fontBody $brushBlue 46 620
    Save $bmp $g $path
}

Shot1
Shot2
Shot3
Shot4
Shot5

Write-Host "SP-08-5-1 QA mock screenshots generated in $OutputDir"
